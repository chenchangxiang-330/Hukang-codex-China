/** TEST ONLY in-memory actions; never a replacement for SQLite acceptance. */
let actions: Record<string, (...args: any[]) => any> = {};
export function setPreviewStore(next: typeof actions) {
  actions = next;
}
export const addStock = (...args: any[]) => actions.addStock?.(...args);
export const reduceStock = (...args: any[]) => actions.reduceStock?.(...args);
export const removeStock = (...args: any[]) => actions.removeStock?.(...args);
export const deleteProduct = (...args: any[]) =>
  actions.deleteProduct?.(...args);

export const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const addCatalogueStock = (...args: any[]) =>
  actions.addStock?.(...args);
