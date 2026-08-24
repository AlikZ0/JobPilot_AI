import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DIST, expect, readManifest, test } from './fixtures';

test.describe('packaged extension', () => {
  test('is a Manifest V3 bundle with the expected entry points', () => {
    const manifest = readManifest();
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe('background/index.js');
    expect(manifest.background.type).toBe('module');
    expect(manifest.side_panel.default_path).toBe('src/sidepanel/index.html');
    expect(manifest.action.default_popup).toBe('src/popup/index.html');
  });

  test('ships every file the manifest references', () => {
    const manifest = readManifest();
    const paths = [
      manifest.background.service_worker,
      manifest.side_panel.default_path,
      manifest.action.default_popup,
      ...Object.values(manifest.icons),
      'content/index.js',
    ];
    for (const path of paths) {
      expect(existsSync(resolve(DIST, path)), path).toBe(true);
    }
  });

  test('asks for no install-time host access', () => {
    const manifest = readManifest();
    const permissions = manifest.permissions;
    expect(permissions).not.toContain('<all_urls>');
    expect(permissions).not.toContain('webRequest');
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest.content_scripts).toBeUndefined();
  });

  test('keeps a restrictive content security policy', () => {
    const manifest = readManifest();
    const csp = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
  });

  test('builds the content script as a self-contained classic script', () => {
    const source = readFileSync(resolve(DIST, 'content/index.js'), 'utf8');
    expect(source.length).toBeGreaterThan(1000);
    // An injected file cannot use ESM syntax.
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s/m);
  });

  test('contains no eval or remote script loading in any bundle', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(resolve(dir, entry.name));
        else if (entry.name.endsWith('.js')) files.push(resolve(dir, entry.name));
      }
    };
    walk(DIST);
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\beval\(/);
      expect(source, file).not.toMatch(/new Function\(/);
      expect(source, file).not.toMatch(/https?:\/\/[^"'\s]*\.js["'\s]/);
    }
  });

  test('never bundles a hardcoded API key', () => {
    const files = readdirSync(resolve(DIST, 'assets')).filter((name) => name.endsWith('.js'));
    for (const name of files) {
      const source = readFileSync(resolve(DIST, 'assets', name), 'utf8');
      expect(source, name).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(source, name).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    }
  });
});
