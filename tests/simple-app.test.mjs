import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import './register-typescript.mjs';
const { parseQuantity,validateExpiry,localDay,expiryLabel } = await import('../src/domain/inventory/rules.ts');
const { sharedCatalogue } = await import('../src/features/simple/catalogue.ts');
const { DatabaseSync } = await import('node:sqlite');
const { createSQLiteFoodStore } = await import('../src/infrastructure/food/sqliteFoodStore.ts');
test('inventory quantities are positive whole package counts, not nutrition amounts',()=>{
  for(const [input,value] of [['1',1],[' 2 ',2],['9999',9999]])assert.equal(parseQuantity(input),value);
  for(const input of ['0','-1','1.5','NaN','1e3','10000',''])assert.throws(()=>parseQuantity(input));
});
test('expiry dates validate actual calendar days and preserve unknown',()=>{
 assert.equal(validateExpiry(''),null);assert.equal(validateExpiry('2028-02-29'),'2028-02-29');
 for(const d of ['2026-02-29','2026-13-01','2026-04-31','tomorrow'])assert.throws(()=>validateExpiry(d));
 assert.equal(expiryLabel(null),'未设置到期日');assert.equal(expiryLabel('2026-10-14','2026-10-14'),'今天到期');
 assert.equal(localDay(new Date(2026,9,14,23)),'2026-10-14');
});
const food = status=>({id:'private-id',status,createdAt:'private-date',revisions:[{private:'data'}],review:{name:'牛奶',brand:'品牌',ingredients:'生牛乳',columns:[{basisKind:'per_100ml',basisRawText:'每100mL',servingAmount:'',servingUnit:'unknown',rows:[{nutrient:'protein',label:'蛋白质',amount:'3.6',unit:'g',nrvPercent:'6',nrvNotDeclared:false}]}]},barcodes:[{rawValue:'0690123456787',format:'EAN_13',lookupKey:'00690123456787',acquiredBy:'camera',scannedAt:'private-date'}],evidence:{raw:'private OCR',uri:'file:///private'}});
test('shared catalogue includes only confirmed foods and preserves raw leading zeros',()=>{
 const result=sharedCatalogue([food('draft'),food('confirmed')],'export-time');
 assert.equal(result.products.length,1);assert.equal(result.products[0].barcodes[0].rawValue,'0690123456787');
 assert.equal(result.products[0].nutrition[0].nutrients[0].printedAmount,'3.6');
 const json=JSON.stringify(result);for(const denied of ['private-id','private-date','private OCR','file://','acquiredBy','scannedAt','inventory'])assert.equal(json.includes(denied),false,denied);
});
test('schema v6 adds independent inventory with foreign key protection and idempotency',async()=>{
 const database=new DatabaseSync(':memory:');
 const driver={async exec(s){database.exec(s)},async run(s,...v){database.prepare(s).run(...v)},async get(s,...v){return database.prepare(s).get(...v)??null},async all(s,...v){return database.prepare(s).all(...v)},async transaction(task){database.exec('BEGIN IMMEDIATE');try{const r=await task(driver);database.exec('COMMIT');return r}catch(e){database.exec('ROLLBACK');throw e}}};
 const store=createSQLiteFoodStore(driver,{});
 assert.deepEqual(await store.listFoods(),[]);
 assert.equal(database.prepare('PRAGMA user_version').get().user_version,6);
 database.exec(`INSERT INTO foods VALUES('product','a','a','confirmed','牛奶','','{}')`);
 const add=database.prepare("INSERT INTO simple_inventory VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING");
 add.run('purchase1','product',2,'瓶',null,'a');add.run('purchase1','product',2,'瓶',null,'a');add.run('purchase2','product',1,'瓶',null,'b');
 assert.equal(database.prepare('SELECT count(*) n FROM foods').get().n,1);
 assert.equal(database.prepare('SELECT count(*) n FROM simple_inventory').get().n,2);
 assert.equal(database.prepare('SELECT sum(quantity) n FROM simple_inventory').get().n,3);
 assert.throws(()=>add.run('bad','product',0,'瓶',null,'b'));
 assert.throws(()=>database.exec("DELETE FROM foods WHERE id='product'"));
 database.exec("DELETE FROM simple_inventory WHERE id='purchase1'");
 assert.equal(database.prepare('SELECT count(*) n FROM foods').get().n,1);database.close();
});
test('production entry is the simple app, not OCR Lab or the network identity screen',()=>{
 const entry=readFileSync(new URL('../src/app/index.tsx',import.meta.url),'utf8');assert.match(entry,/simple\/SimpleApp/);
 const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 assert.match(manifest,/android.permission.INTERNET" tools:node="remove"/);
 const ui=['SimpleApp.tsx','HomeScreens.tsx','ProductScreens.tsx','CaptureScreens.tsx'].map(f=>readFileSync(new URL('../src/features/simple/'+f,import.meta.url),'utf8')).join('\n');
 assert.doesNotMatch(ui,/ConfiguredChinaFoodProvider|fetch\(/);
 for(const text of ['拍一拍','加入我的库存','导出食品资料包','确认并保存食品'])assert.ok(ui.includes(text));
});
