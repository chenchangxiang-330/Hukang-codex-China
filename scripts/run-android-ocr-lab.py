#!/usr/bin/env python3
"""Run the production OCR Lab UI on an existing root-capable test Android device.

Uses the system gallery and real native output, never a test Activity, mock,
manual transcription, host inference or alternate APK ABI. Suitable for a
Google APIs API 30 x86_64 emulator with official ARM64 native translation.
"""
import argparse
import hashlib
import json
import math
import pathlib
import re
import shlex
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
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--run-timeout", type=int, default=240)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    adb = ["adb", "-s", args.serial]
    package = "com.hukang.china"
    files = f"/data/user/0/{package}/files"
    native_runs = files + "/ocr-lab/runs"
    expo_runs = files + "/ocr-evidence"
    actions = []
    summary = {"schemaVersion": 1, "startedAt": datetime.now(timezone.utc).isoformat(),
               "serial": args.serial, "status": "running", "runs": [], "actions": actions,
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

    def tap_match(pattern, tries=15, scroll=False, direction="down"):
        for _ in range(tries):
            root = hierarchy()
            found = locate(root, pattern)
            if found:
                node, bounds = found
                shell("input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
                actions.append({"uiTap": node.attrib, "match": pattern})
                return
            error = locate(root, r"导入失败|本地 OCR 失败|Cannot find native module")
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
            "ro.product.cpu.abilist", "ro.dalvik.vm.native.bridge", "ro.kernel.qemu"]}
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
        screenshot("first-offline-launch")
        for photo_index, photo in enumerate(fixtures):
            tap_match(r"从相册(?:选择|更换)照片", scroll=True, direction="up")
            # DocumentsUI can omit the extension from the visible title.
            try:
                tap_match(re.escape(photo.stem), tries=6, scroll=True)
            except RuntimeError:
                # Expand the native DocumentsUI roots and browse its local
                # Images bucket. This is still a real gallery selection.
                tap_match(r"Show roots|显示根目录|导航抽屉|Open navigation drawer", tries=3)
                tap_match(r"^(Images|图片|图像)\s*$", tries=3)
                try:
                    tap_match(r"HukangOcrLab", tries=3, scroll=True)
                except RuntimeError:
                    pass  # Some Images roots list photos without buckets.
                tap_match(re.escape(photo.stem), scroll=True)
            expected_source = digest(photo.read_bytes())
            for repeat in range(args.repeats):
                before_native = list_json(native_runs)
                before_expo = list_directories(expo_runs)
                tap_match(r"^开始离线识别\s*$", scroll=True)
                deadline = time.monotonic() + args.run_timeout
                native = None
                native_filename = None
                while time.monotonic() < deadline:
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
                label = f"photo-{photo_index + 1}-run-{repeat + 1}"
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
                summary["runs"].append({"fixture": photo.name, "repeat": repeat + 1,
                    "nativeOutput": label + "-native.json", "expoDirectory": label,
                    "sourceImageHash": expected_source, "processedImageHash": native["processedImageHash"],
                    "blockCount": len(native["blocks"]), "modelLoadMs": native["modelLoadMs"],
                    "ocrMs": native["ocrMs"], "totalMs": native["totalMs"], "memory": native.get("memory")})
                print(json.dumps({"actualAndroidRun": label, "sourceImageHash": expected_source,
                                  "rawText": native["rawText"], "blockCount": len(native["blocks"]),
                                  "modelLoadMs": native["modelLoadMs"], "ocrMs": native["ocrMs"],
                                  "totalMs": native["totalMs"], "memory": native.get("memory")}, ensure_ascii=False), flush=True)
                save_summary()
            tap_match(r"^OCR 原文\s*$", scroll=True)
            screenshot(f"photo-{photo_index + 1}-actual-text")
            tap_match(r"02 图片与文字框", scroll=True, direction="up")
            screenshot(f"photo-{photo_index + 1}-actual-boxes")
        summary["status"] = "verified_android_emulated"
    except Exception as error:
        summary["status"] = "error"
        summary["error"] = str(error)
        print("Android OCR execution failed: " + str(error), file=sys.stderr, flush=True)
        try:
            screenshot("failure")
        except Exception:
            pass
    finally:
        try:
            (output / "logcat.txt").write_bytes(execute(["logcat", "-d", "-v", "threadtime"], check=False))
            (output / "connectivity.txt").write_text(shell("dumpsys", "connectivity", check=False), encoding="utf-8")
            (output / "meminfo-snapshot.txt").write_text(shell("dumpsys", "meminfo", package, check=False), encoding="utf-8")
            execute(["pull", files + "/ocr-lab", str(output / "native-storage")], check=False)
        except Exception as error:
            summary["captureError"] = str(error)
        summary["finishedAt"] = datetime.now(timezone.utc).isoformat()
        save_summary()
    print(json.dumps({"status": summary["status"], "runs": len(summary["runs"]), "session": str(output / "session.json")}, ensure_ascii=False), flush=True)
    return 0 if summary["status"] == "verified_android_emulated" else 1


if __name__ == "__main__":
    raise SystemExit(main())
