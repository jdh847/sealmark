import type { Aggregator, AggregationResult, InclusionProof, Leaf } from './index';

// v0: one tree per leaf. root === leaf, inclusion proof empty.
// v1 replaces this with a MerkleAggregator behind the same interface.
export class SingleLeafAggregator implements Aggregator {
  build(leaves: Leaf[]): AggregationResult {
    if (leaves.length !== 1) {
      throw new Error(`SingleLeafAggregator expects exactly 1 leaf, got ${leaves.length}`);
    }
    const leaf = leaves[0];
    const proofs = new Map<string, InclusionProof>();
    proofs.set(leaf.id, { path: [] });
    return { root: leaf.digest, proofs };
  }
}
