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

    # Force the browser to fetch the fixed Backup Center application script.
    s = re.sub(r'ui\.js\?v=[^"]+', 'ui.js?v=1.0.0-apira-langfix3', s, count=1)
    external = '    <script src="apira-i18n.js?v=2.1-backup-csp"></script>'
    ui_tag = re.search(r'<script src="ui\.js\?v=[^"]+"></script>', s)
    if ui_tag:
        tag = ui_tag.group(0)
        s = s.replace(tag, tag + '\n' + external, 1)
    elif '</body>' in s:
        s = s.replace('</body>', external + '\n</body>', 1)
    else:
        s += '\n' + external + '\n'
    path.write_text(s, encoding='utf-8')

    # The app used the first .panel-body in Settings, which became the language card.
    ui = package / 'ui.js'
    if not ui.exists():
        raise SystemExit(f'Backup Center ui.js not found: {ui}')
    js = ui.read_text(encoding='utf-8')
    old_selector = 'const body = $("#settings .panel-body");'
    new_selector = 'const body = $("#settingsBody");'
    if old_selector in js:
        js = js.replace(old_selector, new_selector, 1)
    elif new_selector not in js:
        raise SystemExit(f'Backup Center settings selector not found: {ui}')
    ui.write_text(js, encoding='utf-8')

    # Serve a CSP-compatible external translation bundle from the extension itself.
    messages = merged_messages()
    bundle = 'window.__APIRA_FA_MESSAGES__ = ' + json.dumps(messages, ensure_ascii=False, separators=(',', ':')) + ';\n' + patched_runtime() + '\n'
    (package / 'apira-i18n.js').write_text(bundle, encoding='utf-8')

    # Expose the bundle through a same-origin route allowed by Backup Center CSP.
    app = package / 'app.py'
    if app.exists():
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
