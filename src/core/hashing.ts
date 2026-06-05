// Canonical leaf hashing. Pure: bytes in, SHA-256 digest out.
// Uses the WebCrypto global, available both in the Obsidian renderer and Node 18+.

export type Digest = Uint8Array;

export async function leafHash(bytes: Uint8Array): Promise<Digest> {
  // Copy into a fresh ArrayBuffer: gives WebCrypto a definite ArrayBuffer-backed
  // BufferSource and avoids hashing a view into a larger backing buffer.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const buf = await crypto.subtle.digest('SHA-256', ab);
  return new Uint8Array(buf);
}

export function toHex(d: Uint8Array): string {
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return out;
}
