import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DIST, expect, readManifest, test } from './fixtures';

test.describe('собранное расширение', () => {
  test('это сборка Manifest V3 с ожидаемыми точками входа', () => {
    const manifest = readManifest();
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe('background/index.js');
    expect(manifest.background.type).toBe('module');
    expect(manifest.side_panel.default_path).toBe('src/sidepanel/index.html');
    expect(manifest.action.default_popup).toBe('src/popup/index.html');
  });

  test('содержит все файлы, на которые ссылается манифест', () => {
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

  test('не просит доступ к сайтам при установке', () => {
    const manifest = readManifest();
    const permissions = manifest.permissions;
    expect(permissions).not.toContain('<all_urls>');
    expect(permissions).not.toContain('webRequest');
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest.content_scripts).toBeUndefined();
  });

  test('сохраняет строгую политику безопасности контента', () => {
    const manifest = readManifest();
    const csp = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
  });

  test('собирает content-скрипт как самодостаточный классический скрипт', () => {
    const source = readFileSync(resolve(DIST, 'content/index.js'), 'utf8');
    expect(source.length).toBeGreaterThan(1000);
    // Внедряемый файл не может использовать синтаксис ESM.
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s/m);
  });

  test('ни в одном бандле нет eval и загрузки удалённых скриптов', () => {
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

  test('в сборке нет захардкоженного API-ключа', () => {
    const files = readdirSync(resolve(DIST, 'assets')).filter((name) => name.endsWith('.js'));
    for (const name of files) {
      const source = readFileSync(resolve(DIST, 'assets', name), 'utf8');
      expect(source, name).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(source, name).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    }
  });
});
