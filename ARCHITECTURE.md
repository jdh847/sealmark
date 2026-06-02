# Architecture

**Sealmark** (working name) is an Obsidian plugin that gives a note a private,
tamper-evident proof of existence: it hashes the note, anchors the hash to the
Bitcoin blockchain via [OpenTimestamps](https://opentimestamps.org/), and lets
anyone verify, offline and without trusting Sealmark or any server, that the note
existed at a given time and has not changed since. The note content never leaves
the machine. Only a hash is ever transmitted.

This document is the source of truth for how the codebase is structured and, more
importantly, *why*. Every structural decision here maps to a property we promise
users (privacy, independent verifiability, no vendor lock-in). If a change to the
code would weaken one of those properties, this document should be the thing that
stops it.

---

## 1. Design goals (in priority order)

1. **Auditable trust core.** A reviewer should be able to read one package and
   confirm that Sealmark only hashes content, never transmits content, and produces
   proofs that anyone can verify independently. Trust is the product; the
   architecture must make trust inspectable.
2. **Independent verifiability.** A proof must be verifiable with standard,
   open-source tooling, with no dependency on Sealmark, on its author, or on any
   hosted service.
3. **No mandatory backend.** The plugin must be 100% functional against free public
   OpenTimestamps calendars. Any hosted enhancement (see §8) is strictly opt-in and
   off by default.
4. **Evolvable without rewrites.** The v0 single-note design must extend to v1
   vault-wide Merkle aggregation by swapping implementations behind stable
   interfaces, not by rewriting call sites.
5. **Testable without Obsidian.** The trust core must be unit-testable as pure
   TypeScript, with no Electron or Obsidian runtime required.

---

## 2. Trust model

- **Content never leaves the machine.** Only a SHA-256 digest is submitted to a
  calendar. The digest is computed locally.
- **Hash-only privacy.** The OpenTimestamps file-stamping path prepends a 128-bit
  random nonce before submission, which covers brute-force preimage risk for
  low-entropy content. Sealmark adds no salt of its own in v0.
- **The local clock is not trusted.** A `Pending` proof's time comes from the
  calendar's commitment; a `Sealed` proof's time comes from the Bitcoin block. The
  machine clock is used only for UI hints and never enters a proof.
- **Verification is trust-minimized, with an honest boundary.** Verifying against a
  full Bitcoin node is fully trustless and offline. Verifying via a public block
  explorer is a convenience fallback that makes one network request but still trusts
  no centralized notary and no Sealmark service.

---

## 3. Architecture at a glance

The spine of the system is a hard split between a **pure trust core** and a **thin
Obsidian shell**:

```
packages/
  core/         pure TypeScript, zero Obsidian imports, publishable to npm,
                reusable by a CLI, a web verifier, or a hosted backend
  obsidian/     thin integration shell: commands, badge, settings, file access
```

The core knows nothing about Obsidian. The shell depends on the core and injects
platform-specific implementations (HTTP, file bytes) into it. This is what makes the
core auditable (goal 1), reusable (a web verification page and a CLI can import the
same core), and testable (goal 5).

---

## 4. The core package

### 4.1 Hashing and canonical bytes

`leafHash(bytes: Uint8Array): Digest` is a pure function over raw bytes. The core
never receives an Obsidian note object; it receives bytes. The decision of *which*
bytes (the entire raw file, UTF-8, including frontmatter, no normalization or
reordering, attachments and transclusions excluded) is made in exactly one place in
the shell (`canonical-bytes.ts`). Centralizing this guarantees two independent
verifiers agree on the input.

### 4.2 `AnchorBackend` (the Nexum-decoupling boundary)

```ts
interface AnchorBackend {
  submit(digest: Uint8Array): Promise<PendingProof>
  upgrade(proof: PendingProof): Promise<ConfirmedProof | StillPending>
  verify(proof: Proof, digest: Uint8Array): Promise<VerificationResult>
}
```

Implementations:

- `PublicCalendarBackend` (default): submits to public OpenTimestamps calendars.
- `NexumBackend` (opt-in, deferred to v1): a hosted enhancement.

The plugin depends only on the interface. Because the default injected
implementation is `PublicCalendarBackend`, "the plugin works fully without any
hosted backend" is enforced by the type system and wiring, not by discipline. See
§8 for the policy this encodes.

### 4.3 `Aggregator` (the v0 to v1 boundary)

```ts
interface Aggregator {
  build(leaves: Leaf[]): { root: Uint8Array; proofs: Map<LeafId, InclusionProof> }
}
```

- v0: `SingleLeafAggregator`, where `root === leaf` and the inclusion proof is empty.
- v1: `MerkleAggregator`, where many notes share one tree and one anchor.

`leafHash` is fixed and the `SealRecord` structure already carries `merkleRoot` and
`inclusionProof` fields (degenerate values in v0). A v0 proof remains readable under
v1; only the aggregation strategy changes.

### 4.4 `ProofStore`

Reads and writes the sidecar `.ots` proof and the `SealRecord` index, decoupled from
backend and aggregator. The open v1 question of where inclusion-proof bytes live
when many notes share a root is absorbed here and does not leak elsewhere.

### 4.5 `HttpTransport` (dependency injection, risk hedge)

```ts
interface HttpTransport {
  post(url: string, body: Uint8Array): Promise<Uint8Array>
  get(url: string): Promise<Uint8Array>
}
```

The core does not import `fetch`. It receives a transport. The Obsidian shell injects
an implementation backed by Obsidian's `requestUrl()` (which bypasses renderer CORS);
a CLI injects a Node implementation; tests inject a mock. This single seam hedges two
real risks identified in the design phase:

- **Electron CORS:** OpenTimestamps calendars' CORS headers are undocumented, and the
  upstream library uses its own fetch. Routing all HTTP through `requestUrl()` avoids
  the problem.
- **Unmaintained dependency:** the `opentimestamps` npm package is effectively
  unmaintained. If it must be forked or vendored, the blast radius is confined to
  `core/anchor` and `core/proof`; it never reaches the UI.

### 4.6 Verification

Verification logic lives in the core and depends on no Sealmark-private state. The
`.ots` file uses the standard OpenTimestamps format as a sidecar, so "verify with the
standard `ots` CLI" works for free. This is what makes goal 2 real rather than
aspirational.

### 4.7 State model (derived, not mutable)

The badge is not a single four-valued enum. It is a function of two orthogonal,
independently derived dimensions:

```ts
type ConfirmationState = 'Pending' | 'Sealed'   // derived from the proof file
type ContentMatch      = 'Matched' | 'Drifted'  // current bytes vs. sealed contentHash
```

The two events that drive them have different sources and can interleave: `upgrade`
is asynchronous (Bitcoin confirmation, hours later); drift is user-driven (an edit).
Modeling badge state as a pure function of `SealRecord` plus current file bytes,
rather than as mutable fields, eliminates an entire class of state-inconsistency bugs.
The two dimensions can be shown together, for example `Pending · Drifted`. The
`SealRecord` is the single source of truth; badges and commands derive from it.

---

## 5. The Obsidian shell

A thin layer over the core:

- `main.ts` plugin entry, command registration
- `canonical-bytes.ts` the one place that defines which bytes are hashed
- `seal-command.ts` the user-triggered "Seal this note" action
- `upgrade-queue.ts` attempts `upgrade` on all `Pending` proofs at startup and on a
  timer (a proof is incomplete until Bitcoin confirms and must be re-fetched)
- `badge.ts` renders the derived state in the file-property area (not inline, to
  avoid polluting note body)
- `settings.ts` defaults to public calendars; exposes opt-in hosted backend config

---

## 6. Data flow

```
Seal:
  note bytes --leafHash--> digest --AnchorBackend.submit--> PendingProof
  (submitted to N calendars, any one success => Pending)
  --ProofStore.write--> .ots sidecar + SealRecord
  badge: Pending

Upgrade (startup / timer):
  PendingProof --AnchorBackend.upgrade--> ConfirmedProof | StillPending
  on Confirmed: ProofStore updates .ots; badge: Sealed (block height + UTC)

Drift (on open / edit):
  recompute hash of current bytes; compare to SealRecord.contentHash
  mismatch => ContentMatch = Drifted (old proof stays valid, no longer matches)

Verify (in-plugin or external):
  .ots + digest --AnchorBackend.verify / standard ots CLI--> VerificationResult
```

N-of-M submission means a seal may hold commitments from multiple calendars; `upgrade`
must contact the calendar that issued a given pending commitment. The multi-calendar
storage and upgrade reconciliation is deferred to v1 (see §7).

---

## 7. Deliberately deferred (do not gold-plate)

The interfaces above are cheap to reserve. Their second implementations are expensive
and out of scope for v0. v0 ships exactly one leg behind each boundary:

- `MerkleAggregator`: interface only, no implementation yet.
- `NexumBackend`: interface only, no implementation yet.
- Multi-calendar upgrade reconciliation: single-calendar path first.
- Shareable proof card / hosted verification page: not in v0.

Reserving the abstraction boundary is the design investment. Implementing both sides
now would be the mistake.

---

## 8. Relationship to Nexum

Sealmark and Nexum (the author's Bitcoin-anchoring protocol) are deliberately
**decoupled at the technical layer**:

- Nexum is always an opt-in `AnchorBackend`, off by default. The plugin is fully
  functional against public calendars alone. A default dependency on a hosted backend
  would contradict the trust-minimized value proposition and is treated as a hard
  architectural rule, not a preference.
- Nexum adds *convenience* (faster confirmation, private calendar, HSM signing,
  audit export), never *capability*.
- The relationship is a narrative one (the same protocol thinking, open-sourced into
  a tool researchers use) and a one-directional funnel (plugin to Nexum, never the
  reverse), not a product bundling.

---

## 9. Risks and how the architecture absorbs them

| Risk | Mitigation in the architecture |
|------|-------------------------------|
| `opentimestamps` npm package unmaintained | Confined to `core/anchor` + `core/proof`; fork/vendor stays local |
| Electron renderer CORS blocks calendar calls | All HTTP behind `HttpTransport`, injected with Obsidian `requestUrl()` |
| Note edited during pending window | Drift modeled as an orthogonal derived dimension, not a mutable flag |
| Verifier disagreement on hashed bytes | Canonical bytes defined in exactly one place |
| Pressure to bundle Nexum | `AnchorBackend` interface + default public backend makes coupling structurally awkward |

Two of these (the unmaintained library and CORS) must be validated by a spike before
the rest of this architecture is built. If a spike fails, fix the transport or
library layer first; the architecture above can wait.

---

## 10. Repository layout

```
sealmark/
  ARCHITECTURE.md
  packages/
    core/
      hashing.ts
      aggregator/
        index.ts          # Aggregator interface
        single-leaf.ts    # v0
        merkle.ts         # v1, interface placeholder only
      anchor/
        index.ts          # AnchorBackend interface
        public-calendar.ts# default
        nexum.ts          # v1, interface placeholder only
      proof/
        store.ts
        state.ts
        verify.ts
      transport.ts
    obsidian/
      main.ts
      canonical-bytes.ts
      seal-command.ts
      upgrade-queue.ts
      badge.ts
      settings.ts
```

---

## 11. Testing strategy

The core is pure functions plus injected dependencies, so it is fully unit-testable
without Obsidian. Priority tests:

- **Deterministic hashing:** identical bytes produce identical digests.
- **Proof serialization round-trip:** write then read yields an equal proof.
- **Tamper detection:** verification of altered bytes fails.
- **Drift detection:** edited content flips `ContentMatch` to `Drifted` while the
  proof stays valid.
- **Forward compatibility:** a v0 single-leaf proof is readable by the v1 Merkle path.
- **Transport isolation:** calendar interactions are mockable through `HttpTransport`.
