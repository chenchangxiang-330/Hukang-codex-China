#!/usr/bin/env python3
"""Execute the production Phase 2 food flow on a root-capable offline Android test device.

Uses the system gallery and real native output, never a test Activity, mock,
host inference or alternate APK ABI. Suitable for a
Google APIs API 35 x86_64 emulator with official ARM64 native translation.
"""
import argparse
import hashlib
import json
import math
import pathlib
import re
import shlex
import sqlite3
import struct
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--apk", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--fixture", action="append", type=pathlib.Path)
    parser.add_argument("--run-timeout", type=int, default=240)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    adb = ["adb", "-s", args.serial]
    package = "com.hukang.china"
    files = f"/data/user/0/{package}/files"
    native_runs = files + "/ocr-lab/runs"
    native_images = files + "/ocr-lab/images"
    expo_runs = files + "/ocr-evidence"
    actions = []
    summary = {"schemaVersion": 1, "startedAt": datetime.now(timezone.utc).isoformat(),
               "serial": args.serial, "status": "running", "runs": [], "foodChecks": [], "actions": actions,
               "limitation": "Emulated execution is not ARM64 phone compatibility or performance validation."}

    def execute(arguments, check=True, timeout=60):
        completed = subprocess.run(adb + arguments, capture_output=True, timeout=timeout)
        actions.append({"at": datetime.now(timezone.utc).isoformat(), "adb": arguments,
                        "exitCode": completed.returncode,
                        "stderr": completed.stderr.decode("utf-8", errors="replace")[-4000:]})
        if check and completed.returncode:
            raise RuntimeError(f"adb {arguments}: {completed.stderr.decode(errors='replace')}")
        return completed.stdout

    def shell(*arguments, check=True, timeout=60):
        return execute(["shell", shlex.join(arguments)], check, timeout).decode("utf-8", errors="replace").strip()

    def save_summary():
        (output / "session.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def screenshot(name):
        (output / f"{name}.png").write_bytes(execute(["exec-out", "screencap", "-p"]))

    def hierarchy():
        # OCR busy indicators can prevent idle detection, so this is used only
        # before inference or after actual evidence has been written.
        shell("uiautomator", "dump", "--compressed", "/sdcard/hukang-window.xml", timeout=30)
        data = execute(["exec-out", "cat", "/sdcard/hukang-window.xml"])
        (output / "last-window.xml").write_bytes(data)
        return ET.fromstring(data)

    def locate(root, pattern):
        for node in root.iter("node"):
            labels = [node.attrib.get("text", "").strip(), node.attrib.get("content-desc", "").strip()]
            if any(re.search(pattern, label) for label in labels if label) or re.search(pattern, " ".join(labels).strip()):
                numbers = [int(value) for value in re.findall(r"\d+", node.attrib.get("bounds", ""))]
                if len(numbers) == 4 and numbers[2] > numbers[0] and numbers[3] > numbers[1]:
                    return node, numbers
        return None

    def require_app_process(wait_seconds=0):
        deadline = time.monotonic() + wait_seconds
        while True:
            pid = shell("pidof", package, check=False)
            if pid:
                return pid
            if time.monotonic() >= deadline:
                (output / "foreground-window.txt").write_text(shell("dumpsys", "window", "windows", check=False), encoding="utf-8")
                raise RuntimeError("Production App process is not running; inspect actual logcat and foreground-window.txt")
            time.sleep(1)

    def tap_match(pattern, tries=15, scroll=False, direction="down"):
        for _ in range(tries):
            # A crashed App must not turn later swipes into system-settings
            # interaction or get reported as an unrelated missing UI label.
            require_app_process()
            root = hierarchy()
            found = locate(root, pattern)
            # React Native's accessibility dump includes off-screen children
            # with coordinates far outside the viewport. Never tap one of
            # those nodes; scroll until the real control is visible.
            if found and not (found[1][0] < 1080 and found[1][2] > 0
                              and found[1][1] < 1920 and found[1][3] > 0):
                found = None
            if found:
                # The Android IME resize animation can finish between the
                # accessibility dump and the tap. Re-dump after a short
                # settle window and use the latest visible bounds so a
                # control is never tapped at its stale keyboard-open offset.
                time.sleep(0.35)
                settled = locate(hierarchy(), pattern)
                if settled and not (settled[1][0] < 1080 and settled[1][2] > 0
                                    and settled[1][1] < 1920 and settled[1][3] > 0):
                    settled = None
                if settled:
                    node, bounds = settled
                else:
                    node, bounds = found
                shell("input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
                actions.append({"uiTap": node.attrib, "match": pattern})
                return
            error = locate(root, r"导入失败|图片处理失败|恢复失败|本地 OCR 失败|Cannot find native module")
            if error:
                raise RuntimeError("OCR Lab displayed an error: " + str(error[0].attrib))
            # Android may show a chooser for ACTION_GET_CONTENT.
            chooser = locate(root, r"^(Files|文件)$")
            if chooser:
                _, bounds = chooser
                shell("input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
                time.sleep(1)
                continue
            if scroll:
                size = shell("wm", "size")
                width, height = [int(value) for value in re.findall(r"(\d+)x(\d+)", size)[-1]]
                x = width // 2
                y1, y2 = (int(height * .85), int(height * .25))
                if direction == "up":
                    y1, y2 = y2, y1
                shell("input", "swipe", str(x), str(y1), str(x), str(y2), "450")
            time.sleep(1)
        raise RuntimeError("UI element not found: " + pattern)

    def list_json(directory):
        result = shell("ls", "-1", directory, check=False)
        return {name for name in result.splitlines() if re.fullmatch(r"[\w.-]+\.json", name)}

    def list_directories(directory):
        result = shell("ls", "-1", directory, check=False)
        return {name for name in result.splitlines() if re.fullmatch(r"[\w.-]+", name)}

    def remote_json(path):
        return json.loads(execute(["exec-out", "cat", path]).decode("utf-8"))

    def photo_picker(root):
        return any("providers.media" in node.attrib.get("package", "")
                   and node.attrib.get("resource-id", "").endswith("/picker_tab_recyclerview")
                   for node in root.iter("node"))

    def choose_photo_picker_tile(photo, root):
        # Used only if the actual system picker offers no filename-based Browse
        # route. Two visible fixture tiles and actual MediaStore ordering are
        # required; the imported source SHA-256 must still match in run_ocr.
        rows = shell("content", "query", "--uri", "content://media/external/images/media",
                     "--projection", "_id:_display_name", "--sort", "_id DESC")
        (output / ("picker-media-order-" + photo.stem + ".txt")).write_text(rows, encoding="utf-8")
        indexed = [(int(row_id), filename.strip()) for row_id, filename in
                   re.findall(r"_id=(\d+),\s*_display_name=([^,\n]+)", rows)]
        names = [filename for _, filename in indexed]
        expected_names = {fixture.name for fixture in fixtures}
        if len(indexed) != 2 or len(expected_names) != 2 or set(names) != expected_names:
            raise RuntimeError("PhotoPicker has no Browse route and MediaStore is not exactly the two actual fixtures")
        tiles = []
        for node in root.iter("node"):
            if node.attrib.get("clickable") == "true" and re.match(r"Photo taken|照片拍摄|拍摄于", node.attrib.get("content-desc", "")):
                bounds = [int(value) for value in re.findall(r"\d+", node.attrib.get("bounds", ""))]
                if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
                    tiles.append((node, bounds))
        tiles.sort(key=lambda tile: (tile[1][1], tile[1][0]))
        if len(tiles) != len(indexed) or not any(node.attrib.get("selected") == "true"
                                                and (node.attrib.get("text") == "Photos" or node.attrib.get("content-desc") == "Photos")
                                                for node in root.iter("node")):
            raise RuntimeError("Actual PhotoPicker grid cannot be attributed safely to the MediaStore fixture order")
        target = names.index(photo.name)
        node, bounds = tiles[target]
        screenshot("picker-tile-selection-" + photo.stem)
        actions.append({"photoPickerSelection": "visible_tile_by_actual_MediaStore_id_desc",
                        "fixture": photo.name, "mediaStoreRows": indexed, "tileIndex": target,
                        "uiTile": node.attrib, "sourceHashVerification": "required_after_actual_import"})
        shell("input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))

    def choose_photo(photo):
        tap_match(r"从相册(?:选择|更换)照片", scroll=True, direction="up")
        # Recent Android versions intercept ACTION_GET_CONTENT with the
        # system PhotoPicker even when Expo legacy:true is requested. Prefer
        # its real Browse menu to reach filename-based DocumentsUI.
        root = hierarchy()
        for _ in range(4):
            if photo_picker(root) or locate(root, re.escape(photo.stem)):
                break
            time.sleep(1)
            root = hierarchy()
        if photo_picker(root):
            overflow = locate(root, r"^More options$|^更多选项$|^更多$")
            if not overflow:
                raise RuntimeError("Actual system PhotoPicker has no visible overflow menu")
            tap_match(r"^More options$|^更多选项$|^更多$", tries=2)
            menu = hierarchy()
            (output / ("picker-overflow-" + photo.stem + ".xml")).write_bytes(ET.tostring(menu, encoding="utf-8"))
            screenshot("picker-overflow-" + photo.stem)
            browse_pattern = r"^Browse(?:\s*[.\u2026]+)?$|^浏览(?:文件)?(?:\s*[.\u2026]+)?$"
            if locate(menu, browse_pattern):
                tap_match(browse_pattern, tries=3)
            else:
                shell("input", "keyevent", "KEYCODE_BACK")
                root = hierarchy()
                if not photo_picker(root):
                    raise RuntimeError("Closing PhotoPicker overflow did not return to the actual photo grid")
                choose_photo_picker_tile(photo, root)
                return
        # DocumentsUI can omit the extension from the visible title.
        try:
            tap_match(re.escape(photo.stem), tries=6, scroll=True)
        except RuntimeError:
            tap_match(r"Show roots|显示根目录|导航抽屉|Open navigation drawer", tries=3)
            tap_match(r"^(Images|图片|图像)\s*$", tries=3)
            try:
                tap_match(r"HukangOcrLab", tries=3, scroll=True)
            except RuntimeError:
                pass  # Some Images roots list photos without buckets.
            tap_match(re.escape(photo.stem), scroll=True)

    def run_ocr(photo, label):
        expected_source = digest(photo.read_bytes())
        before_native = list_json(native_runs)
        before_expo = list_directories(expo_runs)
        tap_match(r"^开始离线识别\s*$", scroll=True)
        deadline = time.monotonic() + args.run_timeout
        native = None
        native_filename = None
        while time.monotonic() < deadline:
            require_app_process()
            added = list_json(native_runs) - before_native
            if added:
                if len(added) != 1:
                    raise RuntimeError("Unexpected concurrent native runs; cannot attribute output")
                native_filename = added.pop()
                try:
                    native = remote_json(native_runs + "/" + native_filename)
                    break
                except (RuntimeError, json.JSONDecodeError):
                    # File presence can precede completion of the
                    # native writer. Keep waiting for real JSON.
                    pass
            time.sleep(1)
        if native is None:
            raise RuntimeError(f"No actual native OCR output within timeout for {photo.name}")
        if native["sourceImageHash"] != expected_source:
            raise RuntimeError("Gallery imported a different photo or changed original bytes")
        if not native["blocks"] or not native["rawText"].strip():
            raise RuntimeError("Actual OCR returned no text; do not mark acceptance passed")
        if native["rawText"] != "\n".join(block["text"] for block in native["blocks"]):
            raise RuntimeError("OCR raw text differs from actual block text")
        for block in native["blocks"]:
            if not math.isfinite(block["confidence"]) or not 0 <= block["confidence"] <= 1:
                raise RuntimeError("Invalid recognizer confidence")
            if len(block["polygon"]) != 4 or not all(math.isfinite(v) for v in block["boundingBox"].values()):
                raise RuntimeError("Invalid actual bounding boxes")
        for key in ["detector", "recognizer"]:
            if native["modelHashes"][key] != manifest["models"][key]["sha256"]:
                raise RuntimeError("Native output used an unpinned model")
        for key in ["modelLoadMs", "ocrMs", "totalMs"]:
            if not math.isfinite(native[key]) or native[key] < 0:
                raise RuntimeError("Invalid actual measured timing: " + key)
        (output / (label + "-native.json")).write_text(json.dumps(native, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # Preserve actual JS export too; native output alone does not
        # attest the complete production UI bridge/save path.
        expo_id = None
        for _ in range(30):
            added = list_directories(expo_runs) - before_expo
            for candidate in sorted(added):
                try:
                    record = remote_json(expo_runs + "/" + candidate + "/record.json")
                except (RuntimeError, json.JSONDecodeError):
                    continue
                if record["ocr"]["id"] == native["id"]:
                    expo_id = candidate
                    break
            if expo_id:
                break
            time.sleep(1)
        if not expo_id:
            raise RuntimeError("Native OCR succeeded but production JS evidence save was not observed")
        execute(["pull", expo_runs + "/" + expo_id, str(output / label)], timeout=60)
        summary["runs"].append({"fixture": photo.name, "variant": "food_source_baseline",
            "nativeOutput": label + "-native.json", "expoDirectory": label,
            "sourceImageHash": expected_source, "processedImageHash": native["processedImageHash"],
            "blockCount": len(native["blocks"]), "modelLoadMs": native["modelLoadMs"],
            "ocrMs": native["ocrMs"], "totalMs": native["totalMs"], "memory": native.get("memory"),
            "timings": native.get("timings")})
        print(json.dumps({"actualAndroidRun": label, "sourceImageHash": expected_source,
                          "rawText": native["rawText"], "blockCount": len(native["blocks"]),
                          "modelLoadMs": native["modelLoadMs"], "ocrMs": native["ocrMs"],
                          "totalMs": native["totalMs"], "memory": native.get("memory"),
            "timings": native.get("timings")}, ensure_ascii=False), flush=True)
        save_summary()
        return native

    def set_text(label, value, direction="down"):
        """Enter through the production Android TextInput, then verify UI state."""
        if not value.isascii():
            raise RuntimeError("adb input text only supports ASCII test entries; never replace raw Chinese OCR")
        pattern = "^" + re.escape(label) + "$"
        tap_match(pattern, scroll=True, direction=direction)
        shell("input", "keyevent", "KEYCODE_MOVE_END")
        shell("input", "keyevent", *(["KEYCODE_DEL"] * 200))
        if value:
            shell("input", "text", value.replace(" ", "%s"))
        found = locate(hierarchy(), pattern)
        if not found or found[0].attrib.get("text", "") != value:
            raise RuntimeError("Production TextInput did not retain the exact manual entry: " + label)
        actions.append({"manualReviewInput": label, "value": value,
                        "provenance": "Human visual label transcription/test edit, never OCR output"})
        ime = shell("dumpsys", "input_method")
        if re.search(r"mInputShown=true|mIsInputViewShown=true", ime):
            shell("input", "keyevent", "KEYCODE_BACK")
            # Wait for the window resize to settle before the next control is
            # located. Without this, uiautomator may expose pre-dismissal
            # coordinates while the screenshot/touch surface has moved.
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                state = shell("dumpsys", "input_method")
                if not re.search(r"mInputShown=true|mIsInputViewShown=true", state):
                    break
                time.sleep(0.2)
            time.sleep(0.5)

    def check_reviewed(label):
        pattern = "^" + re.escape(label) + "$"
        tap_match(pattern, scroll=True)
        found = locate(hierarchy(), pattern)
        if not found or found[0].attrib.get("checked") != "true":
            raise RuntimeError("Actual user-review checkbox did not become checked: " + label)

    def database_snapshot(label):
        """Read actual production SQLite bytes; no inserts or host reconstruction."""
        destination = output / label
        destination.mkdir(exist_ok=True)
        paths = shell("find", files, "-name", "hukang-china-food.db", check=False).splitlines()
        if len(paths) != 1 or not paths[0].startswith(files + "/"):
            raise RuntimeError("Actual production SQLite database was not uniquely found: " + str(paths))
        database = paths[0]
        captured = {}
        for suffix in ["", "-wal", "-shm"]:
            remote = database + suffix
            if shell("test", "-f", remote, check=False) == "":
                # shell test has no stdout: use an explicit sentinel for existence.
                exists = shell("sh", "-c", "test -f " + shlex.quote(remote) + " && echo present", check=False)
                if exists != "present":
                    continue
            data = execute(["exec-out", "cat", remote])
            filename = "hukang-china-food.db" + suffix
            (destination / filename).write_bytes(data)
            captured[filename] = {"bytes": len(data), "sha256": digest(data), "devicePath": remote}
        local = destination / "hukang-china-food.db"
        if not local.is_file():
            raise RuntimeError("No actual SQLite main database captured")
        connection = sqlite3.connect("file:" + str(local) + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Actual pulled SQLite database failed integrity_check")
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            expected = {"foods", "food_evidence", "food_revisions"}
            if not expected.issubset(tables):
                raise RuntimeError("Production food schema is incomplete: " + str(tables))
            result = {"capture": captured, "integrityCheck": "ok", "tables": {}}
            for table in sorted(expected):
                result["tables"][table] = [dict(row) for row in connection.execute("SELECT * FROM " + table)]
        finally:
            connection.close()
        (destination / "database-export.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        actions.append({"actualSqliteSnapshot": label, "foodCount": len(result["tables"]["foods"]),
                        "devicePath": database, "integrityCheck": "ok"})
        return result

    def wait_food_count(label, count):
        last_error = None
        for _ in range(20):
            require_app_process()
            try:
                snapshot = database_snapshot(label)
                if len(snapshot["tables"]["foods"]) == count:
                    return snapshot
            except (RuntimeError, sqlite3.Error) as error:
                last_error = str(error)
            time.sleep(1)
        raise RuntimeError("Production save did not produce the expected SQLite records: " + str(last_error))

    def food_from(snapshot, identifier):
        foods = snapshot["tables"]["foods"]
        food = next((row for row in foods if row["id"] == identifier), None)
        evidence = next((row for row in snapshot["tables"]["food_evidence"] if row["food_id"] == identifier), None)
        revisions = [row for row in snapshot["tables"]["food_revisions"] if row["food_id"] == identifier]
        if not food or not evidence or not revisions:
            raise RuntimeError("Actual food, immutable evidence and revision rows were not saved together")
        return food, evidence, revisions

    def verify_immutable(snapshot, identifier, native, original_source=None, original_parsed=None):
        food, evidence, revisions = food_from(snapshot, identifier)
        source = json.loads(evidence["source_evidence_json"])
        parsed = json.loads(evidence["parsed_json"])
        if source["ocr"] != native:
            raise RuntimeError("SQLite source OCR differs from the actual native output")
        if parsed["ocrSourceImageHash"] != native["sourceImageHash"] or parsed["ocrProcessedImageHash"] != native["processedImageHash"]:
            raise RuntimeError("Parser evidence is not tied to the actual source and processed images")
        block_ids = {block["id"] for block in native["blocks"]}
        for column in parsed["columns"]:
            for row in column["rows"]:
                if not set(row["labelBlockIds"]).issubset(block_ids):
                    raise RuntimeError("Parser label refers to invented OCR blocks")
                for key in ["amount", "nrv"]:
                    if not set(row[key]["blockIds"]).issubset(block_ids):
                        raise RuntimeError("Parser cell refers to invented OCR blocks")
        if original_source is not None and evidence["source_evidence_json"] != original_source:
            raise RuntimeError("Manual edit overwrote immutable original OCR evidence")
        if original_parsed is not None and evidence["parsed_json"] != original_parsed:
            raise RuntimeError("Manual edit overwrote immutable parser output")
        return food, evidence, revisions

    def relaunch(label):
        shell("am", "force-stop", package)
        if shell("pidof", package, check=False):
            raise RuntimeError("force-stop did not end the actual application process")
        shell("am", "start", "-n", package + "/.MainActivity")
        require_app_process(wait_seconds=20)
        time.sleep(3)
        screenshot(label)

    def open_food(identifier):
        tap_match("^食品记录-" + re.escape(identifier) + "$", scroll=True)
        tap_match("^食品名称$", scroll=True, direction="down")

    def fill_confirmed_milk(column_id):
        # Explicit human transcription from the photographed label. These are
        # not OCR expectations and must never overwrite original OCR/parser JSON.
        prefix = "营养" + column_id
        tap_match("^" + re.escape(prefix + "-计量基准-per_100ml") + "$", scroll=True, direction="up")
        manual = {"energy": ("309", "kJ", "4"), "protein": ("3.6", "g", "6"),
                  "fat": ("4.4", "g", "7"), "carbohydrate": ("5.0", "g", "2"),
                  "sodium": ("58", "mg", "3")}
        check_reviewed(prefix + "-已核对")
        for nutrient, (amount, unit, nrv) in manual.items():
            field = prefix + "-" + nutrient
            set_text(field + "-数值", amount)
            tap_match("^" + re.escape(field + "-单位-" + unit) + "$", scroll=True)
            set_text(field + "-NRV", nrv)
            check_reviewed(field + "-已核对")
        return manual

    try:
        manifest = json.loads((ROOT / "models/paddleocr/v5-mobile/manifest.json").read_text())
        apk_bytes = args.apk.read_bytes()
        summary["apk"] = {"filename": args.apk.name, "bytes": len(apk_bytes), "sha256": digest(apk_bytes)}
        with zipfile.ZipFile(args.apk) as apk:
            abis = {name.split("/")[1] for name in apk.namelist() if name.startswith("lib/") and name.endswith(".so")}
            if abis != {"arm64-v8a"}:
                raise RuntimeError(f"Only the actual ARM64 release APK is permitted, found ABIs {abis}")
            for key, filename in [("detector", "detector.onnx"), ("recognizer", "recognizer.onnx")]:
                if digest(apk.read("assets/models/paddleocr/v5-mobile/" + filename)) != manifest["models"][key]["sha256"]:
                    raise RuntimeError("Unpinned bundled official model: " + key)
        execute(["wait-for-device"])
        deadline = time.monotonic() + 180
        while shell("getprop", "sys.boot_completed") != "1":
            if time.monotonic() >= deadline:
                raise RuntimeError("Existing Android device did not finish boot; OCR was not executed")
            time.sleep(3)
        execute(["root"])
        time.sleep(1)  # adbd can disconnect shortly after the root response.
        execute(["wait-for-device"])
        if "uid=0(" not in shell("id"):
            raise RuntimeError("Test evidence extraction requires an adb-root-capable test device")
        properties = {name: shell("getprop", name) for name in [
            "ro.product.model", "ro.build.version.release", "ro.build.version.sdk",
            "ro.build.fingerprint", "ro.build.version.security_patch", "ro.product.cpu.abilist64",
            "ro.product.cpu.abilist", "ro.dalvik.vm.native.bridge", "ro.ndk_translation.version", "ro.kernel.qemu"]}
        summary["device"] = properties
        if "arm64-v8a" not in properties["ro.product.cpu.abilist"]:
            raise RuntimeError("This device cannot execute the ARM64 APK")
        if properties["ro.product.cpu.abilist"].startswith("x86") and properties["ro.dalvik.vm.native.bridge"] != "libndk_translation.so":
            raise RuntimeError("x86 emulator lacks the expected official ARM64 native bridge")
        if properties["ro.dalvik.vm.native.bridge"] == "libndk_translation.so":
            bridge = execute(["exec-out", "cat", "/system/lib64/libndk_translation.so"])
            summary["nativeBridge"] = {"path": "/system/lib64/libndk_translation.so", "sha256": digest(bridge)}
        # No app is started until these actual device settings are applied.
        shell("settings", "put", "global", "airplane_mode_on", "1")
        shell("am", "broadcast", "-a", "android.intent.action.AIRPLANE_MODE", "--ez", "state", "true")
        shell("svc", "wifi", "disable")
        shell("svc", "data", "disable", check=False)
        for command in ["iptables", "ip6tables"]:
            (output / (command + "-rules.txt")).write_text(shell(command, "-S", check=False), encoding="utf-8")
        installed = shell("pm", "list", "packages")
        disabled = []
        for name in ["com.google.android.gms", "com.google.android.gsf", "com.google.android.apps.photos"]:
            if "package:" + name + "\n" in installed + "\n":
                shell("pm", "disable-user", "--user", "0", name)
                disabled.append(name)
        summary["googlePackagesDisabledForTest"] = disabled
        actual_disabled = shell("pm", "list", "packages", "-d")
        (output / "disabled-packages.txt").write_text(actual_disabled, encoding="utf-8")
        if any("package:" + name + "\n" not in actual_disabled + "\n" for name in disabled):
            raise RuntimeError("Google services were not actually disabled for this test")
        shell("settings", "put", "global", "device_provisioned", "1")
        shell("settings", "put", "secure", "user_setup_complete", "1")
        summary["offlineSettingsBeforeFirstLaunch"] = {
            "airplane_mode_on": shell("settings", "get", "global", "airplane_mode_on"),
            "wifi_on": shell("settings", "get", "global", "wifi_on")}
        if summary["offlineSettingsBeforeFirstLaunch"] != {"airplane_mode_on": "1", "wifi_on": "0"}:
            raise RuntimeError("Offline settings were not applied")
        execute(["install", "-r", str(args.apk.resolve())], timeout=180)
        package_info = shell("dumpsys", "package", package)
        (output / "installed-package.txt").write_text(package_info, encoding="utf-8")
        if "primaryCpuAbi=arm64-v8a" not in package_info:
            raise RuntimeError("Installed package does not actually use ARM64")
        installed_apks = shell("pm", "path", package).splitlines()
        if len(installed_apks) != 1 or not installed_apks[0].startswith("package:/"):
            raise RuntimeError("Expected the actual monolithic release APK installation")
        native_directory = pathlib.PurePosixPath(installed_apks[0][8:]).parent / "lib" / "arm64"
        installed_libraries = {}
        with zipfile.ZipFile(args.apk) as archive:
            for library in ["libreactnative.so", "libopencv_java4.so", "libonnxruntime.so", "libonnxruntime4j_jni.so"]:
                path = str(native_directory / library)
                shell("test", "-s", path)
                actual_hash = shell("sha256sum", path).split()[0]
                expected_hash = digest(archive.read("lib/arm64-v8a/" + library))
                if actual_hash != expected_hash:
                    raise RuntimeError("Installed ARM64 library differs from the actual release APK: " + library)
                installed_libraries[library] = {"path": path, "sha256": actual_hash}
        summary["installedNativeLibraries"] = installed_libraries
        fixtures = args.fixture or sorted((ROOT / "tests/fixtures/china-food").glob("*.jpg"))
        if not fixtures:
            raise RuntimeError("No actual photo fixtures supplied")
        # Android 11 MediaProvider rejects the /sdcard alias during scanning
        # and _data insertion. Use its canonical primary-volume path for every
        # push, scan broadcast and content insert.
        photo_dir = "/storage/emulated/0/Pictures/HukangOcrLab"
        shell("mkdir", "-p", photo_dir)
        for photo in fixtures:
            if not re.fullmatch(r"[\w.-]+", photo.name):
                raise RuntimeError("Unsupported fixture filename")
            remote = photo_dir + "/" + photo.name
            execute(["push", str(photo.resolve()), remote])
            shell("am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file://" + remote)
            # Verify system gallery indexing; a missing photo is not an OCR
            # failure and must never be replaced with synthetic output.
            for attempt in range(20):
                indexed = shell("content", "query", "--uri", "content://media/external/images/media",
                                "--projection", "_id:_display_name", "--where", "_display_name='" + photo.name + "'", check=False)
                if photo.name in indexed:
                    break
                if attempt == 5:
                    shell("content", "insert", "--uri", "content://media/external/images/media",
                          "--bind", "_data:s:" + remote, "--bind", "mime_type:s:image/jpeg",
                          "--bind", "_display_name:s:" + photo.name, check=False)
                time.sleep(1)
            else:
                raise RuntimeError("System gallery did not index fixture: " + photo.name)
        shell("input", "keyevent", "KEYCODE_WAKEUP")
        shell("wm", "dismiss-keyguard")
        shell("am", "force-stop", package)
        shell("am", "start", "-n", package + "/.MainActivity")
        time.sleep(3)
        summary["appPidAfterInitialLaunch"] = require_app_process(wait_seconds=15)
        screenshot("first-offline-launch")

        # Phase 2 production review, persistence, restart and delete. Every
        # value entered below is a visible review edit; native OCR evidence is
        # read back from SQLite and compared byte-for-byte after each edit.
        if not fixtures:
            raise RuntimeError("No real food fixtures supplied")
        # Import the first real gallery fixture before looking for the OCR
        # action; the production button is rendered only after an image exists.
        choose_photo(fixtures[0])
        native_results = []
        for index, fixture in enumerate(fixtures):
            native_results.append(run_ocr(fixture, f"food-{index + 1}"))
            if index + 1 < len(fixtures):
                choose_photo(fixtures[index + 1])
        native = native_results[-1]
        screenshot("food-ocr-before-review")
        tap_match(r"^食品营养核对$", scroll=True, direction="down")
        require_app_process(wait_seconds=10)
        screenshot("food-review-draft")

        # Save a draft first. This path must work even when the parser marks a
        # table incomplete, because an incomplete table is still useful review
        # evidence and must never be discarded.
        set_text("食品名称", "food-draft")
        tap_match(r"^保存待确认记录$", scroll=True, direction="down")
        time.sleep(2)
        draft_snapshot = wait_food_count("food-draft-saved", 1)
        if len(draft_snapshot["tables"]["food_revisions"]) != 1:
            raise RuntimeError("Draft save did not create exactly one immutable revision")
        food_id = draft_snapshot["tables"]["foods"][0]["id"]
        source_before = draft_snapshot["tables"]["food_evidence"][0]["source_evidence_json"]
        parsed_before = draft_snapshot["tables"]["food_evidence"][0]["parsed_json"]
        verify_immutable(draft_snapshot, food_id, native, source_before, parsed_before)
        summary["foodChecks"].append({"step": "draft-save", "foodId": food_id,
                                       "status": "draft", "foodCount": 1,
                                       "immutableEvidence": True})

        # Reopen from SQLite after a process restart. The editable values use
        # ASCII only because adb input text cannot reliably inject Chinese;
        # the OCR source and parser JSON remain the actual photographed data.
        relaunch("after-draft-restart")
        tap_match(r"^打开本地食品$|^本地食品$", scroll=True, direction="up")
        open_food(food_id)
        set_text("食品名称", "food-edited")
        tap_match(r"^保存待确认记录$", scroll=True, direction="down")
        time.sleep(2)
        edited_snapshot = wait_food_count("food-edited", 1)
        edited_food, _, edited_revisions = verify_immutable(edited_snapshot, food_id, native,
                                                              source_before, parsed_before)
        if edited_food["name"] != "food-edited" or len(edited_revisions) != 2:
            raise RuntimeError("SQLite edit did not persist the visible review change and revision")
        summary["foodChecks"].append({"step": "edit-after-restart", "foodId": food_id,
                                       "name": edited_food["name"], "revisionCount": len(edited_revisions),
                                       "immutableEvidence": True})

        # Confirmed status is attempted only with fields explicitly present in
        # the production form. Missing or ambiguous OCR rows remain a draft;
        # the report then records that confirmed-table acceptance needs a phone
        # run rather than fabricating a pass.
        relaunch("before-confirmed-review")
        tap_match(r"^打开本地食品$|^本地食品$", scroll=True, direction="up")
        open_food(food_id)
        review_root = hierarchy()
        # The native hierarchy exposes the selectable radio options, whose
        # labels end in the selected basis value; the parent View itself does
        # not carry the column label. Extract IDs from those real controls.
        column_ids = sorted({match.group(1) for node in review_root.iter("node")
                             for label in [node.attrib.get("content-desc", "")]
                             for match in [re.search(r"^营养(.+)-计量基准-(?:per_100g|per_100ml|per_serving|unknown)$", label)] if match})
        if column_ids:
            # These are the values visibly printed on the second fixture
            # (the snack label). The energy unit is deliberately entered as
            # kJ to resolve the OCR text "2075千焦(k)" during human review.
            manual_by_nutrient = {"energy": ("2075", "kJ", "25"), "protein": ("21.0", "g", "35"),
                                  "fat": ("37.7", "g", "63"), "carbohydrate": ("19.0", "g", "6"),
                                  "sodium": ("1248", "mg", "62")}
            for column_id in column_ids:
                prefix = "营养" + column_id
                # Prefer an explicit per-100 basis. It avoids introducing a
                # serving size that the photograph may not state.
                basis = locate(review_root, r"^" + re.escape(prefix + "-计量基准-") + r"(?:per_100g|per_100ml)$")
                if not basis:
                    continue
                tap_match(r"^" + re.escape(prefix + "-计量基准-") + r"(?:per_100g|per_100ml)$", scroll=True)
                check_reviewed(prefix + "-已核对")
                for nutrient, (amount, unit, nrv) in manual_by_nutrient.items():
                    field = prefix + "-" + nutrient
                    set_text(field + "-数值", amount)
                    tap_match(r"^" + re.escape(field + "-单位-" + unit) + r"$", scroll=True)
                    set_text(field + "-NRV", nrv)
                    check_reviewed(field + "-已核对")
            tap_match(r"^确认并保存食品$", scroll=True, direction="down")
            time.sleep(2)
            confirmed_snapshot = wait_food_count("food-confirmed", 1)
            confirmed_food, _, confirmed_revisions = verify_immutable(confirmed_snapshot, food_id, native,
                                                                        source_before, parsed_before)
            if confirmed_food["status"] != "confirmed":
                raise RuntimeError("Confirmed save returned without confirmed status")
            summary["foodChecks"].append({"step": "confirmed-save", "foodId": food_id,
                                           "status": confirmed_food["status"],
                                           "revisionCount": len(confirmed_revisions),
                                           "immutableEvidence": True})
        else:
            summary["foodChecks"].append({"step": "confirmed-save", "status": "not-attempted",
                                           "reason": "Production parser returned no editable nutrition column"})

        # Delete through the production UI and verify both relational rows and
        # the app-private evidence folder disappear.
        relaunch("before-delete")
        tap_match(r"^打开本地食品$|^本地食品$", scroll=True, direction="up")
        open_food(food_id)
        tap_match(r"^删除食品记录$", scroll=True, direction="down")
        tap_match(r"^删除$", tries=5)
        for _ in range(20):
            try:
                deleted = database_snapshot("food-deleted")
                if len(deleted["tables"]["foods"]) == 0 and len(deleted["tables"]["food_evidence"]) == 0 and len(deleted["tables"]["food_revisions"]) == 0:
                    break
            except (RuntimeError, sqlite3.Error):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Production delete did not remove food, evidence and revisions")
        summary["foodChecks"].append({"step": "delete", "foodId": food_id, "foodCount": 0,
                                       "cascadeRowsRemoved": True})
        screenshot("food-deleted")
        summary["status"] = "passed"
    except Exception as error:
        summary["status"] = "failed"
        summary["error"] = f"{type(error).__name__}: {error}"
        screenshot("failure")
        raise
    finally:
        summary["finishedAt"] = datetime.now(timezone.utc).isoformat()
        try:
            summary["finalMemoryInfo"] = shell("dumpsys", "meminfo", package, check=False, timeout=60)
            (output / "final-meminfo.txt").write_text(summary["finalMemoryInfo"], encoding="utf-8")
        except Exception as error:
            summary["finalMemoryInfoError"] = str(error)
        save_summary()


if __name__ == "__main__":
    main()
