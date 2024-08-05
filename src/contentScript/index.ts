import { handleMessage, invalidateExtractor } from './message';

document.addEventListener('selectionchange', invalidateExtractor)
chrome.runtime.onMessage.addListener(handleMessage);
console.log('Open Selected Links ready');
