export enum SettingID {
  UseNewWindow = 'use_new_window',
  NewTabGroupName = 'new_tab_group_name',
  AutoDiscard = 'auto_discard',
  Deduplicate = 'deduplicate',
  Focus = 'focus',
  PopupHideDuplicates = 'popup_hide_duplicates',
  PopupMatchUrls = 'popup_match_urls',
}

export enum InputType {
  Checkbox = 'checkbox',
  Text = 'text',
}

export interface SettingSpec {
  name: keyof Settings,
  description: string,
  input_type: InputType,
  default_: string | number | boolean,
}

export interface Settings {
  use_new_window: boolean,
  new_tab_group_name: string,
  auto_discard: boolean,
  deduplicate: boolean,
  focus: boolean,
  popup_hide_duplicates: boolean,
  popup_match_urls: boolean,
}

export function setBoolean(settings: Settings, id: keyof Settings, value: boolean) {
  if (id == SettingID.UseNewWindow || id == SettingID.AutoDiscard ||
    id == SettingID.Deduplicate || id == SettingID.Focus ||
    id == SettingID.PopupHideDuplicates || id == SettingID.PopupMatchUrls) {
    settings[id] = value
  }
}

export function setString(settings: Settings, id: keyof Settings, value: string) {
  if (id == SettingID.NewTabGroupName) {
    settings[id] = value
  }
}

export const settingSpecs: SettingSpec[] = [
  {
    name: SettingID.UseNewWindow,
    description: 'Open links in new window',
    input_type: InputType.Checkbox,
    default_: true,
  },
  {
    name: SettingID.NewTabGroupName,
    description: 'Open links in new tab group',
    input_type: InputType.Text,
    default_: '',
  },
  {
    name: SettingID.AutoDiscard,
    description: 'Automatically snooze tabs',
    input_type: InputType.Checkbox,
    default_: false,
  },
  {
    name: SettingID.Deduplicate,
    description: 'Deduplicate links before opening',
    input_type: InputType.Checkbox,
    default_: true,
  },
  {
    name: SettingID.Focus,
    description: 'Give focus to opened tab/window',
    input_type: InputType.Checkbox,
    default_: true,
  },
  {
    name: SettingID.PopupHideDuplicates,
    description: 'In the popup, hide links with duplicate URLs (show the first only)',
    input_type: InputType.Checkbox,
    default_: false,
  },
  {
    name: SettingID.PopupMatchUrls,
    description: 'In the popup, match URLs as well as link text',
    input_type: InputType.Checkbox,
    default_: false,
  },
]

export const default_settings: Settings = Object.fromEntries(
  settingSpecs.map((elt: SettingSpec) => [elt.name, elt.default_]),
) as unknown as Settings;

export const loadSettings = async (): Promise<Settings> => {

  const settings = (await chrome.storage.local.get('settings'))?.settings as unknown as Settings;
  if (!settings) {
    console.log('LoadSettings: returning defaults')
  } else {
    console.log('LoadSettings: returning', settings)
  }
  return settings ?? default_settings
}

export const saveSettings = async (settings: Settings) => {
  console.log('Saving settings', settings)
  await chrome.storage.local.set({ settings })
}
