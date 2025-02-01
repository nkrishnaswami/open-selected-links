# Version 1.8.1
* Popup enhancements:
  * Allow filter to match URLs as well as link text
  * Separate hiding duplicates from deduplicating when opening tabs/windows
# Version 1.8.0
* Port to Typescript
  - this brings more assurance of correctness.
* New OSL options
  - `deduplicate`: when true, only open one tab for identical links in the selection.
  - `focus`: when true, make the opened tab active or give the opened window focus.  
    *Note*: New windows may be drawn on top without being given focus, which can be confusing.
* Add persistent settings
  - no longer forced to re-select options in the popup.
  - can customize affect context menu clicks.
  - **Requires `storage` permissions.**
* Command and menu item handlers share code.
* Refactored content script
  - now persistent, and communicates with extension via messages.
* Error handling/messages in popup are more robust.
* Refactor `MakeTabsForLink` into smaller functions.
# Version 1.7.4
* Fix delayed context menu listener registration. [#11](https://github.com/nkrishnaswami/open-selected-links/issues/11)
# Version 1.7.3
* Highlight regex match when using filter in popup.
# Version 1.7.2
* Add keyboard shortcut support.
# Version 1.7.1
* Ensure context menus are always installed.
* Add option to auto-discard/snooze newly-created tabs.
# Version 1.7.0
* Switch to manifest v3 to use promise-based API.
# Version 1.6.1
* Automatically focus the filter text input in the popup.
# Version 1.6
* Add `open selected in tab groups` entry to context menu.
# Version 1.5.1
* Fix broken context menus.
# Version 1.5
* Add support for tab groups. 
* Switch to Manifest v3.
# Version 1.4
* Add context menu items to open links in the current or new window.
* Add button to toggle all visible (unfiltered) links in the popup.
# Version 1.3
* Allow case-insensitive, regular expression-based filtering on the links' text in the popup.
# Version 1.2
* Fix popup width oddness.
# Version 1.1
* Switch to ES6 modules to facilitate code reuse.
* Add a popup to permit opening a subset of links.
* Update content script to look for enclosing anchors as well.
# Version 1.0
* Add a context menu entry to open all links in the selection in a new window.
