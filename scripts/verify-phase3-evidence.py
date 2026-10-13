#!/usr/bin/env python3
"""Validate a real Phase 3 barcode-loop evidence bundle.

This validator is deliberately fail-closed.  It accepts records produced by a
device execution harness only when the scan source, validation result, local
lookup transition and persisted food identity are all explicit.  Manual input
or a host-side database call cannot satisfy the scan checks.  The script does
not decode images and never manufactures a successful result.

Expected session shape (schemaVersion 1)::

    {
      "schemaVersion": 1,
      "deviceExecutionVerified": true,
      "offline": true,
      "apk": {"permissions": [...]},
      "barcodeChecks": {
        "firstScan": {"source": "image", "rawValue": "...",
          "format": "EAN_13", "lookupKey": "...", "validity": "valid",
          "queryStatus": "not_found", "foodId": null, "ocrRuns": 0},
        "draftSaved": {"foodId": "...", "status": "draft",
          "immutableEvidence": true},
        "confirmedSaved": {"foodId": "...", "status": "confirmed",
          "immutableEvidence": true},
        "repeatScan": {"source": "image", "rawValue": "...",
          "format": "EAN_13", "lookupKey": "...", "validity": "valid",
          "queryStatus": "found", "foodId": "...", "ocrRuns": 0}
      }
    }

The source may be ``camera`` or ``image``.  ``image`` is suitable for an
offline decoder test; pass ``--require-camera`` only when a physical camera
capture was actually performed.  A manual scan is always rejected.
"""

import argparse
import json
import pathlib
import sys


def fail(message):
    raise ValueError(message)


def string_field(record, field, label):
    value = record.get(field)
    if not isinstance(value, str) or not value:
        fail(f"{label}.{field} must be a non-empty string")
    return value


def scan_record(record, label, require_camera=False):
    if not isinstance(record, dict):
        fail(f"{label} is not an object")
    source = string_field(record, "source", label)
    if source not in {"camera", "image"}:
        fail(f"{label}.source={source!r} is not actual scanner evidence")
    if require_camera and source != "camera":
        fail(f"{label} has no physical camera evidence")
    raw = string_field(record, "rawValue", label)
    string_field(record, "format", label)
    lookup = string_field(record, "lookupKey", label)
    if record.get("validity") != "valid":
        fail(f"{label} does not contain a validated food barcode")
    if not isinstance(record.get("validationEvidence"), (dict, str)):
        fail(f"{label}.validationEvidence is missing")
    if not isinstance(record.get("ocrRuns"), int) or record["ocrRuns"] < 0:
        fail(f"{label}.ocrRuns is invalid")
    return raw, lookup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True, type=pathlib.Path)
    parser.add_argument("--require-camera", action="store_true",
                        help="Require source=camera for both scan events.")
    args = parser.parse_args()
    try:
        session = json.loads(args.session.read_text(encoding="utf-8"))
        if not isinstance(session, dict):
            fail("session root is not an object")
        if session.get("schemaVersion") != 1:
            fail("unsupported Phase 3 evidence schema")
        if session.get("deviceExecutionVerified") is not True:
            fail("device execution was not verified")
        if session.get("offline") is not True:
            fail("offline execution was not asserted")
        apk = session.get("apk")
        if not isinstance(apk, dict):
            fail("APK inspection is missing")
        permissions = apk.get("permissions")
        if not isinstance(permissions, list):
            fail("APK permission list is missing")
        forbidden = {"android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE"}
        leaked = forbidden.intersection(str(value) for value in permissions)
        if leaked:
            fail("offline APK requests forbidden network permissions: " + ", ".join(sorted(leaked)))

        checks = session.get("barcodeChecks")
        if not isinstance(checks, dict):
            fail("barcodeChecks is missing")
        first_raw, first_key = scan_record(checks.get("firstScan"), "firstScan", args.require_camera)
        first = checks["firstScan"]
        if first.get("queryStatus") != "not_found" or first.get("foodId") is not None:
            fail("firstScan must be an explicit local-library miss")
        draft = checks.get("draftSaved")
        if not isinstance(draft, dict) or draft.get("status") != "draft":
            fail("draftSaved does not prove a draft was persisted")
        food_id = string_field(draft, "foodId", "draftSaved")
        if draft.get("lookupKey") != first_key:
            fail("draft barcode lookup key differs from first scan")
        if draft.get("immutableEvidence") is not True:
            fail("draftSaved does not preserve immutable OCR evidence")
        confirmed = checks.get("confirmedSaved")
        if not isinstance(confirmed, dict) or confirmed.get("status") != "confirmed":
            fail("confirmedSaved does not prove confirmation")
        if confirmed.get("foodId") != food_id or confirmed.get("lookupKey") != first_key:
            fail("confirmed food identity or barcode association changed")
        if confirmed.get("immutableEvidence") is not True:
            fail("confirmedSaved does not preserve immutable OCR evidence")
        repeat_raw, repeat_key = scan_record(checks.get("repeatScan"), "repeatScan", args.require_camera)
        repeat = checks["repeatScan"]
        if repeat.get("queryStatus") != "found" or repeat.get("foodId") != food_id:
            fail("repeatScan did not find the saved food")
        if repeat_key != first_key or repeat_raw != first_raw:
            fail("repeatScan barcode is not the exact same encoded value")
        if repeat.get("ocrRuns") != 0:
            fail("repeatScan re-ran OCR; repeat lookup must remain local-only")
        print(json.dumps({
            "phase3Evidence": "passed",
            "scanSource": checks["firstScan"]["source"],
            "lookupKey": first_key,
            "foodId": food_id,
            "ocrOnRepeat": 0,
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Phase 3 evidence rejected: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

