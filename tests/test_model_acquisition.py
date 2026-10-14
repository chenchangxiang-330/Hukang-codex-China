"""Security regressions for build-time import; not OCR or device test fixtures."""
import importlib.util
import io
from pathlib import Path
import sys
import tarfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "fetch_models", Path(__file__).resolve().parents[1] / "scripts/fetch-models.py"
)
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as tar:
        for name, data, kind in entries:
            info = tarfile.TarInfo(name)
            info.type = kind
            if kind == tarfile.REGTYPE:
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
            else:
                info.linkname = "../outside"
                tar.addfile(info)
    return output.getvalue()


class OfficialModelImportTests(unittest.TestCase):
    def test_reads_members_without_extracting_paths(self):
        data = archive([
            ("official/inference.onnx", b"security-test-placeholder-not-ocr-model", tarfile.REGTYPE),
            ("official/inference.yml", b"security-test-placeholder-not-ocr-config", tarfile.REGTYPE),
        ])
        result = models.archive_files(data)
        self.assertEqual(set(result), {"inference.onnx", "inference.yml"})

    def test_rejects_path_traversal_and_absolute_paths(self):
        for name in ("../inference.onnx", "/inference.onnx", r"outside\inference.onnx"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                models.archive_files(archive([(name, b"x", tarfile.REGTYPE)]))

    def test_rejects_links_and_duplicate_asset(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                models.archive_files(archive([("inference.onnx", b"", kind)]))
        with self.assertRaises(ValueError):
            models.archive_files(archive([
                ("a/inference.onnx", b"x", tarfile.REGTYPE),
                ("b/inference.onnx", b"x", tarfile.REGTYPE),
                ("inference.yml", b"x", tarfile.REGTYPE),
            ]))

    def test_rejects_excessive_members_and_missing_asset(self):
        with self.assertRaises(ValueError):
            models.archive_files(archive([
                (f"unused/{i}", b"", tarfile.REGTYPE) for i in range(129)
            ]))
        with self.assertRaises(ValueError):
            models.archive_files(archive([("inference.onnx", b"x", tarfile.REGTYPE)]))

    def test_rejects_declared_decompression_bomb(self):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w") as tar:
            member = tarfile.TarInfo("inference.onnx")
            member.size = models.MAX_BYTES + 1
            tar.fileobj.write(member.tobuf())
        with self.assertRaises(ValueError):
            models.archive_files(output.getvalue())


if __name__ == "__main__":
    unittest.main()
