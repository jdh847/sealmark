// Single source of truth for a sealed note. Persisted by the shell.
// Badges and commands derive from this; nothing mutates badge state directly.
export interface SealRecord {
  // vault-relative path of the note at seal time
  path: string;
  // hex SHA-256 of the canonical bytes at seal time (the drift baseline)
  contentHash: string;
  // backend that produced the proof
  backendId: string;
  // sidecar file holding the standard .ots bytes
  otsPath: string;
  // confirmation dimension (orthogonal to drift)
  confirmation: 'pending' | 'sealed';
  // bitcoin block height once sealed
  bitcoinBlock?: number;
  // ISO UTC of the bitcoin block once sealed
  timeUtc?: string;
  // reserved for v1 Merkle aggregation (degenerate values in v0)
  merkleRoot?: string;
  inclusionProof?: string[];
}
