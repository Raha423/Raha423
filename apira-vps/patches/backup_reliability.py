#!/usr/bin/env python3
from pathlib import Path
import sys

MARKER = 'APIRA_BACKUP_RELIABILITY_V1'

def patch(index: Path) -> None:
    package = index.parent
    app = package / 'app.py'
    ui = package / 'ui.js'
    if not app.exists() or not ui.exists():
        raise SystemExit('Backup Center app.py/ui.js missing')
    py = app.read_text(encoding='utf-8')
    if MARKER not in py:
        if 'import re\n' not in py:
            py = py.replace('import os\n', 'import os\nimport re\n', 1)
        old = '''def safe_excludes(values: object) -> list[str]:\n    if values is None:\n        return []\n    if not isinstance(values, list) or len(values) > 32:\n        raise ValueError("Excludes must be a list with at most 32 entries.")\n    result = []\n    for raw in values:\n        value = str(raw or "").strip()\n        if not value or len(value) > 200 or "\\x00" in value:\n            raise ValueError("Invalid exclusion pattern.")\n        result.append(value)\n    return result\n'''
        new = '''def safe_excludes(values: object) -> list[str]:\n    if values is None:\n        return []\n    if not isinstance(values, list):\n        raise ValueError("Excludes must be a list.")\n    result: list[str] = []\n    # APIRA_BACKUP_RELIABILITY_V1: accept comma, whitespace, semicolon and new-line pasted patterns.\n    for raw in values:\n        for value in re.split(r"[\\s,;]+", str(raw or "").strip()):\n            if not value:\n                continue\n            if len(value) > 200 or "\\x00" in value:\n                raise ValueError("Invalid exclusion pattern.")\n            if value not in result:\n                result.append(value)\n    if len(result) > 32:\n        raise ValueError("Excludes must contain at most 32 patterns.")\n    return result\n'''
        if old not in py:
            raise SystemExit('safe_excludes anchor not found')
        py = py.replace(old, new, 1)

        anchor = '''def scheduler_loop() -> None:\n    while True:\n        try:\n            now = int(time.time())\n'''
        replacement = '''def recover_stale_running(now: int | None = None) -> None:\n    """Recover orphaned jobs left behind if a web worker dies mid-archive."""\n    now = int(now or time.time())\n    stale_before = now - 15 * 60\n    recovered: list[str] = []\n    with database() as connection:\n        rows = connection.execute(\n            "SELECT id,created_at FROM backups WHERE status='running' AND created_at<=?",\n            (stale_before,),\n        ).fetchall()\n        for row in rows:\n            archive = BACKUP_DIR / f"{row['id']}.tar.gz"\n            if archive.exists():\n                try:\n                    if now - int(archive.stat().st_mtime) < 5 * 60:\n                        continue\n                except OSError:\n                    continue\n                archive.unlink(missing_ok=True)\n            connection.execute(\n                "UPDATE backups SET status='failed',completed_at=?,size=0,path=NULL,checksum=NULL,error=? WHERE id=?",\n                (now, "Interrupted: backup worker stopped unexpectedly; incomplete archive removed.", row['id']),\n            )\n            recovered.append(row['id'])\n    for backup_id in recovered:\n        event("error", "backup_interrupted", backup_id)\n\n\ndef scheduler_loop() -> None:\n    while True:\n        try:\n            now = int(time.time())\n            recover_stale_running(now)\n'''
        if anchor not in py:
            raise SystemExit('scheduler anchor not found')
        py = py.replace(anchor, replacement, 1)

        old_tar = '''        with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:\n            for source_text in sources:\n                source = Path(source_text)\n                arcname = str(source).lstrip("/")\n                bundle.add(\n                    source,\n                    arcname=arcname,\n                    recursive=True,\n                    filter=lambda info: None\n                    if excluded(Path(info.name), excludes) else info,\n                )\n'''
        new_tar = '''        checked_members = 0\n        def archive_filter(info: tarfile.TarInfo):\n            nonlocal checked_members\n            checked_members += 1\n            if checked_members % 128 == 0 and shutil.disk_usage(BACKUP_DIR).free < MIN_FREE_BYTES:\n                raise RuntimeError("Backup stopped because less than 512 MB of local disk space is available.")\n            return None if excluded(Path(info.name), excludes) else info\n\n        with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:\n            for source_text in sources:\n                source = Path(source_text)\n                arcname = str(source).lstrip("/")\n                bundle.add(source, arcname=arcname, recursive=True, filter=archive_filter)\n'''
        if old_tar not in py:
            raise SystemExit('tar creation anchor not found')
        py = py.replace(old_tar, new_tar, 1)
        app.write_text(py, encoding='utf-8')

    js = ui.read_text(encoding='utf-8')
    js = js.replace('const excludes = ($("#excludePatterns")?.value || "").split(",").map(x=>x.trim()).filter(Boolean);',
                    'const excludes = ($("#excludePatterns")?.value || "").split(/[\\s,;]+/).map(x=>x.trim()).filter(Boolean);')
    js = js.replace('sources:source.split(",").map(x=>x.trim()).filter(Boolean)',
                    'sources:source.split(/[,\\n;]+/).map(x=>x.trim()).filter(Boolean)')
    ui.write_text(js, encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: backup_reliability.py <BackupCenter/index.html>')
    patch(Path(sys.argv[1]))
