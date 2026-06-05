import * as OTS from 'opentimestamps';
import type { AnchorBackend, Proof, UpgradeResult, VerificationResult } from './index';
import type { Digest } from '../hashing';

// The ONLY module that touches the (unmaintained) opentimestamps library.
// If the library must be forked or vendored, the blast radius is confined here.
// (ARCHITECTURE 4.5)
//
// API confirmed by spike on the pinned version:
//   DetachedTimestampFile.fromHash(new Ops.OpSHA256(), Array.from(digest))
//   OTS.stamp(detached)            -> submits the digest to public calendars (N-of-M)
//   detached.serializeToBytes()    -> standard .ots bytes
//   OTS.upgrade / OTS.verify       -> defensive wrappers below; the verified shape is
//                                     pending real-machine confirmation (see spike notes)

function api(): any {
  return OTS as any;
}

function detachedFromDigest(digest: Digest): any {
  const o = api();
  return o.DetachedTimestampFile.fromHash(new o.Ops.OpSHA256(), Array.from(digest));
}

function deserialize(ots: Uint8Array): any {
  const o = api();
  const ctx = new o.Context.StreamDeserialization(Array.from(ots));
  return o.DetachedTimestampFile.deserialize(ctx);
}

export class PublicCalendarBackend implements AnchorBackend {
  readonly id = 'public-calendar';

  async submit(digest: Digest): Promise<Proof> {
    const o = api();
    const detached = detachedFromDigest(digest);
    await o.stamp(detached);
    const ots = Uint8Array.from(detached.serializeToBytes());
    return { ots, digest };
  }

  async upgrade(proof: Proof): Promise<UpgradeResult> {
    const o = api();
    const detached = deserialize(proof.ots);
    const changed = await o.upgrade(detached);
    if (changed) {
      const ots = Uint8Array.from(detached.serializeToBytes());
      const upgraded: Proof = { ots, digest: proof.digest };
      const v = await this.verify(upgraded, proof.digest);
      if (v.ok) {
        return { kind: 'sealed', proof: upgraded, bitcoinBlock: v.bitcoinBlock, timeUtc: v.timeUtc };
      }
    }
    return { kind: 'pending' };
  }

  async verify(proof: Proof, _digest: Digest): Promise<VerificationResult> {
    const o = api();
    try {
      const detached = deserialize(proof.ots);
      // Use verifyTimestamp directly: top-level verify() requires a second
      // "original" DetachedTimestampFile and would throw without it. verifyTimestamp
      // returns a per-chain map { bitcoin: { timestamp, height } } (empty while pending).
      // ignoreBitcoinNode routes verification through a block explorer (esplora) so no
      // local Bitcoin node is required. (API confirmed against the library source.)
      const result = await o.verifyTimestamp(detached.timestamp, { ignoreBitcoinNode: true });
      const btc = result && result.bitcoin;
      if (btc && (btc.timestamp || btc.height)) {
        const timeUtc = btc.timestamp ? new Date(btc.timestamp * 1000).toISOString() : undefined;
        return { ok: true, bitcoinBlock: btc.height, timeUtc, detail: 'verified against Bitcoin via block explorer' };
      }
      return { ok: false, detail: 'no Bitcoin attestation yet (still pending confirmation)' };
    } catch (e) {
      return { ok: false, detail: `verify error: ${(e as Error)?.message ?? String(e)}` };
    }
  }
}
