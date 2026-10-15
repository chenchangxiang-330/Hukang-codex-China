"""Black-box Android UI acceptance. Fixtures never ship in the APK."""
import hashlib,json,re,shlex,sqlite3,struct,subprocess,time,xml.etree.ElementTree as ET,zipfile,zlib
from pathlib import Path
from urllib.parse import unquote,urlparse
from ui_selectors import bounds,nutrient_unit,nutrient_scroll_towards_top
from archive_checks import jpeg_has_exif
O=Path('artifacts/device');O.mkdir(parents=True,exist_ok=True)
PKG='com.hukang.china';ADB=['adb','-s','emulator-5554'];steps=[]
report={'status':'running','steps':steps,'physicalCameraVerified':False,'limitation':'Emulator, not OPPO hardware; package identity text is entered manually.'}
def run(args,check=True,timeout=90):
 p=subprocess.run(ADB+args,capture_output=True,timeout=timeout)
 if check and p.returncode: raise RuntimeError(str(args)+': '+p.stderr.decode(errors='replace'))
 return p.stdout
def shell(*args,check=True):return run(['shell',shlex.join(args)],check).decode(errors='replace').strip()
def shot(name): (O/(name+'.png')).write_bytes(run(['exec-out','screencap','-p']))
def tree():
 shell('uiautomator','dump','--compressed','/sdcard/simple-window.xml')
 b=run(['exec-out','cat','/sdcard/simple-window.xml']);(O/'last-window.xml').write_bytes(b);root=ET.fromstring(b)
 # API 35's unrelated Pixel Launcher can ANR during cold emulator boot before
 # our App starts. Preserve evidence and close only that exact system dialog.
 # Never dismiss a Hukang ANR/crash or an unknown dialog.
 title=next((n for n in root.iter('node') if n.get('package')=='android' and n.get('resource-id')=='android:id/alertTitle' and n.get('text')=="Pixel Launcher isn't responding"),None)
 if title is not None:
  recoveries=report.setdefault('emulatorLauncherRecoveries',[])
  if len(recoveries)>=2:raise RuntimeError('Repeated unrelated Launcher ANR prevents device acceptance')
  close=next((n for n in root.iter('node') if n.get('package')=='android' and n.get('resource-id')=='android:id/aerr_close'),None)
  if close is None:raise RuntimeError('Known Launcher ANR has no close control')
  name='launcher-anr-'+str(len(recoveries)+1);shot(name);(O/(name+'.xml')).write_bytes(b)
  recoveries.append({'dialog':title.attrib,'evidence':name,'deviceTime':shell('date','-Iseconds')})
  a=bounds(close);shell('input','tap',str((a[0]+a[2])//2),str((a[1]+a[3])//2));time.sleep(1);return tree()
 return root
def find(pattern,clazz=None):
 for n in tree().iter('node'):
  if clazz and n.get('class')!=clazz:continue
  if not any(re.search(pattern,n.get(k,'')) for k in ('text','content-desc')):continue
  a=list(map(int,re.findall(r'-?\d+',n.get('bounds',''))))
  if len(a)==4 and 0 <= (a[0]+a[2])/2 <1080 and 90<(a[1]+a[3])/2<1850 and a[2]>a[0] and a[3]>a[1]:return n,a
 return None
def swipe(up=False):shell('input','swipe','540','420' if up else '1540','540','1540' if up else '420','300');time.sleep(.4)
def short_swipe(up=False):shell('input','swipe','1000','650' if up else '1350','1000','1050' if up else '950','300');time.sleep(.5)
def tap(pattern,scroll=False,clazz=None):
 for _ in range(16 if scroll else 8):
  f=find(pattern,clazz)
  if f:
   n,a=f
   if scroll and clazz=='android.widget.EditText' and (a[3]>1650 or a[3]-a[1]<70):short_swipe();continue
   if clazz=='android.widget.EditText':
    # Image preparation and IME reflow can move fields after a dump. Never tap
    # stale geometry that could now belong to Save draft or another action.
    time.sleep(.3);fresh=find(pattern,clazz)
    if not fresh or fresh[1]!=a:continue
    n,a=fresh
   shell('input','tap',str((a[0]+a[2])//2),str((a[1]+a[3])//2));steps.append({'tap':pattern,'node':n.attrib});time.sleep(.6);return
  if scroll:swipe()
  else:time.sleep(1)
 raise RuntimeError('UI not found: '+pattern)
def field(label,value):
 pattern='^'+re.escape(label)+'$'
 for _ in range(3):
  tap(pattern,True,'android.widget.EditText');f=find(pattern,'android.widget.EditText')
  if f and f[0].get('focused')=='true':break
 else:raise RuntimeError('Field did not receive focus; keyboard input refused: '+label)
 steps.append({'focusedField':label,'node':f[0].attrib})
 shell('input','keyevent','KEYCODE_MOVE_END');shell('input','keyevent',*(['KEYCODE_DEL']*50))
 shell('input','text',value.replace(' ','%s'))
 f=find('^'+re.escape(label)+'$','android.widget.EditText')
 if not f or f[0].get('text')!=value:raise RuntimeError('Field not retained: '+label)
 if 'mInputShown=true' in shell('dumpsys','input_method') or 'mIsInputViewShown=true' in shell('dumpsys','input_method'):shell('input','keyevent','KEYCODE_BACK')
 time.sleep(.5)
def unit_for(label,unit):
 for _ in range(24):
  root=tree();node=nutrient_unit(root,label,unit)
  if node is not None:
   a=bounds(node);shell('input','tap',str((a[0]+a[2])//2),str((a[1]+a[3])//2));time.sleep(.5)
   selected=nutrient_unit(tree(),label,unit)
   if selected is None or selected.get('selected')!='true':raise RuntimeError('Unit was not selected for '+label)
   steps.append({'manualUnit':label,'unit':unit,'node':selected.attrib});return
  short_swipe(nutrient_scroll_towards_top(root,label))
 raise RuntimeError('Unit control not found for '+label)
def photo(button,stem):
 def selected():
  expected='重新拍包装' if button=='从相册选择包装' else '最后，核对一下' if button=='从相册选择营养表' else '先记下它的样子|商品详情'
  deadline=time.monotonic()+(300 if button=='从相册选择营养表' else 45);previous=None
  while time.monotonic()<deadline:
   root=tree();nodes=list(root.iter('node'))
   busy=any(n.get('package')==PKG and re.match(r'^正在(处理|读取|离线识别|查询|保存)',n.get('text','')) for n in nodes)
   ready=[n for n in nodes if n.get('package')==PKG and any(re.fullmatch(expected,n.get(k,'')) for k in ('text','content-desc'))]
   signature=[(n.get('class'),n.get('text'),n.get('content-desc'),n.get('bounds')) for n in ready]
   if ready and not busy and signature==previous:
    steps.append({'photoReady':button,'nodes':[n.attrib for n in ready]});return
   previous=signature if ready and not busy else None;time.sleep(.5)
  raise RuntimeError('Selected photo did not reach expected ready screen: '+button)
 tap('^'+re.escape(button)+'$',True);time.sleep(1)
 for _ in range(6):
  if find(stem):tap(stem);selected();return
  if find('^More options$|^更多选项$'):
   tap('^More options$|^更多选项$')
   if find('^Browse|^浏览'):tap('^Browse|^浏览');time.sleep(1)
   else:shell('input','keyevent','KEYCODE_BACK')
  elif find('^Files$|^文件$'):tap('^Files$|^文件$')
  elif find('Show roots|Open navigation drawer|导航抽屉'):
   tap('Show roots|Open navigation drawer|导航抽屉');tap('^Images$|^图片$|^图像$')
  else:time.sleep(1)
 tap(stem,True);selected()
def database(name):
 shell('am','force-stop',PKG)
 paths=shell('find',f'/data/user/0/{PKG}','-name','hukang-china-food.db').splitlines()
 if len(paths)!=1:raise RuntimeError('Cannot identify SQLite DB: '+str(paths))
 dest=O/(name+'.db')
 for suffix in ('','-wal','-shm'):
  b=run(['exec-out','cat',paths[0]+suffix],False)
  if b:(O/(name+'.db'+suffix)).write_bytes(b)
 return sqlite3.connect(dest)
def launch():shell('am','start','-n',PKG+'/.MainActivity');time.sleep(3)
def native_runs():return shell('ls',f'/data/user/0/{PKG}/files/ocr-lab/runs',check=False).splitlines()
def wait_native(previous):
 deadline=time.monotonic()+300
 while time.monotonic()<deadline:
  new=[name for name in native_runs() if name.endswith('.json') and name not in previous]
  if new:
   time.sleep(3);return new
  if not shell('pidof',PKG,check=False):raise RuntimeError('App crashed during OCR')
  time.sleep(2)
 raise RuntimeError('No new native OCR result within 300 seconds')
def native_snapshot(name):
 destination=O/name;destination.mkdir(exist_ok=True)
 documents=[]
 for filename in native_runs():
  if not filename.endswith('.json'):continue
  payload=run(['exec-out','cat',f'/data/user/0/{PKG}/files/ocr-lab/runs/{filename}']);(destination/filename).write_bytes(payload);document=json.loads(payload);documents.append(document)
  assert document['rawText'] and document['blocks']
  report.setdefault('nativeOcrMeasurements',{})[filename]={'sha256':hashlib.sha256(payload).hexdigest(),**{key:document.get(key) for key in ('modelLoadMs','modelColdLoadMs','imageDecodeMs','ocrMs','totalMs','timings','memory')}}
 return documents
def wait_image_transform():
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  if not find('^正在调整营养表照片$'):return
  if not shell('pidof',PKG,check=False):raise RuntimeError('App crashed during image transform')
  time.sleep(.5)
 raise RuntimeError('Image transform did not finish within 30 seconds')
def transform_photo(original):
 tap('^调整照片方向或裁剪$',True)
 tap('^右转90°$',True);wait_image_transform();tap('^左转90°$',True);wait_image_transform();tap('^选择裁剪区域$',True)
 def apply_control(enabled):
  # The crop modal has no ScrollView: preview and controls must be visible
  # together, without swipes that could be mistaken for a crop gesture.
  for _ in range(5):
   control=find('^应用裁剪$')
   if control and 90<=control[1][1]<control[1][3]<=1850:break
   time.sleep(.5)
  assert control and 90<=control[1][1]<control[1][3]<=1850 and control[0].get('enabled')==str(enabled).lower(),'Unexpected crop Apply enabled state or visibility'
  return control
 apply_control(False)
 assert find('^裁剪营养成分表$'),'Crop modal did not open'
 # Coordinates come from the actual modal layout and native image dimensions.
 def reveal_preview():
  for _ in range(5):
   candidate=find('^营养表裁剪预览$')
   if candidate:
    a=candidate[1]
    if 90<=a[1]<a[3]<=1850 and a[3]-a[1]>400:return a
   time.sleep(.5)
  raise AssertionError('Complete crop preview not visible')
 x1,y1,x2,y2=reveal_preview()
 # A tap/zero-area selection must not enable crop. Then select almost all
 # pixels (one display-pixel inset) so this test does not cut off nutrients.
 shell('input','tap',str(round((x1+x2)/2)),str(round((y1+y2)/2)));time.sleep(.5)
 apply_control(False);steps.append({'zeroAreaCropApplyEnabled':False})
 x1,y1,x2,y2=reveal_preview();scale=min((x2-x1)/original['width'],(y2-y1)/original['height']);w=original['width']*scale;h=original['height']*scale
 left=(x1+x2-w)/2;top=(y1+y2-h)/2
 start=[round(left+1),round(top+1)];end=[round(left+w-1),round(top+h-1)]
 report['cropGesture']={'previewBounds':[x1,y1,x2,y2],'sourceDimensions':[original['width'],original['height']],'start':start,'end':end};shot('crop-modal-before-drag')
 shell('input','swipe',str(start[0]),str(start[1]),str(end[0]),str(end[1]),'650');time.sleep(.5)
 shot('crop-selected')
 apply_control(True)
 tap('^应用裁剪$');wait_image_transform()
 before=native_runs();tap('^使用当前照片重新识别$',True);new=wait_native(before);assert len(new)==1
 result=json.loads(run(['exec-out','cat',f'/data/user/0/{PKG}/files/ocr-lab/runs/{new[0]}']))
 operations=result['preprocessingTransform']['operations'];crops=[operation for operation in operations if operation.get('kind')=='crop'];assert crops
 crop=crops[-1];report['imageTransformUi']={'rotationsDegrees':[90,-90],'crop':'near-full image selected by touch; empty selection disabled','actualNativeCrop':crop,'actualDimensions':[result['width'],result['height']],'physicalCameraVerified':False}
 assert 0<=crop['left']<crop['right']<=original['width'] and 0<=crop['top']<crop['bottom']<=original['height']
 assert crop['right']-crop['left']==result['width'] and crop['bottom']-crop['top']==result['height']
 assert result['width']>=original['width']*.95 and result['height']>=original['height']*.95,'Touch crop did not preserve the requested near-full photo'
 assert result['sourceImageHash']==original['sourceImageHash'],'Image transforms changed original source bytes'
def export_archive(button,expected_format,name):
 directory=f'/data/user/0/{PKG}/cache/hukang-exports'
 before=set(shell('find',directory,'-name','*.zip',check=False).splitlines())
 tap('^'+re.escape(button)+'$',True);tap('^生成文件$');time.sleep(3);shot(name+'-share-sheet');shell('input','keyevent','KEYCODE_BACK');time.sleep(1)
 paths=set(shell('find',directory,'-name','*.zip').splitlines())-before;assert len(paths)==1,paths
 exported=O/(name+'.zip');exported.write_bytes(run(['exec-out','cat',paths.pop()]))
 with zipfile.ZipFile(exported) as z:
  data=json.loads(z.read('data.json'));assert data['format']==expected_format
  manifest=json.loads(z.read('files.json'))
  for asset in manifest:
   payload=z.read(asset['path']);assert len(payload)==asset['bytes'];assert hashlib.sha256(payload).hexdigest()==asset['sha256']
   if expected_format=='hukang-food-catalogue':
    assert asset['path'].startswith('photos/') and asset['path'].endswith('.jpg');assert not jpeg_has_exif(payload),'Catalogue photo contains EXIF metadata'
  for path in z.namelist():
   if path.endswith('.json'):
    portable=z.read(path).decode();assert 'file://' not in portable and 'content://' not in portable,(name,path)
  report.setdefault('exports',[]).append({'file':exported.name,'sha256':hashlib.sha256(exported.read_bytes()).hexdigest(),'bytes':exported.stat().st_size,'entries':z.namelist()})
  return data,manifest
def png_barcode():
 code='6923644266066';assert sum(int(d)*(1 if i%2==0 else 3) for i,d in enumerate(code[:12]))%10==(10-int(code[-1]))%10
 L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'][int(code[0])]
 bits='0'*12+'101'+''.join((L if p=='L' else G)[int(d)] for p,d in zip(parity,code[1:7]))+'01010'+''.join(''.join('1' if x=='0' else '0' for x in L[int(d)]) for d in code[7:])+'101'+'0'*12
 row=b''.join((b'\x00' if b=='1' else b'\xff')*6 for b in bits);w=len(row);rows=[b'\x00'+(b'\xff'*w if y<25 or y>275 else row) for y in range(300)]
 def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
 b=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,300,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
 p=O/'00-barcode.png';p.write_bytes(b);return p
try:
 apks=sorted(Path('artifacts/build').glob('hukang-*-arm64.apk'));assert len(apks)==1, apks;apk=apks[0];inspection=json.loads(Path('artifacts/build/apk-inspection.json').read_text())
 assert hashlib.sha256(apk.read_bytes()).hexdigest()==inspection['sha256'];assert not inspection['errors'];assert 'android.permission.INTERNET' not in inspection['permissions']
 report['apkSha256']=inspection['sha256'];report['sourceCommit']=Path('artifacts/build/source-commit.txt').read_text().strip()
 run(['root']);time.sleep(1);run(['wait-for-device'])
 shell('settings','put','global','airplane_mode_on','1');shell('svc','wifi','disable');shell('svc','data','disable',check=False)
 shell('iptables','-I','OUTPUT','1','-j','DROP');shell('ip6tables','-I','OUTPUT','1','-j','DROP')
 report['offlineRules']=[shell('iptables','-S','OUTPUT'),shell('ip6tables','-S','OUTPUT')]
 report['disabledEmulatorPackages']={}
 for p in ['com.google.android.apps.wellbeing','com.google.android.gms','com.google.android.gsf','com.google.android.apps.photos']:report['disabledEmulatorPackages'][p]=shell('pm','disable-user','--user','0',p,check=False)
 run(['install','-r',str(apk.resolve())],timeout=180);shell('pm','grant',PKG,'android.permission.CAMERA')
 report['device']=shell('getprop','ro.build.fingerprint');report['abis']=shell('getprop','ro.product.cpu.abilist')
 fixture=Path('tests/fixtures/china-food/6923644266066.jpg');barcode=png_barcode()
 remote='/storage/emulated/0/Pictures/HukangSimple';shell('mkdir','-p',remote)
 for p,name in [(barcode,'00-barcode.png'),(fixture,'01-milk.jpg')]:
  run(['push',str(p),remote+'/'+name]);shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+remote+'/'+name)
 report['fixtures']={'syntheticBarcode':hashlib.sha256(barcode.read_bytes()).hexdigest(),'packagingPhoto':hashlib.sha256(fixture.read_bytes()).hexdigest(),'source':json.loads(fixture.with_suffix('.source.json').read_text())['source'],'limitation':'Archived real nutrition-side package photo reused for cover input; not a new front-facing camera photo. Synthetic barcode and manual identity are test-only.'}
 time.sleep(2);launch();tap('^我的$');shot('mine');tap('^今日$');shot('home')
 tap('^拍一拍$');shot('scanner');photo('从相册识别条码','00-barcode')
 photo('从相册选择包装','01-milk');field('商品名称','Test Milk');field('品牌（选填）','Test Brand');field('规格（选填）','250 mL');tap('^下一步，拍营养表$',True)
 c=database('pending-draft');pending=json.loads(c.execute('SELECT json FROM simple_capture_drafts').fetchone()[0]);assert pending['name']=='Test Milk' and pending['specification']=='250 mL';assert pending['step']=='nutrition';assert pending['barcode']['scan']['rawValue']=='6923644266066';assert c.execute('SELECT COUNT(*) FROM foods').fetchone()[0]==0;c.close()
 report['pendingDraftId']=pending['id'];launch();tap('^继续上次未完成的录入$',True);shot('draft-resumed')
 before=native_runs();photo('从相册选择营养表','01-milk');wait_native(before)
 original_native=native_snapshot('native-before-image-adjustment')[-1];shot('ocr-review-before-corrections');transform_photo(original_native)
 native_snapshot('native-before-manual-review');tap('^每100mL$',True)
 expected=[('能量','309','kJ','4'),('蛋白质','3.6','g','6'),('脂肪','4.4','g','7'),('碳水化合物','5.0','g','2'),('钠','58','mg','3')]
 report['manualReviewExpected']=expected
 for label,amount,unit,nrv in expected:
  field(label+'含量',amount);field(label+' NRV%',nrv)
  if label=='钠':unit_for(label,'g');report['manualUnitCorrection']={'nutrient':'钠','from':'g','to':'mg','reason':'deliberately selected wrong unit in UI, then corrected; not claimed as an OCR error'}
  unit_for(label,unit)
 tap('我已对照照片',True);shot('review');tap('^确认并保存食品$',True);tap('^加入我的库存$',True);field('本次购入数量','2');tap('^瓶$',True);tap('^确认加入库存$',True);shot('inventory')
 c=database('after-stock');assert c.execute('SELECT COUNT(*) FROM foods').fetchone()[0]==1;assert c.execute('SELECT SUM(quantity) FROM simple_inventory').fetchone()[0]==2
 report['savedProduct']=dict(zip([x[0] for x in c.execute('SELECT * FROM foods').description],c.execute('SELECT * FROM foods').fetchone()))
 saved_review=json.loads(report['savedProduct']['review_json']);assert report['savedProduct']['id']==pending['id'];assert saved_review['specification']=='250 mL';assert len(saved_review['columns'])==1
 saved_column=saved_review['columns'][0];assert saved_column['basisKind']=='per_100ml';assert [(r['label'],r['amount'],r['unit'],r['nrvPercent']) for r in saved_column['rows']]==expected
 evidence_before=c.execute('SELECT source_evidence_json,persisted_evidence_json,parsed_json FROM food_evidence').fetchone();persisted=json.loads(evidence_before[1]);assert persisted['ocr']['rawText'];assert c.execute('SELECT COUNT(*) FROM simple_capture_drafts').fetchone()[0]==0
 assert persisted['image']['sourceImageHash']==original_native['sourceImageHash']
 for uri_key,hash_key,file_name in [('originalUri','sourceImageHash','saved-original.source'),('uri','processedImageHash','saved-processed.png')]:
  payload=run(['exec-out','cat',unquote(urlparse(persisted['image'][uri_key]).path)]);assert hashlib.sha256(payload).hexdigest()==persisted['image'][hash_key];(O/file_name).write_bytes(payload)
 assert c.execute('SELECT raw_value,acquired_by FROM food_barcodes').fetchone()==('6923644266066','image');c.close()
 launch();before=native_runs();tap('^拍一拍$');photo('从相册识别条码','00-barcode');tap('^加入我的库存$',True);assert before==native_runs();field('本次购入数量','1');tap('^瓶$',True);tap('^确认加入库存$',True)
 c=database('two-purchases');assert c.execute('SELECT COUNT(*) FROM foods').fetchone()[0]==1;assert c.execute('SELECT COUNT(*),SUM(quantity) FROM simple_inventory').fetchone()==(2,3);c.close();report['twoPurchases']={'foodCount':1,'purchaseRows':2,'totalPackages':3};launch();tap('^库存$')
 tap('^用掉1瓶$',True);tap('^用掉1瓶$',True);shot('inventory-reduced')
 tap('^从已有食品添加$',True);tap('^Test Milk$',True);tap('^核对或修改商品资料$',True);field('规格（选填）','250 mL checked');field('蛋白质含量','3.60');tap('我已对照照片',True);tap('^确认并保存食品$',True);shot('edited-product');tap('^暂不入库，返回首页$',True)
 tap('^我的$');data,assets=export_archive('导出食品资料包','hukang-food-catalogue','actual-catalogue');assert len(data['products'])==1 and 'inventory' not in data;assert not assets
 tap('.*',True,'android.widget.Switch');switch=find('.*','android.widget.Switch');assert switch and switch[0].get('checked')=='true'
 data,assets=export_archive('导出食品资料包','hukang-food-catalogue','actual-catalogue-with-photos');assert len(data['products'])==1 and 'inventory' not in data;assert data['photosIncluded'] is True and data['photoMetadataRemoved'] is True;assert len(assets)==2
 data,assets=export_archive('导出个人数据（含库存）','hukang-personal-export','actual-personal-with-photos');assert len(data['products'])==1 and len(data['inventory'])==1 and data['inventory'][0]['quantity']==1
 assert any(a['path'].startswith('photos/') for a in assets);assert any(a['path'].endswith('/current-ocr.json') for a in assets);assert any(a['path'].endswith('/revisions.json') for a in assets)
 c=database('final');assert c.execute('SELECT COUNT(*) FROM foods').fetchone()[0]==1;assert c.execute('SELECT COUNT(*) FROM simple_inventory').fetchone()[0]==1;assert c.execute('SELECT SUM(quantity) FROM simple_inventory').fetchone()[0]==1
 final_review=json.loads(c.execute('SELECT review_json FROM foods').fetchone()[0]);assert final_review['specification']=='250 mL checked';assert next(r for r in final_review['columns'][0]['rows'] if r['nutrient']=='protein')['amount']=='3.60';assert c.execute('SELECT source_evidence_json,persisted_evidence_json,parsed_json FROM food_evidence').fetchone()==evidence_before
 assert c.execute('SELECT COUNT(*) FROM food_revisions').fetchone()[0]>=2;assert c.execute('SELECT COUNT(*) FROM food_barcodes').fetchone()[0]==1;c.close()
 for uri_key,hash_key in [('originalUri','sourceImageHash'),('uri','processedImageHash')]:
  payload=run(['exec-out','cat',unquote(urlparse(persisted['image'][uri_key]).path)]);assert hashlib.sha256(payload).hexdigest()==persisted['image'][hash_key],'Export modified source image bytes'
 report['verifiedFlow']=['imageBarcodeDecode','draftResumeAfterForceStop','realPackagingPhotoLocalOcr','rotateAndCropThenLocalOcr','allFiveManualValuesUnitsNrvAndBasisPersisted','wrongUnitSelectedThenCorrected','imageRescanHitsWithoutOcr','separateInventoryPurchases','consumeAndRemoveInventory','editDecimalPreservesOcrAndRevisions','catalogueExportExcludesInventory','cataloguePhotoExportHasNoExif','personalExportContainsPhotosAndHashedEvidence','exportsPreserveOriginalImageBytes']
 for filename,measurement in report['nativeOcrMeasurements'].items():
  payload=run(['exec-out','cat',f'/data/user/0/{PKG}/files/ocr-lab/runs/{filename}']);assert hashlib.sha256(payload).hexdigest()==measurement['sha256'],'Native OCR evidence changed after review'
 run(['pull',f'/data/user/0/{PKG}/files/ocr-lab/runs',str(O/'native-ocr')]);report['status']='passed';report['deviceExecutionVerified']=True
except Exception as e:
 report['status']='failed';report['error']=repr(e)
 try:shot('failure')
 except Exception:pass
 raise
finally:
 (O/'session.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(O/'logcat.txt').write_bytes(run(['logcat','-d'],False));print(json.dumps({'status':report['status'],'error':report.get('error')},ensure_ascii=False))
