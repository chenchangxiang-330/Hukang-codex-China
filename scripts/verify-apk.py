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
app_config = json.loads((ROOT / "app.json").read_text())["expo"]
package = re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging, re.MULTILINE)
if package is None or package.groups() != (app_config['android']['package'], str(app_config['android']['versionCode']), app_config['version']):
    errors.append("APK applicationId/version does not match the committed app.json")
extraction = re.search(r'android:extractNativeLibs[^=\n]*=(true|false)', manifest)
extract_native_libs = extraction is not None and extraction.group(1) == 'true'
if not extract_native_libs:
    errors.append("Native library extraction is disabled; ARM64 translation cannot use the direct first-ABI loader")
if "android.permission.INTERNET" not in permissions:
    errors.append("Explicit AI requests require INTERNET permission")
if not re.search(r'android:usesCleartextTraffic[^=\n]*=false', manifest):
    errors.append("Cleartext networking must be disabled")
for permission in ["ACCESS_NETWORK_STATE", "RECORD_AUDIO"]:
    if f"android.permission.{permission}" in permissions:
        errors.append(f"Unexpected permission: {permission}")
if "android.permission.CAMERA" not in permissions:
    errors.append("Camera capture feature is enabled but CAMERA permission is missing")
min_sdk = re.search(r"^(?:minSdkVersion|sdkVersion):'([0-9]+)'$", badging, re.MULTILINE)
if min_sdk is None or int(min_sdk.group(1)) != 26:
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
    native_libraries = {}
    for library in ['libreactnative.so', 'libopencv_java4.so', 'libonnxruntime.so', 'libonnxruntime4j_jni.so']:
        name = 'lib/arm64-v8a/' + library
        try:
            entry = archive.getinfo(name)
            native_libraries[library] = {'bytes': entry.file_size, 'compression': entry.compress_type,
                                         'sha256': hashlib.sha256(archive.read(name)).hexdigest()}
            if entry.compress_type != zipfile.ZIP_DEFLATED:
                errors.append(f"Native library is not packaged for extraction: {library}")
        except KeyError:
            errors.append(f"Missing required ARM64 native library: {library}")
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
    # Include the certificate digest in the persisted inspection report.  The
    # release workflow may use either the protected key or an ephemeral lab
    # key, so the actual APK is the only trustworthy source for this value.
    signature = run("apksigner", "verify", "--verbose", "--print-certs", apk)
except subprocess.CalledProcessError as error:
    signature = error.output
    errors.append("APK signature verification failed")
# Keep the human-readable apksigner transcript, but also expose the certificate
# identity as structured data.  The transcript format is stable enough for
# this small field extraction and the raw output remains the audit evidence.
signing_certificates = {}
for line in signature.splitlines():
    match = re.match(r"Signer #(\d+) certificate (DN|SHA-256 digest):\s*(.+)$", line)
    if not match:
        continue
    signer, field, value = match.groups()
    record = signing_certificates.setdefault(signer, {})
    if field == "DN":
        record["dn"] = value
    else:
        record["sha256"] = value
certificate_digests = [
    {"signer": int(signer), **record}
    for signer, record in sorted(signing_certificates.items(), key=lambda item: int(item[0]))
    if "sha256" in record
]
if not certificate_digests:
    errors.append("APK signature certificate SHA-256 digest is missing")
report = {
    "apk": str(apk), "bytes": apk.stat().st_size,
    "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
    "networkPolicy": "explicit-ai-only", "nativeAbis": native_abis, "permissions": permissions, "badging": badging,
    "applicationId": package.group(1) if package else None,
    "versionCode": int(package.group(2)) if package else None,
    "versionName": package.group(3) if package else None,
    "extractNativeLibs": extract_native_libs, "nativeLibraries": native_libraries,
    "bundledModels": assets, "signatureVerification": signature,
    "certificateSha256Digests": certificate_digests,
    "errors": errors, "deviceExecutionVerified": False,
}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(output.parent / "final-manifest.txt").write_text(manifest)
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
