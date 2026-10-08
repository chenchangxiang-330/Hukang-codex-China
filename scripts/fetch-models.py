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
from pathlib import Path, PurePosixPath
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "paddleocr" / "v5-mobile"
MANIFEST = MODEL_DIR / "manifest.json"
SOURCE_LOCK = MODEL_DIR / "source-lock.json"
MAX_BYTES = 64 * 1024 * 1024
MAX_CONFIG_BYTES = 1024 * 1024
EXPECTED_HASHES = {
    "detector": "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
    "recognizer": "da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092",
}
OFFICIAL_REVISIONS = {
    "detector": "e6f4fa85f00e168c862bc462aebca69eef9b3d3d",
    "recognizer": "ed152b8b495f84de93cda5709d768548a9127622",
}
FILES = {
    "detector": ("detector.onnx", "detector.yml", "PP-OCRv5_mobile_det_onnx"),
    "recognizer": ("recognizer.onnx", "inference.yml", "PP-OCRv5_mobile_rec_onnx"),
}


def validate_sources(manifest, lock):
    for name, expected in EXPECTED_HASHES.items():
        model_file, config_file, model_name = FILES[name]
        entry = manifest["models"][name]
        source = f"https://huggingface.co/PaddlePaddle/{model_name}"
        bos = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/"
        required = {
            "name": model_name, "source": source,
            "bosSource": f"{bos}{model_name}_infer.tar",
            "revision": OFFICIAL_REVISIONS[name], "sha256": expected,
            "bundledPath": f"models/paddleocr/v5-mobile/{model_file}",
            "configPath": f"models/paddleocr/v5-mobile/{config_file}",
        }
        if any(entry.get(key) != value for key, value in required.items()):
            raise ValueError(f"Official source, revision, path or digest changed: {name}")
        if lock["models"][name]["modelSha256"] != expected or lock["models"][name]["revision"] != OFFICIAL_REVISIONS[name]:
            raise ValueError(f"Official source lock changed: {name}")
        digest = lock["models"][name].get("configSha256")
        if digest is not None and (len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest)):
            raise ValueError(f"Invalid config digest lock: {name}")


def read_bounded(path, limit=MAX_BYTES):
    with path.open("rb") as file:
        content = file.read(limit + 1)
    if not content or len(content) > limit:
        raise ValueError(f"Empty or oversized asset: {path.name}")
    return content


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url, limit=MAX_BYTES):
    request = urllib.request.Request(url, headers={"User-Agent": "Hukang-build-model-acquisition/1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        # Models are small; do not retain an unbounded response from a bad endpoint.
        data = response.read(limit + 1)
        if not data or len(data) > limit:
            raise ValueError(f"Empty or oversized official response: {url}")
        return data


def archive_files(data):
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Empty or oversized official archive")
    with tempfile.TemporaryFile() as storage:
        storage.write(data)
        storage.seek(0)
        with tarfile.open(fileobj=storage, mode="r|*") as archive:
            result = {}
            total_size = 0
            for index, member in enumerate(archive):
                path = PurePosixPath(member.name)
                if index >= 128 or path.is_absolute() or ".." in path.parts or "\\" in member.name:
                    raise ValueError("Unsafe archive path or excessive member count")
                if not (member.isdir() or member.isfile()):
                    raise ValueError("Archive links and special files are forbidden")
                total_size += member.size
                if member.size < 0 or total_size > MAX_BYTES:
                    raise ValueError("Archive uncompressed size exceeds limit")
                name = path.name
                if name not in ("inference.onnx", "inference.yml"):
                    continue
                if name in result or not member.isfile():
                    raise ValueError(f"Expected exactly one regular {name}")
                limit = MAX_CONFIG_BYTES if name.endswith(".yml") else MAX_BYTES
                if member.size > limit:
                    raise ValueError(f"Archive member exceeds limit: {name}")
                extracted = archive.extractfile(member)
                if extracted is None:
                    raise ValueError(f"Cannot read archive member: {name}")
                # Read members directly. Never extract paths or links from the archive.
                result[name] = extracted.read(limit + 1)
                if len(result[name]) != member.size:
                    raise ValueError(f"Truncated archive member: {name}")
            if set(result) != {"inference.onnx", "inference.yml"}:
                raise ValueError("Expected exactly one official model and config")
            return result


def validate_config(det_bytes, rec_bytes):
    if any(len(content) > MAX_CONFIG_BYTES for content in (det_bytes, rec_bytes)):
        raise ValueError("Configuration exceeds limit")
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
    if any(entry is not None and not isinstance(entry, str) for entry in dictionary):
        raise ValueError("Dictionary entries must preserve official string/empty values")
    characters = ["" if entry is None else entry for entry in dictionary]
    if "中" not in characters:
        raise ValueError("Chinese dictionary validation failed")
    effective_count = len(characters) + (0 if " " in characters else 1)
    ordered = json.dumps(characters, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return {"characterCount": len(characters), "effectiveCharacterCount": effective_count,
            "expectedOutputClasses": effective_count + 1, "orderedDictionarySha256": sha256(ordered)}


def verify(manifest, lock):
    validate_sources(manifest, lock)
    for name, expected in EXPECTED_HASHES.items():
        entry = manifest["models"][name]
        model_path = ROOT / entry["bundledPath"]
        if not model_path.is_file():
            raise ValueError(f"Missing genuine model: {model_path.relative_to(ROOT)}")
        measured = sha256(read_bounded(model_path))
        if measured != expected or entry["sha256"] != expected:
            raise ValueError(f"Model hash mismatch: {name}")
        config_path = ROOT / entry["configPath"]
        pinned = lock["models"][name].get("configSha256")
        if not pinned:
            raise ValueError(f"Official configuration has not been acquired and locked: {name}")
        if not config_path.is_file() or sha256(read_bounded(config_path, MAX_CONFIG_BYTES)) != pinned or entry["configSha256"] != pinned:
            raise ValueError(f"Missing or changed paired configuration: {name}")
    det = (ROOT / manifest["models"]["detector"]["configPath"]).read_bytes()
    rec = (ROOT / manifest["models"]["recognizer"]["configPath"]).read_bytes()
    stats = validate_config(det, rec)
    recorded = manifest["models"]["recognizer"]["dictionary"]
    if any(recorded.get(key) != value for key, value in stats.items()):
        raise ValueError("Dictionary count does not match manifest")
    if manifest["verification"]["status"] != "verified_artifacts":
        raise ValueError("Manifest has not recorded actual artifact verification")
    receipt = {"status": "verified_artifacts", "models": {
        name: {"sha256": expected, "configSha256": lock["models"][name]["configSha256"],
               "bytes": manifest["models"][name]["sizeBytes"]}
        for name, expected in EXPECTED_HASHES.items()
    }, "dictionary": stats, "deviceExecutionVerified": False}
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=("bos", "hf"), default="bos")
    imports = parser.add_mutually_exclusive_group()
    imports.add_argument("--archive-dir", type=Path,
                        help="Official BOS tar files; existing repository config SHA lock required")
    imports.add_argument("--bundle-dir", type=Path,
                        help="Official-models artifact directory; existing repository config SHA lock required")
    parser.add_argument("--verify", action="store_true", help="Verify existing bundled assets; no network")
    parser.add_argument("--receipt", type=Path, help="Write a build-only acquisition receipt")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    lock = json.loads(SOURCE_LOCK.read_text())
    validate_sources(manifest, lock)
    if args.verify:
        receipt = verify(manifest, lock)
        if args.receipt:
            args.receipt.parent.mkdir(parents=True, exist_ok=True)
            args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        return
    if (args.archive_dir is not None or args.bundle_dir is not None) and any(
        not entry.get("configSha256") for entry in lock["models"].values()
    ):
        raise ValueError("Offline imports cannot establish official YAML identity. First lock config SHA from a trusted official download.")
    assets = {}
    for name, expected in EXPECTED_HASHES.items():
        entry = manifest["models"][name]
        if entry["sha256"] != expected:
            raise ValueError(f"Manifest expected model digest changed: {name}")
        if args.archive_dir is not None:
            filename = entry["bosSource"].rsplit("/", 1)[-1]
            files = archive_files(read_bounded(args.archive_dir / filename))
            acquired_from = "local official BOS archive; identity verified by SHA-256"
        elif args.bundle_dir is not None:
            model_file, config_file, _ = FILES[name]
            files = {"inference.onnx": read_bounded(args.bundle_dir / model_file),
                     "inference.yml": read_bounded(args.bundle_dir / config_file, MAX_CONFIG_BYTES)}
            acquired_from = "official-models artifact; checked against repository source lock"
        elif args.source == "bos":
            files = archive_files(fetch(entry["bosSource"]))
            acquired_from = entry["bosSource"]
        else:
            base = f'{entry["source"]}/resolve/{entry["revision"]}'
            files = {filename: fetch(f"{base}/{filename}", MAX_CONFIG_BYTES if filename.endswith(".yml") else MAX_BYTES)
                     for filename in ("inference.onnx", "inference.yml")}
            acquired_from = base
        measured = sha256(files["inference.onnx"])
        if measured != expected:
            raise ValueError(f"Official download differs from pinned digest: {name} ({measured})")
        pinned_config = lock["models"][name].get("configSha256")
        if pinned_config is not None and sha256(files["inference.yml"]) != pinned_config:
            raise ValueError(f"Configuration differs from official repository SHA lock: {name}")
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
        lock["models"][name]["configSha256"] = entry["configSha256"]
    manifest["models"]["recognizer"]["dictionary"].update(stats)
    manifest["verification"] = {
        "status": "verified_artifacts",
        "verifiedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "note": "Both official models match pinned SHA-256; original paired YAML and ordered dictionary checked. Android execution remains a separate acceptance test.",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    SOURCE_LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n")
    receipt = verify(manifest, lock)
    receipt["acquiredFrom"] = {name: asset["acquiredFrom"] for name, asset in assets.items()}
    receipt["verifiedAt"] = manifest["verification"]["verifiedAt"]
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Model acquisition/verification failed: {error}", file=sys.stderr)
        sys.exit(1)
