"""Refresh the editable agent files in existing offline dependency archives.

Keeps the bundled Linux dependencies and device-specific configuration intact.
Only writes an archive after all required source entries have been found.
"""
import argparse
import io
import os
import tarfile
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent
REPLACEMENTS = {
    "petpaint-offline/provision.sh": PROJECT / "print-agent" / "provision.sh",
    "petpaint-offline/print-agent/agent.py": PROJECT / "print-agent" / "agent.py",
    "petpaint-offline/print-agent/print_agent.py": PROJECT / "print-agent" / "print_agent.py",
}


def update_archive(archive: Path) -> None:
    archive = archive.resolve(strict=True)
    if archive.suffix != ".tgz" or not archive.is_file():
        raise ValueError("Expected an existing .tgz offline archive")
    temporary = archive.with_name(archive.name + ".custom-print.tmp")
    # Never move or delete a computed path outside the named archive directory.
    if temporary.parent.resolve() != archive.parent:
        raise ValueError("Temporary archive must stay in the archive directory")
    found = set()
    try:
        with tarfile.open(archive, "r:gz") as original, tarfile.open(temporary, "w:gz", compresslevel=6) as updated:
            for member in original:
                name = member.name.removeprefix("./")
                if name in REPLACEMENTS:
                    data = REPLACEMENTS[name].read_bytes()
                    # Bash scripts shipped from Windows must use LF line endings.
                    if name.endswith(".sh"):
                        data = data.replace(b"\r\n", b"\n")
                    member.size = len(data)
                    updated.addfile(member, io.BytesIO(data))
                    found.add(name)
                else:
                    updated.addfile(member, original.extractfile(member) if member.isfile() else None)
        if found != set(REPLACEMENTS):
            raise ValueError(f"Archive is missing agent entries: {set(REPLACEMENTS) - found}")
        # Verify every replaced file before atomically replacing the old archive.
        with tarfile.open(temporary, "r:gz") as check:
            for name, source in REPLACEMENTS.items():
                member = next(m for m in check.getmembers() if m.name.removeprefix("./") == name)
                expected = source.read_bytes()
                if name.endswith(".sh"):
                    expected = expected.replace(b"\r\n", b"\n")
                if check.extractfile(member).read() != expected:
                    raise ValueError(f"Archive verification failed: {name}")
        os.replace(temporary, archive)
        print(f"Updated and verified: {archive.name}")
    finally:
        if temporary.exists():
            temporary.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, action="append", required=True)
    args = parser.parse_args()
    for directory in args.directory:
        resolved = directory.resolve(strict=True)
        for archive in resolved.glob("petpaint-offline-*.tgz"):
            update_archive(archive)
