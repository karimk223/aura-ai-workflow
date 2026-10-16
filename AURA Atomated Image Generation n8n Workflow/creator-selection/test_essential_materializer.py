import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from essential_materializer import materialize


class MaterializerTests(unittest.TestCase):
    def package(self, folder, change=None):
        data = b"real source fixture bytes"
        manifest = {"protocol": "aura-essential-package/v1", "runId": "run_1", "stage": "generator",
            "pieces": [{"id": "piece", "name": "Original garment name"}], "fileCensus": [],
            "files": [{"entry": "source.png", "path": "piece_piece/02_WHOLE_FRONT_BACK_SIDE/source_file.png",
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "md5Checksum": hashlib.md5(data).hexdigest()}]}
        if change:
            change(manifest)
        raw = json.dumps(manifest).encode()
        package = Path(folder) / "package.zip"
        with zipfile.ZipFile(package, "w") as archive:
            archive.writestr("manifest.json", raw)
            archive.writestr("source.png", data)
        return package, hashlib.sha256(raw).hexdigest(), manifest, data

    def test_actual_bytes_and_original_labels_are_materialized_without_visual_verdict(self):
        with tempfile.TemporaryDirectory() as folder:
            package, sha, manifest, data = self.package(folder)
            root = Path(folder) / "run"
            index = materialize(package, root, sha)
            self.assertEqual((root / manifest["files"][0]["path"]).read_bytes(), data)
            result = json.loads(index.read_text())
            self.assertEqual(result["pieces"][0]["name"], "Original garment name")
            self.assertFalse(result["visualReviewComplete"])
            self.assertFalse(result["humanApproval"])
            self.assertEqual(materialize(package, root, sha), index)

    def test_wrong_manifest_hash_is_rejected_before_any_output(self):
        with tempfile.TemporaryDirectory() as folder:
            package, sha, manifest, data = self.package(folder)
            root = Path(folder) / "run"
            with self.assertRaises(ValueError):
                materialize(package, root, "0" * 64)
            self.assertFalse(root.exists())

    def test_changed_reference_cannot_be_silently_reused_in_reviewer_workspace(self):
        with tempfile.TemporaryDirectory() as folder:
            package, sha, manifest, data = self.package(folder)
            root = Path(folder) / "run"
            materialize(package, root, sha)
            (root / manifest["files"][0]["path"]).write_bytes(b"changed")
            with self.assertRaises(ValueError):
                materialize(package, root, sha)

    def test_path_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            package, sha, manifest, data = self.package(folder, lambda m: m["files"][0].update(path="../escape.png"))
            with self.assertRaises(ValueError):
                materialize(package, Path(folder) / "run", sha)

    def test_wrong_byte_hash_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            package, sha, manifest, data = self.package(folder, lambda m: m["files"][0].update(sha256="0" * 64))
            with self.assertRaises(ValueError):
                materialize(package, Path(folder) / "run", sha)


if __name__ == "__main__":
    unittest.main()
