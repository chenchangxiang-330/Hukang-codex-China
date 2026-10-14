import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const { normalizeBarcode } = await import('../src/domain/barcode/normalize.ts');
const { BarcodeScanGate, LatestBarcodeLookup } = await import('../src/application/usecases/BarcodeScanCoordinator.ts');

function scan(rawValue, format = 'EAN_13') {
  return { rawValue, format, decodedAt: '2026-10-13T00:00:00.000Z' };
}

test('scan gate accepts one valid result, rejects in-flight frames, then suppresses duplicates', () => {
  let now = 1000;
  const gate = new BarcodeScanGate(500, () => now);
  const barcode = normalizeBarcode(scan('6901234567892'));
  const first = gate.begin(barcode);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const other = gate.begin(normalizeBarcode(scan('0690123456787')));
  assert.deepEqual(other, { accepted: false, reason: 'busy', lookupKey: '00690123456787' });
  first.release();
  const duplicate = gate.begin(barcode);
  assert.deepEqual(duplicate, { accepted: false, reason: 'duplicate', lookupKey: '06901234567892' });
  now += 501;
  const afterCooldown = gate.begin(barcode);
  assert.equal(afterCooldown.accepted, true);
});

test('invalid and unsupported scan results never create a gate task', () => {
  const gate = new BarcodeScanGate();
  const invalid = gate.begin(normalizeBarcode(scan('6901234567890')));
  assert.deepEqual(invalid, { accepted: false, reason: 'invalid', lookupKey: null });
  const qr = gate.begin(normalizeBarcode(scan('https://example.invalid', 'QR')));
  assert.deepEqual(qr, { accepted: false, reason: 'invalid', lookupKey: null });
});

test('latest lookup drops a stale result after the user scans another product', async () => {
  const lookup = new LatestBarcodeLookup();
  let resolveA;
  let resolveB;
  const a = lookup.run('key-a', () => new Promise((resolve) => { resolveA = resolve; }));
  const b = lookup.run('key-b', () => new Promise((resolve) => { resolveB = resolve; }));
  resolveA('product-a');
  assert.equal(await a, undefined);
  resolveB('product-b');
  assert.equal(await b, 'product-b');
});

test('cancelling latest lookup prevents a route result from updating an unmounted screen', async () => {
  const lookup = new LatestBarcodeLookup();
  let resolve;
  const pending = lookup.run('key-a', () => new Promise((done) => { resolve = done; }));
  lookup.cancel();
  resolve('late-result');
  assert.equal(await pending, undefined);
});

test('a stale lookup error is suppressed just like a stale success', async () => {
  const lookup = new LatestBarcodeLookup();
  let reject;
  const stale = lookup.run('key-a', () => new Promise((_, done) => { reject = done; }));
  const current = lookup.run('key-b', async () => 'product-b');
  reject(new Error('stale database failure'));
  assert.equal(await stale, undefined);
  assert.equal(await current, 'product-b');
});

