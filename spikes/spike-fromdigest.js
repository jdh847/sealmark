// Spike 2: build an OTS proof from a PRECOMPUTED digest (not content),
// so the privacy contract holds (core hands the backend a hash, never bytes).
// Also nail the serialize -> deserialize round trip.
/* eslint-disable no-console */

const OTS = require('opentimestamps');
const crypto = require('crypto');

async function main() {
  const { DetachedTimestampFile, Ops, Timestamp } = OTS;

  // 1. Introspect the API surface so we stop guessing.
  console.log('DetachedTimestampFile statics:', Object.getOwnPropertyNames(DetachedTimestampFile).filter((n) => typeof DetachedTimestampFile[n] === 'function'));
  console.log('DetachedTimestampFile proto:', Object.getOwnPropertyNames(DetachedTimestampFile.prototype));
  console.log('Timestamp statics:', Object.getOwnPropertyNames(Timestamp).filter((n) => typeof Timestamp[n] === 'function'));
  console.log('Ops keys:', Object.keys(Ops));

  // 2. Compute a digest ourselves (this is what core/leafHash would produce).
  const content = Buffer.from('sealmark from-digest spike\n', 'utf8');
  const digest = crypto.createHash('sha256').update(content).digest(); // 32 bytes
  console.log('digest hex:', digest.toString('hex'));

  // 3a. Try the "fromHash" path (preferred: feed precomputed digest).
  let detached = null;
  let pathUsed = null;
  try {
    detached = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), Array.from(digest));
    pathUsed = 'fromHash(op, Array)';
  } catch (e) {
    console.log('fromHash(Array) failed:', e.message);
  }
  if (!detached) {
    try {
      detached = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), digest);
      pathUsed = 'fromHash(op, Buffer)';
    } catch (e) {
      console.log('fromHash(Buffer) failed:', e.message);
    }
  }
  // 3b. Fallback: construct via Timestamp + constructor.
  if (!detached) {
    try {
      const ts = new Timestamp(Array.from(digest));
      detached = new DetachedTimestampFile(new Ops.OpSHA256(), ts);
      pathUsed = 'new DetachedTimestampFile(op, new Timestamp(digest))';
    } catch (e) {
      console.log('constructor path failed:', e.message);
    }
  }

  if (!detached) {
    console.log('RESULT: could not build from precomputed digest with any known API');
    return;
  }
  console.log('built via:', pathUsed);
  console.log('fileDigest hex:', Buffer.from(detached.fileDigest()).toString('hex'));
  console.log('matches our digest:', Buffer.from(detached.fileDigest()).toString('hex') === digest.toString('hex'));

  // 4. Stamp (network), serialize, deserialize round trip.
  await OTS.stamp(detached);
  const ots = detached.serializeToBytes();
  console.log('stamped, .ots bytes:', ots.length);

  const { Context } = OTS;
  const ctx = new Context.StreamDeserialization(Array.from(ots));
  const back = DetachedTimestampFile.deserialize(ctx);
  console.log('round-trip digest matches:', Buffer.from(back.fileDigest()).toString('hex') === digest.toString('hex'));
}

main().catch((e) => { console.error('UNCAUGHT', e); process.exit(1); });
