import { defineManifest } from '@crxjs/vite-plugin'
import packageData from '../package.json'
import fs from 'fs';

//@ts-ignore
const isDev = process.env.NODE_ENV == 'development'

export function generateFirefoxManifest() {
  const chromeManifest = JSON.parse(fs.readFileSync('build/manifest.json', 'utf-8'));
  const firefoxManifest = {
    ...chromeManifest,
    background: {
      scripts: ["service-worker-loader.js"],
      type: "module"
    },
    browser_specific_settings: {
      gecko: {
        id: "@open-selected-links-ff",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    }
  };
  delete firefoxManifest.key;
  const idx = firefoxManifest.permissions.indexOf('system.display');
  if (idx >= 0) {
    firefoxManifest.permissions.splice(idx, 1);
  }
  for (const resource of firefoxManifest.web_accessible_resources) {
    if (resource.use_dynamic_url !== undefined) {
      delete resource.use_dynamic_url;
    }
  }
  fs.writeFileSync('build/manifest-firefox.json', JSON.stringify(firefoxManifest, null, 2));
}

export default defineManifest({
  name: `${packageData.displayName || packageData.name}${isDev ? ` ➡️ Dev` : ''}`,
  version: packageData.version,
  description: packageData.description,
  manifest_version: 3,
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  options_page: 'html/options.html',
  action: {
    default_popup: 'html/popup.html',
    default_title: 'Open Selected Links',
    default_icon: 'img/icon48.png',
  },
  commands: {
    osl_in_tabs: {
      description: 'Open selected links in new tabs in the current window',
    },
    osl_in_window: {
      description: 'Open selected links in a new window',
    },
    osl_in_tab_group: {
      description: 'Open selected links in a new tab group in the current window',
    },
  },
  permissions: ['activeTab', 'contextMenus', 'system.display', 'scripting', 'storage', 'tabGroups'],
  icons: {
    16: 'img/icon16.png',
    32: 'img/icon32.png',
    48: 'img/icon48.png',
    128: 'img/icon128.png',
  },
  web_accessible_resources: [{
    'resources': ['html/popup.html'],
    'matches': ['*://*/*']
  }],
  key: packageData.openSelectedLinks.key,
})
