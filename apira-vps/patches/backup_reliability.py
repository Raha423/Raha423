#!/usr/bin/env python3
from pathlib import Path
import re
import sys

MARKER = 'APIRA_BACKUP_RELIABILITY_V2'


def patch(index: Path) -> None:
    package = index.parent
    app = package / 'app.py'
    ui = package / 'ui.js'
    if not app.exists() or not ui.exists():
        raise SystemExit('Backup Center app.py/ui.js missing')

    py = app.read_text(encoding='utf-8')
    if 'import re\n' not in py:
        py = py.replace('import os\n', 'import os\nimport re\n', 1)

    safe_excludes = '''def safe_excludes(values: object) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValueError("Excludes must be a list.")
    result: list[str] = []
    # APIRA_BACKUP_RELIABILITY_V2: normalize pasted values on the server too.
    for raw in values:
        for value in re.split(r"[\\s,;]+", str(raw or "").strip()):
            if not value:
                continue
            if len(value) > 200 or "\\x00" in value:
                raise ValueError("Invalid exclusion pattern.")
            if value not in result:
                result.append(value)
    if len(result) > 32:
        raise ValueError("Excludes must contain at most 32 patterns.")
    return result
'''
    safe_pattern = re.compile(r'def safe_excludes\(values: object\) -> list\[str\]:\n.*?\n\ndef checksum', re.S)
    if not safe_pattern.search(py):
        raise SystemExit('safe_excludes anchor not found')
    py = safe_pattern.sub(lambda _m: safe_excludes + '\n\ndef checksum', py, count=1)

    # Scheduled jobs must have enough room for roughly the previous successful
    # archive plus an additional 1 GiB safety margin before they start.
    old_space = '''        if shutil.disk_usage(BACKUP_DIR).free < MIN_FREE_BYTES:\n            raise RuntimeError("Backup stopped because less than 512 MB of local disk space is available.")\n'''
    new_space = '''        free_bytes = shutil.disk_usage(BACKUP_DIR).free\n        required_free = MIN_FREE_BYTES\n        if schedule_id:\n            with database() as connection:\n                previous = connection.execute(\n                    "SELECT size FROM backups WHERE schedule_id=? AND status='completed' AND size>0 AND id<>? ORDER BY completed_at DESC LIMIT 1",\n                    (schedule_id, backup_id),\n                ).fetchone()\n            if previous:\n                required_free = max(required_free, int(previous["size"]) + 1024 * 1024 * 1024)\n        if free_bytes < required_free:\n            need_gb = required_free / (1024 ** 3)\n            free_gb = free_bytes / (1024 ** 3)\n            raise RuntimeError(f"Backup stopped before start: {free_gb:.2f} GB free; at least {need_gb:.2f} GB is required for the previous backup size plus a 1 GB safety margin.")\n'''
    if old_space in py:
        py = py.replace(old_space, new_space, 1)
    elif 'previous backup size plus a 1 GB safety margin' not in py:
        raise SystemExit('initial disk-space guard anchor not found')

    # Check free space throughout archive creation, not only once at startup.
    old_tar = '''        with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:\n            for source_text in sources:\n                source = Path(source_text)\n                arcname = str(source).lstrip("/")\n                bundle.add(\n                    source,\n                    arcname=arcname,\n                    recursive=True,\n                    filter=lambda info: None\n                    if excluded(Path(info.name), excludes) else info,\n                )\n'''
    new_tar = '''        checked_members = 0\n        def archive_filter(info: tarfile.TarInfo):\n            nonlocal checked_members\n            checked_members += 1\n            if checked_members % 128 == 0 and shutil.disk_usage(BACKUP_DIR).free < MIN_FREE_BYTES:\n                raise RuntimeError("Backup stopped because less than 512 MB of local disk space is available.")\n            return None if excluded(Path(info.name), excludes) else info\n\n        with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:\n            for source_text in sources:\n                source = Path(source_text)\n                arcname = str(source).lstrip("/")\n                bundle.add(source, arcname=arcname, recursive=True, filter=archive_filter)\n'''
    if old_tar in py:
        py = py.replace(old_tar, new_tar, 1)
    elif 'checked_members = 0' not in py:
        raise SystemExit('tar creation anchor not found')

    # A PID marker lets another gunicorn worker distinguish a live backup from an
    # orphan left by a killed/restarted worker without guessing from archive mtime.
    if 'APIRA_BACKUP_WORKER_PID_V2' not in py:
        worker_anchor = '    archive = BACKUP_DIR / f"{backup_id}.tar.gz"\n    try:\n'
        worker_replacement = '''    archive = BACKUP_DIR / f"{backup_id}.tar.gz"
    # APIRA_BACKUP_WORKER_PID_V2
    marker = BACKUP_DIR / f".{backup_id}.worker"
    try:
        marker.write_text(str(os.getpid()), encoding="utf-8")
        marker.chmod(0o600)
        excludes = safe_excludes(excludes)
'''
        if worker_anchor not in py:
            raise SystemExit('backup_worker start anchor not found')
        py = py.replace(worker_anchor, worker_replacement, 1)

        finally_anchor = '''    finally:\n        with active_lock:\n            active_jobs.discard(backup_id)\n'''
        finally_replacement = '''    finally:
        marker.unlink(missing_ok=True)
        with active_lock:
            active_jobs.discard(backup_id)
'''
        if finally_anchor not in py:
            raise SystemExit('backup_worker finally anchor not found')
        py = py.replace(finally_anchor, finally_replacement, 1)

    recover = '''def recover_stale_running(now: int | None = None) -> None:
    """Fail orphaned running jobs and remove their incomplete archives."""
    now = int(now or time.time())
    recovered: list[str] = []
    with database() as connection:
        rows = connection.execute(
            "SELECT id,created_at FROM backups WHERE status='running'"
        ).fetchall()
        for row in rows:
            marker = BACKUP_DIR / f".{row['id']}.worker"
            archive = BACKUP_DIR / f"{row['id']}.tar.gz"
            worker_alive = False
            if marker.exists():
                try:
                    pid = int(marker.read_text(encoding="utf-8").strip())
                    worker_alive = pid > 1 and Path(f"/proc/{pid}").exists()
                except (OSError, ValueError):
                    worker_alive = False
            elif now - int(row['created_at']) < 15 * 60:
                # A queued worker may not have created its marker yet.
                continue
            if worker_alive:
                continue
            archive.unlink(missing_ok=True)
            marker.unlink(missing_ok=True)
            connection.execute(
                "UPDATE backups SET status='failed',completed_at=?,size=0,path=NULL,checksum=NULL,error=? WHERE id=?",
                (now, "Interrupted: backup worker stopped unexpectedly; incomplete archive removed.", row['id']),
            )
            recovered.append(row['id'])
    for backup_id in recovered:
        event("error", "backup_interrupted", backup_id)
'''
    recover_pattern = re.compile(r'def recover_stale_running\(now: int \| None = None\) -> None:\n.*?\n\ndef scheduler_loop\(\) -> None:', re.S)
    if recover_pattern.search(py):
        py = recover_pattern.sub(lambda _m: recover + '\n\ndef scheduler_loop() -> None:', py, count=1)
    elif 'def scheduler_loop() -> None:' in py:
        py = py.replace('def scheduler_loop() -> None:', recover + '\n\ndef scheduler_loop() -> None:', 1)
    else:
        raise SystemExit('scheduler anchor not found')

    time_anchor = '            now = int(time.time())\n'
    if '            recover_stale_running(now)\n' not in py:
        if time_anchor not in py:
            raise SystemExit('scheduler time anchor not found')
        py = py.replace(time_anchor, time_anchor + '            recover_stale_running(now)\n', 1)

    app.write_text(py, encoding='utf-8')

    js = ui.read_text(encoding='utf-8')
    js = js.replace(
        'const excludes = ($("#excludePatterns")?.value || "").split(",").map(x=>x.trim()).filter(Boolean);',
        'const excludes = ($("#excludePatterns")?.value || "").split(/[\\s,;]+/).map(x=>x.trim()).filter(Boolean);',
    )
    js = js.replace(
        'sources:source.split(",").map(x=>x.trim()).filter(Boolean)',
        'sources:source.split(/[,\\n;]+/).map(x=>x.trim()).filter(Boolean)',
    )
    ui.write_text(js, encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: backup_reliability.py <BackupCenter/index.html>')
    patch(Path(sys.argv[1]))
