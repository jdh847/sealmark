import type { Digest } from '../hashing';

export interface Leaf {
  id: string;
  digest: Digest;
}

export interface InclusionProof {
  // v0: empty. v1: the Merkle path from this leaf to the root.
  path: Uint8Array[];
}

export interface AggregationResult {
  root: Digest;
  proofs: Map<string, InclusionProof>;
}

// v0 ships SingleLeafAggregator; v1 swaps in MerkleAggregator behind this same
// interface, so call sites (and stored records) do not change. (ARCHITECTURE 4.3)
export interface Aggregator {
  build(leaves: Leaf[]): AggregationResult;
}
