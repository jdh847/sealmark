// Spike 1: does `opentimestamps` (0.4.9, last published 2021) still work on Node v22?
// Staged so a network failure does not mask a library-load failure.
/* eslint-disable no-console */

async function main() {
  const results = {};

  // Stage 1: import
  let OTS;
  try {
    OTS = require('opentimestamps');
    const keys = Object.keys(OTS);
    results.import = `OK — exports: ${keys.join(', ')}`;
  } catch (e) {
    results.import = `FAIL — ${e.message}`;
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Stage 2: hash bytes into a DetachedTimestampFile
  let detached;
  try {
    const { Ops, DetachedTimestampFile } = OTS;
    const data = Buffer.from('sealmark spike: prove this existed\n', 'utf8');
    detached = DetachedTimestampFile.fromBytes(new Ops.OpSHA256(), data);
    const digestHex = Buffer.from(detached.fileDigest()).toString('hex');
    results.hash = `OK — sha256=${digestHex}`;
  } catch (e) {
    results.hash = `FAIL — ${e.message}`;
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Stage 3: stamp (network: submit digest to public calendars, get pending proof)
  try {
    const t0 = Date.now();
    await OTS.stamp(detached);
    const ms = Date.now() - t0;
    const ots = detached.serializeToBytes();
    results.stamp = `OK — pending proof in ${ms}ms, .ots is ${ots.length} bytes`;

    // Stage 3b: human-readable info on the pending proof
    try {
      const info = OTS.info(detached);
      results.info = 'OK — see below';
      results.infoText = info;
    } catch (e) {
      results.info = `FAIL — ${e.message}`;
    }
  } catch (e) {
    results.stamp = `FAIL (likely network/sandbox, not the library) — ${e.message}`;
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('UNCAUGHT', e);
  process.exit(1);
});
