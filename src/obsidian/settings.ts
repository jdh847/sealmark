import { App, PluginSettingTab, Setting } from 'obsidian';
import type SealmarkPlugin from '../main';

export interface SealmarkSettings {
  autoUpgradeOnStartup: boolean;
}

export const DEFAULT_SETTINGS: SealmarkSettings = {
  autoUpgradeOnStartup: true,
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
