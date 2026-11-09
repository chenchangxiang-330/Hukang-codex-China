"""Real APK / Android UI checks. Empty UI evidence first; explicit isolated test entries are created only by the storage acceptance flow. No demo adapter.

Runs first on a clean, disposable Actions emulator. All screenshots are raw
Android screencaps; font scale and display density are actual OS settings.
"""
import hashlib
import json
import os
import re
import shlex
import subprocess
import time
import traceback
import xml.etree.ElementTree as ET
from pathlib import Path
from ui_selectors import keyboard_top
from emulator_setup import ensure_root

OUT = Path('artifacts/device/nutrition-ui-v2')
OUT.mkdir(parents=True, exist_ok=True)
PKG = 'com.hukang.china'
ADB = ['adb', '-s', 'emulator-5554']
report = {'status': 'running', 'platform': 'Android emulator',
          'physicalDevice': False, 'nutritionRecordsInserted': 0, 'checks': []}


def adb(*args, check=True, timeout=90):
    p = subprocess.run(ADB + list(args), capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError(f'{args}: {p.stdout.decode(errors="replace")} {p.stderr.decode(errors="replace")}')
    return p.stdout


def shell(*args, check=True):
    return adb('shell', shlex.join(args), check=check).decode(errors='replace').strip()


def bounds(node):
    return [int(x) for x in re.findall(r'-?\d+', node.get('bounds', ''))]


def tree():
    # Cold-start UIAutomator can return before it produces a valid hierarchy.
    # Never reuse a stale file; preserve each invalid read and bound the retry.
    for attempt in range(3):
        shell('rm', '-f', '/sdcard/hukang-v2.xml')
        output = shell('uiautomator', 'dump', '--compressed', '/sdcard/hukang-v2.xml')
        raw = adb('exec-out', 'cat', '/sdcard/hukang-v2.xml', check=False)
        (OUT / 'last-window.xml').write_bytes(raw)
        try:
            root = ET.fromstring(raw)
            break
        except ET.ParseError:
            retries = report.setdefault('uiDumpRetries', [])
            name = f'invalid-ui-dump-{len(retries) + 1}'
            (OUT / (name + '.txt')).write_bytes(raw)
            retries.append({'attempt': attempt + 1, 'output': output, 'evidence': name})
            if attempt == 2:
                raise
            time.sleep(.5)
    # Only an unrelated, known emulator launcher dialog may be recovered.
    if any(n.get('resource-id') == 'android:id/alertTitle' and
           n.get('text') == "Pixel Launcher isn't responding" for n in root.iter('node')):
        recoveries = report.setdefault('launcherRecoveries', 0)
        if recoveries >= 2:
            raise RuntimeError('Repeated emulator launcher ANR')
        close = next(n for n in root.iter('node') if n.get('resource-id') == 'android:id/aerr_close')
        (OUT / f'launcher-anr-{recoveries}.xml').write_bytes(raw)
        (OUT / f'launcher-anr-{recoveries}.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        report['launcherRecoveries'] = recoveries + 1
        press(close)
        return tree()
    return root


def find(pattern, root=None, attribute=None):
    for node in (root if root is not None else tree()).iter('node'):
        keys = [attribute] if attribute else ['text', 'content-desc']
        if not any(re.search(pattern, node.get(k, '')) for k in keys):
            continue
        b = bounds(node)
        if len(b) == 4 and b[2] > b[0] and b[3] > b[1] and 0 <= b[0] < 1080 and 60 < (b[1] + b[3]) / 2 < 1855:
            return node
    return None


def press(node):
    b = bounds(node)
    shell('input', 'tap', str((b[0] + b[2]) // 2), str((b[1] + b[3]) // 2))
    time.sleep(.6)


def swipe(up=False):
    # The floating camera button owns the middle of the lower screen. Swipe
    # the exposed right edge of the actual ScrollView, not that overlay.
    shell('input', 'swipe', '1030', '500' if up else '1430', '1030', '1430' if up else '500', '350')
    time.sleep(.4)


def require(pattern, scroll=False, attribute=None, attempts=8):
    for _ in range(attempts):
        node = find(pattern, attribute=attribute)
        if node is not None:
            return node
        if scroll:
            swipe()
        else:
            time.sleep(.6)
    raise AssertionError(f'Android control missing: {pattern}')


def tap(pattern, scroll=False, attribute=None):
    for _ in range(16 if scroll else 8):
        root = tree()
        node = find(pattern, root, attribute)
        if node is not None:
            if node.get('enabled') == 'false':
                raise AssertionError(f'Disabled control: {pattern}')
            # UIAutomator exposes content even while the floating action is
            # drawn above it. Scroll it into the unobscured viewport first.
            if scroll and find('^今日$', root) is not None and find('^记录$', root) is not None:
                overlays = [find('^今日$', root)]
                ceiling = min(bounds(n)[1] for n in overlays if n is not None)
                if bounds(node)[3] > ceiling - 12:
                    swipe()
                    continue
            press(node)
            return node
        if scroll:
            swipe()
        else:
            time.sleep(.6)
    raise AssertionError(f'Unobscured Android control missing: {pattern}')


def shot(name):
    root = tree()
    headers = [n.get('text') for n in root.iter('node') if n.get('package') == PKG and n.get('text', '').startswith('护康 ›')]
    backs = [n for n in root.iter('node') if n.get('package') == PKG and n.get('content-desc') == '返回']
    (OUT / (name + '.xml')).write_bytes(ET.tostring(root, encoding='utf-8'))
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    assert len(headers) <= 1 and len(backs) <= 1, ('Stale native navigation views', headers, len(backs))
    return root


def launch():
    shell('am', 'force-stop', PKG)
    shell('am', 'start', '-n', PKG + '/.MainActivity')
    stable = 0
    # The very first render can show the empty home while SQLite opens, then
    # navigate to setup. Require two settled reads and handle setup throughout.
    for attempt in range(30):
        root = tree()
        if find('^个人资料$', root) is not None:
            shot('android-first-setup-empty')
            tap('^返回$', attribute='content-desc')
            stable = 0
        elif find('^今日$', root, 'content-desc') is not None:
            stable += 1
            if stable >= 2:
                return
        else:
            stable = 0
        time.sleep(.6)
    raise AssertionError('Initial setup or home did not settle')


def configure(width_dp=390, scale='1.0'):
    shell('settings', 'put', 'system', 'font_scale', scale)
    shell('wm', 'density', str(round(1080 * 160 / width_dp)))
    time.sleep(1)
    launch()


def check(name, action):
    result = {'name': name}
    report['checks'].append(result)
    try:
        action()
        result['status'] = 'passed'
    except Exception as error:
        result.update(status='failed', error=repr(error), trace=traceback.format_exc())
        try:
            shot(name + '-failure')
        except Exception:
            pass
    finally:
        (OUT / 'session.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False), flush=True)


def dock():
    # Match navigation accessibility labels, not a same-named page heading.
    nodes = [require('^' + label + '$', attribute='content-desc') for label in ['今日', '记录', '食品库', '我的']]
    positions = [bounds(n) for n in nodes]
    assert all(60 < b[1] < b[3] <= 1855 for b in positions), positions
    # Native fractional dp bounds round independently to physical pixels.
    assert all(a[2] <= b[0] + 2 for a, b in zip(positions, positions[1:])), positions
    report.setdefault('dockBounds', []).append({'density': shell('wm', 'density'),
        'fontScale': shell('settings', 'get', 'system', 'font_scale'), 'bounds': positions})


def enter(label, value):
    for _ in range(7):
        swipe(True)
    pattern = '^' + re.escape(label) + '$'
    # IME resize/focus scrolling can consume the first tap after a long scroll.
    # Re-read geometry and reacquire focus before any key events; never type
    # into an unfocused field or weaken the persisted-value assertions below.
    for attempt in range(3):
        tap(pattern, True, 'content-desc')
        field = require(pattern, attribute='content-desc')
        if field.get('focused') == 'true':
            break
        evidence = f'input-focus-wait-{len(report.get("inputFocusWaits", [])) + 1}'
        shot(evidence)
        report.setdefault('inputFocusWaits', []).append({
            'label': label, 'attempt': attempt + 1, 'evidence': evidence,
            'bounds': bounds(field),
        })
        time.sleep(.8)
    assert field.get('focused') == 'true', (label, field.attrib)
    shell('input', 'keyevent', 'KEYCODE_MOVE_END')
    shell('input', 'keyevent', *(['KEYCODE_DEL'] * 80))
    if value:
        shell('input', 'text', value.replace(' ', '%s'))
    time.sleep(.5)
    field = require('^' + re.escape(label) + '$', attribute='content-desc')
    assert field.get('text') == value, (label, value, field.attrib)
    if keyboard_top(shell('dumpsys', 'window')) is not None:
        shell('input', 'keyevent', 'KEYCODE_BACK')
        time.sleep(.5)


def diet_db(name):
    import sqlite3
    shell('am', 'force-stop', PKG)
    paths = shell('find', f'/data/user/0/{PKG}', '-name', 'hukang-china-food.db').splitlines()
    assert len(paths) == 1
    dest = OUT / (name + '.db')
    for suffix in ('', '-wal', '-shm'):
        data = adb('exec-out', 'cat', paths[0] + suffix, check=False)
        if data:
            (OUT / (name + '.db' + suffix)).write_bytes(data)
    return sqlite3.connect(dest)


def identify_fixture(file):
    # Modern Photo Picker doesn't expose filenames. Each image case gets its
    # own fresh emulator, and the exact sole MediaStore row is checked first.
    # Do not delete or rewrite gallery rows to influence picker ordering.
    assert not report.get('ownedMediaFixtures'), 'One image fixture per isolated emulator'
    uri = 'content://media/external/images/media'
    album = 'HukangAi' + file.name[:2]
    remote = '/sdcard/Pictures/' + album + '/' + file.name
    shell('mkdir', '-p', '/sdcard/Pictures/' + album)
    adb('push', str(file), remote)
    shell('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + remote)
    where = "_display_name='" + file.name + "'"
    for _ in range(15):
        row = shell('content', 'query', '--uri', uri, '--projection', '_id:_display_name:_size:bucket_display_name', '--where', where)
        if file.name in row and str(file.stat().st_size) in row and album in row:
            break
        time.sleep(1)
    else: raise AssertionError('MediaStore has not indexed exact fixture: ' + row)
    report.setdefault('fixtureMediaRows', []).append(row)
    media_id = re.search(r'_id=(\d+)', row).group(1)
    all_rows = shell('content', 'query', '--uri', uri, '--projection', '_id:_display_name:_size:_data')
    actual_rows = [r for r in all_rows.splitlines() if r.startswith('Row:')]
    assert len(actual_rows) == 1 and file.name in all_rows and str(file.stat().st_size) in all_rows and album in all_rows, all_rows
    report.setdefault('ownedMediaFixtures', []).append({'id':media_id,'path':remote,'file':file.name,'bytes':file.stat().st_size,'onlyMediaStoreImage':True})
    return remote


def select_isolated_fixture(stem):
    from picker_selectors import next_picker_action
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        root = tree()
        action = next_picker_action(root, stem, 'initial', isolated_media=True)
        if action:
            # Do not take another UI dump between reading geometry and tapping:
            # the system sheet can expand and invalidate the earlier bounds.
            (OUT / (stem + '-picker.xml')).write_bytes(ET.tostring(root, encoding='utf-8'))
            press(action[1])
            return
        time.sleep(.5)
    raise AssertionError('The verified single image was not selectable: ' + stem)


def home_and_navigation():
    configure()
    action=bounds(require('^拍一拍$',attribute='content-desc'));dock_top=bounds(require('^今日$',attribute='content-desc'))[1]
    assert action[3] < dock_top and action[3]-action[1] >= 48*(443/160), ('Primary action covered by Dock',action,dock_top)
    report['primaryActionBounds']={'bounds':action,'dockTop':dock_top,'unobscured':True}
    require('护康 · 今天'); require('今天还没有记录', True)
    for _ in range(5): swipe(True)
    dock(); shot('android-today-empty')
    from PIL import Image
    empty_pixels=Image.open(OUT/'android-today-empty.png').convert('RGB')
    tracks = []
    for title in ['蛋白质', '今日卡路里', '脂肪', '膳食纤维']:
        # Android combines the accessible label and value text. Locate the
        # stable native testID, then verify state and actual empty-track pixels.
        n = require('^nutrient-track-' + title + '$', attribute='resource-id')
        assert n.get('content-desc','').startswith(title+'营养条，—，未设目标，暂不计算进度')
        b = bounds(n)
        assert b[2] - b[0] > 300 and b[3] > b[1], b
        colors=[empty_pixels.getpixel((round(b[0]+(b[2]-b[0])*f),(b[1]+b[3])//2)) for f in (.2,.5,.8)]
        assert colors[0]==colors[1]==colors[2], ('Empty track must not claim filled intake',title,colors)
        tracks.append({'title': title, 'bounds': b, 'state': 'unset; no fabricated percentage','pixels':colors})
    report['emptyNutrientTracks'] = tracks
    for label,title in [('记录','饮食记录'),('食品库','我的食品库'),('我的','个人参考目标')]:
        tap('^'+label+'$', attribute='content-desc');require(title,True);dock();shot('android-'+{'记录':'diary','食品库':'library','我的':'mine'}[label]+'-empty')
    tap('^今日$',attribute='content-desc');tap('^查看完整营养$',True);require('^营养详情$');b=bounds(require('^返回$',attribute='content-desc'));assert (b[3]-b[1])/(443/160)>=48
    shot('android-nutrition-empty');tap('^矿物质，展开$',True);tap('^钠，',True);shot('android-mineral-detail');tap('^维生素，展开$',True);shot('android-vitamin-detail');tap('^返回$',attribute='content-desc')
    tap('^拍一拍$',True);require('^餐食估算$',attribute='content-desc');assert find('^文字描述$|^手动填写$') is None;shot('android-two-entries');tap('^餐食估算$',attribute='content-desc');require('^餐食补充描述$',True,'content-desc');shot('android-meal-single-input');tap('^返回$',attribute='content-desc')

def camera_and_recovery():
    configure();tap('^拍一拍$',True);tap('^餐食估算$',attribute='content-desc');tap('^拍照$',True)
    shot('android-camera-permission-request');press(require(r':id/permission_deny_button$',attribute='resource-id'))
    require('相机权限未开启',True);shot('android-camera-permission-denied')
    for _ in range(7):swipe(True)
    tap('^拍照$',True);press(require(r':id/permission_allow_foreground_only_button$',attribute='resource-id'))
    shutter=require(r':id/shutter_button$',attribute='resource-id',attempts=20);shot('android-system-camera-virtual-scene');press(shutter)
    press(require(r':id/done_button$',attribute='resource-id',attempts=15));require('^餐食原图预览$',True,'content-desc',attempts=20)
    for _ in range(7):swipe(True)
    require('^餐食原图预览$',True,'content-desc');shot('android-camera-meal-original');estimate=require('^估算这餐营养$',True,'content-desc');assert estimate.get('enabled')=='false';require('请先保存 AI 连接',True);shot('android-camera-no-api-state')
    for _ in range(7):swipe(True)
    tap('^删除这张照片$',True,'content-desc');tap('^返回$',attribute='content-desc');tap('^包装食品$',attribute='content-desc');require('对准包装条形码',True);require('等待条码进入取景框',True);shot('android-barcode-entry')
    shell('input','keyevent','KEYCODE_BACK');require('^今日$',attribute='content-desc')
    report['camera']={'permissionDeniedAndGranted':True,'mealPhotoAndDelete':True,'source':'Android emulator virtual scene','physicalCamera':False,'liveBarcodeDecoded':False}

def fresh_label_entry():
    configure()
    c=diet_db('abandon-source');before={t:c.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['foods','nutrition_entries','simple_inventory','nutrition_stock']}
    owned=f'/data/user/0/{PKG}/files/ocr-lab/images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'
    old={'id':'isolated-abandoned-draft','acquiredBy':'image','step':'nutrition','name':'TEST unsaved','brand':'','temporaryUris':['file://'+owned]}
    c.execute('INSERT INTO simple_capture_drafts VALUES(?,?,?)',(old['id'],json.dumps(old),'2026-11-08'));c.commit();c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    path=shell('find',f'/data/user/0/{PKG}','-name','hukang-china-food.db').strip()
    for suffix in ('-wal','-shm'):shell('rm','-f',path+suffix)
    adb('push',str(OUT/'abandon-source.db'),path);shell('chmod','666',path);shell('mkdir','-p',str(Path(owned).parent));shell('touch',owned)
    launch();tap('^拍一拍$',True);tap('^包装食品$',attribute='content-desc');require('对准包装条形码',True)
    assert find('有一条尚未完成的食品|继续补录|条码数字|查询本机食品') is None
    tap('^直接识别营养成分表$',True);require('请先配置 AI 服务',True);shot('android-label-direct-no-api')
    c=diet_db('abandon-verified');assert c.execute("SELECT count(*) FROM simple_capture_drafts WHERE id=?",(old['id'],)).fetchone()[0]==0
    assert {t:c.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in before}==before
    new=json.loads(c.execute('SELECT json FROM simple_capture_drafts ORDER BY updated_at DESC LIMIT 1').fetchone()[0]);assert 'barcode' not in new and new['step']=='nutrition';c.close()
    assert not shell('ls',owned,check=False)
    report['freshLabelEntry']={'withoutBarcode':True,'noResumeDialog':True,'oldDraftRemoved':True,'unreferencedTemporaryFileRemoved':True,'savedCountsUnchanged':before,'realProviderVerified':False}


def gesture_safe_area():
    configure();overlays=shell('cmd','overlay','list');original=re.findall(r'\[x\] (com\.android\.internal\.systemui\.navbar\.[\w.]+)',overlays)
    report['navigationOverlayBefore']=original
    try:
        shell('cmd','overlay','enable-exclusive','--category','--user','0','com.android.internal.systemui.navbar.gestural')
        launch();dock();shot('android-today-gesture-safe-area');tap('^记录$',attribute='content-desc')
        for _ in range(3):swipe()
        require('添加晚餐',True);dock();shot('android-diary-scroll-end-gesture-safe-area')
    finally:
        for overlay in original:shell('cmd','overlay','enable-exclusive','--category','--user','0',overlay,check=False)

def push_diet_db(name, c):
    c.commit();c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    path=shell('find',f'/data/user/0/{PKG}','-name','hukang-china-food.db').strip()
    for suffix in ('-wal','-shm'):shell('rm','-f',path+suffix)
    adb('push',str(OUT/(name+'.db')),path);shell('chmod','666',path)


def choose_health_photos(count):
    from picker_selectors import actionable_nodes,MEDIA
    tap('^从相册选择$',True)
    for _ in range(20):
        root=tree();nodes=[n for n in actionable_nodes(root,MEDIA) if re.match(r'^(?:Photo|GIF) taken on ',n.get('content-desc',''))]
        if len(nodes)==2:break
        time.sleep(.5)
    else:raise AssertionError('Two isolated health fixtures not in system picker')
    for index in range(count):
        root=tree();nodes=[n for n in actionable_nodes(root,MEDIA) if re.match(r'^(?:Photo|GIF) taken on ',n.get('content-desc',''))]
        press(nodes[index])
    shot('android-health-system-multiselect-'+str(count))
    tap(r'^(?:Add|添加|完成)(?:[ (（].*)?$',attribute='text')
    require('^预览体检照片 '+str(count)+'$',True,'content-desc',attempts=20)


def profile_and_targets():
    from PIL import Image,ImageDraw
    configure();tap('^我的$',attribute='content-desc');tap('^个人参考目标$',True,'content-desc');tap('^个人资料与目标推荐$',True)
    for label,value in [('年龄（岁）','30'),('身高（cm）','170'),('体重（kg）','65'),('运动状况','Walking'),('每周运动频率（次/周）','3')]: enter(label,value)
    assert find('保存草稿，稍后继续|保存资料草稿|手动修改目标|当前参考|拍摄体检照片|跳过体检照片') is None
    shot('android-profile-autosaved')
    # Synthetic pages, not medical documents; isolated disposable emulator only.
    for index in (1,2):
        file=OUT/f'health-test-{index}.jpg';im=Image.new('RGB',(800,1100),(235,245,255));draw=ImageDraw.Draw(im);draw.text((40,60),f'ISOLATED TEST REPORT {index}',fill=(25,50,90));im.save(file);im.close()
        remote=f'/sdcard/Pictures/HukangHealth/{file.name}';shell('mkdir','-p','/sdcard/Pictures/HukangHealth');adb('push',str(file),remote);shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+remote)
    time.sleep(3)
    rows=shell('content','query','--uri','content://media/external/images/media','--projection','_id:_display_name:_data');assert rows.count('Row:')==2 and 'health-test-1.jpg' in rows and 'health-test-2.jpg' in rows
    choose_health_photos(2);require('^预览体检照片 2$',True,'content-desc');choose_health_photos(1);require('^预览体检照片 3$',True,'content-desc')
    tap('^预览体检照片 1$',True,'content-desc');shot('android-health-photo-preview');tap('^关闭照片预览$',attribute='content-desc')
    tap('^删除照片 2$',True);assert find('^预览体检照片 3$',attribute='content-desc') is None;shot('android-profile-two-photos')
    tap('^返回$',attribute='content-desc');tap('^个人资料与目标推荐$',True);require('^预览体检照片 2$',True,'content-desc')
    c=diet_db('profile-autosaved');profile=json.loads(c.execute("SELECT json FROM nutrition_state WHERE key='profile'").fetchone()[0]);photos=json.loads(c.execute("SELECT json FROM nutrition_state WHERE key='healthPhotos'").fetchone()[0]);assert len(photos)==2
    assert [profile[k] for k in ['age','heightCm','weightKg','exerciseDescription','exerciseFrequencyPerWeek']]==['30','170','65','Walking','3']
    assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==0
    assert not c.execute('SELECT * FROM nutrition_settings').fetchone()
    draft={'profileRevision':profile['revision'],'healthPhotos':photos,'generatedAt':'2026-11-09','model':'ISOLATED UI FIXTURE','missing':[],'policies':{'protein':{'type':'target','value':100,'unit':'g','source':'ISOLATED TEST','basis':'UI test','applicability':'Disposable emulator','manual':False,'profileRevision':profile['revision']}}}
    c.execute("INSERT INTO nutrition_state VALUES('targetDraft',?)",(json.dumps(draft),));push_diet_db('profile-autosaved',c)
    launch();tap('^我的$',attribute='content-desc');tap('^个人参考目标$',True);tap('^查看目标草案$',True);require('^目标草案$');assert find('年龄（岁）|从相册选择|手动修改目标|当前参考') is None;shot('android-goal-draft-isolated')
    tap('^返回$',attribute='content-desc');require('^个人资料$');require('^预览体检照片 2$',True,'content-desc');tap('^返回$',attribute='content-desc');tap('^查看目标草案$',True);tap('^确认应用目标$',True);require('目标 100 g',True);shot('android-goal-applied-isolated')
    c=diet_db('profile-targets');targets=json.loads(c.execute('SELECT targets_json FROM nutrition_settings').fetchone()[0]);assert targets['policies']['protein']['value']==100;assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==0;c.close()
    launch();tap('^我的$',attribute='content-desc');tap('^个人参考目标$',True);tap('^个人资料与目标推荐$',True);require('^预览体检照片 2$',True,'content-desc');shot('android-health-photos-after-restart')
    report['profileFlow']={'autoSave':True,'multiSelectAppendDeletePreviewRestart':True,'privatePhotos':2,'separateDraftScreen':True,'targetsAppliedOnlyOnConfirm':True,'draftIsInjectedTestFixture':True,'realProviderTested':False}

def secure_storage():
    probe=Path('artifacts/build/secure-storage-probe.apk');assert probe.exists()
    assert 'Success' in adb('install','-r',str(probe.resolve()),timeout=180).decode()
    component='com.hukang.china.test/com.hukang.china.ConnectionProbe'
    def invoke(mode):
        shell('am','force-stop',PKG);result=shell('am','instrument','-w','-e','mode',mode,component);assert 'SECURE_PROBE_PASS:'+mode in result,result
    invoke('write');launch();tap('^我的$',attribute='content-desc');tap('^AI 服务设置$',True);require('最近验证',True);assert require('^个人资料：推荐营养目标$',True).get('checked')=='true';assert require('^体检照片（可选）：辅助目标推荐$',True).get('checked')=='true';shot('android-encrypted-connection-restored-MOCK')
    invoke('verify');launch();tap('^我的$',attribute='content-desc');tap('^AI 服务设置$',True);tap('^同意本次连接测试$',True);tap('^保存连接$',True);require('网络连接失败',True,attempts=15);shot('android-native-network-failure-old-connection-retained');tap('^连接详情与管理$',True);tap('^删除已保存连接$',True);require('已删除连接',True);shot('android-connection-deleted')
    launch();tap('^我的$',attribute='content-desc');tap('^AI 服务设置$',True);require('连接状态.*未连接',True)
    assert not shell('find',f'/data/user/0/{PKG}/no_backup','-name','ai-connection.enc',check=False)
    report['securePersistence']={'primitive':'Android Keystore AES-GCM atomic file','instrumentationFixtureOnly':True,'processRestartVerified':True,'deleteFromActualUiVerified':True,'realProviderVerified':False}

def small_large_keyboard():
    configure(320,'1.5');dock();shot('android-320-font150-empty');tap('^查看完整营养$',True);require('^营养详情$');shot('android-320-font150-nutrition');tap('^返回$',attribute='content-desc');tap('^拍一拍$',True);tap('^餐食估算$',attribute='content-desc');tap('^餐食补充描述$',True,'content-desc');time.sleep(1)
    node=require('^餐食补充描述$',attribute='content-desc');top=keyboard_top(shell('dumpsys','window'));assert top and bounds(node)[3]<=top;shot('android-320-font150-keyboard');shell('input','text','optional%stext');shell('input','keyevent','KEYCODE_BACK');tap('^返回$',attribute='content-desc');tap('^餐食估算$',attribute='content-desc');assert require('^餐食补充描述$',True,'content-desc').get('text')=='optional text';configure()

def seed_food(visual=False):
    # Fixture goes only into this newly created, disposable emulator. No fixture ships in the APK.
    from datetime import datetime
    c=diet_db('fixture-source');today=shell('date','+%F');now=now_iso='2026-11-03T00:00:00Z'
    fact=lambda v,u='g':{'value':v,'unit':u,'status':'confirmed','source':'ISOLATED TEST FIXTURE'}
    food={'id':'isolated-pack','version':'test-v1','kind':'meal','name':'TEST reusable meal','source':'ISOLATED TEST FIXTURE','basis':{'amount':1,'unit':'份'},'nutrients':{'energy':fact(100,'kcal'),'protein':fact(8.5),'fat':fact(3),'fiber':fact(1)}}
    prior={'id':'isolated-prior','date':today,'meal':'breakfast','consumedTime':'08:30','timezone':'UTC','amount':1,'unit':'份','confirmedAt':now,'food':{**food,'id':'prior-food','name':'TEST prior meal','nutrients':{'protein':fact(50),'energy':fact(400,'kcal')}}}
    if visual:
        assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==0, 'Only append visual fixture after empty UI evidence'
        prior['food']['nutrients'].update(fat=fact(20),fiber=fact(12.5))
        common={'source':'ISOLATED TEST FIXTURE','basis':'UI rendering only','applicability':'Disposable emulator only','profileRevision':0,'manual':True}
        policies={k:{**common,'unit':u,**p} for k,u,p in [('protein','g',{'type':'target','value':100}),('energy','kcal',{'type':'range','range':[1600,2000]}),('fat','g',{'type':'range','range':[40,70]}),('fiber','g',{'type':'target','value':25})]}
        c.execute('INSERT INTO nutrition_settings(id,targets_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET targets_json=excluded.targets_json',(json.dumps({'policies':policies}),))
    c.execute('INSERT INTO nutrition_catalogue(food_id,json,asset_id) VALUES(?,?,NULL)',(food['id'],json.dumps(food)));c.execute('INSERT INTO nutrition_entries VALUES(?,?,?,?,?,?)',(prior['id'],today,prior['meal'],json.dumps(prior),now,now));c.execute('INSERT INTO nutrition_operations VALUES(?,?,?)',(prior['id'],prior['id'],now));c.commit();c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    paths=shell('find',f'/data/user/0/{PKG}','-name','hukang-china-food.db').splitlines();assert len(paths)==1
    for suffix in ('-wal','-shm'):shell('rm','-f',paths[0]+suffix)
    adb('push',str(OUT/'fixture-source.db'),paths[0]);shell('chmod','666',paths[0]);report['fixtureIsolation']='Only a fresh disposable emulator, explicit TEST labels, never production app data';launch();return today

def known_progress():
    configure();seed_food(visual=True)
    for title in ['蛋白质','今日卡路里','脂肪','膳食纤维']:
        node=require('^'+title+'营养条，',attribute='content-desc')
        assert '暂不计算进度' not in node.get('content-desc','')
    require('50 g');require('目标 100 g');require('12.5 g')
    action=bounds(require('^拍一拍$',attribute='content-desc'));assert action[3] < bounds(require('^今日$',attribute='content-desc'))[1]
    shot('android-four-progress-isolated');report['nutritionRecordsInserted']=1;report['visualFixtureAfterEmptyEvidence']=True
    # Range and partial records only in this disposable emulator; never embedded in the App.
    c=diet_db('range-source');row=json.loads(c.execute("SELECT snapshot_json FROM nutrition_entries WHERE id='isolated-prior'").fetchone()[0])
    for key,ends,unit in [('protein',[29,52],'g'),('energy',[1250,2200],'kcal'),('fat',[49,115],'g'),('fiber',[2,7],'g')]: row['food']['nutrients'][key]={'value':None,'range':ends,'unit':unit,'status':'estimated','source':'ISOLATED RANGE FIXTURE'}
    c.execute("UPDATE nutrition_entries SET snapshot_json=? WHERE id='isolated-prior'",(json.dumps(row),));c.commit();c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    path=shell('find',f'/data/user/0/{PKG}','-name','hukang-china-food.db').strip()
    for suffix in ('-wal','-shm'):shell('rm','-f',path+suffix)
    adb('push',str(OUT/'range-source.db'),path);shell('chmod','666',path);launch()
    require('29–52',True);node=require('^蛋白质营养条，约 29–52 g',attribute='content-desc');box=bounds(node)
    shot('android-range-progress-isolated')
    from PIL import Image
    pixels=Image.open(OUT/'android-range-progress-isolated.png').convert('RGB');y=(box[1]+box[3])//2
    actual=[pixels.getpixel((round(box[0]+(box[2]-box[0])*ratio),y)) for ratio in (.2,.4,.8)]
    assert actual[0] != actual[1] and actual[1] != actual[2], ('Range fill must have lower/upper/track pixels',actual)
    report['rangeFillPixels']={'lowerUpperTrack':actual,'midpointNotUsed':True}
    tap('^查看完整营养$',True);tap('^蛋白质，',True);shot('android-range-detail-expanded-isolated')


def preview_amount(value):
    # Portion buttons follow the totals. Revisit the top of the prediction.
    for _ in range(8):swipe(True)
    require(value,True)

def diet_closed_loop():
    configure();today=seed_food();require('50 g',True);shot('android-timeline-isolated-prior');tap('^食品库$',attribute='content-desc');tap('^餐食 TEST reusable meal$',True);tap('^食用这份食品$',True);tap('^吃半份$',True);preview_amount('54.25');shot('android-half-portion-prediction');c=diet_db('before-confirm');assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==1;c.close()
    launch();tap('^食品库$',attribute='content-desc');tap('^餐食 TEST reusable meal$',True);tap('^食用这份食品$',True);tap('^吃一份$',True);preview_amount('58.5');shot('android-whole-portion-prediction');tap('^自己填写吃多少$',True);enter('实际食用份量（份）','0.5');tap('我已确认日期、餐次和实际食用份量',True);tap('^确认食用$',True);require('已保存这次食用',True);shot('android-confirmed-intake-isolated')
    c=diet_db('after-confirm');rows=[json.loads(r[0]) for r in c.execute('SELECT snapshot_json FROM nutrition_entries')];assert len(rows)==2;e=next(e for e in rows if e['id']!='isolated-prior');assert e['amount']==.5;assert c.execute('SELECT COUNT(*) FROM nutrition_catalogue').fetchone()[0]==1;assert c.execute('SELECT COUNT(*) FROM nutrition_stock').fetchone()[0]==0;c.close()
    launch();require('54.25 g',True);shot('android-four-progress-isolated');tap('^记录$',attribute='content-desc');tap('^查看食物 TEST reusable meal$',True);enter('修改实际食用份量（份）','1');tap('^确认调整份量$',True);require('饮食记录已更新',True);tap('^返回饮食记录$',True);tap('^今日营养摘要$',True);tap('^蛋白质，',True);require('58.5',True);shot('android-nutrition-updated-isolated')
    launch();tap('^记录$',attribute='content-desc');tap('^查看食物 TEST reusable meal$',True);tap('^修改名称、营养与日期，',True);from datetime import date,timedelta
    prior=(date.fromisoformat(today)-timedelta(days=1)).isoformat();enter('修改记录日期（YYYY-MM-DD）',prior);enter('修改食用时间（HH:mm）','10:15');tap('^修改餐次 早餐$',True);tap('^保存记录修改$',True);require('饮食记录已更新',True)
    c=diet_db('after-move');e=json.loads(c.execute('SELECT snapshot_json FROM nutrition_entries WHERE id=?',(e['id'],)).fetchone()[0]);assert (e['date'],e['meal'],e['consumedTime'])==(prior,'breakfast','10:15');c.close()
    launch();tap('^记录$',attribute='content-desc');tap('^‹ 前一天$',True);tap('^查看食物 TEST reusable meal$',True);tap('^删除这条饮食记录$',True);tap('^确定删除这次食用$',True);c=diet_db('after-delete');assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==1;assert c.execute('SELECT COUNT(*) FROM nutrition_operations').fetchone()[0]==2;assert c.execute('SELECT COUNT(*) FROM nutrition_catalogue').fetchone()[0]==1;c.close()
    launch();tap('^食品库$',attribute='content-desc');tap('^餐食 TEST reusable meal$',True);tap('^加入库存，不计摄入$',True);enter('购入数量','2');tap('^确认加入库存$',True);require('已加入库存，未计入摄入',True);shot('android-meal-inventory-isolated');c=diet_db('after-meal-stock');assert c.execute('SELECT SUM(quantity) FROM nutrition_stock').fetchone()[0]==2;assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==1;c.close();report['nutritionRecordsInserted']=2

def simplified_meal_save():
    configure();c=diet_db('meal-result-fixture');before=c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]
    today=shell('date','+%F')
    fact=lambda value,unit='g':{'value':value,'unit':unit,'status':'estimated' if value is not None else 'unknown','source':'ISOLATED MOCK RESPONSE'}
    food={'id':'isolated-ai-meal','version':'one','kind':'meal','name':'TEST estimated meal','basis':{'amount':1,'unit':'份'},'source':'ISOLATED MOCK RESPONSE','provenance':{'kind':'ai','model':'TEST ONLY','uncertainties':['fixture uncertainty retained']},'nutrients':{'energy':{**fact(None,'kcal'),'range':[400,600],'status':'estimated'},'protein':fact(20),'carbohydrate':fact(55),'fat':{**fact(None),'range':[10,20],'status':'estimated'},'sodium':fact(None,'mg')}}
    draft={'id':'isolated-meal-confirm','date':today,'meal':'lunch','food':food,'amount':1,'unit':'份','consumedTime':'12:20','timezone':'UTC'}
    c.execute("INSERT INTO nutrition_state VALUES('intakeDraft',?) ON CONFLICT(key) DO UPDATE SET json=excluded.json",(json.dumps(draft),));push_diet_db('meal-result-fixture',c)
    launch();tap('^继续上次食用确认$',True);require('^餐食名称$',True,'content-desc');require('AI 估算.*1 份',True);require('400–600',True);require('55 g',True)
    assert find('食物与来源|吃半份|自己填写吃多少|吃一份|我已确认日期') is None
    shot('android-meal-direct-nutrients-isolated')
    tap('^核对或修改营养数值，编辑$',True);enter('蛋白质（g / 基准）','21');tap('^核对或修改营养数值，编辑$',True)
    enter('食用时间','12:34');enter('食用日期',today);shot('android-meal-time-save-isolated');tap('^确认保存$',True);require('已保存这次食用',True);shot('android-meal-saved-isolated')
    assert require('^已保存$',True,'content-desc').get('enabled')=='false'
    c=diet_db('meal-result-saved');assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==before+1
    entry=json.loads(c.execute("SELECT snapshot_json FROM nutrition_entries WHERE id='isolated-meal-confirm'").fetchone()[0]);assert entry['amount']==1 and entry['unit']=='份' and entry['consumedTime']=='12:34';assert entry['food']['nutrients']['protein']['value']==21 and entry['food']['nutrients']['protein']['status']=='estimated';assert entry['food']['nutrients']['sodium']['value'] is None
    assert c.execute("SELECT COUNT(*) FROM nutrition_operations WHERE entry_id='isolated-meal-confirm'").fetchone()[0]==1
    assert not c.execute("SELECT json FROM nutrition_state WHERE key='intakeDraft'").fetchone();c.close()
    launch();assert find('继续上次食用确认') is None;tap('^记录$',attribute='content-desc');tap('^查看食物 TEST estimated meal$',True);enter('修改实际食用份量（份）','2');tap('^确认调整份量$',True);require('饮食记录已更新',True)
    c=diet_db('meal-result-edited');entry=json.loads(c.execute("SELECT snapshot_json FROM nutrition_entries WHERE id='isolated-meal-confirm'").fetchone()[0]);assert entry['amount']==2;c.close();report['directMealResult']={'defaultOneServing':True,'unknownRemainsUnknown':True,'rangePreserved':True,'editableNutrientsAndTime':True,'singleSaveAndRestart':True,'savedRecordPortionEditing':True,'responseIsInjectedFixture':True,'realProviderTested':False}

def image_case():
    from PIL import Image,ImageDraw
    from archive_checks import jpeg_has_exif
    import random
    configure();kind=os.environ['HUKANG_DEVICE_SUITE'];inputs=OUT/'image-inputs';inputs.mkdir(exist_ok=True)
    name={'image-large':'02-ai-large.jpg','image-transparent':'03-ai-transparent.png','image-gif':'04-ai-unsupported.gif','image-oversize':'05-ai-oversize.jpg'}[kind];file=inputs/name
    if kind=='image-large':
        im=Image.frombytes('RGB',(4000,3000),random.Random(42).randbytes(4000*3000*3));exif=Image.Exif();exif[274]=6;exif[270]='TEST ONLY';im.save(file,quality=98,exif=exif);im.close()
    elif kind=='image-transparent':
        im=Image.new('RGBA',(1200,800),(0,0,0,0));ImageDraw.Draw(im).rectangle((300,200,900,600),fill=(20,140,220,255));im.save(file);im.close()
    else:
        im=Image.new('RGB',(200,200),(20,140,220));im.save(file);im.close()
        if kind=='image-oversize':
            with file.open('ab') as f:f.write(b'0'*(51*1024*1024))
    original=identify_fixture(file);tap('^拍一拍$',True);tap('^餐食估算$',attribute='content-desc');tap('^从相册选择$',True);select_isolated_fixture(file.stem)
    if kind in ('image-gif','image-oversize'):
        require('此图片格式无法|原图超过本机 50 MB',True,attempts=20);shot('android-'+kind+'-error');assert not shell('find',f'/data/user/0/{PKG}/files/meal-drafts','-name','original.source',check=False);report['imageErrorRecovery']=True
    else:
        require('^餐食原图预览$',True,'content-desc',attempts=20);shot('android-'+kind+'-original-preview');paths=shell('find',f'/data/user/0/{PKG}/cache/ai-upload-v1','-name','upload.jpg').splitlines();assert len(paths)==1
        payload=adb('exec-out','cat',paths[0]);assert 0<len(payload)<=4000000 and not jpeg_has_exif(payload);processed=OUT/'processed.jpg';processed.write_bytes(payload)
        with Image.open(processed) as im:
            assert max(im.size)<=2048
            if kind=='image-large':assert im.height>im.width
        originals=shell('find',f'/data/user/0/{PKG}/files/meal-drafts','-name','original.source').splitlines();assert len(originals)==1;raw=adb('exec-out','cat',originals[0]);assert hashlib.sha256(raw).digest()==hashlib.sha256(file.read_bytes()).digest()
        c=diet_db('image-draft');assert c.execute('SELECT COUNT(*) FROM nutrition_entries').fetchone()[0]==0;draft=json.loads(c.execute("SELECT json FROM nutrition_state WHERE key='captureDraft'").fetchone()[0]);assert draft['original'].endswith('/original.source');c.close();launch();tap('^继续餐食照片草稿$',True);tap('^餐食估算$',attribute='content-desc');require('^餐食原图预览$',True,'content-desc');shot('android-'+kind+'-draft-restored');tap('^删除这张照片$',True,'content-desc');assert not shell('find',f'/data/user/0/{PKG}/files/meal-drafts','-name','original.source',check=False);report['imageProcessing']={'sourceSha256':hashlib.sha256(raw).hexdigest(),'uploadBytes':len(payload),'rawBytes':len(raw),'metadataRemovedFromUpload':True,'restartDraft':True,'dietRecords':0}
    assert hashlib.sha256(adb('exec-out','cat',original)).digest()==hashlib.sha256(file.read_bytes()).digest()
    for _ in range(8):swipe(True)
    tap('^从相册选择$',True);shell('input','keyevent','KEYCODE_BACK');require('^从相册选择$',True);shot('android-'+kind+'-picker-cancel')

try:
    apk, = Path('artifacts/build').glob('hukang-*-arm64.apk')
    inspection = json.loads(Path('artifacts/build/apk-inspection.json').read_text())
    assert hashlib.sha256(apk.read_bytes()).hexdigest() == inspection['sha256']
    report['apkSha256'] = inspection['sha256']
    report['sourceCommit'] = Path('artifacts/build/source-commit.txt').read_text().strip()
    report['emulatorRootSetup'] = ensure_root(ADB)
    report['device'] = shell('getprop', 'ro.build.fingerprint')
    report['abis'] = shell('getprop', 'ro.product.cpu.abilist')
    report['screen'] = shell('wm', 'size')
    report['originalDensity'] = shell('wm', 'density')
    report['originalFontScale'] = shell('settings', 'get', 'system', 'font_scale')
    assert not shell('pm', 'path', PKG, check=False), 'UI probe expects a fresh disposable emulator, never clears user data'
    report['install'] = adb('install', '-r', str(apk.resolve()), timeout=180).decode()
    assert 'Success' in report['install']
    suite=os.environ.get('HUKANG_DEVICE_SUITE','ui')
    cases=[('four-metrics-navigation',home_and_navigation),('camera-permission-and-recovery',camera_and_recovery),('small-large-keyboard',small_large_keyboard),('gesture-safe-area',gesture_safe_area)]
    if suite=='ui':cases += [('fresh-label-entry-discard',fresh_label_entry),('four-known-progress-isolated',known_progress)]
    if suite=='flows':cases=[('profile-goal-confirmation',profile_and_targets),('secure-connection-storage',secure_storage),('deterministic-intake-stock',diet_closed_loop)]
    if suite=='meal':cases=[('direct-meal-result-save',simplified_meal_save)]
    if suite.startswith('image-'):cases=[('original-and-upload-isolation',image_case)]
    for name, action in cases:
        check(name, action)
    report['status'] = 'passed' if all(c['status'] == 'passed' for c in report['checks']) else 'failed'
finally:
    shell('wm', 'density', 'reset', check=False)
    shell('settings', 'put', 'system', 'font_scale', report.get('originalFontScale', '1.0'), check=False)
    shell('am', 'force-stop', PKG, check=False)
    (OUT / 'session.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    (OUT / 'logcat.txt').write_bytes(adb('logcat', '-d', check=False))
    (OUT / 'window-insets.txt').write_text(shell('dumpsys', 'window', check=False))

raise SystemExit(0 if report['status'] == 'passed' else 1)
