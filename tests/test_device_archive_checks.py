import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('archive_checks', Path(__file__).parent / 'device/archive_checks.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


def segment(marker, payload):
    return b'\xff' + bytes([marker]) + (len(payload) + 2).to_bytes(2, 'big') + payload


class ArchiveChecksTest(unittest.TestCase):
    # Synthetic marker streams test the parser only; they are not device image evidence.
    def test_header_exif_is_detected(self):
        self.assertTrue(checks.jpeg_has_exif(b'\xff\xd8' + segment(0xE1, b'Exif\0\0test') + b'\xff\xd9'))

    def test_other_metadata_and_escaped_scan_bytes_do_not_look_like_exif(self):
        data = b'\xff\xd8' + segment(0xE0, b'JFIF\0') + segment(0xDA, b'scan') + b'\x01\xff\x00\xe1Exif\0\0\xff\xd0\x12\xff\xd9'
        self.assertFalse(checks.jpeg_has_exif(data))

    def test_exif_after_scan_is_detected(self):
        data = b'\xff\xd8' + segment(0xDA, b'scan') + b'\x12' + segment(0xE1, b'Exif\0\0test') + b'\xff\xd9'
        self.assertTrue(checks.jpeg_has_exif(data))

    def test_truncated_or_non_jpeg_is_rejected(self):
        for data in (b'not a JPEG', b'\xff\xd8\xff\xe1\x00\x40short', b'\xff\xd8'):
            with self.assertRaises(ValueError):
                checks.jpeg_has_exif(data)


if __name__ == '__main__':
    unittest.main()
