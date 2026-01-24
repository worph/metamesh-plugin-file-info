/**
 * meta-core API Client for writing metadata
 * Fails gracefully if meta-core is unavailable (returns without throwing)
 */

export class MetaCoreClient {
    constructor(private baseUrl: string) {}

    private async safeFetch(url: string, options: RequestInit): Promise<Response | null> {
        try {
            return await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
        } catch {
            // meta-core unavailable - fail silently (expected in standalone/test mode)
            return null;
        }
    }

    async setProperty(hashId: string, key: string, value: string): Promise<void> {
        const response = await this.safeFetch(`${this.baseUrl}/meta/${hashId}/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
        });
        // Silently ignore errors (expected in standalone/test mode)
    }

    async getProperty(hashId: string, key: string): Promise<string | null> {
        const response = await this.safeFetch(`${this.baseUrl}/meta/${hashId}/${key}`, { method: 'GET' });
        if (!response || response.status === 404) return null;
        if (!response.ok) return null;
        const data = await response.json() as { value?: string };
        return data.value ?? null;
    }

    async mergeMetadata(hashId: string, metadata: Record<string, string>): Promise<void> {
        const response = await this.safeFetch(`${this.baseUrl}/meta/${hashId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata),
        });
        // Silently ignore errors (expected in standalone/test mode)
    }

    async deleteProperty(hashId: string, key: string): Promise<void> {
        const response = await this.safeFetch(`${this.baseUrl}/meta/${hashId}/${key}`, { method: 'DELETE' });
        // Silently ignore errors (expected in standalone/test mode)
    }

    async addToSet(hashId: string, key: string, value: string): Promise<void> {
        const response = await this.safeFetch(`${this.baseUrl}/meta/${hashId}/_add/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
        });
        // Silently ignore errors (expected in standalone/test mode)
    }

    async getMetadata(hashId: string): Promise<Record<string, string>> {
        const response = await this.safeFetch(`${this.baseUrl}/meta/${hashId}`, { method: 'GET' });
        if (!response || response.status === 404) return {};
        if (!response.ok) return {};
        const data = await response.json() as { metadata?: Record<string, string> };
        return data.metadata ?? {};
    }
}
