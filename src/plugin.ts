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
    config: {},
};

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
        await metaCore.setProperty(cid, 'fileName', fileName);
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
