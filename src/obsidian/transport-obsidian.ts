import { requestUrl } from 'obsidian';
import type { HttpTransport } from '../core/transport';

// HttpTransport backed by Obsidian's requestUrl(), which bypasses renderer CORS.
// Not yet wired into the opentimestamps library (which does its own HTTP); this is
// the seam the library's HTTP layer will be patched onto if the renderer spike shows
// CORS blocking its built-in calls. (ARCHITECTURE 4.5, 9)
export class ObsidianTransport implements HttpTransport {
  async post(url: string, body: Uint8Array, headers: Record<string, string> = {}): Promise<Uint8Array> {
    const res = await requestUrl({ url, method: 'POST', body: body.buffer as ArrayBuffer, headers, throw: true });
    return new Uint8Array(res.arrayBuffer);
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
    const res = await requestUrl({ url, method: 'GET', headers, throw: true });
    return new Uint8Array(res.arrayBuffer);
  }
}
