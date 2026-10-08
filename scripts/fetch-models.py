#!/usr/bin/env python3
"""Build-time acquisition of genuine fixed PaddleOCR models, never an App downloader.

Uses the inherited proxy and TLS verification. No proxy bypass, synthetic model,
alternative OCR, or unverified hash fallback is supported. Requires PyYAML 6.0.3
to validate the original embedded dictionary without reserializing its YAML.
"""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "paddleocr" / "v5-mobile"
MANIFEST = MODEL_DIR / "manifest.json"
EXPECTED_HASHES = {
    "detector": "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
    "recognizer": "da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092",
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Hukang-build-model-acquisition/1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        # Models are small; do not retain an unbounded response from a bad endpoint.
        data = response.read(64 * 1024 * 1024 + 1)
        if len(data) > 64 * 1024 * 1024:
            raise ValueError(f"Response exceeds 64 MiB: {url}")
        return data


def archive_files(data):
    with tempfile.TemporaryFile() as storage:
        storage.write(data)
        storage.seek(0)
        with tarfile.open(fileobj=storage, mode="r:*") as archive:
            result = {}
            for name in ("inference.onnx", "inference.yml"):
                matches = [member for member in archive.getmembers()
                           if Path(member.name).name == name and member.isfile()]
                if len(matches) != 1:
                    raise ValueError(f"Expected exactly one regular {name} in official archive")
                member = matches[0]
                if member.size > 64 * 1024 * 1024:
                    raise ValueError(f"Archive member exceeds limit: {name}")
                extracted = archive.extractfile(member)
                if extracted is None:
                    raise ValueError(f"Cannot read archive member: {name}")
                # Read members directly. Never extract paths or links from the archive.
                result[name] = extracted.read()
            return result


def validate_config(det_bytes, rec_bytes):
    try:
        import yaml
    except ImportError as error:
        raise RuntimeError("Config validation requires PyYAML 6.0.3; install it in the build environment.") from error
    det = yaml.safe_load(det_bytes.decode("utf-8"))
    rec = yaml.safe_load(rec_bytes.decode("utf-8"))
    if det["Global"]["model_name"] != "PP-OCRv5_mobile_det":
        raise ValueError("Wrong detector config")
    if rec["Global"]["model_name"] != "PP-OCRv5_mobile_rec":
        raise ValueError("Wrong recognizer config")
    det_ops = {key: value for op in det["PreProcess"]["transform_ops"] for key, value in op.items()}
    rec_ops = {key: value for op in rec["PreProcess"]["transform_ops"] for key, value in op.items()}
    if det_ops["DecodeImage"]["img_mode"] != "BGR" or rec_ops["DecodeImage"]["img_mode"] != "BGR":
        raise ValueError("Expected paired BGR configurations")
    if det_ops["DetResizeForTest"].get("resize_long") != 960:
        raise ValueError("Detector resize_long does not match the fixed v5 configuration")
    normalize = det_ops["NormalizeImage"]
    if normalize["mean"] != [0.485, 0.456, 0.406] or normalize["std"] != [0.229, 0.224, 0.225]:
        raise ValueError("Detector normalization mismatch")
    if rec_ops["RecResizeImg"]["image_shape"] != [3, 48, 320]:
        raise ValueError("Recognizer input configuration mismatch")
    post = det["PostProcess"]
    if any(post.get(key) != value for key, value in {
        "name": "DBPostProcess", "thresh": 0.3, "box_thresh": 0.6,
        "max_candidates": 1000, "unclip_ratio": 1.5,
    }.items()):
        raise ValueError("Detector postprocess mismatch")
    if rec["PostProcess"]["name"] != "CTCLabelDecode":
        raise ValueError("Wrong recognizer decoder")
    dictionary = rec["PostProcess"]["character_dict"]
    if not isinstance(dictionary, list) or len(dictionary) < 1000:
        raise ValueError("Official Chinese dictionary is missing or too short")
    # Preserve every entry and its index, including the official empty first item.
    characters = ["" if entry is None else str(entry) for entry in dictionary]
    if not any("中" in character for character in characters):
        raise ValueError("Chinese dictionary validation failed")
    effective_count = len(characters) + (0 if " " in characters else 1)
    return {"characterCount": len(characters), "effectiveCharacterCount": effective_count,
            "expectedOutputClasses": effective_count + 1}


def verify(manifest):
    for name, expected in EXPECTED_HASHES.items():
        entry = manifest["models"][name]
        model_path = ROOT / entry["bundledPath"]
        if not model_path.is_file():
            raise ValueError(f"Missing genuine model: {model_path.relative_to(ROOT)}")
        measured = sha256(model_path.read_bytes())
        if measured != expected or entry["sha256"] != expected:
            raise ValueError(f"Model hash mismatch: {name}")
        config_path = ROOT / entry["configPath"]
        if not config_path.is_file() or sha256(config_path.read_bytes()) != entry["configSha256"]:
            raise ValueError(f"Missing or changed paired configuration: {name}")
    det = (ROOT / manifest["models"]["detector"]["configPath"]).read_bytes()
    rec = (ROOT / manifest["models"]["recognizer"]["configPath"]).read_bytes()
    stats = validate_config(det, rec)
    recorded = manifest["models"]["recognizer"]["dictionary"]
    if any(recorded.get(key) != value for key, value in stats.items()):
        raise ValueError("Dictionary count does not match manifest")
    if manifest["verification"]["status"] != "verified_artifacts":
        raise ValueError("Manifest has not recorded actual artifact verification")
    print(json.dumps({"status": "verified_artifacts", "models": EXPECTED_HASHES, "dictionary": stats}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=("bos", "hf"), default="bos")
    parser.add_argument("--archive-dir", type=Path,
                        help="Read official BOS tar files supplied locally, without network access")
    parser.add_argument("--verify", action="store_true", help="Verify existing bundled assets; no network")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    if args.verify:
        verify(manifest)
        return
    assets = {}
    for name, expected in EXPECTED_HASHES.items():
        entry = manifest["models"][name]
        if entry["sha256"] != expected:
            raise ValueError(f"Manifest expected model digest changed: {name}")
        if args.archive_dir is not None:
            filename = entry["bosSource"].rsplit("/", 1)[-1]
            files = archive_files((args.archive_dir / filename).read_bytes())
            acquired_from = "local official BOS archive; identity verified by SHA-256"
        elif args.source == "bos":
            files = archive_files(fetch(entry["bosSource"]))
            acquired_from = entry["bosSource"]
        else:
            base = f'{entry["source"]}/resolve/{entry["revision"]}'
            files = {filename: fetch(f"{base}/{filename}")
                     for filename in ("inference.onnx", "inference.yml")}
            acquired_from = base
        measured = sha256(files["inference.onnx"])
        if measured != expected:
            raise ValueError(f"Official download differs from pinned digest: {name} ({measured})")
        assets[name] = {"model": files["inference.onnx"], "config": files["inference.yml"],
                        "acquiredFrom": acquired_from}
    stats = validate_config(assets["detector"]["config"], assets["recognizer"]["config"])
    # Validate both models and both configs before writing any final asset.
    for name, asset in assets.items():
        entry = manifest["models"][name]
        for key, target in (("model", entry["bundledPath"]), ("config", entry["configPath"])):
            destination = ROOT / target
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_name(destination.name + ".tmp")
            temporary.write_bytes(asset[key])
            os.replace(temporary, destination)
        entry["configSha256"] = sha256(asset["config"])
        entry["sizeBytes"] = len(asset["model"])
        entry["configSizeBytes"] = len(asset["config"])
        entry["acquiredFrom"] = asset["acquiredFrom"]
    manifest["models"]["recognizer"]["dictionary"].update(stats)
    manifest["verification"] = {
        "status": "verified_artifacts",
        "verifiedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "note": "Both model bytes match pinned official SHA-256; original paired YAML checked. Android execution remains a separate acceptance test.",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    verify(manifest)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Model acquisition/verification failed: {error}", file=sys.stderr)
        sys.exit(1)
