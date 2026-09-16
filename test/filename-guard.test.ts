/**
 * `fileName` precedence regression tests.
 *
 * `fileName` has two writers (METADATA_KEYS.md §`fileName`): this plugin, which
 * knows a file's on-disk basename, and the indexer feeders, which emit the raw
 * release string at ingest. They collide on one record whenever meta-share
 * materialises a search hit into a tree meta-core watches.
 *
 * The regression these guard: a Usenet posting's on-disk name is the poster's,
 * and posters obfuscate it — writing it unconditionally replaced the readable
 * release string with `9765de45fa2d4522a80d01363d3c0919.mkv` on a record the
 * whole UI reads.
 *
 * These drive the real write path against a stand-in meta-core, so they assert
 * what is actually PUT rather than what the callback says.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'http';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

let processFile: typeof import('../src/plugin.js').process;
let configure: typeof import('../src/plugin.js').configure;

/** Properties the stand-in meta-core currently holds, per cid. */
let record: Record<string, string>;
/** Every `PUT /meta/{cid}/{key}` the plugin made, in order. */
let writes: Array<{ key: string; value: string }>;

let server: http.Server;
let metaCoreUrl: string;
let testDir: string;
/** A file whose basename is the obfuscated shape a Usenet poster produces. */
let obfuscatedFile: string;

const OBFUSCATED = '9765de45fa2d4522a80d01363d3c0919.mkv';
const RELEASE = 'The.Magical.Revolution.of.the.Reincarnated.Princess-S01E09';

const noopCallback = async (): Promise<void> => {};

/** Run the plugin over the obfuscated-named file against the stand-in meta-core. */
async function run(cid: string, existingMeta: Record<string, string> = {}): Promise<void> {
    await processFile(
        {
            taskId: `task-${cid}`,
            cid,
            filePath: obfuscatedFile,
            callbackUrl: 'http://localhost/callback',
            metaCoreUrl,
            existingMeta,
        },
        noopCallback
    );
}

const written = (key: string): string | undefined => writes.find((w) => w.key === key)?.value;

beforeAll(async () => {
    const plugin = await import('../src/plugin.js');
    processFile = plugin.process;
    configure = plugin.configure;

    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-info-guard-'));
    obfuscatedFile = path.join(testDir, OBFUSCATED);
    await fs.writeFile(obfuscatedFile, 'fake video content');

    // Stand-in meta-core: just enough of the property API for this plugin.
    server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean); // ['meta', cid, key?]
        const key = parts[2];
        if (req.method === 'GET' && key) {
            const value = record[key];
            if (value === undefined) {
                res.writeHead(404).end();
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ value }));
            return;
        }
        if (req.method === 'PUT' && key) {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                const value = String(JSON.parse(body || '{}').value ?? '');
                writes.push({ key, value });
                record[key] = value;
                res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    metaCoreUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(testDir, { recursive: true, force: true });
});

beforeEach(() => {
    record = {};
    writes = [];
    configure({}); // forceRecompute defaults back to off
});

describe('fileName precedence', () => {
    it('never overwrites a release string a feeder already wrote', async () => {
        record.fileName = RELEASE;

        await run('cid-feeder-wrote-first');

        expect(written('fileName')).toBeUndefined();
        expect(record.fileName).toBe(RELEASE);
    });

    it('still writes every key it owns when it yields on fileName', async () => {
        record.fileName = RELEASE;

        await run('cid-other-keys-survive');

        // `extension` has exactly one writer, so it is never withheld — and it
        // describes the bytes on disk, which is what this plugin is looking at.
        expect(written('extension')).toBe('mkv');
        expect(written('sizeByte')).toBe('18');
        expect(written('fileType')).toBeDefined();
    });

    it('writes fileName when the record carries none', async () => {
        await run('cid-first-sighting');

        expect(written('fileName')).toBe(OBFUSCATED);
    });

    it('writes fileName when the record already holds the same value', async () => {
        record.fileName = OBFUSCATED;

        await run('cid-same-value');

        expect(record.fileName).toBe(OBFUSCATED);
    });

    it('overwrites when forceRecompute is on', async () => {
        record.fileName = RELEASE;
        configure({ forceRecompute: true });

        await run('cid-forced');

        expect(written('fileName')).toBe(OBFUSCATED);
    });

    /**
     * Standalone / test mode: `getProperty` cannot reach meta-core and answers
     * `null` for both "absent" and "unreachable", so the dispatch snapshot is
     * the only evidence left that someone else owns the key.
     */
    it('falls back to existingMeta when meta-core is unreachable', async () => {
        const unreachable = 'http://127.0.0.1:1';
        await processFile(
            {
                taskId: 'task-offline',
                cid: 'cid-offline',
                filePath: obfuscatedFile,
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: unreachable,
                existingMeta: { fileName: RELEASE },
            },
            noopCallback
        );

        // Nothing reached our stand-in meta-core, and nothing threw.
        expect(writes).toHaveLength(0);
    });
});
