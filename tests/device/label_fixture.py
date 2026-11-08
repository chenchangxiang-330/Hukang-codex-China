"""Isolated API-result fixture, never shipped. Does NOT claim a provider/network call.
Uses the photo actually selected/processed by the APK, then seeds a previously saved
food so offline edit/barcode/inventory/export can be checked without an API key.
"""
import copy,json
from pathlib import Path

def seed_saved_label(c,pending,out,shell,run,db_path):
    assert c.execute('SELECT count(*) FROM foods').fetchone()[0]==0
    image=pending['nutritionImage'];food_id=pending['id'];now='2026-11-08T00:00:00.000Z'
    expected=[('energy','能量','309','kJ','4'),('protein','蛋白质','3.6','g','6'),('fat','脂肪','4.4','g','7'),('carbohydrate','碳水化合物','5.0','g','2'),('sodium','钠','','mg','')]
    rows=[dict(nutrient=k,label=label,amount=amount,unit=unit,nrvPercent=nrv,nrvNotDeclared=False,reviewed=True) for k,label,amount,unit,nrv in expected]
    column=dict(id='label-column-0',basisKind='per_100ml',basisRawText='每100mL',servingAmount='',servingUnit='unknown',servingSizeNotDeclared=False,reviewed=True,rows=rows)
    review=dict(name='TEST API Milk',brand='',specification='250 mL',ingredients='',inputMethod='api_label',columns=[column])
    ocr=dict(imageUri=image['uri'],evidenceUri=image['uri']+'.api.json',sourceImageHash=image['sourceImageHash'],processedImageHash=image['processedImageHash'],rawText='',blocks=[],width=image['width'],height=image['height'],engineVersion='api-label-v1',modelVersion='ISOLATED MOCK RESULT',modelHashes={},modelLoadMs=0,ocrMs=0,totalMs=0,api=dict(endpoint='https://mock.example/v1/chat/completions',model='ISOLATED MOCK RESULT',rawResponse=json.dumps({'fixtureOnly':True,'columns':[column]}),recordedAt=now))
    source=dict(schemaVersion=1,id='isolated-label-evidence',recordedAt=now,image=image,ocr=ocr)
    parsed=dict(parserVersion='api-label-v1',ocrSourceImageHash=image['sourceImageHash'],ocrProcessedImageHash=image['processedImageHash'],columns=[],unassignedBlockIds=[],issues=[],completeCandidateTable=False)
    root=image['uri'].split('/ocr-lab/')[0]+'/food-evidence/'+food_id+'/'
    folder=root.removeprefix('file://');shell('mkdir','-p',folder+'revisions')
    persisted=copy.deepcopy(source);persisted['image']['uri']=root+'processed.png';persisted['image']['originalUri']=root+'original.source';persisted['ocr']['imageUri']=root+'processed.png';persisted['ocr']['evidenceUri']=root+'ocr-document.json'
    for uri,name in [(image['uri'],'processed.png'),(image['originalUri'],'original.source')]:shell('cp',uri.removeprefix('file://'),folder+name)
    revision=dict(id=food_id+'-fixture-created',recordedAt=now,kind='created',status='confirmed',review=review)
    for name,value in [('raw-ocr.json',source),('evidence.json',persisted),('ocr-document.json',persisted['ocr']),('parsed-nutrition.json',parsed),('revisions/'+revision['id']+'.json',revision)]:
        local=out/'api-fixture'/name;local.parent.mkdir(parents=True,exist_ok=True);local.write_text(json.dumps(value,ensure_ascii=False));run(['push',str(local),folder+name])
    shell('chmod','-R','777',folder) # Only the explicit disposable test folder.
    c.execute('INSERT INTO foods VALUES(?,?,?,?,?,?,?)',(food_id,now,now,'confirmed',review['name'],'',json.dumps(review)))
    c.execute('INSERT INTO food_evidence VALUES(?,?,?,?,?)',(food_id,json.dumps(source),json.dumps(persisted),json.dumps(parsed),root))
    c.execute('INSERT INTO food_evidence_versions VALUES(?,?,?,?,?,?,?,1)',(food_id+'-evidence-initial',food_id,now,json.dumps(source),json.dumps(persisted),json.dumps(parsed),root))
    c.execute('INSERT INTO food_revisions VALUES(?,?,?,?,?,?)',(revision['id'],food_id,now,'created','confirmed',json.dumps(review)))
    barcode=pending.get('barcode')
    if barcode:c.execute('INSERT INTO food_barcodes VALUES(?,?,?,?,?,?,?,?)',(food_id+'-barcode',food_id,barcode['scan']['rawValue'],barcode['normalizedFormat'],barcode['lookupKey'],'valid',pending['acquiredBy'],now))
    c.execute('DELETE FROM simple_capture_drafts WHERE id=?',(food_id,));c.commit();c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    for suffix in ('-wal','-shm'):shell('rm','-f',db_path+suffix)
    run(['push',str(out/'api-fixture-source.db'),db_path]);shell('chmod','666',db_path)
    return persisted
