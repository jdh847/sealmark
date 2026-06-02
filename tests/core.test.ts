// Core unit tests: pure logic, no Obsidian, no network. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leafHash, toHex, fromHex } from '../src/core/hashing';
import { SingleLeafAggregator } from '../src/core/aggregator/single-leaf';
import { deriveBadge } from '../src/core/proof/state';
import type { SealRecord } from '../src/core/proof/record';

const enc = (s: string) => new TextEncoder().encode(s);

test('leafHash is deterministic and matches the known SHA-256 vector for "abc"', async () => {
  const a = await leafHash(enc('abc'));
  const b = await leafHash(enc('abc'));
  assert.equal(toHex(a), toHex(b));
  assert.equal(toHex(a), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('leafHash differs for different content (drift baseline is meaningful)', async () => {
  assert.notEqual(toHex(await leafHash(enc('idea v1'))), toHex(await leafHash(enc('idea v2'))));
});

test('hex round-trips', () => {
  const u = new Uint8Array([0, 1, 15, 16, 127, 128, 255]);
  assert.equal(toHex(fromHex(toHex(u))), toHex(u));
});

test('SingleLeafAggregator: root === leaf, inclusion proof empty', async () => {
  const d = await leafHash(enc('x'));
  const { root, proofs } = new SingleLeafAggregator().build([{ id: 'n', digest: d }]);
  assert.equal(toHex(root), toHex(d));
  assert.equal(proofs.get('n')!.path.length, 0);
});

test('SingleLeafAggregator: rejects anything other than exactly one leaf', async () => {
  const d = await leafHash(enc('x'));
  assert.throws(() => new SingleLeafAggregator().build([]));
  assert.throws(() => new SingleLeafAggregator().build([{ id: 'a', digest: d }, { id: 'b', digest: d }]));
});

test('deriveBadge: confirmation and match are orthogonal', () => {
  const base: SealRecord = {
    path: 'n', contentHash: 'aa', backendId: 'public-calendar', otsPath: 'n.ots', confirmation: 'pending',
  };
  assert.equal(deriveBadge(base, 'aa').label, 'Pending');
  assert.equal(deriveBadge(base, 'bb').label, 'Pending · Drifted');
  assert.equal(deriveBadge(base, 'aa').sealed, false);

  const sealed: SealRecord = { ...base, confirmation: 'sealed', bitcoinBlock: 880000 };
  assert.equal(deriveBadge(sealed, 'aa').label, 'Sealed · block 880000');
  assert.equal(deriveBadge(sealed, 'bb').label, 'Sealed · Drifted · block 880000');
  assert.equal(deriveBadge(sealed, 'aa').sealed, true);
  assert.equal(deriveBadge(sealed, 'aa').match, 'Matched');
  assert.equal(deriveBadge(sealed, 'bb').match, 'Drifted');
});
