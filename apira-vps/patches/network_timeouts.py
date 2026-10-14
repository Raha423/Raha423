#!/usr/bin/env python3
from pathlib import Path
import sys

MARKER = 'APIRA_NETWORK_TIMEOUTS_V1'

def patch(index: Path) -> None:
    s = index.read_text(encoding='utf-8')
    if MARKER in s:
        return
    old = '''async function api(url,opt={}){const mount=location.pathname==="\\/"?"/":`/${location.pathname.split("/").filter(Boolean)[0]}/`,endpoint=url.startsWith("/api/")?mount+url.slice(1):url;const r=await fetch(endpoint,{credentials:"same-origin",cache:"no-store",...opt});if(r.status===401){location.href=(await r.json()).login_url||"/login";throw Error("Authentication required")}const type=r.headers.get("content-type")||"";if(!type.includes("application/json"))throw Error(`Unexpected response from ${endpoint} (${r.status})`);const d=await r.json();if(!r.ok||d.success===false)throw Error(d.message||d.error||`Request failed (${r.status})`);return d}\n'''
    new = '''// APIRA_NETWORK_TIMEOUTS_V1\nasync function api(url,opt={}){const mount=location.pathname==="\\/"?"/":`/${location.pathname.split("/").filter(Boolean)[0]}/`,endpoint=url.startsWith("/api/")?mount+url.slice(1):url;const {timeoutMs=30000,...fetchOpt}=opt,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const r=await fetch(endpoint,{credentials:"same-origin",cache:"no-store",...fetchOpt,signal:fetchOpt.signal||controller.signal});if(r.status===401){location.href=(await r.json()).login_url||"/login";throw Error("Authentication required")}const type=r.headers.get("content-type")||"";if(!type.includes("application/json"))throw Error(`Unexpected response from ${endpoint} (${r.status})`);const d=await r.json();if(!r.ok||d.success===false)throw Error(d.message||d.error||`Request failed (${r.status})`);return d}catch(error){if(error?.name==="AbortError")throw Error("Request timed out. The remote network check did not finish in time.");throw error}finally{clearTimeout(timer)}}\n'''
    if old not in s:
        raise SystemExit('Network api helper anchor not found')
    s = s.replace(old, new, 1)
    replacements = {
        'const d=await api("/api/sites");': 'const d=await api("/api/sites",{timeoutMs:45000});',
        'const d=await api("/api/reputation");': 'const d=await api("/api/reputation",{timeoutMs:30000});',
        'const d=await api("/api/speed-test"),r=d.result;': 'const d=await api("/api/speed-test",{timeoutMs:120000}),r=d.result;',
    }
    for old_text, new_text in replacements.items():
        if old_text not in s:
            raise SystemExit(f'Network timeout anchor not found: {old_text}')
        s = s.replace(old_text, new_text, 1)
    index.write_text(s, encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: network_timeouts.py <WEVPSNetwork/index.html>')
    patch(Path(sys.argv[1]))
