#!/usr/bin/env python3
"""Split an already inspected APK for trusted developer transfer, never App use."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--apk", type=Path, default=ROOT / "artifacts/hukang-china-phase1-arm64-release.apk")
parser.add_argument("--inspection", type=Path, default=ROOT / "artifacts/apk-inspection.json")
parser.add_argument("--output", type=Path, default=ROOT / "artifacts/apk-transfer")
args = parser.parse_args()
inspection = json.loads(args.inspection.read_text())
if inspection.get("errors") != []:
    raise SystemExit("APK inspection failed; refusing to create transfer parts.")
size = args.apk.stat().st_size
chunk_bytes = 24 * 1024 * 1024
if not size or math.ceil(size / chunk_bytes) > 6:
    raise SystemExit("APK must be nonempty and at most six 24 MiB transfer parts.")
args.output.mkdir(parents=True, exist_ok=True)
if any(args.output.iterdir()):
    raise SystemExit("Transfer directory must be empty; refusing to mix build outputs.")
digest = hashlib.sha256()
parts = []
with args.apk.open("rb") as apk:
    index = 1
    while data := apk.read(chunk_bytes):
        filename = f"part{index:03}.bin"
        (args.output / filename).write_bytes(data)
        digest.update(data)
        parts.append({"index": index, "file": filename, "bytes": len(data),
                      "sha256": hashlib.sha256(data).hexdigest()})
        index += 1
apk_digest = digest.hexdigest()
if inspection.get("sha256") != apk_digest or inspection.get("bytes") != size:
    raise SystemExit("APK differs from the inspected build; refusing transfer manifest.")
manifest = {
    "schemaVersion": 1, "purpose": "developer transfer of a verified release-mode APK",
    "apk": {"file": args.apk.name, "bytes": size, "sha256": apk_digest},
    "parts": parts,
    "github": {key: os.environ.get(key) for key in (
        "GITHUB_REPOSITORY", "GITHUB_SHA", "GITHUB_REF", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"
    )},
    "deviceExecutionVerified": inspection.get("deviceExecutionVerified", False),
    "note": "Concatenate raw part bytes in index order and verify whole APK SHA before installation.",
}
(args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"apkSha256": apk_digest, "apkBytes": size, "parts": len(parts)}))
