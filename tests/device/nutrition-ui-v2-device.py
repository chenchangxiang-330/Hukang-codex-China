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
                overlays = [find('^拍一拍$', root), find('^今日$', root)]
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
    (OUT / (name + '.xml')).write_bytes(ET.tostring(root, encoding='utf-8'))
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    return root


def launch():
    shell('am', 'force-stop', PKG)
    shell('am', 'start', '-n', PKG + '/.MainActivity')
    require('^今日$', attempts=30)


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


def home_and_navigation():
    configure()
    require('今天，吃得刚刚好')
    require('还没有今天的餐食', scroll=True)
    assert find('1285|1,285|62g|158g') is None, 'Demo values appeared in production'
    # Return to the top before the cover screenshot.
    for _ in range(7): swipe(True)
    dock()
    shot('android-today-390-empty')
    for label, expected, name in [
        ('记录', '饮食记录', 'diary'),
        ('食品库', '我的食品库', 'library'),
        ('我的', '食品资料与库存分开管理', 'mine'),
    ]:
        tap('^' + label + '$')
        require(expected, scroll=True)
        dock()
        shot('android-' + name + '-390-empty')
    tap('^今日$')
    tap('^查看完整营养$', scroll=True)
    require('了解今天的每一份营养')
    back = require('^返回$')
    b = bounds(back)
    density = 443 / 160
    assert (b[2] - b[0]) / density >= 90 and (b[3] - b[1]) / density >= 48, b
    assert find('^主导航$') is None
    shot('android-nutrition-390-empty')
    tap('^返回$')
    require('^今日$')


def details():
    configure()
    tap('^查看完整营养$', True)
    for label, expected, name in [
        ('碳水化合物', '总糖', 'carbohydrate'),
        ('蛋白质', '主要食物来源', 'protein'),
        ('脂肪', '饱和脂肪', 'fat'),
        ('膳食纤维', '不重复累计', 'fiber'),
        ('矿物质', '钾', 'minerals'),
        ('维生素', '维生素 ?A', 'vitamins'),
        ('水分', '饮水记录尚未接入', 'water'),
    ]:
        tap('^' + label + '，', True, 'content-desc')
        require(expected, True)
        shot('android-nutrition-' + name + '-empty')
        # Close from the actual header; scroll back if its body is long.
        for _ in range(8):
            node = find('^' + label + '，', attribute='content-desc')
            if node is not None:
                press(node)
                break
            swipe(True)
        else:
            raise AssertionError('Accordion header not reachable: ' + label)
    tap('^返回$')
    tap('^记录$')
    current = next(n.get('content-desc') for n in tree().iter('node')
                   if re.fullmatch(r'\d{4}-\d{2}-\d{2}', n.get('content-desc', '')) and n.get('checked') == 'true')
    tap('前一天')
    selected = next(n.get('content-desc') for n in tree().iter('node')
                    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', n.get('content-desc', '')) and n.get('checked') == 'true')
    assert current != selected
    tap('^今日营养摘要$', True)
    require('^今日营养$')
    y, m, d = selected.split('-')
    require(f'{y}年{int(m)}月{int(d)}日')
    shot('android-nutrition-from-selected-diary-date')
    report['selectedDateNavigation'] = {'before': current, 'after': selected}
    tap('^返回$')
    # The app intentionally restores the diary's scroll position. Its page
    # title/date strip may be above the viewport until scrolled back up.
    swipe(True)
    require('饮食记录')
    assert any(n.get('content-desc') == selected and n.get('checked') == 'true' for n in tree().iter('node'))


def small_and_large():
    for width, scale, name in [(320, '1.0', '320'), (390, '1.5', '390-font150'), (320, '1.5', '320-font150')]:
        configure(width, scale)
        dock()
        shot('android-today-' + name + '-empty')
        tap('^记录$')
        controls = [require('^‹ 前一天$'), require('^后一天 ›$')]
        control_bounds = [bounds(n) for n in controls]
        assert all(30 <= b[0] < b[2] <= 1050 for b in control_bounds), control_bounds
        report.setdefault('dateNavigationBounds', []).append({
            'logicalWidth': width, 'fontScale': scale, 'bounds': control_bounds})
        original = next(n.get('content-desc') for n in tree().iter('node')
                        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', n.get('content-desc', '')) and n.get('checked') == 'true')
        press(controls[1])
        assert not any(n.get('content-desc') == original and n.get('checked') == 'true' for n in tree().iter('node'))
        tap('^‹ 前一天$')
        assert any(n.get('content-desc') == original and n.get('checked') == 'true' for n in tree().iter('node'))
        shot('android-diary-' + name + '-empty')
        tap('^今日营养摘要$', True)
        shot('android-nutrition-' + name + '-empty')
        tap('^水分，', True, 'content-desc')
        require('饮水记录尚未接入', True)
        shot('android-nutrition-scroll-end-' + name)
        tap('^返回$')
        dock()


def keyboard():
    configure()
    tap('^拍一拍$')
    require('^餐食估算$')
    require('^包装食品$')
    shot('android-capture-meal-empty')
    for iteration in range(3):
        tap('^餐食补充描述$', True, 'content-desc')
        if iteration == 0:
            shell('input', 'text', 'Egg%snoddles%shalf%sportion')
        require('Egg noddles half portion')
        ime = shell('dumpsys', 'input_method')
        (OUT / 'keyboard-state.txt').write_text(ime)
        assert 'mInputShown=true' in ime or 'mIsInputViewShown=true' in ime
        assert find('^主导航$') is None
        window = shell('dumpsys', 'window')
        (OUT / 'keyboard-window.txt').write_text(window)
        ime_top = keyboard_top(window)
        assert ime_top is not None, 'Visible keyboard frame was not reported'
        field_bounds = bounds(require('^餐食补充描述$', attribute='content-desc'))
        # UI XML can report a focused input beneath the IME as present.
        # Its full box must remain above the IME after repeated show/hide.
        assert field_bounds[1] >= 270 and field_bounds[3] - field_bounds[1] >= 277, field_bounds
        assert field_bounds[3] <= ime_top - 20, (field_bounds, ime_top)
        report['keyboardVisibility'] = {'inputBounds': field_bounds, 'keyboardTop': ime_top,
                                        'fullyAboveKeyboard': True}
        report.setdefault('keyboardRepeats', []).append(dict(report['keyboardVisibility']))
        shot('android-capture-keyboard' + (f'-repeat{iteration}' if iteration else ''))
        shell('input', 'keyevent', 'KEYCODE_BACK')
        time.sleep(.6)
    tap('^返回$')
    tap('^拍一拍$')
    require('Egg noddles half portion', True)
    tap('^估算这餐营养$', True)
    require('请先在 AI 服务设置中填写有效地址', True)
    shot('android-capture-no-ai-config-feedback')


def gesture_safe_area():
    configure()
    overlays = shell('cmd', 'overlay', 'list')
    original = re.findall(r'\[x\] (com\.android\.internal\.systemui\.navbar\.[\w.]+)', overlays)
    report['navigationOverlayBefore'] = original
    try:
        shell('cmd', 'overlay', 'enable-exclusive', '--category', '--user', '0',
              'com.android.internal.systemui.navbar.gestural')
        launch()
        dock()
        shot('android-today-gesture-safe-area')
        tap('^记录$')
        for _ in range(3):
            swipe()
        require('添加晚餐')
        dock()
        shot('android-diary-scroll-end-gesture-safe-area')
    finally:
        for overlay in original:
            shell('cmd', 'overlay', 'enable-exclusive', '--category', '--user', '0', overlay, check=False)


def camera():
    configure()
    tap('^拍一拍$')
    tap('^拍照$', True)
    deny = require(r':id/permission_deny_button$', attribute='resource-id')
    shot('android-camera-permission-request')
    press(deny)
    require('未获得相机权限', True)
    shot('android-camera-permission-denied')
    # Return to the top so the same photo control is visible again.
    swipe(True)
    tap('^拍照$', True)
    allow = require(r':id/permission_allow_foreground_only_button$', attribute='resource-id')
    press(allow)
    shutter = require(r':id/shutter_button$', attribute='resource-id', attempts=20)
    shot('android-system-camera-virtual-scene')
    press(shutter)
    done = require(r':id/done_button$', attribute='resource-id', attempts=15)
    press(done)
    require('餐食照片预览', attempts=15)
    shot('android-captured-meal-original-photo')
    tap('^估算这餐营养$', True)
    require('请填写这一餐的文字描述', True)
    shot('android-ai-text-required-feedback')
    # Explicit AI disclosure adds content; return to the mode tabs before tapping.
    for _ in range(3):
        swipe(True)
    tap('^包装食品$')
    shot('android-capture-package-empty')
    tap('^拍照$', True)
    press(require(r':id/shutter_button$', attribute='resource-id', attempts=20))
    press(require(r':id/done_button$', attribute='resource-id', attempts=15))
    require('包装正面照片预览', attempts=15)
    shot('android-captured-package-original-photo')
    tap('^扫描 / 输入条码$', True)
    require('对准包装条形码')
    require('等待条码进入取景框')
    shot('android-live-barcode-scanner')
    shell('input', 'keyevent', 'KEYCODE_BACK')
    require('^今日$')
    report['camera'] = {'permissionDeniedAndGranted': True, 'mealAndPackagePhotos': True,
                        'source': 'Android system camera / emulator virtual scene',
                        'physicalCamera': False, 'liveBarcodeDecoded': False}


def ai_native_network_feedback():
    # Reserved .invalid domain + non-secret fixture: no real provider/key/fees.
    # The distinct native-module-unavailable error ensures this checks the bridge.
    configure()
    tap('^我的$')
    tap('^AI 服务设置', True)
    for label, value in [('API Base URL', 'https://example.invalid/v1'),
                         ('API Key', 'non-secret-native-test'), ('模型名称', 'mock-model')]:
        tap('^' + label + '$', True, 'content-desc')
        shell('input', 'text', value)
        shell('input', 'keyevent', 'KEYCODE_BACK')
    tap('我了解发送内容、服务地址及可能产生的费用', True)
    tap('^检查连接配置$', True)
    require('网络连接失败', True, attempts=12)
    root = shot('android-ai-native-network-failure')
    assert 'non-secret-native-test' not in ET.tostring(root, encoding='unicode')
    tap('^清除临时配置$', True)
    require('临时配置已清除', True)
    shot('android-ai-cleared')
    tap('^返回$')
    tap('^今日$')
    tap('^拍一拍$')
    tap('^餐食补充描述$', True, 'content-desc')
    shell('input', 'text', 'Egg%snoddles')
    shell('input', 'keyevent', 'KEYCODE_BACK')
    tap('^估算这餐营养$', True)
    require('请先在 AI 服务设置中填写有效地址', True)
    shot('android-ai-clear-prevents-meal-call')
    report['aiApi'] = {'nativeTransportLoaded': True, 'networkErrorDisplayed': True,
                       'clearStopsOldCredentials': True, 'liveProviderTested': False,
                       'credentials': 'non-secret-test-fixture-only', 'productionDietWrites': 0}


def enter(label, value):
    for _ in range(7):
        swipe(True)
    tap('^' + re.escape(label) + '$', True, 'content-desc')
    shell('input', 'keyevent', 'KEYCODE_MOVE_END')
    shell('input', 'keyevent', *(['KEYCODE_DEL'] * 80))
    if value:
        shell('input', 'text', value.replace(' ', '%s'))
    time.sleep(.5)
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


def diet_closed_loop():
    configure()
    tap('^个人参考目标$', True, 'content-desc')
    enter('每日能量参考（kcal）', '1800')
    enter('个人蛋白质目标（g）', '75')
    tap('^保存个人目标$', True)
    require('个人目标已保存在本机', True)
    launch()
    require('个人参考 1800', True)
    tap('^拍一拍$')
    enter('餐食补充描述', 'Native meal test')
    tap('^手动记录这一餐$', True)
    tap('^核对或修改营养数值，', True, 'content-desc')
    enter('能量（kcal / 基准）', '600')
    enter('蛋白质（g / 基准）', '20')
    enter('脂肪（g / 基准）', '0')
    enter('实际食用份量（份）', '0.5')
    tap('我已确认日期、餐次和实际食用份量', True)
    tap('^已食用 · 确认记录$', True)
    require('已保存饮食记录', True)
    shot('android-isolated-confirmed-diet-save')
    c = diet_db('confirmed-diet')
    row, = c.execute('SELECT snapshot_json FROM nutrition_entries').fetchall()
    e = json.loads(row[0]); assert e['amount'] == .5 and e['food']['nutrients']['energy']['value'] == 600
    assert e['food']['nutrients']['fat']['value'] == 0
    assert 'sodium' not in e['food']['nutrients'] or e['food']['nutrients']['sodium']['value'] is None
    assert c.execute('SELECT count(*) FROM simple_inventory').fetchone()[0] == 0
    assert json.loads(c.execute('SELECT targets_json FROM nutrition_settings').fetchone()[0])['energy'] == 1800
    c.close()
    from datetime import date as calendar_date, timedelta
    moved_date = (calendar_date.fromisoformat(e['date']) - timedelta(days=1)).isoformat()
    configure(320, '1.5'); require('300', True); shot('android-isolated-today-diet-320-large-font')
    tap('^记录$'); tap('^查看食物 Native meal test$', True, 'content-desc')
    enter('食物名称', 'Edited native meal')
    enter('修改实际食用份量（份）', '1')
    tap('^确认调整份量$', True)
    require('饮食记录已更新', True)
    tap('^返回饮食记录$', True)
    # Returning deliberately restores the tapped food's position; summary is above it.
    for _ in range(7): swipe(True)
    tap('^今日营养摘要$', True); require('600', True)
    shot('android-isolated-nutrition-diet')
    tap('^返回$'); tap('^查看食物 Edited native meal$', True, 'content-desc')
    enter('修改记录日期（YYYY-MM-DD）', moved_date)
    tap('^修改餐次 早餐$', True, 'content-desc')
    tap('^确认调整份量$', True); require('饮食记录已更新', True)
    c = diet_db('edited-diet'); e = json.loads(c.execute('SELECT snapshot_json FROM nutrition_entries').fetchone()[0]); assert (e['date'], e['meal'], e['amount']) == (moved_date, 'breakfast', 1); c.close()
    launch(); tap('^记录$')
    tap('^‹ 前一天$', True)
    tap('^查看食物 Edited native meal$', True, 'content-desc')
    tap('^删除这条饮食记录$', True); tap('^保留记录$', True)
    tap('^删除这条饮食记录$', True); tap('^确定删除这次食用$', True)
    c = diet_db('deleted-diet'); assert c.execute('SELECT count(*) FROM nutrition_entries').fetchone()[0] == 0; assert c.execute('SELECT count(*) FROM nutrition_operations').fetchone()[0] == 1; c.close()
    report['nutritionRecordsInserted'] = 1
    report['dietStorage'] = {'isolatedUserEnteredRecords': 1, 'demoAdapter': False, 'relaunchPersisted': True, 'threePageSync': True, 'dateMealNameAmountEdit': True, 'confirmedDelete': True, 'inventoryUnchanged': True, 'targetsPersisted': True}


def identify_fixture(file):
    from datetime import datetime, timezone
    day = int(file.name[:2])
    millis = int(datetime(2030, 1, day, 12, tzinfo=timezone.utc).timestamp() * 1000)
    uri = 'content://media/external/images/media'
    where = "_display_name='" + file.name + "'"
    for _ in range(15):
        row = shell('content', 'query', '--uri', uri, '--projection', '_id:_display_name:_size:datetaken', '--where', where)
        if file.name in row and str(file.stat().st_size) in row:
            break
        time.sleep(1)
    else: raise AssertionError('MediaStore has not indexed exact fixture: ' + row)
    shell('content', 'update', '--uri', uri, '--bind', 'datetaken:l:' + str(millis), '--where', where)
    row = shell('content', 'query', '--uri', uri, '--projection', '_id:_display_name:_size:datetaken', '--where', where)
    assert str(millis) in row, row
    report.setdefault('fixtureMediaRows', []).append(row)
    return f'Jan {day}, 2030'


def upload_photos():
    from PIL import Image, ImageDraw
    from picker_selectors import next_picker_action, MEDIA, DOCUMENTS
    from archive_checks import jpeg_has_exif
    configure()
    fixtures = OUT / 'image-inputs'; fixtures.mkdir(exist_ok=True)
    import random
    large = Image.frombytes('RGB', (4000, 3000), random.Random(42).randbytes(4000 * 3000 * 3))
    exif = Image.Exif(); exif[274] = 6; exif[270] = 'test-only metadata to remove'
    large.save(fixtures / '02-ai-large.jpg', quality=98, exif=exif)
    large.close()
    transparent = Image.new('RGBA', (1200, 800), (0, 0, 0, 0))
    ImageDraw.Draw(transparent).rectangle((300, 200, 900, 600), fill=(20, 140, 220, 255))
    transparent.save(fixtures / '03-ai-transparent.png'); transparent.close()
    shell('mkdir', '-p', '/sdcard/Pictures/HukangSimple')
    tap('^拍一拍$')
    results = []
    for stem in ['02-ai-large', '03-ai-transparent']:
        original_file = next(fixtures.glob(stem + '.*'))
        adb('push', str(original_file), '/sdcard/Pictures/HukangSimple/' + original_file.name)
        shell('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Pictures/HukangSimple/' + original_file.name)
        fixture_date = identify_fixture(original_file)
        for _ in range(7): swipe(True)
        before = set(shell('find', f'/data/user/0/{PKG}/cache/ai-upload-v1', '-name', 'upload.jpg', check=False).splitlines())
        tap('^从相册选择$', True)
        stage = 'initial'; deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            action = next_picker_action(tree(), stem, stage, fixture_date=fixture_date)
            if action:
                stage, node = action; press(node)
                if stage == 'fixture': break
            else: time.sleep(.5)
        else: raise AssertionError('Image fixture not selectable: ' + stem)
        require('上传副本已在本机准备', True, attempts=18)
        for _ in range(7): swipe(True)
        require(str(original_file.stat().st_size), True)
        paths = set(shell('find', f'/data/user/0/{PKG}/cache/ai-upload-v1', '-name', 'upload.jpg').splitlines()) - before
        assert len(paths) == 1, paths
        path, = paths
        payload = adb('exec-out', 'cat', path)
        output = OUT / (stem + '-processed.jpg'); output.write_bytes(payload)
        assert 0 < len(payload) <= 4000000 and not jpeg_has_exif(payload)
        original_bytes = adb('exec-out', 'cat', '/sdcard/Pictures/HukangSimple/' + original_file.name)
        assert hashlib.sha256(original_bytes).digest() == hashlib.sha256(original_file.read_bytes()).digest()
        with Image.open(output) as image:
            assert max(image.size) <= 2048
            if stem == '02-ai-large': assert image.height > image.width and (fixtures / (stem + '.jpg')).stat().st_size > 4000000
            else: assert min(image.getpixel((0, 0))) >= 250
            results.append({'source': stem, 'sourceBytes': len(original_bytes), 'originalSha256': hashlib.sha256(original_bytes).hexdigest(), 'originalUnchanged': True, 'size': image.size, 'bytes': len(payload), 'exifRemoved': True, 'sha256': hashlib.sha256(payload).hexdigest()})
        if stem == '02-ai-large':
            tap('^手动记录这一餐$', True)
            enter('食物名称', 'Photo snapshot test')
            tap('我已确认日期、餐次和实际食用份量', True)
            tap('^已食用 · 确认记录$', True)
            require('已保存饮食记录', True)
            c = diet_db('saved-photo-diet')
            saved = json.loads(c.execute('SELECT snapshot_json FROM nutrition_entries').fetchone()[0]); c.close()
            from urllib.parse import urlparse, unquote
            saved_path = unquote(urlparse(saved['food']['image']).path)
            assert '/nutrition-photos/' in saved_path
            assert hashlib.sha256(adb('exec-out', 'cat', saved_path)).hexdigest() == hashlib.sha256(payload).hexdigest()
            # Export a real retained diet photo with no food-library products.
            launch(); tap('^我的$')
            tap('^包含食品与饮食照片$', True, 'content-desc')
            export_root = f'/data/user/0/{PKG}/cache/hukang-exports'
            previous = set(shell('find', export_root, '-name', '*.zip', check=False).splitlines())
            tap('^导出个人数据（含库存）$', True); tap('^生成文件$'); time.sleep(3)
            shot('android-isolated-diet-export-share-sheet')
            shell('input', 'keyevent', 'KEYCODE_BACK'); time.sleep(1)
            archives = set(shell('find', export_root, '-name', '*.zip').splitlines()) - previous
            assert len(archives) == 1, archives
            archive_path, = archives
            archive_bytes = adb('exec-out', 'cat', archive_path)
            import io, zipfile
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
                document = json.loads(archive.read('data.json'))
                assert document['schemaVersion'] == 2 and document['products'] == []
                exported, = document['nutrition']
                assert exported['id'] == saved['id'] and exported['food']['name'] == 'Photo snapshot test'
                assert exported['food']['image'].startswith('nutrition-photos/')
                assert archive.read(exported['food']['image']) == payload
                for item in json.loads(archive.read('files.json')):
                    asset = archive.read(item['path'])
                    assert len(asset) == item['bytes'] and hashlib.sha256(asset).hexdigest() == item['sha256']
                assert 'file://' not in archive.read('data.json').decode()
            report['dietPhotoExport'] = {'realNativeZip':True,'dietOnlyWithoutProducts':True,'retainedImageHashMatches':True,'portablePaths':True,'sha256':hashlib.sha256(archive_bytes).hexdigest()}
            # Restart, delete the record through UI; this removes only its private retained photo.
            launch(); tap('^记录$'); tap('^查看食物 Photo snapshot test$', True, 'content-desc')
            tap('^删除这条饮食记录$', True); tap('^确定删除这次食用$', True)
            assert saved_path not in shell('find', f'/data/user/0/{PKG}/files', '-name', 'photo.source', check=False)
            report['nutritionRecordsInserted'] += 1
            report['savedPhotoLifecycle'] = {'separatePersistentCopy':True,'copyHashMatches':True,'recordDeletionRemovesOnlyOwnedPhoto':True}
            tap('^拍一拍$')
            # The old upload is a cache preview from the terminated process; remove only via app's next cache lifecycle.
            continue
        for _ in range(6): swipe(True)
        shot('android-' + stem + '-preview')
        tap('^清除这张照片$', True)
        assert shell('test', '-f', path, check=False) == ''
        assert path not in shell('find', f'/data/user/0/{PKG}/cache/ai-upload-v1', '-name', 'upload.jpg', check=False)
    report['localUploadImages'] = {'nativeAndroidProcessing': True, 'inputs': results, 'originalsUnchanged': True, 'explicitlyClearedCopyRemoved': True, 'networkRequests': 0}

def upload_failures():
    from PIL import Image
    from picker_selectors import next_picker_action
    configure(); tap('^拍一拍$')
    fixtures = OUT / 'image-inputs'; fixtures.mkdir(exist_ok=True)
    image = Image.new('RGB', (20, 20), (60, 140, 200))
    image.save(fixtures / '04-ai-unsupported.gif')
    image.save(fixtures / '05-ai-oversize.jpg'); image.close()
    # Readable JPEG with padding isolates the raw-byte cap without a huge bitmap.
    with (fixtures / '05-ai-oversize.jpg').open('ab') as f:
        f.truncate(50_000_001)
    shell('mkdir', '-p', '/sdcard/Pictures/HukangSimple')
    failures = []
    for filename, expected in [('04-ai-unsupported.gif', '此图片格式无法在当前手机解码'),
                               ('05-ai-oversize.jpg', '原图超过本机 50 MB')]:
        original = fixtures / filename
        remote = '/sdcard/Pictures/HukangSimple/' + filename
        adb('push', str(original), remote)
        shell('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + remote)
        fixture_date = identify_fixture(original)
        for _ in range(7): swipe(True)
        cache = f'/data/user/0/{PKG}/cache/ai-upload-v1'
        before = set(shell('find', cache, '-type', 'f', check=False).splitlines())
        tap('^从相册选择$', True)
        stage = 'initial'; deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            action = next_picker_action(tree(), original.stem, stage, fixture_date=fixture_date)
            if action:
                stage, node = action; press(node)
                if stage == 'fixture': break
            else: time.sleep(.5)
        else: raise AssertionError('Failure fixture not selectable: ' + filename)
        require(expected, True, attempts=18)
        shot('android-' + original.stem + '-feedback')
        assert set(shell('find', cache, '-type', 'f', check=False).splitlines()) == before
        assert hashlib.sha256(adb('exec-out', 'cat', remote)).digest() == hashlib.sha256(original.read_bytes()).digest()
        for _ in range(7): swipe(True)
        require('^从相册选择$', True)
        failures.append({'file':filename,'errorDisplayed':True,'failedWorkRemoved':True,'originalUnchanged':True})
    for _ in range(7): swipe(True)
    tap('^从相册选择$', True); shell('input', 'keyevent', 'KEYCODE_BACK')
    require('^从相册选择$', True)
    report['localImageFailures'] = {'cases':failures,'pickerCancelRecovered':True,'networkRequests':0}


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
    cases = [('navigation-empty', home_and_navigation), ('nutrition-accordions-date', details),
                         ('small-screen-system-font', small_and_large), ('gesture-safe-area', gesture_safe_area),
                         ('keyboard-state', keyboard), ('camera-permissions', camera),
                         ('ai-native-network-feedback', ai_native_network_feedback), ('real-diet-local-storage', diet_closed_loop), ('local-upload-images', upload_photos), ('image-errors-and-picker-cancel', upload_failures)]
    if os.environ.get('HUKANG_DEVICE_SUITE') == 'images':
        cases = [('local-upload-images', upload_photos), ('image-errors-and-picker-cancel', upload_failures)]
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
