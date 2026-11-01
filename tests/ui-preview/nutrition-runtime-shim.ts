/** Browser QA only: production screens + adapter with an explicitly isolated in-memory store. */
import { createNutritionAdapter } from "../../src/services/nutrition/adapter";
import type { Entry, Targets } from "../../src/features/nutrition-v2/model";
let entries: Entry[] = [],
  targets: Targets = {};
const operations = new Set<string>();
const state = async () => ({ entries, targets });
export const productionNutrition = createNutritionAdapter(async () => ({
  load: state,
  record: async (e, op) => {
    if (!operations.has(op)) {
      operations.add(op);
      entries = [...entries, JSON.parse(JSON.stringify(e))];
    }
    return state();
  },
  update: async (e) => {
    entries = entries.map((v) => (v.id === e.id ? e : v));
    return state();
  },
  remove: async (id) => {
    entries = entries.filter((e) => e.id !== id);
    return state();
  },
  targets: async (t) => {
    targets = t;
    return state();
  },
}));
