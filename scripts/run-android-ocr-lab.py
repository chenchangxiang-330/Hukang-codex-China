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
    native_images = files + "/ocr-lab/images"
    expo_runs = files + "/ocr-evidence"
    actions = []
    summary = {"schemaVersion": 1, "startedAt": datetime.now(timezone.utc).isoformat(),
               "serial": args.serial, "status": "running", "runs": [], "processingChecks": [], "actions": actions,
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
            if found:
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

    def choose_photo(photo):
        tap_match(r"从相册(?:选择|更换)照片", scroll=True, direction="up")
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

    def capture_prepared_image(before, label, expected_source):
        """Wait for both the native PNG and sidecar to finish; preserve actual bytes."""
        deadline = time.monotonic() + args.run_timeout
        last_error = None
        while time.monotonic() < deadline:
            require_app_process()
            added = {name for name in list_json(native_images) - before if name.endswith(".png.json")}
            if len(added) > 1:
                raise RuntimeError("Unexpected concurrent image operations; cannot attribute transformation")
            if added:
                filename = added.pop()
                try:
                    metadata = remote_json(native_images + "/" + filename)
                    path = native_images + "/" + filename[:-5]
                    image = execute(["exec-out", "cat", path])
                    if metadata["uri"] != "file://" + path or metadata["sourceImageHash"] != expected_source:
                        raise RuntimeError("Prepared image lineage does not match the actual selected photo")
                    if digest(image) != metadata["processedImageHash"]:
                        raise RuntimeError("Prepared image bytes do not match their native SHA-256")
                    if len(image) < 24 or image[:8] != b"\x89PNG\r\n\x1a\n" or image[12:16] != b"IHDR":
                        raise RuntimeError("Native transformed image is not a complete PNG header")
                    dimensions = struct.unpack(">II", image[16:24])
                    if dimensions != (metadata["width"], metadata["height"]):
                        raise RuntimeError("Native metadata dimensions differ from actual PNG dimensions")
                    (output / (label + ".png")).write_bytes(image)
                    (output / (label + ".json")).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    return metadata
                except (RuntimeError, json.JSONDecodeError) as error:
                    # File presence may precede completion of the native writer.
                    # No partial image or sidecar may count as verification.
                    last_error = str(error)
            time.sleep(1)
        raise RuntimeError(f"Actual image operation did not produce complete evidence: {label}: {last_error}")

    def product(left, right):
        return [sum(left[row * 3 + k] * right[k * 3 + col] for k in range(3))
                for row in range(3) for col in range(3)]

    def check_transformation(actual, original, size, matrix, added_operations):
        if (actual["width"], actual["height"]) != size:
            raise RuntimeError("Image transformation returned unexpected actual dimensions")
        for key in ["originalUri", "sourceImageHash", "sourceOrientation"]:
            if actual[key] != original[key]:
                raise RuntimeError("Image transformation changed original lineage: " + key)
        for key in ["originalWidth", "originalHeight"]:
            if actual["transform"][key] != original["transform"][key]:
                raise RuntimeError("Image transformation changed original dimensions")
        measured = actual["transform"]["matrix"]
        if len(measured) != 9 or not all(math.isfinite(number) and math.isclose(number, expected, abs_tol=1e-4)
                                       for number, expected in zip(measured, matrix)):
            raise RuntimeError("Actual image transformation matrix does not match the UI operation")
        if actual["transform"]["operations"] != original["transform"]["operations"] + added_operations:
            raise RuntimeError("Actual image operations do not match the UI actions")

    def set_crop_field(label, value):
        pattern = r"^裁剪" + re.escape(label) + r"\s*$"
        tap_match(pattern, scroll=True, direction="up")
        shell("input", "keyevent", "KEYCODE_MOVE_END")
        shell("input", "keyevent", *(["KEYCODE_DEL"] * 7))
        shell("input", "text", str(value))
        found = locate(hierarchy(), pattern)
        if not found or found[0].attrib.get("text", "") != str(value):
            raise RuntimeError("Crop field was not actually updated through the UI: " + label)
        ime = shell("dumpsys", "input_method")
        if re.search(r"mInputShown=true|mIsInputViewShown=true", ime):
            shell("input", "keyevent", "KEYCODE_BACK")

    def run_ocr(photo, label, repeat=0, variant="baseline", expected_image=None):
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
        if expected_image is not None:
            for key in ["sourceImageHash", "processedImageHash", "width", "height"]:
                if native[key] != expected_image[key] or record["image"][key] != expected_image[key]:
                    raise RuntimeError("Transformation/OCR evidence mismatch: " + key)
            if native["imageUri"] != expected_image["uri"] or record["image"]["transform"] != expected_image["transform"]:
                raise RuntimeError("OCR did not use the current transformed image")
        execute(["pull", expo_runs + "/" + expo_id, str(output / label)], timeout=60)
        summary["runs"].append({"fixture": photo.name, "repeat": repeat + 1, "variant": variant,
            "nativeOutput": label + "-native.json", "expoDirectory": label,
            "sourceImageHash": expected_source, "processedImageHash": native["processedImageHash"],
            "blockCount": len(native["blocks"]), "modelLoadMs": native["modelLoadMs"],
            "ocrMs": native["ocrMs"], "totalMs": native["totalMs"], "memory": native.get("memory")})
        print(json.dumps({"actualAndroidRun": label, "sourceImageHash": expected_source,
                          "rawText": native["rawText"], "blockCount": len(native["blocks"]),
                          "modelLoadMs": native["modelLoadMs"], "ocrMs": native["ocrMs"],
                          "totalMs": native["totalMs"], "memory": native.get("memory")}, ensure_ascii=False), flush=True)
        save_summary()
        return native

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
        summary["appPidAfterInitialLaunch"] = require_app_process(wait_seconds=15)
        screenshot("first-offline-launch")
        for photo_index, photo in enumerate(fixtures):
            choose_photo(photo)
            for repeat in range(args.repeats):
                run_ocr(photo, f"photo-{photo_index + 1}-run-{repeat + 1}", repeat)
            tap_match(r"^OCR 原文\s*$", scroll=True)
            screenshot(f"photo-{photo_index + 1}-actual-text")
            tap_match(r"02 图片与文字框", scroll=True, direction="up")
            screenshot(f"photo-{photo_index + 1}-actual-boxes")

        # Preserve the four baseline OCR runs before exercising any image
        # modification. Variants below are the same photograph, not new goods
        # or new real-world capture conditions.
        summary["baselineRunCount"] = len(summary["runs"])
        summary["uniqueFixtureCount"] = len({run["fixture"] for run in summary["runs"]})
        save_summary()
        if summary["baselineRunCount"] < 4:
            raise RuntimeError("Image processing checks require at least four actual baseline OCR runs")
        photo = next((fixture for fixture in fixtures if fixture.stem == "6923644266066"), fixtures[0])
        expected_source = digest(photo.read_bytes())
        before = list_json(native_images)
        choose_photo(photo)
        original = capture_prepared_image(before, "processing-baseline-image", expected_source)
        width, height = original["width"], original["height"]
        original_matrix = original["transform"]["matrix"]
        tap_match(r"02 图片与文字框", scroll=True, direction="up")
        screenshot("processing-baseline-ui")

        before = list_json(native_images)
        tap_match(r"右转 90°", scroll=True, direction="up")
        right = capture_prepared_image(before, "processing-right-90-image", expected_source)
        check_transformation(right, original, (height, width),
                             product([0, -1, height, 1, 0, 0, 0, 0, 1], original_matrix),
                             [{"kind": "rotate", "degreesClockwise": 90}])
        screenshot("processing-right-90-ui")
        summary["processingChecks"].append({"operation": "manual_clockwise_90", "fixture": photo.name,
            "status": "verified_android_ui_transform", "image": "processing-right-90-image.png",
            "metadata": "processing-right-90-image.json", "width": right["width"], "height": right["height"],
            "matrix": right["transform"]["matrix"], "processedImageHash": right["processedImageHash"],
            "limitation": "Metadata, PNG dimensions, file SHA-256 and UI verified; rotated OCR and exact pixels not assessed."})
        save_summary()

        before = list_json(native_images)
        tap_match(r"左转 90°", scroll=True, direction="up")
        roundtrip = capture_prepared_image(before, "processing-roundtrip-image", expected_source)
        check_transformation(roundtrip, original, (width, height), original_matrix,
                             [{"kind": "rotate", "degreesClockwise": 90},
                              {"kind": "rotate", "degreesClockwise": 270}])
        screenshot("processing-roundtrip-ui")
        run_ocr(photo, "processing-roundtrip-run", variant="rotation_roundtrip", expected_image=roundtrip)
        summary["processingChecks"].append({"operation": "manual_counterclockwise_90_roundtrip", "fixture": photo.name,
            "status": "verified_android_ui_transform_and_ocr", "image": "processing-roundtrip-image.png",
            "metadata": "processing-roundtrip-image.json", "ocrRun": "processing-roundtrip-run",
            "width": roundtrip["width"], "height": roundtrip["height"], "matrix": roundtrip["transform"]["matrix"],
            "processedImageHash": roundtrip["processedImageHash"],
            "roundTripEncodedHashMatches": roundtrip["processedImageHash"] == original["processedImageHash"],
            "limitation": "PNG byte hash comparison is recorded; no independent pixel decoder or EXIF 2–8 test."})
        save_summary()

        tap_match(r"矩形裁剪", scroll=True, direction="up")
        for field, value in [("左侧 %", 10), ("顶部 %", 10), ("宽度 %", 80), ("高度 %", 80)]:
            set_crop_field(field, value)
        screenshot("processing-crop-preview-ui")
        before = list_json(native_images)
        tap_match(r"^应用裁剪\s*$", scroll=True)
        cropped = capture_prepared_image(before, "processing-crop-image", expected_source)
        left, top = math.floor(width * .1 + .5), math.floor(height * .1 + .5)
        crop_right, bottom = math.floor(width * .9 + .5), math.floor(height * .9 + .5)
        crop = {"kind": "crop", "left": left, "top": top, "right": crop_right, "bottom": bottom}
        check_transformation(cropped, original, (crop_right - left, bottom - top),
                             product([1, 0, -left, 0, 1, -top, 0, 0, 1], original_matrix),
                             [{"kind": "rotate", "degreesClockwise": 90},
                              {"kind": "rotate", "degreesClockwise": 270}, crop,
                              {"kind": "rotate", "degreesClockwise": 0}])
        tap_match(r"02 图片与文字框", scroll=True, direction="up")
        screenshot("processing-crop-ui")
        run_ocr(photo, "processing-crop-run", variant="rectangle_crop", expected_image=cropped)
        tap_match(r"^OCR 原文\s*$", scroll=True)
        screenshot("processing-crop-actual-text")
        tap_match(r"02 图片与文字框", scroll=True, direction="up")
        screenshot("processing-crop-actual-boxes")
        summary["processingChecks"].append({"operation": "rectangle_crop_10_10_80_80_percent", "fixture": photo.name,
            "status": "verified_android_ui_transform_and_ocr", "image": "processing-crop-image.png",
            "metadata": "processing-crop-image.json", "ocrRun": "processing-crop-run",
            "crop": crop, "width": cropped["width"], "height": cropped["height"],
            "matrix": cropped["transform"]["matrix"], "processedImageHash": cropped["processedImageHash"],
            "limitation": "Actual native crop geometry, files and OCR verified; no independent exact-pixel comparison."})
        save_summary()
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
