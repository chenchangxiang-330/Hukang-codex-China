import assert from 'node:assert/strict';
import test from 'node:test';
import { createHukangFoodService } from '../server/hukang-food-service.mjs';
import { VendorError } from '../server/vendor-adapter.mjs';

const valid = {
  rawValue: '6900000000014',
  gtin: '6900000000014',
  lookupKey: '06900000000014',
  format: 'EAN_13',
};

async function withServer(vendorLookup, callback) {
  const server = createHukangFoodService({ vendorLookup });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  try { return await callback(`http://127.0.0.1:${port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('service rejects arbitrary routes and malformed or forged barcode identity', async () => {
  await withServer(async () => ({ name: 'unused' }), async (base) => {
    const wrongRoute = await fetch(`${base}/proxy?url=https://vendor.example`, { method: 'POST', body: '{}' });
    assert.equal(wrongRoute.status, 404);
    const invalid = await fetch(`${base}/v1/food-identity/lookup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...valid, lookupKey: '00000000000000', image: 'file:///private/photo.jpg', ocrText: '营养成分表' }),
    });
    assert.equal(invalid.status, 422);
    assert.deepEqual(await invalid.json(), { ok: false, error: { code: 'INVALID_REQUEST' } });
  });
});

test('service calls only the injected vendor with canonical identity and strips unsupported fields', async () => {
  const calls = [];
  await withServer(async (barcode) => {
    calls.push(barcode);
    return {
      name: '  纯牛奶  ', brand: '示例品牌', specification: '250mL', category: '乳制品', manufacturer: '示例厂',
      sourceRecordId: 'supplier-1', sourceUpdatedAt: '2026-10-01',
      imageUrl: 'https://vendor.example/photo.jpg', nutrition: { protein: 3.2 },
    };
  }, async (base) => {
    const response = await fetch(`${base}/v1/food-identity/lookup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...valid, image: 'photo-bytes', ocrText: 'private', upstreamUrl: 'https://arbitrary.example', apiKey: 'fake' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, {
      name: '纯牛奶', brand: '示例品牌', specification: '250mL', category: '乳制品', manufacturer: '示例厂',
      sourceRecordId: 'supplier-1', sourceUpdatedAt: '2026-10-01', gtin: valid.gtin, lookupKey: valid.lookupKey, format: valid.format,
    });
    assert.equal('imageUrl' in body.data, false);
    assert.equal('nutrition' in body.data, false);
    assert.deepEqual(calls, [valid]);
  });
});

test('not configured and not found remain distinct business results', async () => {
  await withServer(async () => { throw new VendorError('NOT_CONFIGURED', 'missing'); }, async (base) => {
    const response = await fetch(`${base}/v1/food-identity/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: { code: 'NOT_CONFIGURED' } });
  });
  await withServer(async () => { throw new VendorError('NOT_FOUND', 'no record'); }, async (base) => {
    const response = await fetch(`${base}/v1/food-identity/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, data: { found: false } });
  });
});

test('vendor errors map to safe status codes without exposing details', async () => {
  await withServer(async () => { throw new VendorError('RATE_LIMITED', 'secret vendor body', 9); }, async (base) => {
    const response = await fetch(`${base}/v1/food-identity/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '9');
    const body = await response.json();
    assert.deepEqual(body, { ok: false, error: { code: 'RATE_LIMITED', retryAfterSeconds: 9 } });
    assert.equal(JSON.stringify(body).includes('secret'), false);
  });
});
