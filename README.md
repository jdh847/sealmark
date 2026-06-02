# Sealmark

Private proof of existence for your Obsidian notes.

Sealmark hashes a note locally, anchors the hash to the Bitcoin blockchain via
[OpenTimestamps](https://opentimestamps.org/), and lets anyone verify, with standard
open-source tools, that the note existed at a given time and has not changed since.

**Your content never leaves your machine. Only a hash is ever published.** That is the
whole point: you can prove you wrote something first without publishing it (unlike a
preprint, which makes priority public by making the content public).

## Status

Early v0. The cryptographic core and the library integration are validated by spikes
on Node: the `opentimestamps` library loads and stamps, proofs round-trip, and the
plugin bundles. What remains is on-machine validation inside the Obsidian renderer
(does the bundled library run there, and do calendar calls survive renderer CORS).
See `ARCHITECTURE.md` section 9.

## How it works

1. **Seal**: Sealmark reads the note's raw bytes, computes a SHA-256 digest, and submits
   only that digest to several public OpenTimestamps calendars. You get a `pending`
   proof in seconds, stored as a `.ots` sidecar next to your note.
2. **Upgrade**: Bitcoin confirmation takes hours. Sealmark re-fetches the completed proof
   on startup (and on demand), flipping the note to `sealed` with a block height.
3. **Verify**: the `.ots` is a standard OpenTimestamps proof. Anyone can verify it with
   Sealmark, with the `ots` CLI, or against a Bitcoin node. No trust in Sealmark or any
   server is required (a full node is fully offline and trustless; a block explorer is a
   convenience fallback).

A note whose content changes after sealing shows as `Drifted`: the old proof stays valid
for the bytes it sealed, it just no longer matches the current file.

## Commands

- **Seal current note**
- **Upgrade pending seals**
- **Verify current note seal**

## Install (manual, for testing)

```
npm install
npm run build
```

Then copy `main.js` and `manifest.json` into your vault at
`<vault>/.obsidian/plugins/sealmark/`, reload Obsidian, and enable Sealmark in
Settings → Community plugins.

## Privacy and trust

- Content is hashed locally; only the digest is sent to calendars.
- The default backend is free public OpenTimestamps calendars. An optional hosted
  backend (Nexum) may be added later, off by default; the plugin is fully functional
  without it.

## Architecture

See `ARCHITECTURE.md`. The trust core (`src/core`) is pure TypeScript with no Obsidian
dependency; the Obsidian shell (`src/obsidian`, `src/main.ts`) is a thin layer over it.
All contact with the `opentimestamps` library is confined to one file
(`src/core/anchor/public-calendar.ts`).

## License

MIT.
