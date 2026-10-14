#!/usr/bin/env python3
from pathlib import Path
import re, sys

MARKER = 'APIRA_I18N_EXTERNALIZED_V3'

def patch(html: Path) -> None:
    if not html.exists():
        raise SystemExit(f'HTML not found: {html}')
    js = html.with_name('ui.js')
    if not js.exists():
        raise SystemExit(f'External ui.js not found beside {html}')
    s = html.read_text(encoding='utf-8')
    j = js.read_text(encoding='utf-8')
    m = re.search(r'\s*<!-- APIRA_I18N_BEGIN -->(.*?)<!-- APIRA_I18N_END -->', s, flags=re.S)
    if m:
        block = m.group(1)
        scripts = re.findall(r'<script[^>]*>(.*?)</script>', block, flags=re.S | re.I)
        if len(scripts) < 2:
            raise SystemExit(f'Expected dictionary + runtime scripts in {html}, got {len(scripts)}')
        if MARKER not in j:
            j += '\n\n/* ' + MARKER + ' */\n' + '\n\n'.join(x.strip() for x in scripts if x.strip()) + '\n'
        s = s[:m.start()] + '\n' + s[m.end():]
    elif MARKER not in j:
        raise SystemExit(f'No inline i18n block to externalize in {html}')
    s = re.sub(r'(src=["\']ui\.js)(?:\?[^"\']*)?(["\'])', r'\1?v=apira-i18n3\2', s, count=1)
    html.write_text(s, encoding='utf-8')
    js.write_text(j, encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: externalize_i18n.py <index.html>')
    patch(Path(sys.argv[1]))
