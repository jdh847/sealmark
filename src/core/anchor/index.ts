import type { Digest } from '../hashing';

// A proof is the standard OpenTimestamps .ots bytes plus the digest it commits to.
// The .ots is verifiable by ANY OpenTimestamps tool, not just Sealmark.
export interface Proof {
  ots: Uint8Array;
  digest: Digest;
}

export type UpgradeResult =
  | { kind: 'sealed'; proof: Proof; bitcoinBlock?: number; timeUtc?: string }
  | { kind: 'pending' };

export interface VerificationResult {
  ok: boolean;
  bitcoinBlock?: number;
  timeUtc?: string;
  detail: string;
}

// The seam that keeps the anchoring backend swappable. The default implementation is
// PublicCalendarBackend; an optional hosted backend can implement the same interface, so
// the plugin depends only on this boundary and never hard-wires a specific provider.
export interface AnchorBackend {
  readonly id: string;
  submit(digest: Digest): Promise<Proof>;
  upgrade(proof: Proof): Promise<UpgradeResult>;
  verify(proof: Proof, digest: Digest): Promise<VerificationResult>;
}
