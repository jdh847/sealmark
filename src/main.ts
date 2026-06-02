import { Notice, Plugin, TFile } from 'obsidian';
import { PublicCalendarBackend } from './core/anchor/public-calendar';
import type { AnchorBackend } from './core/anchor/index';
import { SingleLeafAggregator } from './core/aggregator/single-leaf';
import { fromHex, leafHash, toHex } from './core/hashing';
import type { SealRecord } from './core/proof/record';
import { deriveBadge } from './core/proof/state';
import { canonicalBytes } from './obsidian/canonical-bytes';
import { DEFAULT_SETTINGS, SealmarkSettings, SealmarkSettingTab } from './obsidian/settings';

interface PersistedData {
  settings: SealmarkSettings;
  records: Record<string, SealRecord>; // keyed by note path
}

function asArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export default class SealmarkPlugin extends Plugin {
  settings: SealmarkSettings = DEFAULT_SETTINGS;
  records: Record<string, SealRecord> = {};
  backend: AnchorBackend = new PublicCalendarBackend();
  private aggregator = new SingleLeafAggregator();
  private statusBar: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadPersisted();

    this.statusBar = this.addStatusBarItem();
    this.statusBar.style.cursor = 'pointer';
    this.statusBar.addEventListener('click', () => void this.verifyActive());

    this.addCommand({ id: 'seal-note', name: 'Seal current note', callback: () => void this.sealActive() });
    this.addCommand({ id: 'upgrade-pending', name: 'Upgrade pending seals', callback: () => void this.upgradePending() });
    this.addCommand({ id: 'verify-note', name: 'Verify current note seal', callback: () => void this.verifyActive() });

    this.addSettingTab(new SealmarkSettingTab(this.app, this));

    this.registerEvent(this.app.workspace.on('active-leaf-change', () => void this.refreshBadge()));
    this.registerEvent(this.app.workspace.on('editor-change', () => void this.refreshBadge()));

    if (this.settings.autoUpgradeOnStartup) {
      window.setTimeout(() => void this.upgradePending(true), 3000);
    }
    void this.refreshBadge();
  }

  private activeFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  async sealActive(): Promise<void> {
    const file = this.activeFile();
    if (!file) {
      new Notice('Sealmark: no active note');
      return;
    }
    if (file.extension !== 'md') {
      new Notice('Sealmark: only markdown notes can be sealed');
      return;
    }
    try {
      const bytes = await canonicalBytes(this.app.vault, file);
      const digest = await leafHash(bytes);
      const existing = this.records[file.path];
      if (existing && existing.contentHash === toHex(digest)) {
        new Notice(`Sealmark: already sealed (${existing.confirmation}), content unchanged`);
        return;
      }
      if (existing) {
        new Notice('Sealmark: content changed since last seal, creating a new proof (replaces the old .ots)');
      }
      // v0: single leaf. Interface reserved for v1 Merkle aggregation.
      this.aggregator.build([{ id: file.path, digest }]);
      new Notice('Sealmark: submitting to Bitcoin calendars…');
      const proof = await this.backend.submit(digest);
      const otsPath = file.path + '.ots';
      await this.app.vault.adapter.writeBinary(otsPath, asArrayBuffer(proof.ots));
      this.records[file.path] = {
        path: file.path,
        contentHash: toHex(digest),
        backendId: this.backend.id,
        otsPath,
        confirmation: 'pending',
        merkleRoot: toHex(digest),
        inclusionProof: [],
      };
      await this.savePersisted();
      new Notice('Sealmark: sealed (pending Bitcoin confirmation)');
      void this.refreshBadge();
    } catch (e) {
      new Notice(`Sealmark: seal failed — ${(e as Error)?.message ?? e}`);
    }
  }

  async upgradePending(silent = false): Promise<void> {
    const pending = Object.values(this.records).filter((r) => r.confirmation === 'pending');
    if (pending.length === 0) {
      if (!silent) new Notice('Sealmark: no pending seals');
      return;
    }
    let upgraded = 0;
    for (const r of pending) {
      try {
        const otsBuf = await this.app.vault.adapter.readBinary(r.otsPath);
        const res = await this.backend.upgrade({ ots: new Uint8Array(otsBuf), digest: fromHex(r.contentHash) });
        if (res.kind === 'sealed') {
          await this.app.vault.adapter.writeBinary(r.otsPath, asArrayBuffer(res.proof.ots));
          r.confirmation = 'sealed';
          r.bitcoinBlock = res.bitcoinBlock;
          r.timeUtc = res.timeUtc;
          upgraded++;
        }
      } catch {
        // leave pending; retry next time
      }
    }
    await this.savePersisted();
    if (!silent) new Notice(`Sealmark: upgraded ${upgraded}/${pending.length} seal(s)`);
    void this.refreshBadge();
  }

  async verifyActive(): Promise<void> {
    const file = this.activeFile();
    if (!file) {
      new Notice('Sealmark: no active note');
      return;
    }
    const r = this.records[file.path];
    if (!r) {
      new Notice('Sealmark: this note is not sealed');
      return;
    }
    try {
      const otsBuf = await this.app.vault.adapter.readBinary(r.otsPath);
      const digest = fromHex(r.contentHash);
      const v = await this.backend.verify({ ots: new Uint8Array(otsBuf), digest }, digest);
      new Notice(`Sealmark: ${v.ok ? 'VERIFIED' : 'not yet verifiable'} — ${v.detail}`);
    } catch (e) {
      new Notice(`Sealmark: verify failed — ${(e as Error)?.message ?? e}`);
    }
  }

  async refreshBadge(): Promise<void> {
    if (!this.statusBar) return;
    const file = this.activeFile();
    if (!file || file.extension !== 'md') {
      this.statusBar.setText('');
      return;
    }
    const r = this.records[file.path];
    if (!r) {
      this.statusBar.setText('Sealmark: unsealed');
      this.statusBar.title = 'This note is not sealed. Run "Seal current note".';
      return;
    }
    try {
      const bytes = await canonicalBytes(this.app.vault, file);
      const badge = deriveBadge(r, toHex(await leafHash(bytes)));
      const icon = badge.sealed ? (badge.match === 'Drifted' ? '(!)' : 'OK') : '...';
      this.statusBar.setText(`Sealmark [${icon}]: ${badge.label}`);
      this.statusBar.title = [
        `confirmation: ${badge.confirmation}`,
        `content: ${badge.match}${badge.match === 'Drifted' ? ' (edited since seal; old proof still valid for the sealed bytes)' : ''}`,
        r.bitcoinBlock ? `bitcoin block: ${r.bitcoinBlock}` : null,
        r.timeUtc ? `time: ${r.timeUtc}` : null,
        `backend: ${r.backendId}`,
        'click to verify',
      ].filter(Boolean).join('\n');
    } catch {
      this.statusBar.setText('Sealmark: ?');
      this.statusBar.title = 'Sealmark: could not read note bytes';
    }
  }

  async loadPersisted(): Promise<void> {
    const data = (await this.loadData()) as PersistedData | null;
    if (data) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
      this.records = data.records ?? {};
    }
  }

  async savePersisted(): Promise<void> {
    const data: PersistedData = { settings: this.settings, records: this.records };
    await this.saveData(data);
  }

  async saveSettings(): Promise<void> {
    await this.savePersisted();
  }
}
