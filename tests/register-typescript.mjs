import { registerHooks } from 'node:module';

// Node 24 strips TS syntax; this test-only hook resolves the extensionless imports used by Metro.
// Import this module before dynamically importing production TS. It changes no app runtime behavior.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
