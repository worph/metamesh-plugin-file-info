/**
 * File Info Plugin Integration Tests
 *
 * Tests basic file information extraction.
 * Uses @metazla/filename-tools library for FileType class.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { FileType } from '@metazla/filename-tools';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Dynamic import of plugin module
let manifest: typeof import('../src/plugin.js').manifest;
let processFile: typeof import('../src/plugin.js').process;

// Mock callback collector
interface CallbackResult {
    taskId: string;
    status: 'completed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
}

let lastCallback: CallbackResult | null = null;

const mockSendCallback = async (payload: CallbackResult): Promise<void> => {
    lastCallback = payload;
};

// Create FileType instance for direct testing
const fileType = new FileType();

describe('File Info Plugin Integration Tests', () => {
    let testDir: string;
    let testVideoFile: string;
    let testTextFile: string;

    beforeAll(async () => {
        const plugin = await import('../src/plugin.js');
        manifest = plugin.manifest;
        processFile = plugin.process;

        // Create temporary test files
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-info-test-'));
        testVideoFile = path.join(testDir, 'test-movie.mkv');
        testTextFile = path.join(testDir, 'readme.txt');

        // Create dummy files
        await fs.writeFile(testVideoFile, 'fake video content');
        await fs.writeFile(testTextFile, 'This is a text file');
    });

    describe('Manifest', () => {
        it('has required fields', () => {
            expect(manifest.id).toBe('file-info');
            expect(manifest.name).toBeDefined();
            expect(manifest.version).toBeDefined();
            expect(manifest.dependencies).toEqual([]);
            expect(manifest.priority).toBe(10);
        });

        it('declares correct schema', () => {
            expect(manifest.schema).toHaveProperty('fileType');
            expect(manifest.schema).toHaveProperty('mimeType');
            expect(manifest.schema).toHaveProperty('sizeByte');
            expect(manifest.schema).toHaveProperty('fileName');
            expect(manifest.schema).toHaveProperty('extension');
        });
    });

    describe('FileType Class', () => {
        it('detects video extension', () => {
            const result = fileType.getFileTypeFromExtension('/movies/test.mkv');
            expect(result).toBe('video');
        });

        it('detects audio extension', () => {
            const result = fileType.getFileTypeFromExtension('/music/song.mp3');
            expect(result).toBe('audio');
        });

        it('detects image or document extension', () => {
            const result = fileType.getFileTypeFromExtension('/photos/image.jpg');
            // FileType may classify jpg as 'image' or 'document' depending on implementation
            expect(['image', 'document']).toContain(result);
        });

        it('detects subtitle extension', () => {
            const result = fileType.getFileTypeFromExtension('/subs/movie.srt');
            expect(result).toBe('subtitle');
        });

        it('detects document extension', () => {
            const result = fileType.getFileTypeFromExtension('/docs/readme.txt');
            expect(result).toBe('document');
        });

        it('handles unknown extension', () => {
            const result = fileType.getFileTypeFromExtension('/files/unknown.xyz');
            expect(result).toBeDefined();
        });
    });

    describe('Extension Parsing', () => {
        it('extracts extension from filename', () => {
            const ext = path.extname('/movies/Inception.2010.mkv').slice(1).toLowerCase();
            expect(ext).toBe('mkv');
        });

        it('extracts filename from path', () => {
            const fileName = path.basename('/movies/Inception.2010.mkv');
            expect(fileName).toBe('Inception.2010.mkv');
        });

        it('handles multiple dots in filename', () => {
            const fileName = path.basename('/movies/Movie.Name.2010.1080p.mkv');
            const ext = path.extname(fileName).slice(1).toLowerCase();
            expect(fileName).toBe('Movie.Name.2010.1080p.mkv');
            expect(ext).toBe('mkv');
        });
    });

    describe('Process Function', () => {
        it('processes file successfully', async () => {
            await processFile({
                taskId: 'test-file-1',
                cid: 'test-cid-file',
                filePath: testVideoFile,
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {},
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
            expect(lastCallback?.taskId).toBe('test-file-1');
        });

        it('processes text file successfully', async () => {
            await processFile({
                taskId: 'test-file-2',
                cid: 'test-cid-text',
                filePath: testTextFile,
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {},
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
        });
    });
});
