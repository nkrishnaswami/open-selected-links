import { describe, expect, test, vi } from 'vitest';
import {
  setBoolean, setString, loadSettings, saveSettings,
  Settings, SettingID, default_settings,
} from '../src/common/settings';

describe('setBoolean', () => {
  test('sets a boolean field for a matching key', () => {
    const s = { ...default_settings };
    setBoolean(s, SettingID.AutoDiscard, true);
    expect(s.auto_discard).toEqual(true);
  });

  test('sets each boolean key correctly', () => {
    const booleanKeys = [
      SettingID.UseNewWindow,
      SettingID.AutoDiscard,
      SettingID.Deduplicate,
      SettingID.Focus,
      SettingID.PopupHideDuplicates,
      SettingID.PopupMatchUrls,
    ] as const;
    for (const key of booleanKeys) {
      const s = { ...default_settings };
      setBoolean(s, key, true);
      expect(s[key]).toEqual(true);
    }
  });

  test('ignores the string key NewTabGroupName', () => {
    const s = { ...default_settings };
    const before = { ...s };
    setBoolean(s, SettingID.NewTabGroupName, true as any);
    expect(s).toEqual(before);
  });
});

describe('setString', () => {
  test('sets new_tab_group_name', () => {
    const s = { ...default_settings };
    setString(s, SettingID.NewTabGroupName, 'my group');
    expect(s.new_tab_group_name).toEqual('my group');
  });

  test('ignores boolean keys', () => {
    const s = { ...default_settings };
    const before = { ...s };
    setString(s, SettingID.AutoDiscard, 'ignored');
    expect(s).toEqual(before);
  });
});

describe('loadSettings', () => {
  test('returns stored settings when present', async () => {
    const stored: Settings = { ...default_settings, auto_discard: true };
    browser.storage = {
      local: {
        get: vi.fn().mockResolvedValue({ settings: stored }),
        set: vi.fn(),
      }
    };
    const result = await loadSettings();
    expect(result).toEqual(stored);
    expect(browser.storage.local.get).toHaveBeenCalledWith('settings');
  });

  test('returns defaults when storage has no settings key', async () => {
    browser.storage = {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn(),
      }
    };
    const result = await loadSettings();
    expect(result).toEqual(default_settings);
  });
});

describe('saveSettings', () => {
  test('calls storage.local.set with the settings object', async () => {
    browser.storage = {
      local: {
        get: vi.fn(),
        set: vi.fn().mockResolvedValue(undefined),
      }
    };
    const s = { ...default_settings };
    await saveSettings(s);
    expect(browser.storage.local.set).toHaveBeenCalledWith({ settings: s });
  });
});
