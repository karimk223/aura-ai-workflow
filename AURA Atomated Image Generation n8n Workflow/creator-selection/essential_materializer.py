"""Network-free input transfer adapter. No inference, Drive access or approvals."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

CATEGORIES = ("01_MATERIAL_CLOSEUPS_4K", "02_WHOLE_FRONT_BACK_SIDE", "03_SIZE_FIT_MODEL_MANNEQUIN")


def materialize(package, root, expected_sha):
    root = Path(root)
    with zipfile.ZipFile(package) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(names) != len(set(names)) or len(names) > 2001:
            raise ValueError("Duplicate entries or package entry limit exceeded")
        if any("/" in name or "\\" in name or name in (".", "..") for name in names):
            raise ValueError("Package must use safe flat entries")
        if any(info.flag_bits & 1 or stat.S_ISLNK(info.external_attr >> 16) for info in infos):
            raise ValueError("Encrypted entries and symlinks are not allowed")
        if sum(info.file_size for info in infos) > 220 * 1024 * 1024:
            raise ValueError("Package too large; nothing was silently omitted")
        manifest_bytes = archive.read("manifest.json")
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_sha:
            raise ValueError("Source manifest checksum mismatch")
        manifest = json.loads(manifest_bytes)
        if manifest["protocol"] != "aura-essential-package/v1":
            raise ValueError("Unknown package protocol")
        if set(names) != {"manifest.json", *(item["entry"] for item in manifest["files"])}:
            raise ValueError("Manifest/file coverage mismatch")
        verified = []
        targets = set()
        for item in manifest["files"]:
            relative = PurePosixPath(item["path"])
            if relative.is_absolute() or ".." in relative.parts or "\\" in str(relative):
                raise ValueError("Unsafe materialization path")
            if item["path"] in targets:
                raise ValueError("Duplicate target path")
            targets.add(item["path"])
            data = archive.read(item["entry"])
            if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError("Actual source bytes do not match the manifest")
            if hashlib.md5(data).hexdigest() != item["md5Checksum"]:
                raise ValueError("Source MD5 mismatch")
            verified.append((item, data))
        if root.exists():
            index = root / "input-index.json"
            if not index.is_file():
                raise ValueError("Existing output has no source index")
            existing = json.loads(index.read_text())
            if existing.get("sourceManifestSha256") != expected_sha or any(existing.get(key) != value for key, value in manifest.items()):
                raise ValueError("Existing source index changed")
            for item, data in verified:
                target = root / item["path"]
                if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
                    raise ValueError("Existing reference bytes changed")
            return index
        root.parent.mkdir(parents=True, exist_ok=True)
        root.mkdir()
        # Empty actual category folders must stay distinguishable from missing
        # categories. The census supplies folder identity, never a visual verdict.
        for item in manifest["fileCensus"]:
            if item["mimeType"] != "application/vnd.google-apps.folder":
                continue
            if item["name"] not in CATEGORIES:
                continue
            piece_root = ("Processed/" if manifest["stage"] == "auditor" else "") + "piece_" + item["pieceId"]
            (root / piece_root / item["name"]).mkdir(parents=True, exist_ok=True)
        for item, data in verified:
            target = root / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        index = root / "input-index.json"
        index.write_text(json.dumps({**manifest, "sourceManifestSha256": expected_sha,
            "visualReviewComplete": False, "humanApproval": False}, ensure_ascii=False))
        return index


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--sha", required=True)
    args = parser.parse_args()
    print(materialize(args.package, args.root, args.sha))
