#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

MARKER = 'APIRA_BACKUP_LANGUAGE_SETTINGS_BEGIN'
BLOCK = '''
                <!-- APIRA_BACKUP_LANGUAGE_SETTINGS_BEGIN -->
                <section class="panel apira-language-panel" id="apiraLanguageSetting" data-i18n-skip="1">
                    <div class="panel-header apira-language-panel-head">
                        <div>
                            <div class="panel-title apira-lang-title">Language / زبان</div>
                            <div class="panel-subtitle apira-lang-desc">Choose the display language for Backup Center / زبان نمایش مرکز بکاپ را انتخاب کنید</div>
                        </div>
                        <i data-lucide="languages"></i>
                    </div>
                    <div class="panel-body apira-language-panel-body">
                        <label class="apira-language-label">Interface language / زبان رابط کاربری</label>
                        <select class="apira-language-select" aria-label="Language">
                            <option value="en">English</option>
                            <option value="fa">فارسی</option>
                        </select>
                        <div class="apira-language-hint">This setting is synchronized with the main panel and other Apira VPS tools. / این تنظیم با پنل اصلی و بقیه ابزارهای Apira VPS همگام می‌شود.</div>
                    </div>
                </section>
                <!-- APIRA_BACKUP_LANGUAGE_SETTINGS_END -->
'''
NEEDLE = '''                <section class="panel">\n                    <div class="panel-header">\n                        <div>\n                            <div class="panel-title">Destination configuration</div>'''


def merged_messages() -> dict:
    i18n = Path('apira-vps/i18n')
    out = {}
    for name in ('apira-fa.json', 'apira-fa-extra.json', 'apira-fa-backup.json'):
        p = i18n / name
        if p.exists():
            out.update(json.loads(p.read_text(encoding='utf-8')))
    return out


def patched_runtime() -> str:
    p = Path('apira-vps/i18n/apira-i18n-v2.js')
    s = p.read_text(encoding='utf-8')
    old = """  function injectIntoNativeSettings() {\n    const page = document.querySelector('#settings');\n    if (!page || document.getElementById('apiraLanguageSetting')) return false;\n"""
    new = """  function injectIntoNativeSettings() {\n    const page = document.querySelector('#settings');\n    if (!page) return false;\n    const existing = document.getElementById('apiraLanguageSetting');\n    if (existing) { bindLanguageSelect(existing); return true; }\n"""
    if old in s:
        s = s.replace(old, new, 1)
    return s


def patch_backup_runtime(package: Path) -> None:
    ui = package / 'ui.js'
    app = package / 'app.py'
    if not ui.is_file() or not app.is_file():
        raise SystemExit(f'Backup Center runtime files not found under {package}')

    js = ui.read_text(encoding='utf-8')
    old_selector = 'const body = $("#settings .panel-body");'
    if old_selector in js:
        js = js.replace(old_selector, 'const body = $("#settingsBody");', 1)
    elif 'const body = $("#settingsBody");' not in js:
        raise SystemExit(f'Backup Center settings selector not found: {ui}')

    # Accept pasted excludes separated by spaces, commas, semicolons or newlines.
    js = js.replace(
        'const excludes = ($("#excludePatterns")?.value || "").split(",").map(x=>x.trim()).filter(Boolean);',
        'const excludes = ($("#excludePatterns")?.value || "").split(/[\\s,;]+/).map(x=>x.trim()).filter(Boolean);',
    )
    ui.write_text(js, encoding='utf-8')

    py = app.read_text(encoding='utf-8')
    safe_excludes = '''def safe_excludes(values: object) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValueError("Excludes must be a list.")
    result: list[str] = []
    # Normalize pasted values defensively on the server too; never trust only the UI.
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
    pattern = re.compile(r'def safe_excludes\(values: object\) -> list\[str\]:\n.*?\n\ndef checksum', re.S)
    if pattern.search(py):
        py = pattern.sub(safe_excludes + '\n\ndef checksum', py, count=1)
    else:
        raise SystemExit(f'safe_excludes function not found: {app}')

    # Every worker leaves a PID marker. A dead PID is reliable evidence that a running
    # backup was orphaned by a killed/restarted gunicorn worker.
    if 'APIRA_BACKUP_WORKER_PID_V1' not in py:
        anchor = '    archive = BACKUP_DIR / f"{backup_id}.tar.gz"\n    try:\n'
        replacement = '''    archive = BACKUP_DIR / f"{backup_id}.tar.gz"
    # APIRA_BACKUP_WORKER_PID_V1
    marker = BACKUP_DIR / f".{backup_id}.worker"
    try:
        marker.write_text(str(os.getpid()), encoding="utf-8")
        marker.chmod(0o600)
        excludes = safe_excludes(excludes)
'''
        if anchor not in py:
            raise SystemExit(f'backup_worker archive anchor not found: {app}')
        py = py.replace(anchor, replacement, 1)
        final_anchor = '''    finally:\n        with active_lock:\n            active_jobs.discard(backup_id)\n'''
        final_replacement = '''    finally:
        marker.unlink(missing_ok=True)
        with active_lock:
            active_jobs.discard(backup_id)
'''
        if final_anchor not in py:
            raise SystemExit(f'backup_worker finally anchor not found: {app}')
        py = py.replace(final_anchor, final_replacement, 1)

    recover = '''def recover_stale_running(now: int | None = None) -> None:
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
                # Give queued jobs time to start and create their worker marker.
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
    existing_recover = re.compile(r'def recover_stale_running\(now: int \| None = None\) -> None:\n.*?\n\ndef scheduler_loop\(\) -> None:', re.S)
    if existing_recover.search(py):
        py = existing_recover.sub(recover + '\n\ndef scheduler_loop() -> None:', py, count=1)
    elif 'def scheduler_loop() -> None:' in py:
        py = py.replace('def scheduler_loop() -> None:', recover + '\n\ndef scheduler_loop() -> None:', 1)
    else:
        raise SystemExit(f'Backup scheduler anchor not found: {app}')

    scheduler_anchor = '            now = int(time.time())\n'
    if '            recover_stale_running(now)\n' not in py:
        if scheduler_anchor not in py:
            raise SystemExit(f'Backup scheduler time anchor not found: {app}')
        py = py.replace(scheduler_anchor, scheduler_anchor + '            recover_stale_running(now)\n', 1)

    app.write_text(py, encoding='utf-8')


def patch(path: Path) -> None:
    package = path.parent
    s = path.read_text(encoding='utf-8')

    if MARKER not in s:
        if NEEDLE not in s:
            raise SystemExit(f'Backup Center settings anchor not found: {path}')
        s = s.replace(NEEDLE, BLOCK + '\n' + NEEDLE, 1)

    # Backup Center has a strict CSP that blocks inline scripts and inline event handlers.
    s = re.sub(r'\s*<!-- APIRA_I18N_BEGIN -->.*?<!-- APIRA_I18N_END -->', '', s, flags=re.S)
    s = re.sub(r'\s*<script src="apira-i18n\.js\?v=[^"]+"></script>', '', s)
    s = re.sub(r'\s+onchange="if\(window\.ApiraI18n\).*?location\.reload\(\)\}"', '', s)

    s = re.sub(r'ui\.js\?v=[^"]+', 'ui.js?v=1.0.0-apira-audit4', s, count=1)
    external = '    <script src="apira-i18n.js?v=2.2-backup-csp"></script>'
    ui_tag = re.search(r'<script src="ui\.js\?v=[^"]+"></script>', s)
    if ui_tag:
        tag = ui_tag.group(0)
        s = s.replace(tag, tag + '\n' + external, 1)
    elif '</body>' in s:
        s = s.replace('</body>', external + '\n</body>', 1)
    else:
        s += '\n' + external + '\n'
    path.write_text(s, encoding='utf-8')

    patch_backup_runtime(package)

    messages = merged_messages()
    bundle = 'window.__APIRA_FA_MESSAGES__ = ' + json.dumps(messages, ensure_ascii=False, separators=(',', ':')) + ';\n' + patched_runtime() + '\n'
    (package / 'apira-i18n.js').write_text(bundle, encoding='utf-8')

    app = package / 'app.py'
    py = app.read_text(encoding='utf-8')
    if '@app.get("/apira-i18n.js")' not in py:
        anchor = '''@app.get("/ui.js")\n@login_required\ndef ui_script():\n    return send_from_directory(str(BASE_DIR), "ui.js", mimetype="application/javascript")\n'''
        insert = anchor + '''\n\n@app.get("/apira-i18n.js")\n@login_required\ndef apira_i18n_script():\n    return send_from_directory(str(BASE_DIR), "apira-i18n.js", mimetype="application/javascript")\n'''
        if anchor not in py:
            raise SystemExit(f'Backup Center ui.js route anchor not found: {app}')
        py = py.replace(anchor, insert, 1)
        app.write_text(py, encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: backup_language_settings.py <BackupCenter/index.html>')
    patch(Path(sys.argv[1]))
