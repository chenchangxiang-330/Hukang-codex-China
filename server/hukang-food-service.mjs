import http from 'node:http';
import { createVendorLookup, VendorError } from './vendor-adapter.mjs';

const PORT = Number(process.env.HUKANG_PORT || 8787);
const MAX_BODY_BYTES = 4 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const SUPPORTED = new Set(['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E']);

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function hasValidCheckDigit(digits) {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const check = Number(digits.at(-1));
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 2; i >= 0; i -= 1) { sum += Number(digits[i]) * weight; weight = weight === 3 ? 1 : 3; }
  return (10 - (sum % 10)) % 10 === check;
}
function expandUpcE(value) {
  if (!/^\d{8}$/.test(value) || !['0', '1'].includes(value[0])) return null;
  const [n, x1, x2, x3, x4, x5, x6, check] = value;
  let body;
  if (['0', '1', '2'].includes(x6)) body = `${n}${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  else if (x6 === '3') body = `${n}${x1}${x2}${x3}00000${x4}${x5}`;
  else if (x6 === '4') body = `${n}${x1}${x2}${x3}${x4}00000${x5}`;
  else body = `${n}${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  const expanded = `${body}${check}`;
  return hasValidCheckDigit(expanded) ? expanded : null;
}
function canonicalBarcode(input) {
  if (!input || typeof input !== 'object') return null;
  const { rawValue, gtin, lookupKey, format } = input;
  if (typeof rawValue !== 'string' || typeof gtin !== 'string' || typeof lookupKey !== 'string' || typeof format !== 'string') return null;
  if (!SUPPORTED.has(format) || !/^\d+$/.test(rawValue) || !/^\d{14}$/.test(lookupKey)) return null;
  const expected = { EAN_13: 13, EAN_8: 8, UPC_A: 12, UPC_E: 8 }[format];
  if (rawValue.length !== expected) return null;
  let canonical = null;
  if (format === 'UPC_E') canonical = expandUpcE(rawValue);
  else if (hasValidCheckDigit(rawValue)) canonical = rawValue;
  if (!canonical || gtin !== canonical || lookupKey !== canonical.padStart(14, '0')) return null;
  return { rawValue, gtin: canonical, lookupKey, format };
}
async function readJson(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new VendorError('INVALID_REQUEST', 'Request body too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new VendorError('INVALID_REQUEST', 'Request body is not JSON.'); }
}
function statusForError(error) {
  if (error?.code === 'NOT_FOUND') return [200, { ok: true, data: { found: false } }];
  if (error?.code === 'UNSUPPORTED_FORMAT') return [422, { ok: false, error: { code: 'UNSUPPORTED_FORMAT' } }];
  if (error?.code === 'UNAUTHORIZED') return [502, { ok: false, error: { code: 'UNAUTHORIZED' } }];
  if (error?.code === 'RATE_LIMITED') return [429, { ok: false, error: { code: 'RATE_LIMITED', retryAfterSeconds: error.retryAfterSeconds } }];
  if (error?.code === 'NOT_CONFIGURED') return [503, { ok: false, error: { code: 'NOT_CONFIGURED' } }];
  if (error?.code === 'IDENTITY_CONFLICT') return [502, { ok: false, error: { code: 'IDENTITY_CONFLICT' } }];
  if (error?.code === 'INVALID_RESPONSE') return [502, { ok: false, error: { code: 'INVALID_RESPONSE' } }];
  return [502, { ok: false, error: { code: 'SERVICE_UNAVAILABLE' } }];
}

/**
 * Create the fixed-route service. The adapter is injected by deployment code;
 * this keeps tests deterministic and prevents arbitrary URL forwarding.
 */
export function createHukangFoodService({ vendorLookup = createVendorLookup(), now = () => new Date().toISOString() } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/food-identity/lookup') {
      json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
      return;
    }
    let body;
    try { body = await readJson(req); }
    catch (error) { const [, payload] = statusForError(error); json(res, 400, payload); return; }
    const barcode = canonicalBarcode(body);
    if (!barcode) { json(res, 422, { ok: false, error: { code: 'INVALID_REQUEST' } }); return; }
    let timeoutHandle;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new VendorError('SERVICE_UNAVAILABLE', 'Vendor timeout.')), REQUEST_TIMEOUT_MS);
      });
      const vendor = await Promise.race([vendorLookup(barcode), timeoutPromise]);
      if (!vendor || typeof vendor !== 'object' || typeof vendor.name !== 'string' || !vendor.name.trim()) {
        json(res, 502, { ok: false, error: { code: 'INVALID_RESPONSE' } });
        return;
      }
      const safe = {
        name: vendor.name.trim().slice(0, 200),
        brand: typeof vendor.brand === 'string' ? vendor.brand.trim().slice(0, 200) || null : null,
        specification: typeof vendor.specification === 'string' ? vendor.specification.trim().slice(0, 200) || null : null,
        category: typeof vendor.category === 'string' ? vendor.category.trim().slice(0, 200) || null : null,
        manufacturer: typeof vendor.manufacturer === 'string' ? vendor.manufacturer.trim().slice(0, 200) || null : null,
        sourceRecordId: typeof vendor.sourceRecordId === 'string' ? vendor.sourceRecordId.trim().slice(0, 160) || null : null,
        sourceUpdatedAt: typeof vendor.sourceUpdatedAt === 'string' ? vendor.sourceUpdatedAt.trim().slice(0, 80) || null : null,
        gtin: barcode.gtin,
        lookupKey: barcode.lookupKey,
        format: barcode.format,
      };
      json(res, 200, { ok: true, data: safe, obtainedAt: now() });
    } catch (error) {
      const [status, payload] = statusForError(error);
      json(res, status, payload, error?.code === 'RATE_LIMITED' ? { 'retry-after': String(error.retryAfterSeconds ?? 0) } : {});
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createHukangFoodService();
  server.listen(PORT, '127.0.0.1', () => console.log(`Hukang food identity service listening on 127.0.0.1:${PORT}`));
}
