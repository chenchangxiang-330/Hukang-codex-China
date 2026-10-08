#!/usr/bin/env python3
"""Inspect a real built APK, not the source manifest, and fail closed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("apk", nargs="?", default=str(ROOT / "android/app/build/outputs/apk/release/app-release.apk"))
parser.add_argument("--output", default=str(ROOT / "artifacts/apk-inspection.json"))
args = parser.parse_args()
apk = Path(args.apk).resolve()
sdk = Path(os.environ.get("ANDROID_HOME", ROOT / ".build-tools/android-sdk"))
tools = sdk / "build-tools/36.0.0"

def run(tool, *arguments):
    return subprocess.check_output([str(tools / tool), *map(str, arguments)], text=True, stderr=subprocess.STDOUT)

permissions = run("aapt2", "dump", "permissions", apk)
badging = run("aapt2", "dump", "badging", apk)
manifest = run("aapt2", "dump", "xmltree", apk, "--file", "AndroidManifest.xml")
errors = []
for permission in ["INTERNET", "ACCESS_NETWORK_STATE", "CAMERA", "RECORD_AUDIO"]:
    if f"android.permission.{permission}" in permissions:
        errors.append(f"Unexpected permission: {permission}")
if not re.search(r"sdkVersion:'26'", badging):
    errors.append("minSdk is not 26")
if 'android:debuggable' in manifest and re.search(r'android:debuggable[^\n]*0xffffffff', manifest):
    errors.append("Release APK is debuggable")
for forbidden in ["com.google.android.gms.metadata.ModuleDependencies", "com.google.firebase", "com.google.mlkit"]:
    if forbidden in manifest:
        errors.append(f"Unexpected production manifest component: {forbidden}")

with zipfile.ZipFile(apk) as archive:
    native_abis = sorted({name.split('/')[1] for name in archive.namelist() if name.startswith('lib/') and name.endswith('.so')})
    if native_abis != ["arm64-v8a"]:
        errors.append(f"Unexpected native ABIs: {native_abis}")
    required = {
        "assets/models/paddleocr/v5-mobile/detector.onnx": "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
        "assets/models/paddleocr/v5-mobile/recognizer.onnx": "da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092",
    }
    assets = {}
    for name, expected in required.items():
        try:
            content = archive.read(name)
            digest = hashlib.sha256(content).hexdigest()
            assets[name] = {"bytes": len(content), "sha256": digest}
            if digest != expected:
                errors.append(f"Model hash mismatch: {name}")
        except KeyError:
            errors.append(f"Missing bundled model: {name}")
    for name in ["assets/models/paddleocr/v5-mobile/detector.yml", "assets/models/paddleocr/v5-mobile/inference.yml", "assets/index.android.bundle"]:
        if name not in archive.namelist():
            errors.append(f"Missing offline asset: {name}")
    try:
        model_manifest = json.loads(archive.read("assets/models/paddleocr/v5-mobile/manifest.json"))
        if model_manifest.get("verification", {}).get("status") != "verified_artifacts":
            errors.append("Bundled model manifest is not verified")
        if model_manifest.get("productionNetwork") is not False or model_manifest.get("automaticModelDownload") is not False:
            errors.append("Bundled model policy permits networking or download")
        for model_name, config_name in [("detector", "detector.yml"), ("recognizer", "inference.yml")]:
            config_path = "assets/models/paddleocr/v5-mobile/" + config_name
            config_bytes = archive.read(config_path)
            config_sha = hashlib.sha256(config_bytes).hexdigest()
            expected = model_manifest["models"][model_name].get("configSha256")
            if not expected or config_sha != expected:
                errors.append(f"Bundled configuration hash mismatch: {config_name}")
            assets[config_path] = {"bytes": len(config_bytes), "sha256": config_sha}
    except (KeyError, ValueError, TypeError) as error:
        errors.append(f"Missing or invalid bundled model configuration: {error}")

try:
    signature = run("apksigner", "verify", "--verbose", apk)
except subprocess.CalledProcessError as error:
    signature = error.output
    errors.append("APK signature verification failed")
report = {
    "apk": str(apk), "bytes": apk.stat().st_size,
    "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
    "nativeAbis": native_abis, "permissions": permissions, "badging": badging,
    "bundledModels": assets, "signatureVerification": signature,
    "errors": errors, "deviceExecutionVerified": False,
}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(output.parent / "final-manifest.txt").write_text(manifest)
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
