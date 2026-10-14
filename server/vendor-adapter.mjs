/**
 * Vendor adapter boundary for the Hukang-owned domestic service.
 *
 * No vendor URL or API key is present in this repository. Until a provider's
 * current API contract, rights and deployment credentials are approved, the
 * production-safe default is fail-closed NOT_CONFIGURED. A deployment may
 * supply an adapter at process startup; that adapter must call one fixed,
 * documented vendor endpoint and return only identity fields.
 */
export class VendorError extends Error {
  constructor(code, message, retryAfterSeconds) {
    super(message);
    this.name = 'VendorError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function notConfiguredVendor() {
  return async () => {
    throw new VendorError('NOT_CONFIGURED', 'No approved domestic provider is configured.');
  };
}

/**
 * This factory deliberately does not read an API key or URL from a client
 * request. It is the only place deployment code should wire a vendor adapter.
 */
export function createVendorLookup({ adapter } = {}) {
  return typeof adapter === 'function' ? adapter : notConfiguredVendor();
}
