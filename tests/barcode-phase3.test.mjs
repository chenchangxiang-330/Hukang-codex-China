import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const barcode = await import('../src/domain/barcode/normalize.ts');
const {
  normalizeBarcode, validateBarcode, expandUpcEToUpcA,
} = barcode;
const { BarcodeScanGate, LatestBarcodeLookup } = await import('../src/application/usecases/BarcodeScanCoordinator.ts');

function scan(rawValue, format) {
  return { rawValue, format, decodedAt: '2026-10-13T00:00:00.000Z' };
}

test('EAN-13 keeps the scanned string and leading zero while producing a GTIN-14 lookup key', () => {
  const result = normalizeBarcode(scan('0690123456787', 'ean13'));
  assert.equal(result.validity, 'valid');
  assert.equal(result.scan.rawValue, '0690123456787');
  assert.equal(result.gtin, '0690123456787');
  assert.equal(result.lookupKey, '00690123456787');
});

test('EAN-8 validates its check digit and does not silently pad the raw value', () => {
  const result = validateBarcode(scan('96385074', 'EAN_8'));
  assert.equal(result.validity, 'valid');
  assert.equal(result.gtin, '96385074');
  assert.equal(result.lookupKey, '00000096385074');
  assert.equal(result.scan.rawValue, '96385074');
});

test('UPC-A remains a 12-digit GTIN while lookup uses an equivalent GTIN-14 key', () => {
  const result = normalizeBarcode(scan('042100005264', 'upc_a'));
  assert.equal(result.validity, 'valid');
  assert.equal(result.gtin, '042100005264');
  assert.equal(result.lookupKey, '00042100005264');
});

test('UPC-E expands only when the scanner explicitly reports UPC-E', () => {
  assert.equal(expandUpcEToUpcA('04252614'), '042100005264');
  const result = normalizeBarcode(scan('04252614', 'upc_e'));
  assert.equal(result.validity, 'valid');
  assert.equal(result.gtin, '042100005264');
  assert.equal(result.lookupKey, '00042100005264');
  const ambiguous = normalizeBarcode(scan('04252614', 'unknown'));
  assert.equal(ambiguous.validity, 'not_gtin');
  assert.equal(ambiguous.gtin, null);
  assert.equal(ambiguous.lookupKey, null);
});

test('bad check digits are invalid, not a local-food miss', () => {
  const result = validateBarcode(scan('6901234567890', 'ean13'));
  assert.equal(result.validity, 'invalid');
  assert.equal(result.gtin, null);
  assert.equal(result.lookupKey, null);
  assert.ok(result.reason);
});

test('QR and unsupported formats are not guessed as food barcodes', () => {
  for (const format of ['qr', 'code128', 'DATA_MATRIX', '']) {
    const result = normalizeBarcode(scan('6901234567892', format));
    assert.equal(result.validity, 'not_gtin', format);
    assert.equal(result.gtin, null, format);
    assert.equal(result.lookupKey, null, format);
  }
});

test('whitespace is rejected without altering the original scanner value', () => {
  const result = normalizeBarcode(scan(' 6901234567892 ', 'ean13'));
  assert.notEqual(result.validity, 'valid');
  assert.equal(result.scan.rawValue, ' 6901234567892 ');
});

test('camera-frame gate allows one task, rejects in-flight and repeated frames', () => {
  let now = 1000;
  const gate = new BarcodeScanGate(1200, () => now);
  const first = gate.begin(normalizeBarcode(scan('6900000000014', 'EAN_13')));
  assert.equal(first.accepted, true);
  const inFlight = gate.begin(normalizeBarcode(scan('6900000000021', 'EAN_13')));
  assert.deepEqual(inFlight, { accepted: false, reason: 'busy', lookupKey: '06900000000021' });
  first.release();
  const repeat = gate.begin(normalizeBarcode(scan('6900000000014', 'EAN_13')));
  assert.deepEqual(repeat, { accepted: false, reason: 'duplicate', lookupKey: '06900000000014' });
  now += 1200;
  const afterCooldown = gate.begin(normalizeBarcode(scan('6900000000014', 'EAN_13')));
  assert.equal(afterCooldown.accepted, true);
  afterCooldown.release();
});

test('latest-only local lookup cannot let a slow product A overwrite product B', async () => {
  const lookup = new LatestBarcodeLookup();
  let resolveA;
  const slowA = new Promise((resolve) => { resolveA = resolve; });
  const a = lookup.run('00000000000001', () => slowA);
  const b = lookup.run('00000000000002', async () => 'food-b');
  assert.equal(await b, 'food-b');
  resolveA('food-a');
  assert.equal(await a, undefined);
  lookup.cancel();
});

