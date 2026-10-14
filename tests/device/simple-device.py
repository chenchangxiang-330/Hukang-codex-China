"""Black-box Android UI acceptance. Fixtures never ship in the APK."""
import hashlib,json,re,shlex,sqlite3,struct,subprocess,time,xml.etree.ElementTree as ET,zipfile,zlib
from pathlib import Path
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
 b=run(['exec-out','cat','/sdcard/simple-window.xml']);(O/'last-window.xml').write_bytes(b);return ET.fromstring(b)
def find(pattern,clazz=None):
 for n in tree().iter('node'):
  if clazz and n.get('class')!=clazz:continue
  if not any(re.search(pattern,n.get(k,'')) for k in ('text','content-desc')):continue
  a=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
  if len(a)==4 and 0 <= (a[0]+a[2])/2 <1080 and 90<(a[1]+a[3])/2<1850 and a[2]>a[0] and a[3]>a[1]:return n,a
 return None
def swipe(up=False):shell('input','swipe','540','420' if up else '1540','540','1540' if up else '420','300');time.sleep(.4)
def tap(pattern,scroll=False,clazz=None):
 for _ in range(16 if scroll else 8):
  f=find(pattern,clazz)
  if f:
   n,a=f;shell('input','tap',str((a[0]+a[2])//2),str((a[1]+a[3])//2));steps.append({'tap':pattern,'node':n.attrib});time.sleep(.6);return
  if scroll:swipe()
  else:time.sleep(1)
 raise RuntimeError('UI not found: '+pattern)
def field(label,value):
 tap('^'+re.escape(label)+'$',True,'android.widget.EditText')
 shell('input','keyevent','KEYCODE_MOVE_END');shell('input','keyevent',*(['KEYCODE_DEL']*50))
 shell('input','text',value.replace(' ','%s'))
 f=find('^'+re.escape(label)+'$','android.widget.EditText')
 if not f or f[0].get('text')!=value:raise RuntimeError('Field not retained: '+label)
 if 'mInputShown=true' in shell('dumpsys','input_method') or 'mIsInputViewShown=true' in shell('dumpsys','input_method'):shell('input','keyevent','KEYCODE_BACK')
 time.sleep(.5)
def unit_for(label,unit):
 for _ in range(8):
  nodes=list(tree().iter('node')); target=None;candidates=[]
  for n in nodes:
   a=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
   if len(a)!=4:continue
   if n.get('content-desc')==label+' NRV%' and n.get('class')=='android.widget.EditText':target=a
   if n.get('text')==unit or n.get('content-desc')==unit:candidates.append((n,a))
  if target:
   candidates=[(n,a) for n,a in candidates if a[1]>=target[3]-5 and a[3]<1850 and a[1]>90]
   if candidates:
    n,a=min(candidates,key=lambda t:t[1][1]);shell('input','tap',str((a[0]+a[2])//2),str((a[1]+a[3])//2));steps.append({'manualUnit':label,'unit':unit});return
  swipe()
 raise RuntimeError('Unit control not found for '+label)
def photo(button,stem):
 tap('^'+re.escape(button)+'$',True);time.sleep(1)
 for _ in range(6):
  if find(stem):tap(stem);return
  if find('^More options$|^更多选项$'):
   tap('^More options$|^更多选项$')
   if find('^Browse|^浏览'):tap('^Browse|^浏览');time.sleep(1)
   else:shell('input','keyevent','KEYCODE_BACK')
  elif find('^Files$|^文件$'):tap('^Files$|^文件$')
  elif find('Show roots|Open navigation drawer|导航抽屉'):
   tap('Show roots|Open navigation drawer|导航抽屉');tap('^Images$|^图片$|^图像$')
  else:time.sleep(1)
 tap(stem,True)
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
 for p in ['com.google.android.gms','com.google.android.gsf','com.google.android.apps.photos']:shell('pm','disable-user','--user','0',p,check=False)
 run(['install','-r',str(apk.resolve())],timeout=180);shell('pm','grant',PKG,'android.permission.CAMERA')
 report['device']=shell('getprop','ro.build.fingerprint');report['abis']=shell('getprop','ro.product.cpu.abilist')
 fixture=Path('tests/fixtures/china-food/6923644266066.jpg');barcode=png_barcode()
 remote='/storage/emulated/0/Pictures/HukangSimple';shell('mkdir','-p',remote)
 for p,name in [(barcode,'00-barcode.png'),(fixture,'01-milk.jpg')]:
  run(['push',str(p),remote+'/'+name]);shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+remote+'/'+name)
 report['fixtures']={'syntheticBarcode':hashlib.sha256(barcode.read_bytes()).hexdigest(),'packagingPhoto':hashlib.sha256(fixture.read_bytes()).hexdigest()}
 time.sleep(2);launch();tap('^我的$');shot('mine');tap('^今日$');shot('home')
 tap('^拍一拍$');shot('scanner');photo('从相册识别条码','00-barcode')
 photo('从相册选择包装','01-milk');field('商品名称','Test Milk');field('品牌（选填）','Test Brand');tap('^下一步，拍营养表$',True)
 photo('从相册选择营养表','01-milk')
 deadline=time.monotonic()+300
 while time.monotonic()<deadline:
  if any(n.endswith('.json') for n in native_runs()):break
  if not shell('pidof',PKG,check=False):raise RuntimeError('App crashed during OCR')
  time.sleep(2)
 time.sleep(3);tap('^每100mL$',True)
 for label,amount,unit,nrv in [('能量','309','kJ','4'),('蛋白质','3.6','g','6'),('脂肪','4.4','g','7'),('碳水化合物','5.0','g','2'),('钠','58','mg','3')]:
  field(label+'含量',amount);field(label+' NRV%',nrv);unit_for(label,unit)
 tap('我已对照照片',True);shot('review');tap('^确认并保存食品$',True);tap('^加入我的库存$',True);field('本次购入数量','2');tap('^瓶$',True);tap('^确认加入库存$',True);shot('inventory')
 c=database('after-stock');assert c.execute('SELECT COUNT(*) FROM foods').fetchone()[0]==1;assert c.execute('SELECT SUM(quantity) FROM simple_inventory').fetchone()[0]==2
 report['savedProduct']=dict(zip([x[0] for x in c.execute('SELECT * FROM foods').description],c.execute('SELECT * FROM foods').fetchone()));c.close()
 launch();before=native_runs();tap('^拍一拍$');photo('从相册识别条码','00-barcode');tap('^加入我的库存$',True);assert before==native_runs();field('本次购入数量','1');tap('^瓶$',True);tap('^确认加入库存$',True)
 tap('^我的$');tap('^导出食品资料包$',True);tap('^生成文件$');time.sleep(3);shot('share-sheet');shell('input','keyevent','KEYCODE_BACK')
 paths=shell('find',f'/data/user/0/{PKG}/cache/hukang-exports','-name','*.zip').splitlines();assert len(paths)==1
 exported=O/'actual-catalogue.zip';exported.write_bytes(run(['exec-out','cat',paths[0]]))
 with zipfile.ZipFile(exported) as z:
  data=json.loads(z.read('data.json'));assert data['format']=='hukang-food-catalogue';assert len(data['products'])==1;assert 'inventory' not in data
 c=database('final');assert c.execute('SELECT COUNT(*) FROM foods').fetchone()[0]==1;assert c.execute('SELECT COUNT(*) FROM simple_inventory').fetchone()[0]==2;assert c.execute('SELECT SUM(quantity) FROM simple_inventory').fetchone()[0]==3;c.close()
 run(['pull',f'/data/user/0/{PKG}/files/ocr-lab/runs',str(O/'native-ocr')]);report['status']='passed';report['deviceExecutionVerified']=True
except Exception as e:
 report['status']='failed';report['error']=repr(e)
 try:shot('failure')
 except Exception:pass
 raise
finally:
 (O/'session.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(O/'logcat.txt').write_bytes(run(['logcat','-d'],False));print(json.dumps({'status':report['status'],'error':report.get('error')},ensure_ascii=False))
