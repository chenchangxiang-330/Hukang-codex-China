"""Real APK / Android UI checks. No nutrition records or demo adapter are used.

Runs first on a clean, disposable Actions emulator. All screenshots are raw
Android screencaps; font scale and display density are actual OS settings.
"""
import hashlib
import json
import re
import shlex
import subprocess
import time
import traceback
import xml.etree.ElementTree as ET
from pathlib import Path
from ui_selectors import keyboard_top

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
    shell('uiautomator', 'dump', '--compressed', '/sdcard/hukang-v2.xml')
    raw = adb('exec-out', 'cat', '/sdcard/hukang-v2.xml')
    (OUT / 'last-window.xml').write_bytes(raw)
    root = ET.fromstring(raw)
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
    require('尚未记录', scroll=True)
    assert find('1285|1,285|62g|158g') is None, 'Demo values appeared in production'
    # Return to the top before the cover screenshot.
    swipe(True)
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
    require('请先拍照或从相册选择餐食照片', True)
    shot('android-capture-empty-photo-feedback')


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
    require('真实.*AI.*尚未接入|餐食 AI 尚未接入', True)
    shot('android-ai-unavailable-feedback')
    swipe(True)
    tap('^包装食品$')
    shot('android-capture-package-empty')
    tap('^拍照$', True)
    press(require(r':id/shutter_button$', attribute='resource-id', attempts=20))
    press(require(r':id/done_button$', attribute='resource-id', attempts=15))
    require('包装正面原图预览', attempts=15)
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


try:
    apk, = Path('artifacts/build').glob('hukang-*-arm64.apk')
    inspection = json.loads(Path('artifacts/build/apk-inspection.json').read_text())
    assert hashlib.sha256(apk.read_bytes()).hexdigest() == inspection['sha256']
    report['apkSha256'] = inspection['sha256']
    report['sourceCommit'] = Path('artifacts/build/source-commit.txt').read_text().strip()
    adb('root')
    adb('wait-for-device')
    report['device'] = shell('getprop', 'ro.build.fingerprint')
    report['abis'] = shell('getprop', 'ro.product.cpu.abilist')
    report['screen'] = shell('wm', 'size')
    report['originalDensity'] = shell('wm', 'density')
    report['originalFontScale'] = shell('settings', 'get', 'system', 'font_scale')
    assert not shell('pm', 'path', PKG, check=False), 'UI probe expects a fresh disposable emulator, never clears user data'
    report['install'] = adb('install', '-r', str(apk.resolve()), timeout=180).decode()
    assert 'Success' in report['install']
    for name, action in [('navigation-empty', home_and_navigation), ('nutrition-accordions-date', details),
                         ('small-screen-system-font', small_and_large), ('gesture-safe-area', gesture_safe_area),
                         ('keyboard-state', keyboard), ('camera-permissions', camera)]:
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
