#!/usr/bin/env python3
from pathlib import Path
import sys

MARKER = 'APIRA_CONTROL_RUNTIME_FIXES_V1'

SCRIPT = r'''
<script>
/* APIRA_CONTROL_RUNTIME_FIXES_V1 */
(() => {
  const button = document.getElementById('restartAllServices');
  const modal = document.getElementById('securityGuideModal');
  const title = document.getElementById('securityGuideTitle');
  const eyebrow = document.getElementById('securityGuideEyebrow');
  const body = document.getElementById('securityGuideBody');
  if (!button || !modal || !title || !body) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = async (btn, value) => {
    const done = () => { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '⧉'; }, 1000); };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value); done(); return;
      }
    } catch (_) {}
    const area = document.createElement('textarea');
    area.value = value; area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(area); area.select();
    try { document.execCommand('copy'); done(); } finally { area.remove(); }
  };

  button.addEventListener('click', event => {
    event.preventDefault();
    const fa = localStorage.getItem('apira_language') === 'fa';
    eyebrow.textContent = fa ? 'راهنمای سرویس‌ها' : 'Service guide';
    title.textContent = fa ? 'راه‌اندازی مجدد امن سرویس‌ها' : 'Restart services safely';
    const steps = fa ? [
      ['اول سرویس خراب را مشخص کن','همه سرویس‌های فعال را یکجا ری‌استارت نکن؛ ممکن است SSH، دیتابیس، Docker یا خود پنل قطع شود.','systemctl --failed'],
      ['وضعیت سرویس را ببین','نام سرویس موردنظر را از جدول همین صفحه یا systemctl پیدا کن.','systemctl status SERVICE --no-pager'],
      ['فقط همان سرویس را ری‌استارت کن','در جدول Services روی Restart همان ردیف بزن، یا دستور زیر را اجرا کن.','sudo systemctl restart SERVICE'],
      ['بعد نتیجه را بررسی کن','وضعیت و لاگ جدید سرویس را ببین.','systemctl status SERVICE --no-pager\njournalctl -u SERVICE -n 100 --no-pager']
    ] : [
      ['Identify the failing service first','Do not restart every active service at once; SSH, databases, Docker or the panel itself could be interrupted.','systemctl --failed'],
      ['Inspect that service','Use the Services table or systemctl to find the exact unit name.','systemctl status SERVICE --no-pager'],
      ['Restart only that service','Use Restart on that service row, or run the command below.','sudo systemctl restart SERVICE'],
      ['Verify the result','Review fresh service status and logs.','systemctl status SERVICE --no-pager\njournalctl -u SERVICE -n 100 --no-pager']
    ];
    const warning = fa
      ? 'این دکمه عمداً همه سرویس‌ها را یکجا Restart نمی‌کند؛ این کار روی سرور واقعی می‌تواند اتصال و دیتابیس‌ها را همزمان قطع کند.'
      : 'This button intentionally does not restart every service at once; doing that on a live server can interrupt access and databases.';
    body.innerHTML = `<p class="security-guide-intro">${esc(warning)}</p>` + steps.map((step, i) => `
      <div class="security-guide-step"><div class="security-guide-step-num">${i + 1}</div><div>
        <h3>${esc(step[0])}</h3><p>${esc(step[1])}</p>
        <div class="security-code"><pre>${esc(step[2])}</pre><button class="security-copy-btn" type="button" data-service-code="${esc(step[2])}" title="${fa ? 'کپی' : 'Copy'}">⧉</button></div>
      </div></div>`).join('');
    body.querySelectorAll('[data-service-code]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation(); copy(btn, btn.dataset.serviceCode);
    }));
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    window.lucide?.createIcons?.();
  });
})();
</script>
'''


def patch(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    if MARKER in text:
        return
    if '<!-- APIRA_I18N_BEGIN -->' in text:
        text = text.replace('<!-- APIRA_I18N_BEGIN -->', SCRIPT + '\n<!-- APIRA_I18N_BEGIN -->', 1)
    elif '</body>' in text:
        text = text.replace('</body>', SCRIPT + '\n</body>', 1)
    else:
        text += '\n' + SCRIPT
    path.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: control_runtime_fixes.py <ui/index.html>')
    patch(Path(sys.argv[1]))
