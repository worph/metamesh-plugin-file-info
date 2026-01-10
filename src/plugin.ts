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
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { FileType } from '@metazla/filename-tools';
import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';

const fileType = new FileType();

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

        // Get file type (video, audio, image, etc.) - matches old FileProcessor
        const typeResult = await fileType.getFileType(filePath);
        if (typeResult) {
            await metaCore.setProperty(cid, 'fileType', typeResult);
        }

        // Get MIME type - matches old FileProcessor
        const mimeType = await fileType.getMimeTypeFromFile(filePath);
        if (mimeType) {
            await metaCore.setProperty(cid, 'mimeType', mimeType);
        }

        // Get file size - matches old FileProcessor
        const stats = await fs.stat(filePath);
        await metaCore.setProperty(cid, 'sizeByte', String(stats.size));

        // Also store filename and extension for convenience - matches old FileProcessor
        const fileName = path.basename(filePath);
        const extension = path.extname(filePath).slice(1).toLowerCase();
        await metaCore.setProperty(cid, 'fileName', fileName);
        await metaCore.setProperty(cid, 'extension', extension);

        const duration = Date.now() - startTime;
        console.log(`[file-info] Processed ${fileName} in ${duration}ms`);

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
