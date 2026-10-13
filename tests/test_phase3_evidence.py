import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "verify-phase3-evidence.py"


def valid_session(source="image"):
    first = {
        "source": source,
        "rawValue": "6900000000014",
        "format": "EAN_13",
        "lookupKey": "06900000000014",
        "validity": "valid",
        "validationEvidence": {"checksum": True},
        "queryStatus": "not_found",
        "foodId": None,
        "ocrRuns": 0,
    }
    return {
        "schemaVersion": 1,
        "deviceExecutionVerified": True,
        "offline": True,
        "apk": {"permissions": ["android.permission.CAMERA"]},
        "barcodeChecks": {
            "firstScan": first,
            "draftSaved": {
                "foodId": "food-1", "lookupKey": first["lookupKey"],
                "status": "draft", "immutableEvidence": True,
            },
            "confirmedSaved": {
                "foodId": "food-1", "lookupKey": first["lookupKey"],
                "status": "confirmed", "immutableEvidence": True,
            },
            "repeatScan": {
                **{key: first[key] for key in ("source", "rawValue", "format", "lookupKey", "validity", "validationEvidence")},
                "queryStatus": "found", "foodId": "food-1", "ocrRuns": 0,
            },
        },
    }


class Phase3EvidenceTest(unittest.TestCase):
    def run_validator(self, data, *extra):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "session.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT), "--session", str(path), *extra],
                capture_output=True, text=True, check=False,
            )

    def test_accepts_offline_image_decode_loop(self):
        result = self.run_validator(valid_session())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"phase3Evidence": "passed"', result.stdout)

    def test_camera_requirement_is_explicit(self):
        result = self.run_validator(valid_session(), "--require-camera")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("physical camera", result.stderr)

    def test_manual_input_cannot_be_called_camera_evidence(self):
        data = valid_session(source="manual")
        result = self.run_validator(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("actual scanner evidence", result.stderr)

    def test_repeat_scan_cannot_hide_an_ocr_run(self):
        data = valid_session()
        data["barcodeChecks"]["repeatScan"]["ocrRuns"] = 1
        result = self.run_validator(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("re-ran OCR", result.stderr)

    def test_network_permission_fails_closed(self):
        data = valid_session()
        data["apk"]["permissions"].append("android.permission.INTERNET")
        result = self.run_validator(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("forbidden network permissions", result.stderr)


if __name__ == "__main__":
    unittest.main()

