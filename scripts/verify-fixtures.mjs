import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tests/fixtures/china-food');
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.ok(manifest.images.length > 0);
const ids = new Set();
for (const fixture of manifest.images) {
  assert.ok(!ids.has(fixture.fixtureId), 'Duplicate fixture ID');
  ids.add(fixture.fixtureId);
  assert.equal(path.basename(fixture.image), fixture.image, 'Fixture paths must stay in fixture directory');
  const bytes = await readFile(path.join(dir, fixture.image));
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, fixture.sha256, `Changed original image: ${fixture.image}`);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8, 'Expected original JPEG input');
  const source = JSON.parse(await readFile(path.join(dir, fixture.sourceMetadata), 'utf8'));
  assert.equal(source.sha256, hash);
  assert.equal(source.width, fixture.width);
  assert.equal(source.height, fixture.height);
  assert.equal(source.source.license, fixture.license);
  assert.ok(source.source.uploader && source.source.imageUrl && source.source.licenseUrl);
  assert.equal(fixture.capturedInThisPhase, false, 'Archived images are not new camera captures');
  console.log(`${fixture.fixtureId}: original SHA-256 and attribution verified`);
}
console.log('Fixture verification does not execute OCR. Android evidence is required separately.');
