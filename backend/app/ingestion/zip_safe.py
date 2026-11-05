"""Safe extraction of untrusted ZIP uploads.

Uploaded projects are untrusted (CLAUDE.md rule 4/5). This module only *copies bytes*
out of the archive; nothing extracted is ever executed, imported or installed.

Every entry is validated before anything is written:
- archive size, file count, total uncompressed size, per-file size and compression ratio
- no absolute paths, drive letters, backslashes, ``..`` segments or Windows-reserved names
- no symlinks, devices or other special files; no encrypted entries
- the resolved target path must stay inside the destination directory
- nested archives are recorded and skipped, never extracted
Declared sizes in the ZIP header are not trusted: bytes are counted while streaming.
Files are written without execute permission. On any failure the destination is removed.
"""

import re
import shutil
import stat
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

MB = 1024 * 1024

NESTED_ARCHIVE_SUFFIXES = frozenset(
    {".zip", ".jar", ".war", ".ear", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar"}
)
_WINDOWS_RESERVED = re.compile(r"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$", re.IGNORECASE)
_DRIVE_LETTER = re.compile(r"^[A-Za-z]:")
_CHUNK = 64 * 1024


class UnsafeArchiveError(ValueError):
    """The archive violates an ingestion safety rule. The message is safe to show users."""


@dataclass(frozen=True)
class ZipLimits:
    max_archive_bytes: int = 50 * MB
    max_total_uncompressed_bytes: int = 200 * MB
    max_file_bytes: int = 20 * MB
    max_files: int = 5000
    max_compression_ratio: float = 100.0


@dataclass
class ExtractionResult:
    files: list[str] = field(default_factory=list)  # posix paths relative to destination
    skipped_nested_archives: list[str] = field(default_factory=list)
    total_bytes: int = 0


def _validate_name(name: str) -> PurePosixPath:
    if not name or "\x00" in name:
        raise UnsafeArchiveError("Archive contains an entry with an empty or invalid name.")
    if "\\" in name:
        raise UnsafeArchiveError(f"Backslash in entry path is not allowed: {name!r}")
    if name.startswith("/") or _DRIVE_LETTER.match(name):
        raise UnsafeArchiveError(f"Absolute path in archive is not allowed: {name!r}")
    path = PurePosixPath(name)
    for part in path.parts:
        if part == "..":
            raise UnsafeArchiveError(f"Path traversal ('..') in archive is not allowed: {name!r}")
        if ":" in part or _WINDOWS_RESERVED.match(part):
            raise UnsafeArchiveError(f"Reserved or invalid file name in archive: {name!r}")
    return path


def _entry_file_type(info: zipfile.ZipInfo) -> int:
    """Unix file-type bits from the entry (0 when the archive stores none)."""
    return stat.S_IFMT(info.external_attr >> 16)


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
    except ValueError:
        return False
    return True


def _validate_entries(infos: list[zipfile.ZipInfo], limits: ZipLimits) -> None:
    file_count = 0
    total = 0
    for info in infos:
        _validate_name(info.filename)
        if info.flag_bits & 0x1:
            raise UnsafeArchiveError(f"Encrypted entries are not supported: {info.filename!r}")
        file_type = _entry_file_type(info)
        if file_type == stat.S_IFLNK:
            raise UnsafeArchiveError(f"Symlinks are not allowed in archives: {info.filename!r}")
        if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise UnsafeArchiveError(f"Special files are not allowed: {info.filename!r}")
        if info.is_dir():
            continue
        file_count += 1
        if file_count > limits.max_files:
            raise UnsafeArchiveError(f"Archive has more than {limits.max_files} files.")
        if info.file_size > limits.max_file_bytes:
            raise UnsafeArchiveError(f"File too large in archive: {info.filename!r}")
        total += info.file_size
        if total > limits.max_total_uncompressed_bytes:
            raise UnsafeArchiveError("Archive is too large when uncompressed.")
        ratio = info.file_size / max(info.compress_size, 1)
        if ratio > limits.max_compression_ratio:
            raise UnsafeArchiveError(f"Suspicious compression ratio for {info.filename!r}.")


def _copy_entry(
    zf: zipfile.ZipFile, info: zipfile.ZipInfo, target: Path, budget: int, limits: ZipLimits
) -> int:
    """Stream one entry to disk, enforcing limits on the bytes actually produced."""
    written = 0
    with zf.open(info) as src, open(target, "xb") as dst:
        while chunk := src.read(_CHUNK):
            written += len(chunk)
            if written > info.file_size or written > limits.max_file_bytes or written > budget:
                raise UnsafeArchiveError(f"Entry expands beyond its declared size: {info.filename!r}")
            dst.write(chunk)
    target.chmod(0o644)  # never executable
    return written


def extract_zip_safely(
    archive_path: Path, destination: Path, limits: ZipLimits | None = None
) -> ExtractionResult:
    """Validate and extract ``archive_path`` into ``destination`` (which must not exist)."""
    limits = limits or ZipLimits()

    if archive_path.stat().st_size > limits.max_archive_bytes:
        raise UnsafeArchiveError("Uploaded archive is too large.")
    if destination.exists():
        raise ValueError(f"Destination already exists: {destination}")

    try:
        zf = zipfile.ZipFile(archive_path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise UnsafeArchiveError("File is not a valid ZIP archive.") from exc

    destination.mkdir(parents=True)
    root = destination.resolve()
    result = ExtractionResult()
    try:
        with zf:
            infos = zf.infolist()
            _validate_entries(infos, limits)
            for info in infos:
                rel = PurePosixPath(info.filename)
                target = (root / rel).resolve()
                if not _is_within(target, root):
                    raise UnsafeArchiveError(f"Entry escapes destination: {info.filename!r}")
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                if rel.suffix.lower() in NESTED_ARCHIVE_SUFFIXES:
                    result.skipped_nested_archives.append(rel.as_posix())
                    continue
                if target.exists():
                    raise UnsafeArchiveError(f"Duplicate entry in archive: {info.filename!r}")
                target.parent.mkdir(parents=True, exist_ok=True)
                budget = limits.max_total_uncompressed_bytes - result.total_bytes
                result.total_bytes += _copy_entry(zf, info, target, budget, limits)
                result.files.append(target.relative_to(root).as_posix())
    except (zipfile.BadZipFile, EOFError) as exc:
        shutil.rmtree(root, ignore_errors=True)
        raise UnsafeArchiveError("Archive is corrupt.") from exc
    except BaseException:
        shutil.rmtree(root, ignore_errors=True)
        raise
    return result
