// All non-library outbound HTTP goes through this seam. The Obsidian shell injects
// an implementation backed by requestUrl() to bypass renderer CORS; tests inject a mock.
//
// NOTE: opentimestamps 0.4.9 performs its OWN HTTP internally and does not yet route
// through this. This interface documents the seam onto which the library's HTTP layer
// will be patched if the renderer spike shows CORS blocking its built-in calls.
// (ARCHITECTURE sections 4.5 and 9)

export interface HttpTransport {
  post(url: string, body: Uint8Array, headers?: Record<string, string>): Promise<Uint8Array>;
  get(url: string, headers?: Record<string, string>): Promise<Uint8Array>;
}
