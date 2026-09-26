const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('manifest resources exist and the extension uses Manifest V3', () => {
  const manifest = JSON.parse(read('manifest.json'));

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.action?.default_popup);
  assert.ok(existsSync(path.join(root, manifest.action.default_popup)));

  for (const contentScript of manifest.content_scripts ?? []) {
    for (const file of contentScript.js ?? []) {
      assert.ok(existsSync(path.join(root, file)), `Missing content script: ${file}`);
    }
  }
});

test('popup JavaScript only selects elements present in the popup HTML', () => {
  const html = read('popup.html');
  const popup = read('popup.js');
  const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const selectedIds = [...popup.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);

  assert.ok(selectedIds.length > 0, 'Expected popup.js to select popup elements');
  for (const id of selectedIds) {
    assert.ok(htmlIds.has(id), `popup.js refers to missing element #${id}`);
  }
  assert.match(html, /<script\s+src=["']popup\.js["']/);
});

test('popup and content script share the expected message actions', () => {
  const popup = read('popup.js');
  const content = read('content.js');

  for (const action of ['GET_TABLES', 'HIGHLIGHT_TABLE']) {
    assert.ok(popup.includes(`action: '${action}'`), `Popup does not send ${action}`);
    assert.ok(content.includes(`message.action === '${action}'`), `Content script does not handle ${action}`);
  }
});
