/**
 * File Info Plugin
 *
 * Extracts basic file information: type, MIME type, and size.
 * This is the first plugin in the processing chain.
 */

import { stat } from 'fs/promises';
import { basename, extname } from 'path';
import { fileTypeFromFile } from 'file-type';
import { lookup as mimeTypeLookup } from 'mime-types';
import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';

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
        privateFilePath: {
            label: 'Original File Path',
            type: 'string',
            readonly: true,
            hint: 'Physical path on disk (used by Stremio addon and FUSE)',
        },
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

// File type detection based on extension (matching @metazla/filename-tools)
// Note: Images are classified as 'document' not 'image' per original design
const EXTENSION_MAPPINGS: Record<string, string> = {
    // Video
    'mp4': 'video', 'mkv': 'video', 'webm': 'video', 'avi': 'video',
    'mov': 'video', 'wmv': 'video', 'flv': 'video', 'm4v': 'video',
    'mpg': 'video', 'mpeg': 'video', '3gp': 'video', '3g2': 'video',
    'f4v': 'video', 'm2ts': 'video', 'mts': 'video', 'ts': 'video',
    'vob': 'video', 'ogm': 'video', 'divx': 'video', 'xvid': 'video',
    // Audio
    'mp3': 'audio', 'wav': 'audio', 'flac': 'audio', 'aac': 'audio',
    'ogg': 'audio', 'm4a': 'audio',
    // Document (includes images per original design)
    'pdf': 'document', 'doc': 'document', 'docx': 'document',
    'ppt': 'document', 'pptx': 'document', 'xls': 'document',
    'xlsx': 'document', 'txt': 'document', 'rtf': 'document',
    // Images are classified as 'document' per original library
    'jpg': 'document', 'jpeg': 'document', 'png': 'document',
    'gif': 'document', 'bmp': 'document', 'tif': 'document',
    'tiff': 'document', 'svg': 'document', 'webp': 'document',
    // Archive
    'zip': 'archive', 'rar': 'archive', '7z': 'archive',
    'tar': 'archive', 'gz': 'archive', 'bz2': 'archive', 'xz': 'archive',
    // Subtitles
    'srt': 'subtitle', 'sub': 'subtitle', 'sbv': 'subtitle', 'vtt': 'subtitle',
    // Torrent
    'torrent': 'torrent',
};

function getFileTypeFromExtension(ext: string): string {
    if (!ext) return 'undefined';
    const lowerExt = ext.toLowerCase();
    return EXTENSION_MAPPINGS[lowerExt] || 'other';
}

export async function process(
    request: ProcessRequest,
    sendCallback: (payload: CallbackPayload) => Promise<void>
): Promise<void> {
    const startTime = Date.now();
    const metaCore = new MetaCoreClient(request.metaCoreUrl);

    try {
        const { cid, filePath } = request;

        // Get file stats
        const stats = await stat(filePath);

        // Get file name and extension
        const fileName = basename(filePath);
        const extension = extname(filePath).slice(1).toLowerCase();

        // Determine file type
        let fileType = getFileTypeFromExtension(extension);

        // Try to get MIME type from file magic bytes
        let mimeType: string | undefined;
        try {
            const detected = await fileTypeFromFile(filePath);
            if (detected) {
                mimeType = detected.mime;
            }
        } catch {
            // Fallback to extension-based lookup
        }

        // Fallback MIME type lookup by extension
        if (!mimeType) {
            mimeType = mimeTypeLookup(extension) || 'application/octet-stream';
        }

        // Prepare metadata
        const metadata = {
            fileType,
            mimeType,
            sizeByte: String(stats.size),
            fileName,
            extension,
            filePath, // Store the file path for other plugins/services
        };

        // Write metadata to meta-core
        await metaCore.mergeMetadata(cid, metadata);

        const duration = Date.now() - startTime;
        console.log(`[file-info] Processed ${fileName} in ${duration}ms`);

        await sendCallback({
            taskId: request.taskId,
            status: 'completed',
            duration,
            metadata, // Include metadata in callback as fallback
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
