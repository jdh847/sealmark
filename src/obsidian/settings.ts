import { App, PluginSettingTab, Setting } from 'obsidian';
import type SealmarkPlugin from '../main';

export interface SealmarkSettings {
  backend: 'public-calendar' | 'nexum';
  autoUpgradeOnStartup: boolean;
  nexumEndpoint: string;
}

// Default is the free, trust-minimized public path. Nexum is opt-in and off by
// default; the plugin is fully functional without it. (ARCHITECTURE 8)
export const DEFAULT_SETTINGS: SealmarkSettings = {
  backend: 'public-calendar',
  autoUpgradeOnStartup: true,
  nexumEndpoint: '',
};

export class SealmarkSettingTab extends PluginSettingTab {
  plugin: SealmarkPlugin;

  constructor(app: App, plugin: SealmarkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Anchoring backend')
      .setDesc(
        'Public OpenTimestamps calendars are free and trust-minimized. Nexum is an optional hosted enhancement (not yet available).'
      )
      .addDropdown((d) =>
        d
          .addOption('public-calendar', 'Public OpenTimestamps (default)')
          .addOption('nexum', 'Nexum (opt-in, coming later)')
          .setValue(this.plugin.settings.backend)
          .onChange(async (v) => {
            this.plugin.settings.backend = v as SealmarkSettings['backend'];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Upgrade pending seals on startup')
      .setDesc('Bitcoin confirmation takes hours. Sealmark re-checks pending proofs when Obsidian starts.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoUpgradeOnStartup).onChange(async (v) => {
          this.plugin.settings.autoUpgradeOnStartup = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
