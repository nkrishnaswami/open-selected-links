{
  "name": "Open Selected Links",
  "version": "1.7.4",
  "description": "Opens multiple links in the selected content in the current or new window or a tab group.",
  "manifest_version": 3,
  "background": {
      "service_worker": "/src/background.js",
      "type": "module"
  },
  "options_page": "/pages/options.html",
  "action": {
    "default_popup": "/pages/popup.html",
    "default_title": "Open Selected Links"
  },
  "commands": {
    "osl_in_tabs": {
      "description": "Open selected links in new tabs in the current window"
    },
    "osl_in_window": {
      "description": "Open selected links in a new window"
    },
    "osl_in_tab_group": {
      "description": "Open selected links in a new tab group in the current window"
    }
  },
  "permissions": ["activeTab", "contextMenus", "scripting", "storage", "tabGroups"],
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
