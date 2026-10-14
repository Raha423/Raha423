#!/usr/bin/env python3
from pathlib import Path
import sys

MARKER = 'APIRA_SERVICE_RESTART_GUIDE_V1'

def patch(path: Path) -> None:
    s = path.read_text(encoding='utf-8')
    if MARKER in s:
        return
    fn = r'''
            // APIRA_SERVICE_RESTART_GUIDE_V1
            function openServiceRestartGuide(){
                const fa=securityGuideLang()==='fa';
                const g=fa?{
                    title:'راه‌اندازی مجدد امن سرویس‌ها',
                    intro:'فقط همان سرویسی را ری‌استارت کن که واقعاً قصد تغییرش را داری. ری‌استارت گروهی می‌تواند SSH، دیتابیس، Docker، شبکه و خود پنل را همزمان قطع کند.',
                    warn:'روی سرور واقعی همه سرویس‌های فعال را یکجا ری‌استارت نکن. از Restart همان ردیف استفاده کن.',
                    steps:[['اسم سرویس را پیدا کن','Unit دقیق سرویس فعال را مشخص کن.','systemctl list-units --type=service --state=running'],['وضعیت را بررسی کن','قبل از تغییر وضعیت همان سرویس را ببین.','systemctl status YOUR_SERVICE --no-pager'],['فقط همان سرویس را ری‌استارت کن','YOUR_SERVICE را با اسم واقعی سرویس جایگزین کن.','sudo systemctl restart YOUR_SERVICE'],['نتیجه را بررسی کن','Active بودن و خطاهای آخر را ببین.','systemctl is-active YOUR_SERVICE\njournalctl -u YOUR_SERVICE -n 50 --no-pager']],
                    check:'داخل Apira VPS از Restart همان ردیف استفاده کن. SSH، شبکه و دیتابیس را فقط در صورت نیاز دست بزن.'
                }:{
                    title:'Restart services safely',
                    intro:'Restart only the service you intend to change. Bulk restarting every active service can disconnect SSH, databases, Docker, networking and this panel.',
                    warn:'Do not restart all active services as one batch on a production server. Use Restart on the individual service row.',
                    steps:[['Find the service','List running systemd units and identify the exact service.','systemctl list-units --type=service --state=running'],['Check status','Review the unit before changing it.','systemctl status YOUR_SERVICE --no-pager'],['Restart only that service','Replace YOUR_SERVICE with the exact unit name.','sudo systemctl restart YOUR_SERVICE'],['Verify','Confirm it returned to active and inspect recent errors.','systemctl is-active YOUR_SERVICE\njournalctl -u YOUR_SERVICE -n 50 --no-pager']],
                    check:'In Apira VPS use Restart on the individual service row. Avoid SSH, networking and database restarts unless intended.'
                };
                text('securityGuideEyebrow',fa?'راهنمای سرویس':'Service guide');
                text('securityGuideTitle',g.title);
                const b=$('securityGuideBody');
                b.innerHTML=`<p class="security-guide-intro">${escapeHtml(g.intro)}</p><div class="security-guide-warning"><i data-lucide="triangle-alert"></i><div><strong>${fa?'قبل از شروع':'Before you start'}</strong><p>${escapeHtml(g.warn)}</p></div></div>${g.steps.map((step,i)=>`<div class="security-guide-step"><div class="security-guide-step-num">${i+1}</div><div><h3>${escapeHtml(step[0])}</h3><p>${escapeHtml(step[1])}</p><div class="security-code"><pre>${escapeHtml(step[2])}</pre><button class="security-copy-btn" type="button" data-code="${escapeHtml(step[2])}" title="${fa?'کپی':'Copy'}"><i data-lucide="copy"></i></button></div></div></div>`).join('')}<div class="security-guide-check"><h3>${fa?'چطور مطمئن شوم؟':'How do I verify it?'}</h3><p>${escapeHtml(g.check)}</p></div>`;
                b.querySelectorAll('[data-code]').forEach(x=>x.onclick=e=>{e.stopPropagation();securityGuideCopy(x,x.dataset.code)});
                $('securityGuideModal').classList.add('show');document.body.style.overflow='hidden';refreshIcons();
            }
            $("restartAllServices")?.addEventListener("click",e=>{e.preventDefault();openServiceRestartGuide()});
'''
    anchors = [
        '            $("securityRecommendations")?.addEventListener("click"',
        '            async function loadSecurity(',
    ]
    for anchor in anchors:
        if anchor in s:
            s = s.replace(anchor, fn + '\n' + anchor, 1)
            break
    else:
        raise SystemExit('security guide runtime anchor not found')
    path.write_text(s, encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: control_service_guide.py <control index.html>')
    patch(Path(sys.argv[1]))
