import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version, 'Package and extension versions must match.');

for (const page of [manifest.action.default_popup, manifest.options_ui.page, 'resume.html', 'debug.html']) {
  const html = await readFile(resolve(root, page), 'utf8');
  assert(!/<script\b[^>]*>\s*[^<\s]/i.test(html), 'Extension pages must not contain inline scripts.');
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
    assert(!/^(?:https?:)?\/\//.test(asset), 'Executable assets must be bundled locally.');
    await access(resolve(root, asset));
  }
}
console.log('Extension package verified: Manifest V3, matching versions, and local page assets.');
