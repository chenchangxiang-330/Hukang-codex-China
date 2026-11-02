import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import './register-typescript.mjs';
const { createNutritionStore, NUTRITION_MIGRATION_V7 } = await import('../src/services/nutrition/store.ts');
const { createNutritionAdapter } = await import('../src/services/nutrition/adapter.ts');
const { contribution, total, targetProgress } = await import('../src/features/nutrition-v2/model.ts');

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(NUTRITION_MIGRATION_V7);
  let failInsert = false, failCopy = false;
  const saved = new Set(), deleted = [];
  const driver = {
    exec: async s => { db.exec(s); },
    run: async (s,...v) => { if (failInsert && s.startsWith('INSERT INTO nutrition_entries')) throw Error('disk failure'); db.prepare(s).run(...v); },
    get: async (s,...v) => db.prepare(s).get(...v) ?? null,
    all: async (s,...v) => db.prepare(s).all(...v),
    transaction: async f => { db.exec('BEGIN IMMEDIATE'); try { const r = await f(driver); db.exec('COMMIT'); return r; } catch(e) {db.exec('ROLLBACK'); throw e;} },
  };
  const files = {
    copy: async (id, uri) => { saved.add(id); if(failCopy) throw Error('copy failure'); return 'file:///nutrition-photos/'+id+'/photo.source'; },
    remove: async id => {saved.delete(id); deleted.push(id);}, exists: async () => true,
  };
  const store = () => createNutritionStore(driver, files);
  return { db, store, saved, deleted, fail: () => {failInsert=true;}, failCopy: () => {failCopy=true;} };
}
const fact = (value,unit='g',status='confirmed') => ({value,unit,status,source:'label checked'});
const entry = (id='entry-1', extra={}) => ({id,date:'2026-11-01',meal:'lunch',amount:50,unit:'g',food:{id:'library-food',version:'1',name:'记录食品',source:'本机食品库',basis:{amount:100,unit:'g'},nutrients:{energy:fact(418.4,'kJ'),protein:fact(20),fat:fact(0),sodium:fact(null,'mg','unknown'),fiber:{value:null,range:[2,4],unit:'g',status:'estimated',source:'AI'}}},...extra});
test('durable save, unique operation, distinct meals, immutable snapshot, edit date/meal and deletion tombstone', async()=>{
 const f=fixture(), s=f.store(), e=entry();
 const [one,two] = await Promise.all([s.record(e,'op1'),s.record(e,'op1')]);
 assert.equal(two.entries.length,1); e.food.nutrients.protein.value=99; e.food.name='changed library';
 let state=await f.store().load(); assert.equal(state.entries[0].food.name,'记录食品');
 assert.equal(total(state.entries,'2026-11-01','protein').value,10);
 assert.equal(total(state.entries,'2026-11-01','fat').value,0);
 assert.equal(total(state.entries,'2026-11-01','sodium').value,null);
 assert.deepEqual(total(state.entries,'2026-11-01','fiber').range,[1,2]);
 assert.equal(Math.round(total(state.entries,'2026-11-01','energy').value),50);
 await s.record(entry('entry-2',{meal:'dinner'}),'op2');
 const changed={...one.entries[0],amount:100,date:'2026-10-31',meal:'breakfast',food:{...one.entries[0].food,name:'用户改名'}};
 state=await s.update(changed); assert.equal(total(state.entries,'2026-11-01','protein').value,10); assert.equal(total(state.entries,'2026-10-31','protein').value,20);
 await s.remove('entry-1'); state=await s.record(entry(),'op1'); assert.equal(state.entries.length,1); assert.equal(state.entries[0].id,'entry-2'); f.db.close();
});
test('transaction failure removes copied photo and rolls back entry and operation, retry remains possible',async()=>{
 const f=fixture();f.fail();await assert.rejects(f.store().record(entry('entry-photo',{food:{...entry().food,image:'file:///source.jpg'}}),'op-fail'),/disk failure/);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM nutrition_entries').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM nutrition_operations').get().n,0);assert.equal(f.saved.size,0);f.db.close();
});
test('copy failure, restart cleanup and referenced photos are protected',async()=>{
 const f=fixture();f.failCopy();await assert.rejects(f.store().record(entry('photo',{food:{...entry().food,image:'file:///source.jpg'}}),'failed'),/copy failure/);assert.equal(f.saved.size,0);
 const s=f.store();await s.record(entry(),'op');f.db.exec("INSERT INTO nutrition_photo_cleanup VALUES('entry-1'); INSERT INTO nutrition_photo_cleanup VALUES('abandoned')");await f.store().load();assert(!f.deleted.includes('entry-1'));assert(f.deleted.includes('abandoned'));f.db.close();
});
test('targets persist, clear to unset; no default 2000 and fail safely for invalid ranges',async()=>{
 const f=fixture(),s=f.store();assert.deepEqual((await s.load()).targets,{});await s.targets({energy:1800,protein:70,fat:[40,65]});assert.equal((await f.store().load()).targets.energy,1800);assert.throws(()=>s.targets({fat:[80,20]}));await s.targets({});assert.deepEqual((await s.load()).targets,{});f.db.close();
});
test('g/mL/serving conversions require known basis; snapshots strip arbitrary request data',async()=>{
 const f=fixture(),s=f.store();const e=entry();e.food.request={apiKey:'not-a-real-key'};e.food.serving={amount:25,unit:'g'};
 e.amount=2;e.unit='份';await s.record(e,'x');let saved=(await s.load()).entries[0];assert.equal(contribution(saved,'protein').value,10);assert(!JSON.stringify(saved).includes('not-a-real-key'));
 assert.throws(()=>s.record({...e,id:'e2',unit:'mL'},'y'),/单位/);
 const volume=entry('volume',{unit:'mL',amount:125,food:{...entry().food,basis:{amount:100,unit:'mL'}}});assert.equal(contribution(volume,'protein').value,25);
 const actual=entry('actual',{amount:0.5,unit:'份',food:{...entry().food,basis:{amount:1,unit:'份'}}});assert.equal(contribution(actual,'protein').value,10);f.db.close();
});
test('shared adapter publishes committed state and loading, errors never masquerade as success',async()=>{
 const f=fixture();const a=createNutritionAdapter(async()=>f.store());await a.reload();assert.equal(a.getSnapshot().status,'ready');const updates=[];const stop=a.subscribe(()=>updates.push(a.getSnapshot()));await a.record(entry(),'a');assert.equal(a.getSnapshot().entries.length,1);assert(updates.some(s=>s.saving));assert.equal(a.getSnapshot().saving,false);await a.updateEntry({...a.getSnapshot().entries[0],amount:200});await a.deleteEntry('entry-1');assert.equal(a.getSnapshot().entries.length,0);stop();f.db.close();
});

test('protein progress observes only commits and updates across portion, date, meal and delete',async()=>{
 const f=fixture(),a=createNutritionAdapter(async()=>f.store()); await a.reload();await a.configureTargets({protein:100});
 const progress=(date='2026-11-01')=>targetProgress(total(a.getSnapshot().entries,date,'protein'),a.getSnapshot().targets.protein);
 const draft=entry('progress',{amount:250}); assert.equal(progress().fraction,null);
 await a.record(draft,'progress-op'); assert.equal(progress().fraction,.5);
 await a.updatePortion('progress',500);assert.equal(progress().fraction,1);
 await a.updateEntry({...a.getSnapshot().entries[0],date:'2026-10-31',meal:'dinner',amount:750});
 assert.equal(progress().fraction,null);assert.equal(progress('2026-10-31').excess,50);
 await a.deleteEntry('progress');assert.equal(progress('2026-10-31').fraction,null);f.db.close();
});
