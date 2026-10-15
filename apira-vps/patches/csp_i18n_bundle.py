#!/usr/bin/env python3
from pathlib import Path
import re
import sys

MARKER = 'APIRA_CSP_I18N_EXTERNAL_V1'
BLOCK_RE = re.compile(r'\s*<!-- APIRA_I18N_BEGIN -->(.*?)<!-- APIRA_I18N_END -->', re.S)
SCRIPT_RE = re.compile(r'<script(?:\s[^>]*)?>(.*?)</script>', re.S | re.I)
UI_RE = re.compile(r'<script\s+src="([^"]*ui\.js(?:\?[^\"]*)?)"></script>', re.I)


def patch_html(path: Path) -> bool:
    text = path.read_text(encoding='utf-8', errors='ignore')
    match = BLOCK_RE.search(text)
    if not match:
        return False

    scripts = [body.strip() for body in SCRIPT_RE.findall(match.group(1)) if body.strip()]
    if not scripts:
        raise SystemExit(f'No inline i18n scripts found in {path}')

    ui_match = UI_RE.search(text)
    if not ui_match:
        raise SystemExit(f'No external ui.js found for CSP-safe i18n in {path}')

    ui_ref = ui_match.group(1)
    ui_path = path.parent / ui_ref.split('?', 1)[0]
    if not ui_path.is_file():
        raise SystemExit(f'ui.js not found next to {path}: {ui_path}')

    ui = ui_path.read_text(encoding='utf-8', errors='ignore')
    if MARKER not in ui:
        ui += '\n\n/* ' + MARKER + ' */\n' + '\n\n'.join(scripts) + '\n'
        ui_path.write_text(ui, encoding='utf-8')

    text = BLOCK_RE.sub('', text, count=1)
    busted = ui_ref.split('?', 1)[0] + '?v=apira-i18n3'
    text = text.replace(ui_ref, busted, 1)
    path.write_text(text, encoding='utf-8')
    return True


def main(target: Path) -> None:
    files = [target] if target.is_file() else sorted(target.rglob('index.html'))
    changed = 0
    for html in files:
        try:
            if patch_html(html):
                changed += 1
        except UnicodeDecodeError:
            continue
    if not changed:
        raise SystemExit(f'No APIRA_I18N block with ui.js found under {target}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: csp_i18n_bundle.py <package-dir-or-index.html>')
    main(Path(sys.argv[1]))
