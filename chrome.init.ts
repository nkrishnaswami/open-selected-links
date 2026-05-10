import { vi } from 'vitest';

// vi.hoisted ensures this runs before any imports, so the factory can reference it
const browserMock = vi.hoisted(() => ({
  tabs: {
    sendMessage: vi.fn(),
    create: vi.fn(),
    query: vi.fn(),
    group: vi.fn(),
    discard: vi.fn(),
    update: vi.fn(),
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  windows: {
    create: vi.fn(),
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,
    WINDOW_ID_CUR: -2,
  },
  scripting: {
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
    update: vi.fn(),
    query: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  runtime: {
    id: 'some-test-id',
    onMessage: { addListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  commands: {
    onCommand: { addListener: vi.fn() },
  },
}));

vi.mock('webextension-polyfill', () => ({ default: browserMock }));

// Expose browser mock as a global so test files can use it without importing
(globalThis as any).browser = browserMock;
(globalThis as any).chrome = { runtime: { id: 'some-test-id' } };
