/**
 * File Info Plugin
 *
 * Extracts basic file information: type, MIME type, and size.
 * This is the first plugin in the processing chain.
 *
 * Matches old FileProcessor output:
 * - fileType
 * - mimeType
 * - sizeByte
 * - fileName
 * - extension
 *
 * FILE ACCESS:
 * - Uses WebDAV client when WEBDAV_URL is set (containerized mode)
 * - Falls back to direct filesystem access (local development)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { FileType } from '@metazla/filename-tools';
import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';
import { createWebDAVClient, WebDAVClient } from './webdav-client.js';

const fileType = new FileType();

// Initialize WebDAV client if WEBDAV_URL is set
const webdavClient = createWebDAVClient();
if (webdavClient) {
    console.log('[file-info] Using WebDAV for file access');
} else {
    console.log('[file-info] Using direct filesystem access');
}

/**
 * Get MIME type from file via WebDAV (reads first 4KB for magic bytes)
 */
async function getMimeTypeViaWebDAV(client: WebDAVClient, filePath: string): Promise<string | undefined> {
    try {
        // Read first 4KB for magic byte detection
        const buffer = await client.readBytes(filePath, 0, 4095);
        const result = await fileTypeFromBuffer(buffer);
        return result?.mime;
    } catch (error) {
        console.warn(`[file-info] Failed to detect MIME type via WebDAV: ${error}`);
        return undefined;
    }
}

/**
 * Get file type using MIME type and extension mappings
 */
async function getFileTypeViaWebDAV(client: WebDAVClient, filePath: string): Promise<string> {
    const mimeType = await getMimeTypeViaWebDAV(client, filePath);
    const extensionType = fileType.getFileTypeFromExtension(filePath);

    if (mimeType) {
        // Use the FileType class's mime type mapping
        const mimeBasedType = (fileType as any).mimeTypeMappings?.[mimeType];
        if (mimeBasedType && mimeBasedType !== 'undefined') {
            return mimeBasedType;
        }
    }

    return extensionType;
}

export const manifest: PluginManifest = {
    id: 'file-info',
    name: 'File Information',
    version: '1.0.0',
    description: 'Extracts basic file information (type, MIME, size)',
    author: 'MetaMesh',
    dependencies: [],
    priority: 10,
    color: '#607D8B',
    defaultQueue: 'fast',
    timeout: 30000,
    schema: {
        fileType: {
            label: 'File Type',
            type: 'string',
            readonly: true,
        },
        mimeType: {
            label: 'MIME Type',
            type: 'string',
            readonly: true,
        },
        sizeByte: {
            label: 'Size (bytes)',
            type: 'number',
            readonly: true,
        },
        fileName: {
            label: 'File Name',
            type: 'string',
            readonly: true,
        },
        extension: {
            label: 'Extension',
            type: 'string',
            readonly: true,
        },
    },
    config: {
        forceRecompute: { type: 'boolean', label: 'Force Recompute', default: false },
    },
};

/** Overwrite `fileName` even when another writer already set one. Default off. */
let forceRecompute = false;

export function configure(config: Record<string, unknown>): void {
    forceRecompute = config.forceRecompute === true;
    console.log(`[file-info] Config: forceRecompute=${forceRecompute}`);
}

/**
 * Whether we may write `fileName` on this record.
 *
 * `fileName` has **two writers** (METADATA_KEYS.md §`fileName`): this plugin,
 * which knows the on-disk basename, and the indexer feeders, which emit the raw
 * release string at ingest. They meet on one record whenever meta-share
 * materialises a search hit into a tree meta-core watches — the bytes' midhash
 * is the record's content CID, so this plugin lands on the record the feeder
 * already wrote.
 *
 * A Usenet posting's on-disk name is the poster's, and posters obfuscate it
 * (`9765de45fa2d4522a80d01363d3c0919.mkv`). Writing it unconditionally destroyed
 * the only readable name the record had, in a last-writer-wins race that showed
 * up as hex on meta-watch's source rows.
 *
 * Precedence, mirroring the `still` rule the registry already legislates: the
 * writer that knows less yields, and it yields by skipping a record that already
 * carries a value. We know less — a basename is a container's filing detail,
 * a release string is the release's identity.
 *
 * The record is re-read over the network rather than trusted from
 * `existingMeta`: that map is delivered nested for grouped keys, and it is
 * snapshotted before dispatch. `existingMeta` is the fallback for standalone /
 * test mode, where `getProperty` cannot reach meta-core and answers `null`.
 */
async function mayWriteFileName(
    metaCore: MetaCoreClient,
    request: ProcessRequest,
    cid: string,
    fileName: string
): Promise<boolean> {
    if (forceRecompute) return true;
    const existing = (await metaCore.getProperty(cid, 'fileName')) ?? request.existingMeta?.fileName ?? null;
    if (!existing || existing === fileName) return true;
    console.log(`[file-info] Keeping existing fileName "${existing}" (not overwriting with "${fileName}")`);
    return false;
}

export async function process(
    request: ProcessRequest,
    sendCallback: (payload: CallbackPayload) => Promise<void>
): Promise<void> {
    const startTime = Date.now();
    const metaCore = new MetaCoreClient(request.metaCoreUrl);

    try {
        const { cid, filePath } = request;

        // Extract filename and extension (works for both filesystem and WebDAV)
        const fileName = path.basename(filePath);
        const extension = path.extname(filePath).slice(1).toLowerCase();

        let typeResult: string | undefined;
        let mimeType: string | undefined;
        let fileSize: number;

        if (webdavClient) {
            // ============================================================
            // WebDAV Mode: Access files via HTTP
            // ============================================================

            // Get file stats (size) via HTTP HEAD
            const stats = await webdavClient.stat(filePath);
            fileSize = stats.size;

            // Get MIME type via HTTP Range request (reads first 4KB for magic bytes)
            mimeType = await getMimeTypeViaWebDAV(webdavClient, filePath);

            // Get file type from MIME type or extension
            typeResult = await getFileTypeViaWebDAV(webdavClient, filePath);

        } else {
            // ============================================================
            // Filesystem Mode: Direct file access (local development)
            // ============================================================

            // Get file type (video, audio, image, etc.)
            typeResult = await fileType.getFileType(filePath);

            // Get MIME type
            mimeType = await fileType.getMimeTypeFromFile(filePath);

            // Get file size
            const stats = await fs.stat(filePath);
            fileSize = stats.size;
        }

        // Store metadata via meta-core API
        if (typeResult) {
            await metaCore.setProperty(cid, 'fileType', typeResult);
        }
        if (mimeType) {
            await metaCore.setProperty(cid, 'mimeType', mimeType);
        }
        await metaCore.setProperty(cid, 'sizeByte', String(fileSize));
        if (await mayWriteFileName(metaCore, request, cid, fileName)) {
            await metaCore.setProperty(cid, 'fileName', fileName);
        }
        // `extension` is unguarded on purpose: METADATA_KEYS.md names exactly one
        // writer for it (this plugin), so there is nothing to yield to — and it
        // describes the bytes on disk, which is precisely what we are looking at.
        await metaCore.setProperty(cid, 'extension', extension);

        const duration = Date.now() - startTime;
        const mode = webdavClient ? 'WebDAV' : 'filesystem';
        console.log(`[file-info] Processed ${fileName} in ${duration}ms (${mode})`);

        await sendCallback({
            taskId: request.taskId,
            status: 'completed',
            duration,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[file-info] Error:`, errorMessage);

        await sendCallback({
            taskId: request.taskId,
            status: 'failed',
            duration,
            error: errorMessage,
        });
    }
}
