/**
 * MetaMesh Plugin: file-info
 *
 * ============================================================================
 * PLUGIN FILE ACCESS ARCHITECTURE - WebDAV
 * ============================================================================
 *
 * Plugins access files via WebDAV served by meta-sort nginx:
 *
 *   WEBDAV_URL env var: http://meta-sort-dev/webdav
 *
 *   Endpoints:
 *     GET  /webdav/watch/...   - Read media files
 *     GET  /webdav/plugin/...  - Read plugin output
 *     PUT  /webdav/plugin/...  - Write plugin output
 *     HEAD /webdav/...         - Get file stats (size, mtime)
 *
 * This plugin (file-info) uses:
 *   - HEAD requests for file size
 *   - Range GET requests for MIME type detection (magic bytes)
 *
 * FALLBACK: If WEBDAV_URL is not set, uses direct filesystem access.
 *
 * ============================================================================
 */

import Fastify from 'fastify';
import type {
    HealthResponse,
    ProcessRequest,
    ProcessResponse,
    CallbackPayload,
    ConfigureRequest,
    ConfigureResponse,
} from './types.js';
import { manifest, process as processFile } from './plugin.js';

const app = Fastify({ logger: true });
let ready = false;
let pluginConfig: Record<string, unknown> = {};

// Health check
app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'healthy',
    ready,
    version: manifest.version,
}));

// Manifest
app.get('/manifest', async () => manifest);

// Configure
app.post<{ Body: ConfigureRequest }>('/configure', async (request): Promise<ConfigureResponse> => {
    try {
        pluginConfig = request.body.config || {};
        console.log('[file-info] Configuration updated');
        return { status: 'ok' };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
});

// Process
app.post<{ Body: ProcessRequest }>('/process', async (request, reply) => {
    const { taskId, cid, filePath, callbackUrl, metaCoreUrl } = request.body;

    if (!taskId || !cid || !filePath || !callbackUrl || !metaCoreUrl) {
        return reply.send({ status: 'rejected', error: 'Missing required fields' } as ProcessResponse);
    }

    // Process in background (don't await)
    processFile(request.body, async (payload: CallbackPayload) => {
        try {
            await fetch(callbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.error('[file-info] Callback error:', error);
        }
    }).catch(console.error);

    // Accept immediately
    return reply.send({ status: 'accepted' } as ProcessResponse);
});

// Start server
const port = parseInt(process.env.PORT || '8080', 10);
const host = process.env.HOST || '0.0.0.0';

app.listen({ port, host }).then(() => {
    ready = true;
    console.log(`[file-info] Plugin listening on http://${host}:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    ready = false;
    await app.close();
    process.exit(0);
});
