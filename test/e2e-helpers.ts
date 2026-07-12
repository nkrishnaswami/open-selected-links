// Shared helpers for e2e specs that need real link rows in the popup (not just
// static UI presence, which is all test/e2e.test.ts checks).
//
// Chrome's `activeTab` — the only host-access permission this extension ships
// with — is granted on a real user gesture on the toolbar icon, which
// Playwright cannot simulate. These tests instead load a copy of the build
// with a narrow, localhost-only `host_permissions` grant added, so the
// content script can be injected into our own test pages without that
// gesture. The patched copy lives in a temp directory; the checked-in
// manifest and the shipped `build/` output are never touched.
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';

export function buildPermissiveExtension(buildDir: string): string {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'osl-e2e-'));
  fs.cpSync(buildDir, dest, { recursive: true });
  const manifestPath = path.join(dest, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dest;
}

export interface TestServer {
  url: string;
  close: () => void;
}

export function startTestServer(html: string): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}
