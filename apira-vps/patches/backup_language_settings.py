#!/usr/bin/env python3
from pathlib import Path
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
                        <select class="apira-language-select" aria-label="Language" onchange="if(window.ApiraI18n){window.ApiraI18n.setLanguage(this.value)}else{localStorage.setItem('apira_language',this.value);location.reload()}">
                            <option value="en">English</option>
                            <option value="fa">فارسی</option>
                        </select>
                        <div class="apira-language-hint">This setting is synchronized with the main panel and other Apira VPS tools. / این تنظیم با پنل اصلی و بقیه ابزارهای Apira VPS همگام می‌شود.</div>
                    </div>
                </section>
                <!-- APIRA_BACKUP_LANGUAGE_SETTINGS_END -->
'''
NEEDLE = '''                <section class="panel">\n                    <div class="panel-header">\n                        <div>\n                            <div class="panel-title">Destination configuration</div>'''

def patch(path: Path) -> None:
    s = path.read_text(encoding='utf-8')
    if MARKER in s:
        return
    if NEEDLE not in s:
        raise SystemExit(f'Backup Center settings anchor not found: {path}')
    path.write_text(s.replace(NEEDLE, BLOCK + '\n' + NEEDLE, 1), encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: backup_language_settings.py <BackupCenter/index.html>')
    patch(Path(sys.argv[1]))
