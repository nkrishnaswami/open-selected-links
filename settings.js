export const SettingSpecs = [
  {
    name: 'use_new_window',
    description: 'Open links in new window',
    input_type: 'checkbox',
    default_: true
  }, {
    name: 'new_tab_group_name',
    description: 'Open links in new tab group',
    input_type: 'text',
    default_: ''
  }, {
    name: 'auto_discard',
    description: 'Automatically snooze tabs',
    input_type: 'checkbox',
    default_: false
  }, {
    name: 'deduplicate',
    description: 'Deduplicate links before opening',
    input_type: 'checkbox',
    default_: true
  }, {
    name: 'focus',
    description: 'Give focus to opened tab/window',
    input_type: 'checkbox',
    default_: true,
  },
];

export const default_settings = Object.fromEntries(
  SettingSpecs.map(elt => [elt.name, elt.default_]));

export const LoadSettings = async function() {
  const settings = (await chrome.storage.local.get('settings'))?.settings
  if (!settings) {
    console.log('LoadSettings: returning defaults')
  } else {
    console.log('LoadSettings: returning', settings)
  }
  return  settings ?? default_settings;
};

export const SaveSettings = async function(settings) {
  console.log('Saving settings', settings)
  await chrome.storage.local.set({settings})
};
