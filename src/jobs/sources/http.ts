import type { MonitorSource, RawEvent } from '../types';

export class HttpSource implements MonitorSource {
  readonly name = 'http';

  private readonly url: string;
  private readonly token?: string;
  private readonly sinceParam: string;
  private readonly root?: string;

  constructor() {
    const url = process.env.MONITOR_SOURCE_URL;
    if (!url) {
      throw new Error(
        'MONITOR_SOURCE_URL is not set (required when MONITOR_SOURCE=http)',
      );
    }
    this.url = url;
    this.token = process.env.MONITOR_SOURCE_TOKEN || undefined;
    this.sinceParam = process.env.MONITOR_SINCE_PARAM || 'since';
    this.root = process.env.MONITOR_SOURCE_ROOT || undefined;
  }

  async fetchSince(since: Date | null): Promise<RawEvent[]> {
    const u = new URL(this.url);
    if (since) u.searchParams.set(this.sinceParam, since.toISOString());

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(u, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Source responded ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
      );
    }

    const payload: unknown = await res.json();
    const arr = this.root ? dig(payload, this.root) : payload;
    if (!Array.isArray(arr)) {
      throw new Error(
        `Expected an array of events${this.root ? ` at "${this.root}"` : ''}, got ${typeof arr}`,
      );
    }
    return arr as RawEvent[];
  }
}

function dig(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}
