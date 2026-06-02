import type { TFile, Vault } from 'obsidian';

// The ONE place that defines which bytes are hashed: the entire raw file, including
// frontmatter, with no normalization or reordering. Two independent verifiers must
// agree on this, so it lives in exactly one function. (ARCHITECTURE 4.1)
export async function canonicalBytes(vault: Vault, file: TFile): Promise<Uint8Array> {
  const buf = await vault.readBinary(file);
  return new Uint8Array(buf);
}
