import { vi } from 'vitest';

// without chrome.runtime.id webextension-polyfill won't work
const chromeObject = { runtime: { id: 'some-test-id' } };
(globalThis as any).chrome = chromeObject;

vi.mock('webextension-polyfill');
