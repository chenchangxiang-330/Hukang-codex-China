/** TEST ONLY: isolated in-memory stand-in. Never exported to the native build. */
import type { ConnectionStorage } from "../../src/services/ai/connection";
let record: string | null = null;
export const secureConnectionStorage: ConnectionStorage = {
  read: async () => record,
  write: async (v) => {
    record = v;
  },
  delete: async () => {
    record = null;
  },
};
