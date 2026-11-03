/** Browser QA only: production screens + adapter with an explicitly isolated in-memory store. */
import { createNutritionAdapter } from "../../src/services/nutrition/adapter";
import type { Entry, Targets } from "../../src/features/nutrition-v2/model";
let metadata: any = { onboardingDeferred: true, catalogue: [], covers: {} };
let entries: Entry[] = [],
  targets: Targets = {};
const operations = new Set<string>();
const state = async () => ({ entries, targets, ...metadata });
export const productionNutrition = createNutritionAdapter(async () => ({
  load: state,
  profile: async (p) => {
    metadata.profile = {
      ...p,
      revision: (metadata.profile?.revision ?? 0) + 1,
    };
    return state();
  },
  targetDraft: async (d) => {
    metadata.targetDraft = d;
    return state();
  },
  applyDraft: async (d) => {
    targets = { policies: d.policies };
    metadata.targetDraft = null;
    return state();
  },
  defer: async () => {
    metadata.onboardingDeferred = true;
    return state();
  },
  intakeDraft: async (e) => {
    metadata.intakeDraft = e;
    return state();
  },
  captureDraft: async (d) => {
    metadata.captureDraft = d;
    return state();
  },
  catalogueFood: async (f) => {
    metadata.catalogue = metadata.catalogue.map((v: any) =>
      v.id === f.id ? f : v,
    );
    return state();
  },
  restoreCover: async () => state(),
  retryCover: async () => state(),
  record: async (e, op) => {
    if (!operations.has(op)) {
      operations.add(op);
      entries = [...entries, JSON.parse(JSON.stringify(e))];
      if (!metadata.catalogue.some((f: any) => f.id === e.food.id))
        metadata.catalogue.push(e.food);
      metadata.intakeDraft = null;
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
