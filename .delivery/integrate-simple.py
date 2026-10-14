from pathlib import Path
import json

def replace(path, old, new):
    p=Path(path); text=p.read_text()
    if old not in text:
        if new in text: return
        raise SystemExit('Integration precondition failed: '+path)
    p.write_text(text.replace(old,new))

replace('android/app/build.gradle','versionCode 4','versionCode 5')
replace('android/app/build.gradle','versionName "0.2.2"','versionName "0.3.0"')
replace('android/app/src/main/res/values/strings.xml','>护康 China<','>护康<')
replace('android/app/src/main/AndroidManifest.xml','<uses-permission android:name="android.permission.INTERNET"/>','<uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>')
p=Path('android/app/src/main/AndroidManifest.xml'); t=p.read_text()
if '<uses-permission android:name="android.permission.CAMERA"/>' not in t:
    p.write_text(t.replace('  <queries>','  <uses-permission android:name="android.permission.CAMERA"/>\n  <queries>'))
p=Path('app.json'); app=json.loads(p.read_text()); app['expo']['name']='护康'; app['expo']['version']='0.3.0'; app['expo']['android']['versionCode']=5
if 'android.permission.INTERNET' not in app['expo']['android']['blockedPermissions']: app['expo']['android']['blockedPermissions'].insert(0,'android.permission.INTERNET')
p.write_text(json.dumps(app,ensure_ascii=False,indent=2)+'\n')
replace('modules/hukang-barcode/android/build.gradle', "  implementation 'androidx.exifinterface:exifinterface:1.4.1'", "  implementation 'androidx.exifinterface:exifinterface:1.4.1'\n  implementation 'androidx.camera:camera-camera2:1.4.2'\n  implementation 'androidx.camera:camera-lifecycle:1.4.2'\n  implementation 'androidx.camera:camera-view:1.4.2'")
replace('modules/hukang-barcode/android/src/main/java/com/hukang/barcode/HukangBarcodeModule.kt','    Name("HukangBarcode")','''    Name("HukangBarcode")
    View(LiveBarcodeView::class) {
      Events("onBarcode", "onError")
      Prop("active") { view: LiveBarcodeView, active: Boolean -> view.setActive(active) }
      Prop("torch") { view: LiveBarcodeView, torch: Boolean -> view.setTorch(torch) }
    }
    AsyncFunction("exportArchive") { payload: String, assets: List<Map<String, Any?>> ->
      LocalExport.create(context(), payload, assets)
    }''')
replace('plugins/withOfflineAndroid.cjs', '    const app = manifest.application[0];', '''    const app = manifest.application[0];
    manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(item => item.$['android:name'] !== 'android.permission.INTERNET');
    manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.INTERNET', 'tools:node': 'remove' } });''')
replace('scripts/verify-apk.py','if "android.permission.INTERNET" not in permissions:\n    errors.append("Domestic product identity lookup requires INTERNET permission")','if "android.permission.INTERNET" in permissions:\n    errors.append("Local-only app must not have INTERNET permission")')
replace('src/infrastructure/food/sqliteFoodStore.ts','interface StoredRow {','''/** Additive migration: keep existing foods, evidence and revisions. */
const MIGRATION_V6 = `
CREATE TABLE IF NOT EXISTS simple_product_photos (
  food_id TEXT PRIMARY KEY NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  json TEXT NOT NULL, ocr_json TEXT
);
CREATE TABLE IF NOT EXISTS simple_capture_drafts (
  id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS simple_inventory (
  id TEXT PRIMARY KEY NOT NULL,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9999),
  unit TEXT NOT NULL, expires_on TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS simple_inventory_food ON simple_inventory(food_id);
PRAGMA user_version = 6;
`;

interface StoredRow {''')
replace('src/infrastructure/food/sqliteFoodStore.ts','else if (version !== 5) throw','else if (version !== 5 && version !== 6) throw')
replace('src/infrastructure/food/sqliteFoodStore.ts','    await cleanupExpiredIdentities();','    if (version !== undefined && version < 6) await driver.transaction(async transaction => { await transaction.exec(MIGRATION_V6); });\n    await cleanupExpiredIdentities();')
for f in ['tests/barcode-storage.test.mjs','tests/food-identity-storage.test.mjs']:
    replace(f,'.get().user_version, 5);','.get().user_version, 6);')
print('Integrated reviewed main app changes. Existing records are retained.')
