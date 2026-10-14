#!/usr/bin/env python3
from pathlib import Path
import sys

MARKER = 'APIRA_API_CORE_PUBLIC_URL_V1'

def patch(index: Path) -> None:
    ui = index.with_name('ui.js')
    if not ui.exists():
        raise SystemExit(f'API Core ui.js not found: {ui}')
    s = ui.read_text(encoding='utf-8')
    if MARKER in s:
        return
    old = '''        setBaseUrl(data.base_url.replace(/\\/api\\/v1$/, "") + "/api/v1");\n        renderCurlSample(data.base_url);\n'''
    new = '''        // APIRA_API_CORE_PUBLIC_URL_V1: use the URL the user actually opened, not backend localhost.\n        const browserBaseUrl = `${location.origin}${mount}api/v1`.replace(/\\/$/, "");\n        setBaseUrl(browserBaseUrl);\n        renderCurlSample(browserBaseUrl);\n'''
    if old not in s:
        raise SystemExit('API Core overview URL anchor not found')
    s = s.replace(old, new, 1)
    needle = '${baseUrl}/api/v1/system'
    if needle not in s:
        raise SystemExit('API Core curl sample anchor not found')
    s = s.replace(needle, '${baseUrl}/system', 1)
    ui.write_text(s, encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: api_core_public_url.py <WEVPSApiCore/index.html>')
    patch(Path(sys.argv[1]))
