/** Additive only. Existing intake JSON remains untouched and independently readable. */
export const NUTRITION_MIGRATION_V8 = `
CREATE TABLE IF NOT EXISTS nutrition_state (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nutrition_catalogue (food_id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, asset_id TEXT);
CREATE TABLE IF NOT EXISTS nutrition_covers (food_id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nutrition_stock (id TEXT PRIMARY KEY NOT NULL, food_id TEXT NOT NULL REFERENCES nutrition_catalogue(food_id), quantity REAL NOT NULL, unit TEXT NOT NULL, expires_on TEXT, created_at TEXT NOT NULL);
INSERT OR IGNORE INTO nutrition_catalogue(food_id,json,asset_id)
 SELECT json_extract(snapshot_json,'$.food.id'),
 json_set(json_extract(snapshot_json,'$.food'),'$.kind',COALESCE(json_extract(snapshot_json,'$.food.kind'),CASE WHEN json_extract(snapshot_json,'$.food.provenance.kind')='label' THEN 'packaged' ELSE 'meal' END)),
 CASE WHEN json_extract(snapshot_json,'$.food.image') IS NOT NULL THEN id ELSE NULL END
 FROM nutrition_entries ORDER BY confirmed_at DESC,id;
INSERT OR IGNORE INTO nutrition_covers(food_id,json)
 SELECT food_id,json_object('foodId',food_id,'original',json_extract(json,'$.image'),
 'assetId',asset_id,'inputVersion',json_extract(json,'$.version'),'selectionVersion',0,
 'state','waiting_identity','attempts',0,'taskId',asset_id||'-0','processingVersion','pending-identity-v1')
 FROM nutrition_catalogue WHERE asset_id IS NOT NULL AND json_extract(json,'$.image') IS NOT NULL;
PRAGMA user_version = 8;
`;
