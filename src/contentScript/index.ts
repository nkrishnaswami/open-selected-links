import browser from 'webextension-polyfill';
import { handleMessage, invalidateExtractor } from './message';

document.addEventListener('selectionchange', invalidateExtractor)
browser.runtime.onMessage.addListener(handleMessage as browser.Runtime.OnMessageListener);
console.log('Open Selected Links ready');
