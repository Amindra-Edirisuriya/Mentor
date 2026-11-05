import stat
import zipfile
from pathlib import Path

import pytest

from app.ingestion.zip_safe import UnsafeArchiveError, ZipLimits, extract_zip_safely


def make_zip(path: Path, entries: dict[str, bytes], compression: int = zipfile.ZIP_DEFLATED) -> Path:
    with zipfile.ZipFile(path, "w", compression=compression) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return path


@pytest.fixture
def dest(tmp_path: Path) -> Path:
    return tmp_path / "out"


def test_extracts_normal_project(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(
        tmp_path / "ok.zip",
        {"proj/package.json": b"{}", "proj/src/index.js": b"console.log(1)\n", "proj/README.md": b"# hi"},
    )

    result = extract_zip_safely(archive, dest)

    assert sorted(result.files) == ["proj/README.md", "proj/package.json", "proj/src/index.js"]
    assert (dest / "proj/src/index.js").read_bytes() == b"console.log(1)\n"
    assert result.total_bytes == len(b"{}") + len(b"console.log(1)\n") + len(b"# hi")


@pytest.mark.parametrize(
    "name",
    [
        "../evil.txt",
        "proj/../../evil.txt",
        "/etc/passwd",
        "C:/Windows/evil.txt",
        "c:evil.txt",
        "..\\evil.txt",
        "proj\\..\\..\\evil.txt",
        "proj/CON",
        "proj/nul.txt",
        "proj/file.txt:stream",
    ],
)
def test_rejects_dangerous_paths(tmp_path: Path, dest: Path, name: str) -> None:
    archive = make_zip(tmp_path / "bad.zip", {"ok.txt": b"ok", name: b"pwned"})

    with pytest.raises(UnsafeArchiveError):
        extract_zip_safely(archive, dest)

    assert not dest.exists(), "destination must be cleaned up on failure"
    assert not (tmp_path / "evil.txt").exists()


def test_rejects_symlink(tmp_path: Path, dest: Path) -> None:
    archive = tmp_path / "link.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        info = zipfile.ZipInfo("proj/link")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        zf.writestr(info, "/etc/passwd")

    with pytest.raises(UnsafeArchiveError, match="Symlink"):
        extract_zip_safely(archive, dest)


def test_rejects_zip_bomb_by_ratio(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(tmp_path / "bomb.zip", {"zeros.bin": b"\0" * (5 * 1024 * 1024)})

    with pytest.raises(UnsafeArchiveError, match="compression ratio"):
        extract_zip_safely(archive, dest)


def test_rejects_too_many_files(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(tmp_path / "many.zip", {f"f{i}.txt": b"x" for i in range(4)})

    with pytest.raises(UnsafeArchiveError, match="more than 3 files"):
        extract_zip_safely(archive, dest, ZipLimits(max_files=3))


def test_rejects_total_uncompressed_size(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(
        tmp_path / "big.zip", {"a.txt": b"a" * 600, "b.txt": b"b" * 600}, compression=zipfile.ZIP_STORED
    )

    with pytest.raises(UnsafeArchiveError, match="too large when uncompressed"):
        extract_zip_safely(archive, dest, ZipLimits(max_total_uncompressed_bytes=1000))


def test_rejects_oversized_single_file(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(tmp_path / "f.zip", {"a.txt": b"a" * 2000}, compression=zipfile.ZIP_STORED)

    with pytest.raises(UnsafeArchiveError, match="File too large"):
        extract_zip_safely(archive, dest, ZipLimits(max_file_bytes=1000))


def test_rejects_oversized_archive(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(tmp_path / "a.zip", {"a.txt": b"a" * 2000}, compression=zipfile.ZIP_STORED)

    with pytest.raises(UnsafeArchiveError, match="archive is too large"):
        extract_zip_safely(archive, dest, ZipLimits(max_archive_bytes=100))


def test_rejects_non_zip(tmp_path: Path, dest: Path) -> None:
    fake = tmp_path / "fake.zip"
    fake.write_bytes(b"not a zip at all")

    with pytest.raises(UnsafeArchiveError, match="not a valid ZIP"):
        extract_zip_safely(fake, dest)
    assert not dest.exists()


def test_rejects_duplicate_entries(tmp_path: Path, dest: Path) -> None:
    archive = tmp_path / "dup.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("a.txt", b"first")
        with pytest.warns(UserWarning):
            zf.writestr("a.txt", b"second")

    with pytest.raises(UnsafeArchiveError, match="Duplicate"):
        extract_zip_safely(archive, dest)


def test_nested_archives_are_skipped_not_extracted(tmp_path: Path, dest: Path) -> None:
    inner = make_zip(tmp_path / "inner.zip", {"secret.txt": b"inner"})
    archive = make_zip(
        tmp_path / "outer.zip", {"proj/app.js": b"x", "proj/vendor/lib.zip": inner.read_bytes()}
    )

    result = extract_zip_safely(archive, dest)

    assert result.files == ["proj/app.js"]
    assert result.skipped_nested_archives == ["proj/vendor/lib.zip"]
    assert not (dest / "proj/vendor/lib.zip").exists()
    assert not any(p.name == "secret.txt" for p in dest.rglob("*"))


def test_extracted_files_are_not_executable(tmp_path: Path, dest: Path) -> None:
    archive = tmp_path / "exec.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        info = zipfile.ZipInfo("run.sh")
        info.external_attr = (stat.S_IFREG | 0o755) << 16
        zf.writestr(info, "#!/bin/sh\necho hi\n")

    extract_zip_safely(archive, dest)

    mode = (dest / "run.sh").stat().st_mode
    assert not mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def test_refuses_existing_destination(tmp_path: Path, dest: Path) -> None:
    archive = make_zip(tmp_path / "ok.zip", {"a.txt": b"a"})
    dest.mkdir()

    with pytest.raises(ValueError, match="already exists"):
        extract_zip_safely(archive, dest)
