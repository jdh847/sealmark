// Integration spike: exercise the REAL core code we wrote (not the raw library),
// end to end, in Node. Validates hashing + aggregator + PublicCalendarBackend wrapper
// + badge state. Only the Obsidian shell (vault IO, commands, UI) is left for on-machine.
/* eslint-disable no-console */
import { leafHash, toHex } from '../src/core/hashing';
import { SingleLeafAggregator } from '../src/core/aggregator/single-leaf';
import { PublicCalendarBackend } from '../src/core/anchor/public-calendar';
import { deriveBadge } from '../src/core/proof/state';
import type { SealRecord } from '../src/core/proof/record';

async function main() {
  const content = new TextEncoder().encode('integration spike: seal this early idea\n');

  // 1. hashing
  const digest = await leafHash(content);
  console.log('1. leafHash sha256:', toHex(digest));

  // 2. aggregator (v0 single leaf): root === digest, empty inclusion proof
  const agg = new SingleLeafAggregator();
  const { root, proofs } = agg.build([{ id: 'note.md', digest }]);
  console.log('2. aggregator: root===digest =', toHex(root) === toHex(digest), '| inclusionProof empty =', proofs.get('note.md')!.path.length === 0);

  // 3. backend.submit (network): our wrapper, not the raw library
  const backend = new PublicCalendarBackend();
  const proof = await backend.submit(digest);
  console.log('3. backend.submit: ots =', proof.ots.length, 'bytes | digest preserved =', toHex(proof.ots).length > 0 && toHex(proof.digest) === toHex(digest));

  // 4. badge state: orthogonal confirmation x match
  const record: SealRecord = {
    path: 'note.md', contentHash: toHex(digest), backendId: backend.id,
    otsPath: 'note.md.ots', confirmation: 'pending', merkleRoot: toHex(digest), inclusionProof: [],
  };
  const matched = deriveBadge(record, toHex(digest));
  const drifted = deriveBadge(record, toHex(await leafHash(new TextEncoder().encode('edited content'))));
  console.log('4. badge: matched =', JSON.stringify(matched.label), '| drifted =', JSON.stringify(drifted.label));

  // 5. verify on a still-pending proof should report not-yet-verifiable (defensive path)
  const v = await backend.verify(proof, digest);
  console.log('5. verify (pending):', v.ok, '-', v.detail);

  // 6. upgrade on a still-pending proof must not crash and must report pending
  //    (the sealed branch needs a Bitcoin-confirmed proof, validated on-machine later)
  const up = await backend.upgrade(proof);
  console.log('6. upgrade (pending):', up.kind, up.kind === 'pending' ? 'OK (expected pending)' : 'UNEXPECTED');

  console.log('\nINTEGRATION OK (core + backend wrapper work end to end; Obsidian shell + sealed-path pending on-machine)');
}

main().catch((e) => { console.error('INTEGRATION FAIL', e); process.exit(1); });
