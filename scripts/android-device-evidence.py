#!/usr/bin/env python3
"""Capture actual Android evidence. Never synthesizes OCR output or score data.

Run after interactive OCR Lab execution. Private storage extraction requires a
root-capable test emulator; it does not make the production APK debuggable.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--package", default="com.hukang.china")
    parser.add_argument("--apk", type=pathlib.Path)
    parser.add_argument("--pull-private", action="store_true")
    args = parser.parse_args()
    destination = args.output.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    adb = ["adb", "-s", args.serial]
    commands = []

    def capture(name, arguments, binary=False):
        completed = subprocess.run(adb + arguments, capture_output=True, timeout=60)
        suffix = ".png" if binary else ".txt"
        output = destination / (name + suffix)
        output.write_bytes(completed.stdout)
        if completed.stderr:
            (destination / (name + ".stderr.txt")).write_bytes(completed.stderr)
        commands.append({"command": arguments, "exitCode": completed.returncode,
                         "output": output.name})
        return completed

    state = capture("adb-state", ["get-state"])
    if state.returncode or state.stdout.strip() != b"device":
        raise RuntimeError("No online Android device; no execution claim can be made")
    capture("properties", ["shell", "getprop"])
    capture("identity", ["shell", "id"])
    capture("network-settings", ["shell", "settings", "list", "global"])
    capture("connectivity", ["shell", "dumpsys", "connectivity"])
    capture("packages-disabled", ["shell", "pm", "list", "packages", "-d"])
    capture("package", ["shell", "dumpsys", "package", args.package])
    capture("meminfo-snapshot", ["shell", "dumpsys", "meminfo", args.package])
    capture("screenshot", ["exec-out", "screencap", "-p"], binary=True)
    capture("logcat", ["logcat", "-d", "-v", "threadtime"])
    capture("processes", ["shell", "ps", "-A"])
    if args.pull_private:
        # No run-as, chmod, exported Activity or production test hook.
        # Caller must already have an adb-root-capable test device.
        for label, relative in [("native", "files/ocr-lab"),
                                ("expo", "files/ocr-evidence")]:
            completed = subprocess.run(
                adb + ["pull", f"/data/user/0/{args.package}/{relative}",
                       str(destination / label)], capture_output=True, timeout=60)
            (destination / (label + "-pull.txt")).write_bytes(
                completed.stdout + completed.stderr)
            commands.append({"command": ["pull", relative],
                             "exitCode": completed.returncode})
    apk = None
    if args.apk:
        apk_bytes = args.apk.read_bytes()
        apk = {"filename": args.apk.name, "bytes": len(apk_bytes),
               "sha256": hashlib.sha256(apk_bytes).hexdigest()}
    summary = {"schemaVersion": 1, "capturedAt": datetime.now(timezone.utc).isoformat(),
               "serial": args.serial, "applicationId": args.package, "apk": apk,
               "commands": commands,
               "limitation": "Capture only. Review identity, actual outputs and failures; "
                             "this script does not attest accuracy or completed acceptance."}
    (destination / "capture.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"captureDirectory": str(destination), "apk": apk}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
