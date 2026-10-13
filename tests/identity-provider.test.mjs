import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const { ConfiguredChinaFoodProvider } = await import('../src/infrastructure/food/providers/ConfiguredChinaFoodProvider.ts');
const { LocalFirstChinaFoodLookup } = await import('../src/infrastructure/food/LocalFirstChinaFoodLookup.ts');

function query(overrides = {}) {
  return {
    rawValue: '6901234567892',
    gtin: '6901234567892',
    lookupKey: '06901234567892',
    format: 'EAN_13',
    ...overrides,
  };
}

test('provider fails closed without an endpoint and never invokes fetch', async () => {
  let calls = 0;
  const provider = new ConfiguredChinaFoodProvider({ fetchImpl: async () => { calls += 1; throw new Error('must not call'); } });
  assert.deepEqual(await provider.lookup(query()), { status: 'not_configured', message: '国内商品查询服务尚未配置。' });
  assert.equal(calls, 0);
});

test('disabled provider is an explicit status and does not fall back to a network call', async () => {
  let calls = 0;
  const provider = new ConfiguredChinaFoodProvider({
    baseUrl: 'https://food.example.test', enabled: false,
    fetchImpl: async () => { calls += 1; throw new Error('must not call'); },
  });
  assert.deepEqual(await provider.lookup(query()), { status: 'disabled', message: '国内商品查询已关闭。' });
  assert.equal(calls, 0);
});

test('provider rejects arbitrary origins and paths before sending a request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not call'); };
  const insecure = new ConfiguredChinaFoodProvider({ baseUrl: 'http://food.example.test', fetchImpl });
  const path = new ConfiguredChinaFoodProvider({ baseUrl: 'https://food.example.test/other', fetchImpl });
  assert.equal((await insecure.lookup(query())).status, 'not_configured');
  assert.equal((await path.lookup(query())).status, 'not_configured');
  assert.equal(calls, 0);
});

test('found response sends only validated identity fields and maps the result', async () => {
  const calls = [];
  const provider = new ConfiguredChinaFoodProvider({
    baseUrl: 'https://food.example.test',
    now: () => '2026-10-13T01:02:03.000Z',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true, status: 200,
        async json() { return { ok: true, data: {
          name: '纯牛奶', brand: '示例品牌', specification: '250mL', category: '乳制品',
          manufacturer: '示例厂', sourceRecordId: 'record-1',
          gtin: '6901234567892', lookupKey: '06901234567892',
          // A supplier nutrition field must not enter the identity response.
          protein: 3.2,
        } }; },
      };
    },
  });
  const result = await provider.lookup(query());
  assert.equal(result.status, 'found');
  assert.deepEqual(result.identity, {
    name: '纯牛奶', brand: '示例品牌', specification: '250mL', category: '乳制品',
    manufacturer: '示例厂', sourceRecordId: 'record-1', sourceId: 'hukang-china-food-service',
    sourceName: 'Hukang 国内商品身份服务', obtainedAt: '2026-10-13T01:02:03.000Z', sourceUpdatedAt: null,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://food.example.test/v1/food-identity/lookup');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, { gtin: '6901234567892', lookupKey: '06901234567892', format: 'EAN_13' });
  assert.equal('image' in body, false);
  assert.equal('ocrText' in body, false);
  assert.equal('nutrition' in body, false);
});

test('duplicate identity calls for one barcode share a single in-flight request', async () => {
  let calls = 0;
  let resolve;
  const provider = new ConfiguredChinaFoodProvider({
    baseUrl: 'https://food.example.test',
    fetchImpl: async () => {
      calls += 1;
      await new Promise(done => { resolve = done; });
      return { ok: false, status: 404, async json() { return { ok: false, error: { code: 'NOT_FOUND' } }; } };
    },
  });
  const first = provider.lookup(query());
  const second = provider.lookup(query());
  assert.equal(calls, 1);
  resolve();
  assert.equal((await first).status, 'not_found');
  assert.equal((await second).status, 'not_found');
});

test('provider maps business errors separately from transport errors', async () => {
  const response = (status, payload) => async () => ({ ok: status >= 200 && status < 300, status, async json() { return payload; } });
  const cases = [
    [404, { ok: false, error: { code: 'NOT_FOUND' } }, 'not_found'],
    [401, { ok: false, error: { code: 'INVALID_KEY' } }, 'unauthorized'],
    [429, { ok: false, error: { code: 'QUOTA_EXCEEDED', retryAfterSeconds: 8 } }, 'rate_limited'],
    [503, { ok: false, error: { code: 'SERVICE_UNAVAILABLE' } }, 'unavailable'],
  ];
  for (const [status, payload, expected] of cases) {
    const provider = new ConfiguredChinaFoodProvider({ baseUrl: 'https://food.example.test', fetchImpl: response(status, payload) });
    const result = await provider.lookup(query());
    assert.equal(result.status, expected);
    if (expected === 'rate_limited') assert.equal(result.retryAfterSeconds, 8);
  }
  const offline = new ConfiguredChinaFoodProvider({ baseUrl: 'https://food.example.test', fetchImpl: async () => { throw new TypeError('network down'); } });
  assert.equal((await offline.lookup(query())).status, 'offline');
});

test('invalid response and barcode identity conflict fail closed', async () => {
  const malformed = new ConfiguredChinaFoodProvider({
    baseUrl: 'https://food.example.test',
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { ok: true, data: { brand: '缺商品名' } }; } }),
  });
  assert.equal((await malformed.lookup(query())).status, 'invalid_response');
  const conflict = new ConfiguredChinaFoodProvider({
    baseUrl: 'https://food.example.test',
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { ok: true, data: { name: '另一商品', lookupKey: '00000000000000' } }; } }),
  });
  assert.equal((await conflict.lookup(query())).status, 'invalid_response');
});

test('local-first lookup never calls provider for a local hit', async () => {
  let providerCalls = 0;
  const provider = { enabled: true, kind: 'CHINA_SERVICE', sourceId: 'mock', sourceName: 'mock', async lookup() { providerCalls += 1; return { status: 'found', identity: { name: 'remote' } }; } };
  const record = { id: 'food-local', review: { name: '本地商品' } };
  const local = { async getFoodByBarcode(key) { assert.equal(key, '06901234567892'); return { record, barcode: { lookupKey: key } }; } };
  const lookup = new LocalFirstChinaFoodLookup(local, provider);
  const result = await lookup.lookup(query());
  assert.equal(result.status, 'local_found');
  assert.equal(result.record, record);
  assert.equal(providerCalls, 0);
});

test('local-first lookup exposes configured provider status on a miss', async () => {
  const local = { async getFoodByBarcode() { return null; } };
  const provider = { enabled: true, kind: 'CHINA_SERVICE', sourceId: 'mock', sourceName: 'mock', async lookup() { return { status: 'timeout', message: '查询超时' }; } };
  const result = await new LocalFirstChinaFoodLookup(local, provider).lookup(query());
  assert.deepEqual(result, { status: 'not_found', providerStatus: 'timeout', message: '查询超时' });
});

test('stale provider result cannot overwrite a later barcode lookup', async () => {
  let resolveA;
  const local = { async getFoodByBarcode() { return null; } };
  const provider = {
    enabled: true, kind: 'CHINA_SERVICE', sourceId: 'mock', sourceName: 'mock',
    async lookup(item) {
      if (item.lookupKey.endsWith('1')) return new Promise(resolve => { resolveA = resolve; });
      return { status: 'not_found', message: 'B 未收录' };
    },
  };
  const lookup = new LocalFirstChinaFoodLookup(local, provider);
  const first = lookup.lookup(query({ lookupKey: '00000000000001', gtin: '000000000001' }));
  // Let A reach the provider before starting B; otherwise both calls are
  // still waiting on the synchronous local miss in the same microtask turn.
  await new Promise(resolve => setImmediate(resolve));
  const second = lookup.lookup(query({ lookupKey: '00000000000002', gtin: '000000000002' }));
  assert.equal((await second).status, 'not_found');
  resolveA({ status: 'found', identity: { name: 'A' } });
  assert.equal((await first).status, 'stale');
});
