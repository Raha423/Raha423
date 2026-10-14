(() => {
    "use strict";
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const mount = location.pathname === "/" ? "/" : `/${location.pathname.split("/").filter(Boolean)[0]}/`;
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const icons = {"package-check":"▣","layout-grid":"▦","sparkles":"✦","shield-check":"◇","server-cog":"▥","history":"↶","search":"⌕","refresh-cw":"↻","terminal-square":"▣","menu":"☰","arrow-down":"↓","badge-check":"✓","boxes":"▦","globe-2":"◎","shield-ban":"◇","brick-wall":"▤","activity":"⌁","panel-top":"▱","git-branch":"⑂","hexagon":"⬡","bot":"◆","wand-sparkles":"✦","radio-tower":"⌁","network":"⌘","x":"×","triangle-alert":"!","download":"↓","circle-check":"✓","loader-circle":"↻"};
    function drawIcons(root = document) {
        if (window.lucide?.createIcons) window.lucide.createIcons({attrs:{"aria-hidden":"true"}});
        else $$("[data-lucide]", root).forEach(icon => { icon.textContent = icons[icon.dataset.lucide] || "•"; icon.style.fontStyle = "normal"; });
    }
    async function api(path, options = {}) {
        const endpoint = path.startsWith("/api/") ? mount + path.slice(1) : path;
        const response = await fetch(endpoint, {credentials:"same-origin", cache:"no-store", ...options});
        if (response.status === 401) { const data = await response.json(); location.href = data.login_url || "/login"; throw Error("Authentication required"); }
        const data = await response.json();
        if (!response.ok || data.success === false) throw Object.assign(Error(data.message || data.error || "Request failed"), {status:response.status, data});
        return data;
    }
    function toast(title, message, type = "success") {
        const node = document.createElement("div");
        node.className = `toast ${type}`;
        node.innerHTML = `<div class="toast-icon">${type === "error" ? "!" : "✓"}</div><div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
        $("#toastWrap").appendChild(node);
        setTimeout(() => node.remove(), 5200);
    }
    async function copyText(value) {
        const text = String(value ?? "");
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // HTTP/IP deployments and browser policies can reject this API.
            }
        }
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "");
        input.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;pointer-events:none";
        document.body.appendChild(input);
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
        let copied = false;
        try { copied = document.execCommand("copy"); }
        finally { input.remove(); }
        return copied;
    }
    const state = {catalog:[], category:"All", search:"", installedOnly:false, selected:null, selectedAction:"install", activeJob:null, poll:null, credentials:null};
    const riskLabel = item => item.installed ? "Installed" : item.reimage ? item.compatible ? "Ready to install" : "Check requirements" : item.risk === "destructive" ? "Protected action" : item.risk === "caution" ? "Extra care" : "Ready";
    function categories() { return ["All", ...new Set(state.catalog.map(item => item.category))]; }
    function renderChips() {
        $("#chips").innerHTML = categories().map(category => `<button class="chip ${category === state.category ? "active" : ""}" data-category="${esc(category)}">${esc(category)}</button>`).join("");
        $$("[data-category]").forEach(button => button.onclick = () => { state.category = button.dataset.category; state.installedOnly = false; renderChips(); renderCatalog(); });
    }
    function visibleTools() {
        const needle = state.search.toLowerCase();
        return state.catalog.filter(item =>
            (state.category === "All" || item.category === state.category) &&
            (!state.installedOnly || item.installed) &&
            (!needle || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(needle))
        );
    }
    function renderCatalog() {
        const tools = visibleTools();
        $("#resultCount").textContent = `${tools.length} tool${tools.length === 1 ? "" : "s"}`;
        $("#catalog").innerHTML = tools.map(item => `
            <article class="tool-card">
                <div class="tool-top"><div class="tool-icon"><i data-lucide="${esc(item.icon)}"></i></div><div class="tool-title"><h3>${esc(item.name)}</h3><div class="tool-category">${esc(item.category)}</div></div><span class="badge ${item.installed ? "installed" : esc(item.risk)}">${riskLabel(item)}</span></div>
                <p>${esc(item.description)}</p>
                ${item.requires?.length ? `<div class="requires">${item.requires.map(req => `<span>Requires ${esc(req)}</span>`).join("")}</div>` : ""}
                <div class="tool-footer">
                    ${item.installed
                        ? item.uninstallable
                            ? `<button type="button" class="danger-btn" data-uninstall="${esc(item.id)}"><i data-lucide="trash-2"></i>Uninstall</button>`
                            : `<button type="button" class="secondary-btn" disabled><i data-lucide="circle-check"></i>Installed</button>`
                        : `<button type="button" class="primary-btn" data-install="${esc(item.id)}"><i data-lucide="${item.reimage ? "hard-drive" : item.guided ? "shield-check" : "download"}"></i>${item.reimage ? "Replace system" : item.guided ? "Open guide" : "Install"}</button>`}
                    <span class="tool-version">${esc(item.version || "")}</span>
                </div>
            </article>`).join("") || `<div class="empty"><div><i data-lucide="search"></i><h3>No matching tools</h3><p>Try another category or search phrase.</p></div></div>`;
        drawIcons($("#catalog"));
    }
    function renderOverview(data) {
        state.catalog = data.catalog;
        $("#osName").textContent = data.system.os;
        $("#archName").textContent = data.system.arch;
        $("#packageManager").textContent = data.system.package_manager || "Unsupported";
        $("#rootState").textContent = data.system.root ? "Root ready" : "Needs root";
        $("#rootState").style.color = data.system.root ? "var(--green)" : "var(--amber)";
        $("#availableCount").textContent = data.catalog.length;
        $("#installedCount").textContent = data.catalog.filter(item => item.installed).length;
        $("#categoryCount").textContent = new Set(data.catalog.map(item => item.category)).size;
        $("#activeCount").textContent = data.active_job ? 1 : 0;
        state.activeJob = data.active_job;
        renderChips(); renderCatalog();
    }
    async function loadOverview(showToast = false) {
        try { renderOverview(await api("/api/overview")); if (showToast) toast("Status refreshed", "Catalog and installed tools were checked."); }
        catch (error) { $("#catalog").innerHTML = `<div class="empty"><div><h3>Catalog unavailable</h3><p>${esc(error.message)}</p></div></div>`; toast("Unable to load", error.message, "error"); }
    }
    function openInstall(id) {
        const item = state.catalog.find(tool => tool.id === id);
        if (!item || item.installed) return;
        if (item.guided) {
            const destructive = item.risk === "destructive";
            toast(
                destructive ? "Protected migration required" : "Guided setup required",
                item.guide_message || (destructive
                    ? `${item.name} can replace the server disk or operating system.`
                    : `${item.name} needs configuration choices before installation can start.`),
                "error"
            );
            return;
        }
        state.selected = item;
        state.selectedAction = "install";
        $("#modalIcon").innerHTML = `<i data-lucide="${esc(item.icon)}"></i>`;
        $("#modalTitle").textContent = item.reimage ? `Replace server with ${item.name}` : `Install ${item.name}`;
        $("#modalSubtitle").textContent = item.reimage ? "Full disk replacement" : item.category;
        const phrase = item.reimage ? `ERASE AND INSTALL ${item.id}` : `INSTALL ${item.id}`;
        $("#confirmLabel").textContent = `Type ${phrase} to confirm`;
        $("#confirmationInput").value = "";
        $("#confirmationInput").placeholder = phrase;
        $("#modalNotice span").textContent = item.reimage
            ? `All files, databases, backups and current settings on this server will be permanently erased. ${item.compatibility_reason || "Server requirements will be checked before installation starts."} A new login password will be generated before reboot.`
            : item.risk === "caution"
            ? "This installer may open ports or add a persistent system service. Review the vendor defaults after installation."
            : "The operation will install system packages and may add a service. Output is recorded in the activity log.";
        $("#confirmInstall").className = "primary-btn";
        $("#confirmInstall").innerHTML = item.reimage
            ? `<i data-lucide="hard-drive"></i>Erase disk and reinstall`
            : `<i data-lucide="download"></i>Start installation`;
        $("#installModal").classList.add("show");
        drawIcons($("#installModal"));
        $("#confirmationInput").focus();
    }
    function openUninstall(id) {
        const item = state.catalog.find(tool => tool.id === id);
        if (!item?.installed || !item.uninstallable) return;
        state.selected = item;
        state.selectedAction = "uninstall";
        $("#modalIcon").innerHTML = `<i data-lucide="trash-2"></i>`;
        $("#modalTitle").textContent = `Uninstall ${item.name}`;
        $("#modalSubtitle").textContent = "Remove installed tool";
        const phrase = `UNINSTALL ${item.id}`;
        $("#confirmLabel").textContent = `Type ${phrase} to confirm`;
        $("#confirmationInput").value = "";
        $("#confirmationInput").placeholder = phrase;
        $("#modalNotice span").textContent = "This removes the selected software. Its official uninstaller may also remove configuration and application data.";
        $("#confirmInstall").className = "danger-btn";
        $("#confirmInstall").innerHTML = `<i data-lucide="trash-2"></i>Start removal`;
        $("#installModal").classList.add("show");
        drawIcons($("#installModal"));
        $("#confirmationInput").focus();
    }
    function closeInstall() { $("#installModal").classList.remove("show"); state.selected = null; }
    async function confirmInstall() {
        if (!state.selected) return;
        const item = state.selected;
        const action = state.selectedAction;
        const confirmation = $("#confirmationInput").value.trim();
        try {
            const data = await api(`/api/${action}/${item.id}`, {method:"POST", headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"}, body:JSON.stringify({confirmation})});
            closeInstall();
            state.activeJob = data.job_id;
            if (data.result && typeof data.result === "object") {
                state.credentials = data.result;
            }
            toast(action === "install" ? "Installation started" : "Removal started", data.message);
            await openJob(data.job_id);
            renderCredentials(state.credentials);
        } catch (error) { toast("Unable to start", error.message, "error"); }
    }
    async function openJob(id = null) {
        $("#jobModal").classList.add("show");
        state.activeJob = id || state.activeJob;
        if (!state.activeJob) {
            const data = await api("/api/jobs");
            state.activeJob = data.jobs[0]?.id || null;
        }
        if (!state.activeJob) { $("#jobStatus").textContent = "Idle"; $("#consoleOutput").textContent = "No installation activity yet."; return; }
        renderCredentials(state.credentials);
        await pollJob();
    }
    function renderCredentials(result, {clear = false} = {}) {
        const card = $("#credentialsCard");
        if (clear) state.credentials = null;
        if (result && typeof result === "object" && !Array.isArray(result)) {
            state.credentials = {...(state.credentials || {}), ...result};
        }
        const credentials = state.credentials;
        const fields = [
            ["Panel URL", "url", true],
            ["Username", "username"],
            ["Password", "password"],
            ["Panel port", "port"],
            ["Access path", "path"],
            ["API token", "api_token", true],
            ["Database", "database"],
        ].filter(([, key]) => credentials?.[key] !== undefined && credentials?.[key] !== null && String(credentials[key]).length > 0);
        card.classList.toggle("show", fields.length > 0);
        $("#credentialGrid").innerHTML = fields.map(([label, key, wide]) => `
            <div class="credential ${wide ? "wide" : ""}">
                <label>${esc(label)}</label><div class="credential-row">
                    <code title="${esc(credentials[key])}">${esc(credentials[key])}</code>
                    <button class="copy-credential" type="button" data-copy-field="${esc(key)}" title="Copy ${esc(label)}"><i data-lucide="copy"></i></button>
                </div>
            </div>`).join("");
        $$("[data-copy-field]", card).forEach(button => button.onclick = async () => {
            if (await copyText(credentials[button.dataset.copyField])) {
                toast("Copied securely", "The value is now in your clipboard.");
            } else {
                toast("Copy failed", "Select the value and copy it manually.", "error");
            }
        });
        drawIcons(card);
    }
    async function sendTerminalInput() {
        if (!state.activeJob) return;
        const input = $("#terminalInput");
        const value = input.value;
        if (!value.length) return;
        try {
            await api(`/api/jobs/${state.activeJob}/input`, {
                method:"POST",
                headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},
                body:JSON.stringify({input:value}),
            });
            input.value = "";
            input.focus();
            setTimeout(pollJob, 100);
        } catch (error) {
            toast("Input not sent", error.message, "error");
        }
    }
    async function pollJob() {
        if (!state.activeJob) return;
        clearTimeout(state.poll);
        try {
            const data = await api(`/api/jobs/${state.activeJob}`), job = data.job;
            $("#jobStatus").className = `job-status ${job.status}`;
            $("#jobStatus").textContent = `${job.tool} · ${job.status}`;
            if (job.result && typeof job.result === "object") renderCredentials(job.result);
            else renderCredentials(state.credentials);
            $("#consoleOutput").textContent = job.log || "Preparing installation…";
            $("#consoleOutput").scrollTop = $("#consoleOutput").scrollHeight;
            $("#terminalInput").disabled = job.status !== "running";
            $("#sendTerminalInput").disabled = job.status !== "running";
            if (job.status === "running") state.poll = setTimeout(pollJob, 1600);
            else { state.activeJob = null; await loadOverview(); toast(job.status === "completed" ? "Installation completed" : "Installation failed", job.status === "completed" ? "The tool is ready." : job.error || "Review the activity log.", job.status === "completed" ? "success" : "error"); }
        } catch (error) { $("#consoleOutput").textContent = error.message; }
    }
    function closeJob() { $("#jobModal").classList.remove("show"); clearTimeout(state.poll); }
    $("#catalog").addEventListener("click", event => {
        const installButton = event.target.closest("[data-install]");
        if (installButton && !installButton.disabled) {
            event.preventDefault();
            openInstall(installButton.dataset.install);
            return;
        }
        const uninstallButton = event.target.closest("[data-uninstall]");
        if (uninstallButton && !uninstallButton.disabled) {
            event.preventDefault();
            openUninstall(uninstallButton.dataset.uninstall);
        }
    });
    $$(".nav-item[data-filter]").forEach(button => button.onclick = () => {
        $$(".nav-item").forEach(item => item.classList.remove("active")); button.classList.add("active");
        state.category = button.dataset.filter; state.installedOnly = false; renderChips(); renderCatalog();
        $("#sidebar").classList.remove("open"); $("#overlay").classList.remove("show");
    });
    $("#searchInput").oninput = event => { state.search = event.target.value; renderCatalog(); };
    $("#refreshButton").onclick = () => loadOverview(true);
    $("#browseButton").onclick = () => $("#catalogSection").scrollIntoView({behavior:"smooth"});
    $("#showInstalled").onclick = () => { state.category = "All"; state.installedOnly = true; renderChips(); renderCatalog(); $("#catalogSection").scrollIntoView({behavior:"smooth"}); };
    $("#menuButton").onclick = () => { $("#sidebar").classList.add("open"); $("#overlay").classList.add("show"); };
    $("#overlay").onclick = () => { $("#sidebar").classList.remove("open"); $("#overlay").classList.remove("show"); };
    $("#historyButton").onclick = () => openJob();
    $("#historyNav").onclick = () => openJob();
    $("#confirmInstall").onclick = confirmInstall;
    $("#confirmationInput").onkeydown = event => { if (event.key === "Enter") confirmInstall(); };
    $$("[data-close-modal]").forEach(button => button.onclick = closeInstall);
    $$("[data-close-job]").forEach(button => button.onclick = closeJob);
    $("#loadLatest").onclick = () => openJob();
    $("#sendTerminalInput").onclick = sendTerminalInput;
    $("#terminalInput").onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); sendTerminalInput(); } };
    $("#installModal").onclick = event => { if (event.target === $("#installModal")) closeInstall(); };
    $("#jobModal").onclick = event => { if (event.target === $("#jobModal")) closeJob(); };
    drawIcons(); loadOverview();
})();


/* APIRA_I18N_EXTERNALIZED_V3 */
window.__APIRA_FA_MESSAGES__ = {"Apira VPS":"Apira VPS","Sign in · Apira VPS":"ورود · Apira VPS","Welcome back":"خوش آمدید","Welcome.":"خوش آمدید.","Sign in":"ورود","Sign out":"خروج","Logout":"خروج","Username":"نام کاربری","Password":"رمز عبور","Enter your username":"نام کاربری را وارد کنید","Enter your password":"رمز عبور را وارد کنید","Show password":"نمایش رمز عبور","Hide password":"پنهان کردن رمز عبور","Signing in...":"در حال ورود...","Remember me":"مرا به خاطر بسپار","Invalid username or password.":"نام کاربری یا رمز عبور نادرست است.","Too many login attempts. Try again later.":"تلاش‌های ورود بیش از حد است. کمی بعد دوباره امتحان کنید.","Dashboard":"داشبورد","Overview":"نمای کلی","System":"سیستم","Processes":"پردازش‌ها","Services":"سرویس‌ها","Security":"امنیت","Security Center":"مرکز امنیت","Tools Center":"مرکز ابزارها","Extensions":"افزونه‌ها","Notifications":"اعلان‌ها","Settings":"تنظیمات","Account":"حساب","Manage your control panel session and account access.":"نشست پنل و دسترسی حساب خود را مدیریت کنید.","End your current session and return to the sign-in page.":"نشست فعلی را پایان دهید و به صفحه ورود برگردید.","Language":"زبان","English":"انگلیسی","Persian":"فارسی","Server Protection":"محافظت از سرور","SERVER PROTECTION":"محافظت از سرور","A read-only security overview based on your live server configuration.":"نمای امنیتی سرور بر اساس تنظیمات واقعی و زنده‌ی سرور.","Run security check":"اجرای بررسی امنیتی","Current security posture":"وضعیت امنیت فعلی","CURRENT SECURITY POSTURE":"وضعیت امنیت فعلی","out of 100":"از ۱۰۰","Critical":"بحرانی","Warning":"هشدار","Normal":"عادی","Healthy":"سالم","Needs review":"نیاز به بررسی","Important security risks require prompt review.":"چند مورد امنیتی مهم نیاز به بررسی سریع دارند.","Firewall":"فایروال","Inactive":"غیرفعال","Active":"فعال","SSH access":"دسترسی SSH","Change SSH port":"تغییر پورت SSH","Failed logins · 24h":"ورودهای ناموفق · ۲۴ ساعت","SSH authentication attempts":"تلاش‌های احراز هویت SSH","Security updates":"به‌روزرسانی‌های امنیتی","total package update(s)":"به‌روزرسانی بسته در مجموع","Recommended actions":"اقدام‌های پیشنهادی","Prioritized improvements based on this server":"پیشنهادهای اولویت‌بندی‌شده بر اساس وضعیت این سرور","Enable a host firewall":"فایروال سرور را فعال کنید","No active firewall policy was detected. Allow SSH first, then enable UFW or firewalld.":"هیچ فایروال فعالی پیدا نشد. ابتدا دسترسی SSH را مجاز کنید و بعد UFW یا firewalld را فعال کنید.","Restrict SSH root login":"ورود مستقیم root با SSH را محدود کنید","PermitRootLogin is currently yes. Use prohibit-password or no.":"ورود مستقیم root فعال است؛ بهتر است روی prohibit-password یا no قرار بگیرد.","Disable SSH password authentication":"ورود SSH با رمز عبور را غیرفعال کنید","Use SSH keys, verify access in a second session, then disable password authentication.":"ابتدا ورود با کلید SSH را در یک نشست دوم تست کنید و سپس ورود با رمز را غیرفعال کنید.","Install security updates":"به‌روزرسانی‌های امنیتی را نصب کنید","Review failed SSH logins":"ورودهای ناموفق SSH را بررسی کنید","Listening ports":"پورت‌های در حال گوش‌دادن","PORT":"پورت","PROCESS":"پردازش","BINDING":"اتصال","EXPOSURE":"دسترسی","PUBLIC":"عمومی","LOCAL":"محلی","Public":"عمومی","Local":"محلی","publicly bound":"متصل به اینترنت","listener(s)":"شنونده","Protected configuration":"تنظیمات محافظت‌شده","New SSH port":"پورت جدید SSH","Administrator password":"رمز عبور مدیر","Choose an unused port between 1024 and 65535.":"یک پورت آزاد بین ۱۰۲۴ تا ۶۵۵۳۵ انتخاب کنید.","Your panel password is verified by the server and is never stored here.":"رمز پنل فقط روی سرور بررسی می‌شود و اینجا ذخیره نمی‌شود.","Test a new SSH connection before closing your current session. The old firewall rule will be kept for recovery.":"قبل از بستن نشست فعلی، اتصال SSH جدید را تست کنید. قانون قبلی فایروال برای بازیابی موقتاً نگه داشته می‌شود.","Validate and apply":"بررسی و اعمال","Cancel":"لغو","Confirm":"تأیید","Are you sure?":"مطمئن هستید؟","CPU Usage":"مصرف CPU","CPU usage":"مصرف CPU","CPU right now":"مصرف فعلی CPU","Memory Usage":"مصرف حافظه","Memory usage":"مصرف حافظه","Disk Usage":"مصرف دیسک","Disk usage":"مصرف دیسک","Swap Usage":"مصرف سواپ","Swap usage":"مصرف سواپ","System Load":"بار سیستم","Load average":"میانگین بار","Uptime":"مدت روشن بودن","Total memory":"کل حافظه","Storage used":"فضای استفاده‌شده","Total storage":"کل فضای ذخیره‌سازی","Available":"در دسترس","Used":"استفاده‌شده","Peak":"اوج","Since boot":"از زمان روشن‌شدن","Server ready":"سرور آماده است","Refresh server data":"تازه‌سازی اطلاعات سرور","Refresh dashboard":"تازه‌سازی داشبورد","Refresh":"تازه‌سازی","Refresh status":"تازه‌سازی وضعیت","Refresh view":"تازه‌سازی نمایش","Reload":"بارگذاری مجدد","Reload list":"بارگذاری مجدد فهرست","Loading...":"در حال بارگذاری...","Loading…":"در حال بارگذاری…","Checking...":"در حال بررسی...","Checking":"در حال بررسی","checking…":"در حال بررسی…","Connecting":"در حال اتصال","Connecting…":"در حال اتصال…","Running…":"در حال اجرا…","Working...":"در حال انجام...","Working…":"در حال انجام…","Done":"انجام شد","Successful":"موفق","Failed":"ناموفق","Errors":"خطاها","Error":"خطا","Service":"سرویس","Service error":"خطای سرویس","Start":"شروع","Stop":"توقف","Restart":"راه‌اندازی مجدد","Enable":"فعال‌کردن","Disable":"غیرفعال‌کردن","Logs":"لاگ‌ها","View all":"مشاهده همه","Status":"وضعیت","Running":"در حال اجرا","Stopped":"متوقف","Paused":"متوقف موقت","Exited":"خارج‌شده","Unknown state":"وضعیت نامشخص","Up to date":"به‌روز","Update available":"به‌روزرسانی موجود است","Not installed":"نصب نشده","Installed":"نصب‌شده","Installed version":"نسخه نصب‌شده","Latest version":"آخرین نسخه","Install":"نصب","Uninstall":"حذف نصب","Update":"به‌روزرسانی","Open":"باز کردن","Extension error":"خطای افزونه","Extension is already installed":"افزونه از قبل نصب شده است","Operation failed":"عملیات ناموفق بود","Operation completed":"عملیات انجام شد","Tools error":"خطای ابزارها","Could not load tools from the API.":"بارگذاری ابزارها از API ممکن نشد.","No extensions were returned by the repository manifest.":"هیچ افزونه‌ای از فهرست مخزن دریافت نشد.","File Manager":"مدیریت فایل‌ها","FileManager":"مدیریت فایل‌ها","Apira VPS File Manager":"مدیریت فایل Apira VPS","Secure local server file manager.":"مدیریت امن فایل‌های محلی سرور.","Places":"مسیرها","Search this folder":"جست‌وجو در این پوشه","New folder":"پوشه جدید","New file":"فایل جدید","Upload":"آپلود","Download":"دانلود","Edit":"ویرایش","Rename":"تغییر نام","Copy":"کپی","Move":"انتقال","Properties":"مشخصات","Archive":"فشرده‌سازی","Extract":"استخراج","Move to Trash":"انتقال به سطل زباله","Trash":"سطل زباله","Name":"نام","Size":"حجم","Modified":"آخرین تغییر","Owner":"مالک","Permissions":"مجوزها","Type":"نوع","Path":"مسیر","Directory":"پوشه","Folder":"پوشه","File":"فایل","Drop files to upload":"فایل‌ها را برای آپلود اینجا رها کنید","Files will be uploaded to the current directory.":"فایل‌ها در پوشه فعلی آپلود می‌شوند.","File saved":"فایل ذخیره شد","Item renamed":"نام مورد تغییر کرد","Moved to Trash":"به سطل زباله منتقل شد","Archive created":"فایل فشرده ساخته شد","About File Manager":"درباره مدیریت فایل‌ها","Authentication":"احراز هویت","Connection":"اتصال","Default deletion":"حذف پیش‌فرض","Managed root":"ریشه مدیریت‌شده","Shared Apira VPS session":"نشست مشترک Apira VPS","Same-origin local API":"API محلی هم‌دامنه","Mobile ready":"آماده برای موبایل","Terminal":"ترمینال","WeVPSTerminal":"ترمینال Apira VPS","Manage server terminal.":"مدیریت ترمینال سرور.","secure shell":"پوسته امن","Reconnect":"اتصال مجدد","Clear":"پاک‌کردن","Paste":"چسباندن","Open keyboard":"بازکردن صفحه‌کلید","Toggle fullscreen":"تمام‌صفحه","Clear terminal":"پاک‌کردن ترمینال","Paste from clipboard":"چسباندن از کلیپ‌بورد","Copy selected text only":"فقط متن انتخاب‌شده را کپی کن","Type a response and press Enter":"پاسخ را بنویسید و Enter بزنید","Connected":"متصل","Disconnected":"قطع‌شده","Connecting...":"در حال اتصال...","Connection lost":"اتصال قطع شد","Network":"شبکه","WEVPSNetwork":"شبکه Apira VPS","Apira VPS Network":"شبکه Apira VPS","Professional network management, diagnostics and IP reputation toolbox.":"مدیریت حرفه‌ای شبکه، عیب‌یابی و بررسی اعتبار IP.","Public IP":"IP عمومی","Private IP":"IP خصوصی","IP addresses":"آدرس‌های IP","IP address":"آدرس IP","Interfaces":"رابط‌های شبکه","Interface":"رابط شبکه","DNS & routes":"DNS و مسیرها","DNS resolver":"حل‌کننده DNS","DNS lookup":"جست‌وجوی DNS","Routes":"مسیرها","Route":"مسیر","Gateway":"درگاه","Gateway IP":"IP دروازه","Add address":"افزودن آدرس","Add route":"افزودن مسیر","Remove route":"حذف مسیر","Static route":"مسیر ثابت","Open port":"بازکردن پورت","Close port":"بستن پورت","TCP port":"پورت TCP","Connectivity":"اتصال شبکه","Diagnostics":"عیب‌یابی","Traceroute":"مسیر‌یابی","Discover MTU":"پیدا کردن MTU","Scan ports":"اسکن پورت‌ها","IP reputation":"اعتبار IP","Check IP":"بررسی IP","Data center":"دیتاسنتر","IP forwarding":"فوروارد IP","Live data":"داده زنده","Live feed":"نمایش زنده","Downloaded":"دانلودشده","Uploaded":"آپلودشده","Rx rate":"سرعت دریافت","Tx rate":"سرعت ارسال","All interfaces":"همه رابط‌ها","Sample now":"نمونه‌گیری اکنون","Export CSV":"خروجی CSV","Backup Center":"مرکز بکاپ","BackupCenter":"مرکز بکاپ","Professional server backup, recovery and secure delivery management center.":"مرکز حرفه‌ای بکاپ، بازیابی و ارسال امن سرور.","Backup Jobs":"وظایف بکاپ","Backup jobs":"وظایف بکاپ","New Backup":"بکاپ جدید","Active jobs":"وظایف فعال","Backup source":"منبع بکاپ","Backup file":"فایل بکاپ","Destinations":"مقصدها","Destination":"مقصد","Schedules":"زمان‌بندی‌ها","Schedule":"زمان‌بندی","Backup History":"تاریخچه بکاپ","Backup history":"تاریخچه بکاپ","Run all jobs":"اجرای همه وظایف","Create backup job":"ساخت وظیفه بکاپ","JOB NAME":"نام وظیفه","SOURCE TYPE":"نوع منبع","SOURCE PATH OR CONNECTION":"مسیر منبع یا اتصال","EXCLUDE PATTERNS":"الگوهای مستثنا","BACKUP MODE":"حالت بکاپ","Full TAR.GZ backup":"بکاپ کامل TAR.GZ","Hourly":"ساعتی","Daily":"روزانه","Weekly":"هفتگی","Monthly":"ماهانه","EXECUTION TIME":"زمان اجرا","TIME ZONE":"منطقه زمانی","Browser local time":"زمان محلی مرورگر","Remote server (SFTP)":"سرور راه‌دور (SFTP)","Telegram":"تلگرام","Email attachment":"پیوست ایمیل","S3 / MinIO":"S3 / MinIO","DELIVERY METHOD":"روش ارسال","Send the backup file":"ارسال فایل بکاپ","Send a status message":"ارسال پیام وضعیت","Send a login-protected panel link":"ارسال لینک محافظت‌شده پنل","Send file and login-protected link":"ارسال فایل و لینک محافظت‌شده","ARCHIVE ACCESS":"دسترسی به آرشیو","Requires an active panel login":"نیازمند ورود فعال به پنل","Retention policy":"سیاست نگهداری","KEEP BACKUPS":"نگهداری بکاپ‌ها","Keep only the latest backup":"فقط آخرین بکاپ نگه داشته شود","Keep the latest 7 backups":"۷ بکاپ آخر نگه داشته شود","Keep the latest 30 backups":"۳۰ بکاپ آخر نگه داشته شود","INTEGRITY VERIFICATION":"بررسی صحت","SHA-256 checksum enabled":"بررسی SHA-256 فعال است","Verify":"بررسی صحت","Restore":"بازیابی","Retry":"تلاش دوباره","Run now":"اجرای اکنون","Backup started":"بکاپ شروع شد","Backup deleted":"بکاپ حذف شد","Verify failed":"بررسی صحت ناموفق بود","Retry failed":"تلاش دوباره ناموفق بود","Installer":"نصب‌کننده","WEVPSInstaller":"نصب‌کننده Apira VPS","Install tool":"نصب ابزار","Installation activity":"فعالیت نصب","Secure installation credentials":"اطلاعات ورود امن نصب","Categories":"دسته‌بندی‌ها","All tools":"همه ابزارها","Search tools, platforms and assistants…":"جست‌وجوی ابزارها، پلتفرم‌ها و دستیارها…","AI Assistants":"دستیارهای هوش مصنوعی","VPN & Tunnels":"VPN و تونل‌ها","Server Platforms":"پلتفرم‌های سرور","Operating Systems":"سیستم‌عامل‌ها","Databases":"پایگاه‌داده‌ها","Monitoring":"مانیتورینگ","Root ready":"دسترسی root آماده","Needs root":"نیازمند root","Toolchain":"زنجیره ابزار","Start installation":"شروع نصب","Installation failed":"نصب ناموفق بود","Installation completed":"نصب کامل شد","OpsDeck":"مرکز عملیات","WEVPSOpsDeck":"مرکز عملیات Apira VPS","One panel for containers, git, automation and terminal sessions.":"یک پنل برای کانتینرها، Git، اتوماسیون و نشست‌های ترمینال.","Overview dashboard":"داشبورد کلی","Container control":"کنترل کانتینر","Inside container":"داخل کانتینر","Images":"ایمیج‌ها","Git repositories":"مخزن‌های Git","Scheduled tasks":"وظایف زمان‌بندی‌شده","Screen sessions":"نشست‌های Screen","Update watchers":"ناظرهای به‌روزرسانی","Activity & safety":"فعالیت و ایمنی","Quick guide":"راهنمای سریع","Containers":"کانتینرها","Container":"کانتینر","Docker engine":"موتور Docker","Git engine":"موتور Git","Repositories":"مخزن‌ها","Repository":"مخزن","Branches":"شاخه‌ها","Commits":"کامیت‌ها","Working tree changes":"تغییرات فایل‌های کاری","New scheduled task":"وظیفه زمان‌بندی جدید","Task output":"خروجی وظیفه","New screen session":"نشست Screen جدید","Track a git repository":"افزودن مخزن Git","Track a tool release":"پیگیری نسخه ابزار","All states":"همه وضعیت‌ها","Enabled only":"فقط فعال‌ها","Disabled only":"فقط غیرفعال‌ها","Invalid entries":"موارد نامعتبر","Deleted tasks":"وظایف حذف‌شده","All sessions":"همه نشست‌ها","Detached only":"فقط جداشده‌ها","Attached only":"فقط متصل‌ها","Dead only":"فقط مرده‌ها","All watchers":"همه ناظرها","Updates available":"به‌روزرسانی موجود","Prune images":"پاکسازی ایمیج‌ها","PRUNE IMAGES":"پاکسازی ایمیج‌ها","Run in sh -c":"اجرا با sh -c","Kill session":"بستن نشست","Save watcher":"ذخیره ناظر","Save task":"ذخیره وظیفه","Task created":"وظیفه ساخته شد","Task updated":"وظیفه به‌روزرسانی شد","Task deleted":"وظیفه حذف شد","Task enabled":"وظیفه فعال شد","Task disabled":"وظیفه غیرفعال شد","Task restored":"وظیفه بازیابی شد","Pull finished":"Pull تمام شد","Pull failed":"Pull ناموفق بود","Fetch failed":"Fetch ناموفق بود","Prune failed":"پاکسازی ناموفق بود","Image deleted":"ایمیج حذف شد","Resource Sentinel":"نگهبان منابع","ResourceSentinel":"نگهبان منابع","Live server resource monitoring with configurable CPU, RAM, disk space and I/O, network, load and temperature threshold alerts delivered via Telegram and email.":"مانیتورینگ زنده منابع سرور با هشدارهای قابل تنظیم برای CPU، RAM، دیسک، I/O، شبکه، بار و دما از طریق تلگرام و ایمیل.","Alert Rules":"قوانین هشدار","Alert rules":"قوانین هشدار","Alert History":"تاریخچه هشدار","Alert history":"تاریخچه هشدار","Active alerts":"هشدارهای فعال","Open alerts":"هشدارهای باز","Create rule":"ساخت قانون","Add channel":"افزودن کانال","Channels":"کانال‌ها","Metric":"متریک","THRESHOLD":"آستانه","OPERATOR":"عملگر","SEVERITY":"شدت","Severity":"شدت","Condition":"شرط","RULE NAME":"نام قانون","Sustained detection":"تشخیص پایدار","Secure by default":"امن به‌صورت پیش‌فرض","Eleven live metrics":"یازده متریک زنده","How Resource Sentinel protects your uptime":"نگهبان منابع چطور از پایداری سرور محافظت می‌کند","Collect":"جمع‌آوری","Evaluate":"ارزیابی","Notify":"اعلان","Recover":"بازیابی","All alerts":"همه هشدارها","All severities":"همه شدت‌ها","Open only":"فقط بازها","Resolved":"حل‌شده","Resolved only":"فقط حل‌شده‌ها","Swap used":"سواپ استفاده‌شده","Load 1m":"بار ۱ دقیقه","Load 5m":"بار ۵ دقیقه","Process count":"تعداد پردازش‌ها","Temperature":"دما","Download rate":"سرعت دانلود","Upload rate":"سرعت آپلود","Run test":"اجرای تست","Clear history":"پاک‌کردن تاریخچه","Clear alerts":"پاک‌کردن هشدارها","CLEAR ALERTS":"پاک‌کردن هشدارها","Rule updated":"قانون به‌روزرسانی شد","Rule deleted":"قانون حذف شد","Sample failed":"نمونه‌گیری ناموفق بود","Health error":"خطای وضعیت سلامت","API Core":"هسته API","ApiCore":"هسته API","WEVPSApiCore":"هسته API آپیرا","REST API gateway for the whole server: system metrics & disks & packages, processes (signals/open files), systemd (reload/mask/failed), terminal, files (checksum/symlink), GNU screen sessions, docker (inspect/pause/pull/prune), network, ufw + fail2ban, git, user management and cron — secured by scoped, rate-limited, expiring API keys with a live dashboard panel and interactive documentation.":"درگاه REST API برای مدیریت کامل سرور؛ شامل سیستم، پردازش‌ها، systemd، ترمینال، فایل‌ها، Screen، Docker، شبکه، UFW، Fail2ban، Git، کاربران و Cron با کلیدهای API محدودشده و مستندات تعاملی.","API Keys":"کلیدهای API","API keys":"کلیدهای API","Issued keys":"کلیدهای صادرشده","Active keys":"کلیدهای فعال","Total keys":"کل کلیدها","Create key":"ساخت کلید","KEY NAME":"نام کلید","SCOPES":"سطوح دسترسی","Scopes":"سطوح دسترسی","EXPIRES AFTER":"انقضا پس از","Requests":"درخواست‌ها","Rate":"نرخ","Last used":"آخرین استفاده","Prefix":"پیشوند","Copy key":"کپی کلید","Revoke key":"لغو کلید","Key revoked":"کلید لغو شد","Key enabled":"کلید فعال شد","Key disabled":"کلید غیرفعال شد","Documentation":"مستندات","Search endpoints, paths, scopes...":"جست‌وجوی Endpoint، مسیر و Scope...","Send request":"ارسال درخواست","JSON BODY":"بدنه JSON","API BASE URL":"آدرس پایه API","Copy as cURL":"کپی به‌صورت cURL","Live request":"درخواست زنده","Services (systemd)":"سرویس‌ها (systemd)","Files":"فایل‌ها","Docker":"Docker","Firewall (ufw)":"فایروال (UFW)","Fail2ban":"Fail2ban","Users":"کاربران","Git":"Git","Scheduled tasks (cron)":"وظایف زمان‌بندی (Cron)","Audit":"گزارش ممیزی","Audit trail":"گزارش عملیات","Activity":"فعالیت","Activity log":"گزارش فعالیت","History":"تاریخچه","Preferences":"تنظیمات","Description":"توضیحات","Details":"جزئیات","Info":"اطلاعات","Close":"بستن","Save":"ذخیره","Send":"ارسال","Delete":"حذف","Remove":"حذف","Create":"ساخت","Add":"افزودن","Apply safely":"اعمال امن","Copy URL":"کپی آدرس","Click to copy":"برای کپی بزنید","Copy failed":"کپی ناموفق بود","Copied!":"کپی شد!","Not found":"پیدا نشد","No activity yet":"هنوز فعالیتی ثبت نشده","No alerts recorded":"هشداری ثبت نشده","No API keys yet":"هنوز کلید API ساخته نشده","No containers running":"کانتینر در حال اجرایی وجود ندارد","No repositories tracked":"مخزنی اضافه نشده","No screen sessions yet":"هنوز نشست Screen وجود ندارد","No scheduled tasks yet":"هنوز وظیفه زمان‌بندی‌شده‌ای وجود ندارد","No watchers yet":"هنوز ناظری وجود ندارد","All caught up":"همه‌چیز به‌روز است","Unknown":"نامشخص","Open navigation menu":"بازکردن منوی ناوبری","Open menu":"بازکردن منو","Refresh current page":"تازه‌سازی صفحه فعلی","Search":"جست‌وجو","Search keys...":"جست‌وجوی کلیدها...","Search rules… (Ctrl+K)":"جست‌وجوی قوانین… (Ctrl+K)","Search containers and repos… (Ctrl+K)":"جست‌وجوی کانتینرها و مخزن‌ها… (Ctrl+K)","Loading keys":"در حال بارگذاری کلیدها","Loading containers":"در حال بارگذاری کانتینرها","Loading repositories":"در حال بارگذاری مخزن‌ها","Loading sessions":"در حال بارگذاری نشست‌ها","Loading settings":"در حال بارگذاری تنظیمات","Loading activity":"در حال بارگذاری فعالیت","Loading alert history":"در حال بارگذاری تاریخچه هشدار","Loading backup history":"در حال بارگذاری تاریخچه بکاپ","Loading recent activity":"در حال بارگذاری فعالیت‌های اخیر","Loading destination settings":"در حال بارگذاری تنظیمات مقصد","Good morning":"صبح بخیر","Good evening":"عصر بخیر","Good night":"شب بخیر","Server Admin":"مدیر سرور","Administrator":"مدیر","Architecture":"معماری","Kernel":"کرنل","Hostname":"نام میزبان","Startup":"راه‌اندازی","Time zone":"منطقه زمانی","Storage":"فضای ذخیره‌سازی","Memory":"حافظه","Swap":"سواپ","Firewall rule":"قانون فایروال","Action needed":"نیازمند اقدام","Extra care":"نیازمند توجه بیشتر","Not checked.":"بررسی نشده.","Last restart":"آخرین راه‌اندازی مجدد","Server uptime":"مدت روشن بودن سرور","Auto restart":"راه‌اندازی مجدد خودکار","0 items":"۰ مورد","03:00 AM":"۰۳:۰۰","ARP / NDP neighbors":"همسایه‌های ARP / NDP","About this extension":"درباره این افزونه","Apira VPS Installer":"نصب‌کننده Apira VPS","Apira VPS agent":"عامل Apira VPS","Apira VPS tools center":"مرکز ابزارهای Apira VPS","Archive format":"فرمت آرشیو","Are you sure you want to continue?":"مطمئن هستید که می‌خواهید ادامه دهید؟","Automatic diagnosis":"تشخیص خودکار","Automatic rollback":"بازگشت خودکار","Automation":"اتوماسیون","Backups running now":"بکاپ‌های در حال اجرا","Backups you can verify, protect and recover with confidence.":"بکاپ‌هایی قابل بررسی، محافظت و بازیابی مطمئن.","Binding":"آدرس اتصال","Blocklist checks":"بررسی فهرست‌های مسدودسازی","Browse catalog":"مرور فهرست","Building recommendations...":"در حال ساخت پیشنهادها...","Built by":"ساخته‌شده توسط","Built by Apira VPS":"ساخته‌شده توسط Apira VPS","Built for dependable recovery":"ساخته‌شده برای بازیابی مطمئن","Center":"مرکز","Checks common DNS-based abuse lists":"بررسی فهرست‌های رایج سوءاستفاده مبتنی بر DNS","Common routing, resolver and packet checks":"بررسی‌های رایج مسیر‌یابی، DNS و بسته‌ها","Connect a delivery channel for automated backups.":"یک کانال ارسال برای بکاپ‌های خودکار متصل کنید.","Connect external servers and notification channels.":"سرورهای خارجی و کانال‌های اعلان را متصل کنید.","Created":"ساخته‌شده","Deliver":"ارسال","Delivery methods":"روش‌های ارسال","Destination configuration":"تنظیمات مقصد","Detecting capabilities":"در حال شناسایی قابلیت‌ها","Exposure":"سطح دسترسی","Flexible delivery":"ارسال انعطاف‌پذیر","Fri":"جمعه","Generate a checksum and record the result for auditing.":"Checksum بسازید و نتیجه را برای بررسی ثبت کنید.","Generated backups":"بکاپ‌های ساخته‌شده","Good afternoon":"عصر بخیر","Hardware and software":"سخت‌افزار و نرم‌افزار","IP intelligence":"اطلاعات IP","IPv4 / IPv6 routing":"مسیر‌یابی IPv4 / IPv6","IPv4 DNSBL coverage":"پوشش DNSBL برای IPv4","Idle":"بیکار","Inspect":"بررسی","Inspecting exposure":"در حال بررسی سطح دسترسی","Job":"وظیفه","Library":"کتابخانه","Listening sockets":"سوکت‌های در حال گوش‌دادن","Long-press inside the box, choose Paste, then tap Send.":"داخل کادر نگه دارید، Paste را انتخاب کنید و سپس Send را بزنید.","MTU discovery":"شناسایی MTU","Maintained by":"نگهداری‌شده توسط","Mon":"دوشنبه","Not checked yet":"هنوز بررسی نشده","Official announcement feed":"اعلان‌های رسمی","Operations lab":"آزمایشگاه عملیات","Product information":"اطلاعات محصول","Quick repairs":"رفع سریع مشکلات","Recently discovered devices and gateways":"دستگاه‌ها و Gatewayهای اخیراً شناسایی‌شده","Reports & snapshots":"گزارش‌ها و Snapshotها","Resolver configuration":"تنظیمات DNS Resolver","Review before applying":"قبل از اعمال بررسی کنید","Routing table":"جدول مسیر‌یابی","Runtime configuration":"تنظیمات زمان اجرا","SMTP filtering":"فیلتر SMTP","Safe-change mode:":"حالت تغییر امن:","Sat":"شنبه","Scheduler":"زمان‌بند","Securely retrieving your saved destination configuration.":"در حال دریافت امن تنظیمات ذخیره‌شده مقصد.","Send only to destinations you explicitly configure.":"فقط به مقصدهایی ارسال می‌شود که خودتان مشخص کرده‌اید.","Successful backups":"بکاپ‌های موفق","Sun":"یکشنبه","TAR.GZ + SHA-256":"TAR.GZ + SHA-256","This is a reputation signal, not a universal “blocked IP” detector. Websites use independent policies, regional filters, rate limits and private blocklists.":"این فقط یک نشانه از اعتبار IP است و تشخیص قطعی مسدودبودن نیست. سایت‌ها سیاست‌ها، فیلترهای منطقه‌ای، محدودیت نرخ و فهرست‌های خصوصی خودشان را دارند.","Thu":"پنجشنبه","Total backups":"کل بکاپ‌ها","Total traffic":"کل ترافیک","Tue":"سه‌شنبه","Updating every 3 seconds":"به‌روزرسانی هر ۳ ثانیه","Verified archives":"آرشیوهای تأییدشده","Virtualization":"مجازی‌سازی","We":"ما","WebSocket":"WebSocket","Wed":"چهارشنبه","Workspace":"فضای کاری","detecting...":"در حال شناسایی...","— free":"— آزاد","— used":"— استفاده‌شده","Authorization: Bearer <your-key>":"Authorization: Bearer <کلید-شما>","Denied | last 24h":"ردشده | ۲۴ ساعت اخیر","Developer reference":"مرجع توسعه‌دهنده","Expires":"انقضا","FULL URL":"آدرس کامل","Go":"Go","Header 1":"هدر ۱","Header 2":"هدر ۲","I saved it":"ذخیره کردم","JavaScript":"JavaScript","Mounted filesystems":"فایل‌سیستم‌های Mount‌شده","Never expires":"بدون انقضا","Python":"Python","REST for everything":"REST برای همه‌چیز","Received":"دریافت‌شده","Response appears here.":"پاسخ اینجا نمایش داده می‌شود.","Sent":"ارسال‌شده","Since boot |":"از زمان روشن‌شدن |","X-API-Key: <your-key>":"X-API-Key: <کلید-شما>","cURL":"cURL","or":"یا","rates pending...":"در انتظار محاسبه نرخ...","total -":"مجموع -","30 seconds":"۳۰ ثانیه","Built for proactive operations":"ساخته‌شده برای مدیریت پیشگیرانه","Channel configuration":"تنظیمات کانال","Choose a supported delivery provider.":"یک روش ارسال پشتیبانی‌شده انتخاب کنید.","Closed":"بسته","Every triggered threshold breach with its peak value and delivery results.":"هر عبور از آستانه همراه با بیشترین مقدار و نتیجه ارسال ثبت می‌شود.","Fire immediately":"هشدار فوری","Greater than (>)":"بزرگ‌تر از (>)","Last 24 hours":"۲۴ ساعت اخیر","Last 6 hours":"۶ ساعت اخیر","Last hour":"ساعت اخیر","Less than (<)":"کوچک‌تر از (<)","MUST STAY BREACHED FOR":"مدت ماندن خارج از محدوده","Notification channels":"کانال‌های اعلان","Opened":"باز","RE-NOTIFY EVERY (COOLDOWN)":"ارسال دوباره پس از (Cooldown)","RECOVERY NOTICE":"اعلان بازیابی","Retrieving triggered incidents from the sentinel database.":"در حال دریافت رخدادهای هشدار از پایگاه داده.","SMTP using STARTTLS or implicit TLS.":"SMTP با STARTTLS یا TLS مستقیم.","Securely retrieving your saved configuration.":"در حال دریافت امن تنظیمات ذخیره‌شده.","Send a resolved message":"ارسال پیام رفع‌شدن","Sentinel":"نگهبان","Watch everything":"مانیتور همه‌چیز","psutil sampling":"نمونه‌گیری psutil","Apira VPS OpsDeck":"مرکز عملیات Apira VPS","Apira VPS OpsDeck — Docker, Git & Cron operations":"مرکز عملیات Apira VPS — مدیریت Docker، Git و Cron","Audit trail of the last 200 operations":"گزارش ۲۰۰ عملیات اخیر","Automatic rollback if a downgrade is detected":"بازگشت خودکار در صورت تشخیص Downgrade","COMMAND":"دستور","COMMENT (OPTIONAL)":"توضیح (اختیاری)","CRON EXPRESSION":"عبارت Cron","Command":"دستور","Command every stack":"دستور برای هر Stack","Cron":"Cron","Cron line:":"خط Cron:","Event":"رویداد","Everything OpsDeck can do":"تمام قابلیت‌های مرکز عملیات","Executed on demand":"اجرا به‌صورت دستی","FIRST COMMAND (OPTIONAL)":"اولین دستور (اختیاری)","Five fields: minute · hour · day-of-month · month · day-of-week":"پنج بخش: دقیقه · ساعت · روز ماه · ماه · روز هفته","Head":"ابتدای فایل","Human-readable crontab editor":"ویرایشگر خوانای Crontab","Last 100 lines":"۱۰۰ خط آخر","Last 1000 lines":"۱۰۰۰ خط آخر","Last 300 lines":"۳۰۰ خط آخر","Last 5000 lines":"۵۰۰۰ خط آخر","Level":"سطح","List dir":"نمایش پوشه","Manage":"مدیریت","Never miss a release":"هیچ نسخه جدیدی را از دست ندهید","Operations":"عملیات","Output appears here.":"خروجی اینجا نمایش داده می‌شود.","Querying the Docker engine for running workloads.":"در حال بررسی Docker برای Workloadهای در حال اجرا.","Quick:":"سریع:","Read the buffer incl. scrollback per window":"خواندن Buffer و Scrollback هر پنجره","Registry cache":"کش Registry","Release tracking":"پیگیری نسخه‌ها","Reload crontab":"بارگذاری مجدد Crontab","Retrieving the audit trail.":"در حال دریافت گزارش عملیات.","Retrieving your saved toolchain configuration.":"در حال دریافت تنظیمات ذخیره‌شده ابزارها.","SCROLLBACK":"تاریخچه ترمینال","Strict argument validation everywhere":"اعتبارسنجی سخت‌گیرانه ورودی‌ها در همه‌جا","Tag":"تگ","Text is injected with":"متن با این روش وارد می‌شود","Track GitHub releases of up to 24 tools":"پیگیری Releaseهای GitHub تا ۲۴ ابزار","Tune and audit":"تنظیم و بررسی","Up":"بالا","WINDOW":"پنجره","detached":"جداشده","fnmatch pattern against release assets, e.g. *linux-amd64*, *.tar.gz, mytool_*_linux_64-bit. Leave empty to require an exact single asset.":"الگوی fnmatch برای فایل‌های Release؛ مثل *linux-amd64* یا *.tar.gz. برای انتخاب دقیق یک فایل، خالی بگذارید.","git diff HEAD":"git diff HEAD","screen -X stuff":"screen -X stuff","Actions":"عملیات","Apira VPS Control Center":"مرکز کنترل Apira VPS","Apira VPS updates":"به‌روزرسانی‌های Apira VPS","CPU, memory and network activity":"فعالیت CPU، حافظه و شبکه","Check all updates":"بررسی همه به‌روزرسانی‌ها","Checking package updates":"در حال بررسی به‌روزرسانی بسته‌ها","Checking your server...":"در حال بررسی سرور شما...","Confirm action":"تأیید عملیات","Connecting to the official announcement feed.":"در حال اتصال به فید رسمی اطلاعیه‌ها.","Control":"کنترل","Copy information":"کپی اطلاعات","Critical services":"سرویس‌های حیاتی","Detected hardware, network and operating system":"سخت‌افزار، شبکه و سیستم‌عامل شناسایی‌شده","Detecting firewall policy":"در حال شناسایی سیاست فایروال","Detecting network listeners":"در حال شناسایی سرویس‌های شبکه","Infrastructure health":"سلامت زیرساخت","Install, update and open additional server management tools.":"ابزارهای تکمیلی مدیریت سرور را نصب، به‌روزرسانی یا باز کنید.","Installed services":"سرویس‌های نصب‌شده","Latest system events":"آخرین رویدادهای سیستم","Live monitoring":"مانیتورینگ زنده","Live monitoring active":"مانیتورینگ زنده فعال است","Live resource usage":"مصرف زنده منابع","Live throughput":"نرخ انتقال زنده","Loading notifications...":"در حال بارگذاری اعلان‌ها...","Network traffic since boot":"ترافیک شبکه از زمان روشن‌شدن","News, maintenance notices and important updates from Apira VPS.":"اخبار، اطلاعیه‌های نگهداری و به‌روزرسانی‌های مهم Apira VPS.","Operating system":"سیستم‌عامل","Overall server health score":"امتیاز کلی سلامت سرور","PID / User":"PID / کاربر","Pending updates":"به‌روزرسانی‌های در انتظار","Port":"پورت","Primary interface":"رابط اصلی شبکه","Process":"پردازش","Processes currently consuming the most resources":"پردازش‌هایی که اکنون بیشترین منابع را مصرف می‌کنند","Real-time utilization of your server hardware and network.":"مصرف لحظه‌ای سخت‌افزار و شبکه سرور شما.","Recent activity":"فعالیت‌های اخیر","Refresh notifications":"تازه‌سازی اعلان‌ها","Resource Monitor":"مانیتور منابع","Resource monitor":"مانیتور منابع","Restart Apira VPS Control":"راه‌اندازی مجدد کنترل Apira VPS","Restart active services":"راه‌اندازی مجدد سرویس‌های فعال","Restart policy":"سیاست راه‌اندازی مجدد","Reviewing authentication":"در حال بررسی احراز هویت","Reviewing firewall, SSH, updates, access attempts and exposed network services.":"در حال بررسی فایروال، SSH، به‌روزرسانی‌ها، تلاش‌های دسترسی و سرویس‌های در معرض شبکه.","Scanning ports...":"در حال اسکن پورت‌ها...","Security guide":"راهنمای امنیت","Security scan in progress":"بررسی امنیتی در حال انجام است","Security status":"وضعیت امنیت","Server is connected":"سرور متصل است","Server overview":"نمای کلی سرور","Server protection":"محافظت از سرور","Server specifications":"مشخصات سرور","Service manager":"مدیریت سرویس‌ها","Showing the top 100 of all installed services in a stable priority order":"نمایش ۱۰۰ سرویس برتر نصب‌شده با ترتیب اولویت پایدار","Single server center":"مرکز یکپارچه مدیریت سرور","Storage usage":"مصرف فضای ذخیره‌سازی","Synced directly from the Apira VPS GitHub repository.":"مستقیماً با مخزن GitHub پروژه Apira VPS همگام شده است.","System Administrator":"مدیر سیستم","System Information":"اطلاعات سیستم","System information":"اطلاعات سیستم","System services":"سرویس‌های سیستم","System uptime":"مدت روشن‌بودن سیستم","Technical information about this server and operating system.":"اطلاعات فنی این سرور و سیستم‌عامل.","This action affects the current server.":"این عملیات روی همین سرور اعمال می‌شود.","Top 100 installed services ordered by state, startup mode and real resource usage.":"۱۰۰ سرویس نصب‌شده برتر بر اساس وضعیت، حالت راه‌اندازی و مصرف واقعی منابع مرتب شده‌اند.","Top processes":"پردازش‌های برتر","User":"کاربر","Your server is online and all critical services are operational.":"سرور آنلاین است و همه سرویس‌های حیاتی در حال کار هستند.","· cumulative transfer and live throughput":"· انتقال تجمعی و نرخ انتقال زنده","Built by Apira VPS · Version 1.0.0":"ساخته‌شده توسط Apira VPS · نسخه 1.0.0","File Manager · Apira VPS":"مدیریت فایل · Apira VPS","This folder is empty":"این پوشه خالی است","Upload a file or create a new folder.":"یک فایل آپلود کنید یا پوشه جدید بسازید.","! Copy this key now - it will never be shown again.":"! این کلید را همین حالا کپی کنید؛ دیگر نمایش داده نخواهد شد.","30 days":"۳۰ روز","365 days":"۳۶۵ روز","7 days":"۷ روز","90 days":"۹۰ روز","Access control":"کنترل دسترسی","Apira VPS ApiCore - REST gateway":"Apira VPS ApiCore - درگاه REST","Authenticate with a bearer key and call any endpoint below. Responses are always JSON envelopes:":"با Bearer Key احراز هویت کنید و هر Endpoint زیر را فراخوانی کنید. پاسخ‌ها همیشه در قالب JSON هستند:","Click a group header to collapse it":"برای جمع‌کردن هر گروه روی سربرگ آن بزنید","Create API key":"ساخت کلید API","Create an API key":"ساخت یک کلید API","Every server capability exposed as a versioned JSON endpoint - with live try-it requests signed by your own keys.":"تمام قابلیت‌های سرور به‌صورت Endpointهای نسخه‌بندی‌شده JSON ارائه می‌شوند و درخواست‌های آزمایشی زنده با کلیدهای خودتان امضا می‌شوند.","Issue scoped keys for external tools and automations. Keys are stored as SHA-256 hashes - the full value is visible only once at creation.":"برای ابزارها و اتوماسیون‌های خارجی کلیدهای محدود به Scope بسازید. کلیدها به‌صورت هش SHA-256 ذخیره می‌شوند و مقدار کامل فقط یک بار هنگام ساخت نمایش داده می‌شود.","Latest audited events":"آخرین رویدادهای ثبت‌شده در Audit","Live view of host resources and gateway activity - CPU, memory, disks and the latest audited events, refreshed every few seconds.":"نمای زنده منابع میزبان و فعالیت درگاه؛ شامل CPU، حافظه، دیسک‌ها و آخرین رویدادهای Audit که هر چند ثانیه تازه می‌شوند.","Loading disks":"در حال بارگذاری دیسک‌ها","Network counters":"شمارنده‌های شبکه","Nothing is enabled by default - pick exactly the modules this key may call.":"هیچ دسترسی‌ای به‌صورت پیش‌فرض فعال نیست؛ دقیقاً ماژول‌هایی را انتخاب کنید که این کلید اجازه استفاده از آن‌ها را دارد.","One gateway for the whole server.":"یک درگاه برای کل سرور.","RATE LIMIT (REQUESTS/MINUTE)":"محدودیت نرخ (درخواست در دقیقه)","REST documentation":"مستندات REST","Recent gateway activity":"فعالیت اخیر درگاه","Requests | last 24h":"درخواست‌ها | ۲۴ ساعت اخیر","Revoking a key blocks it instantly across all clients":"لغو یک کلید، دسترسی آن را فوراً برای همه کلاینت‌ها قطع می‌کند","Same request in your language":"همان درخواست به زبان شما","Stored only in this browser's sessionStorage for the session.":"فقط برای همین نشست در sessionStorage مرورگر ذخیره می‌شود.","This action cannot be undone.":"این عملیات قابل بازگشت نیست.","cores - | load -":"هسته‌ها - | بار -","A local-first network toolbox for server operators. It combines live interface visibility, service reachability, safe diagnostics, protected network configuration and public-IP reputation signals in one responsive workspace.":"یک جعبه‌ابزار شبکه با تمرکز بر خود سرور برای مدیران؛ نمایش زنده رابط‌ها، دسترسی سرویس‌ها، عیب‌یابی امن، تغییرات محافظت‌شده شبکه و اعتبار IP عمومی را در یک محیط یکپارچه ارائه می‌کند.","ASN, ISP, location and reverse DNS":"ASN، سرویس‌دهنده اینترنت، موقعیت و Reverse DNS","Active processes":"پردازش‌های فعال","Active sockets":"سوکت‌های فعال","Add or remove IP":"افزودن یا حذف IP","Add or remove a route":"افزودن یا حذف Route","Addresses currently assigned by the Linux kernel":"آدرس‌هایی که اکنون توسط کرنل لینوکس اختصاص داده شده‌اند","Addresses, speed and transfer counters":"آدرس‌ها، سرعت و شمارنده‌های انتقال","Apira VPS Network diagnostics ready.\\nEnter a public host and select a test.":"ابزار عیب‌یابی شبکه Apira VPS آماده است.\\nیک میزبان عمومی وارد کنید و تست را انتخاب کنید.","Apira VPS Network extension":"افزونه شبکه Apira VPS","Authenticated session":"نشست احرازهویت‌شده","Clear failed neighbors":"پاک‌کردن Neighborهای ناموفق","Cloudflare or installed Speedtest":"Cloudflare یا Speedtest نصب‌شده","Concurrent DNS, TCP and HTTP tests from this server":"تست‌های همزمان DNS، TCP و HTTP از همین سرور","Confirm connectivity":"تأیید اتصال","Create protected snapshot":"ساخت Snapshot محافظت‌شده","Current throughput calculated in your browser":"نرخ انتقال فعلی که در مرورگر محاسبه شده است","Detected public IP":"IP عمومی شناسایی‌شده","Detecting manager":"در حال شناسایی مدیر شبکه","Download JSON report":"دانلود گزارش JSON","Download sample":"دانلود نمونه","Export support data or preserve the current kernel state":"خروجی گرفتن از داده‌های پشتیبانی یا ذخیره وضعیت فعلی کرنل","Find a non-fragmenting public path size":"پیدا کردن اندازه مسیر عمومی بدون Fragment شدن","Flush DNS cache":"پاک‌کردن کش DNS","Global service reachability":"دسترسی‌پذیری سرویس‌های جهانی","Inspect a public hostname or address safely":"بررسی امن یک Hostname یا آدرس عمومی","Interfaces online":"رابط‌های آنلاین","Keep change":"نگه‌داشتن تغییر","Kernel routes across all tables":"Routeهای کرنل در همه جدول‌ها","Live interface traffic":"ترافیک زنده رابط شبکه","Live network health and interface statistics":"سلامت زنده شبکه و آمار رابط‌ها","Loading connections":"در حال بارگذاری اتصال‌ها","Loading interfaces":"در حال بارگذاری رابط‌ها","Low-risk recovery actions":"اقدام‌های بازیابی کم‌خطر","MTR path loss":"افت مسیر MTR","Manage runtime addresses, routes and link state with automatic rollback":"مدیریت آدرس‌ها، Routeها و وضعیت Link با بازگشت خودکار در صورت مشکل","Network backend":"بک‌اند شبکه","Network configuration":"تنظیمات شبکه","Network diagnostics":"عیب‌یابی شبکه","Network health":"سلامت شبکه","Network intelligence":"اطلاعات هوشمند شبکه","Network interfaces":"رابط‌های شبکه","Network manager":"مدیر شبکه","Network overview":"نمای کلی شبکه","No sample yet.":"هنوز نمونه‌ای ثبت نشده است.","Outbound address":"آدرس خروجی","Performance, security exposure, health analysis and portable reports":"عملکرد، سطح در معرض بودن امنیتی، تحلیل سلامت و گزارش‌های قابل‌انتقال","Ping":"پینگ","Ports & firewall":"پورت‌ها و فایروال","Ports, firewall & neighbors":"پورت‌ها، فایروال و Neighborها","Processes accepting inbound connections":"پردازش‌هایی که اتصال ورودی می‌پذیرند","Processes ranked by network connections":"پردازش‌ها بر اساس تعداد اتصال‌های شبکه","Protected network change":"تغییر محافظت‌شده شبکه","Protected runtime port access":"دسترسی محافظت‌شده به پورت در زمان اجرا","Public IP reputation":"اعتبار IP عمومی","Refresh health":"تازه‌سازی سلامت","Remove address":"حذف آدرس","Restricted to this server's addresses":"محدود به آدرس‌های همین سرور","Review change":"بررسی تغییر","Review firewall change":"بررسی تغییر فایروال","Run all tests":"اجرای همه تست‌ها","Run automatic analysis":"اجرای تحلیل خودکار","Run speed test":"اجرای تست سرعت","Run the tests to evaluate outbound connectivity. A failed test can mean filtering, routing trouble, DNS failure, or a remote outage.":"برای ارزیابی اتصال خروجی تست‌ها را اجرا کنید. شکست تست می‌تواند به معنی فیلترینگ، مشکل Route، خطای DNS یا قطعی سرویس مقصد باشد.","SSH and control-panel ports are protected from closure.":"پورت‌های SSH و پنل کنترل در برابر بسته‌شدن محافظت می‌شوند.","Self port scanner":"اسکنر پورت خود سرور","Snapshots are stored locally with owner-only permissions. Restore stays manual to avoid overwriting distribution-specific persistent configuration.":"Snapshotها به‌صورت محلی و فقط با دسترسی مالک ذخیره می‌شوند. بازیابی عمداً دستی است تا تنظیمات پایدار مخصوص توزیع بازنویسی نشوند.","Start a check to view results.":"برای دیدن نتیجه یک بررسی را شروع کنید.","Start live monitor":"شروع مانیتور زنده","Start monitoring to view live rates.":"برای دیدن نرخ‌های زنده مانیتورینگ را شروع کنید.","TCP connection":"اتصال TCP","Understand what is exposed and who is visible on the local network":"ببینید چه چیزهایی در معرض شبکه هستند و چه دستگاه‌هایی در شبکه محلی دیده می‌شوند","Version":"نسخه","Version 1.0.0":"نسخه 1.0.0","Your connection may briefly drop. If you cannot confirm within 90 seconds, Apira VPS Network automatically rolls this change back.":"ممکن است اتصال شما برای مدت کوتاهی قطع شود. اگر طی ۹۰ ثانیه نتوانید اتصال را تأیید کنید، Apira VPS Network تغییر را خودکار برمی‌گرداند.","every change is temporary for 90 seconds. Confirm connectivity after applying or the server automatically restores the previous state.":"هر تغییر تا ۹۰ ثانیه موقت است. بعد از اعمال، اتصال را تأیید کنید؛ در غیر این صورت سرور وضعیت قبلی را خودکار بازیابی می‌کند.","1 hour":"۱ ساعت","1 minute":"۱ دقیقه","12 hours":"۱۲ ساعت","15 minutes":"۱۵ دقیقه","2 minutes":"۲ دقیقه","24 hours":"۲۴ ساعت","3 hours":"۳ ساعت","30 minutes":"۳۰ دقیقه","5 minutes":"۵ دقیقه","A clear path from metric to message":"مسیر روشن از متریک تا اعلان","Action":"عملیات","Add notification channel":"افزودن کانال اعلان","Alerts fire only after a breach persists for the configured duration, with per-rule cooldowns that stop notification storms.":"هشدار فقط وقتی فعال می‌شود که عبور از آستانه به مدت تنظیم‌شده ادامه داشته باشد؛ Cooldown هر قانون هم از ارسال پشت‌سرهم اعلان جلوگیری می‌کند.","All statuses":"همه وضعیت‌ها","Apira VPS Resource Sentinel":"نگهبان منابع Apira VPS","CPU, RAM, swap, per-mount disk usage, disk read/write throughput, download/upload traffic, load average, thermal sensors and process count.":"CPU، RAM، Swap، مصرف دیسک هر Mount، سرعت خواندن/نوشتن دیسک، ترافیک دانلود/آپلود، Load Average، حسگرهای دما و تعداد پردازش‌ها.","CPU, memory and swap over time":"روند CPU، حافظه و Swap در طول زمان","Checking recent notifications…":"در حال بررسی اعلان‌های اخیر…","Checking the alert engine for open incidents.":"در حال بررسی موتور هشدار برای رخدادهای باز.","Close incidents and confirm recovery when values normalize.":"وقتی مقادیر عادی شدند رخدادها را ببندید و بازیابی را تأیید کنید.","Collecting buffered samples from the monitoring engine.":"در حال جمع‌آوری نمونه‌های بافرشده از موتور مانیتورینگ.","Compare each enabled rule against the freshest sample.":"هر قانون فعال با جدیدترین نمونه مقایسه می‌شود.","Configure monitoring cadence and secure delivery channels.":"فاصله مانیتورینگ و کانال‌های امن ارسال اعلان را تنظیم کنید.","Connect Telegram or email so threshold breaches reach you instantly.":"تلگرام یا ایمیل را وصل کنید تا عبور از آستانه فوراً به شما اطلاع داده شود.","Create alert rule":"ساخت قانون هشدار","Create an alert rule":"ساخت یک قانون هشدار","Credentials stay server-side and are never returned by the API":"اطلاعات ورود روی سرور می‌ماند و هرگز از API برگردانده نمی‌شود","Define the metric, condition, notifications and cooldown behavior.":"متریک، شرط، اعلان‌ها و رفتار Cooldown را مشخص کنید.","Define thresholds for CPU, memory, disk, network, load, temperature and processes. Sustained breaches raise alerts through your channels.":"برای CPU، حافظه، دیسک، شبکه، Load، دما و پردازش‌ها آستانه تعریف کنید. عبور مداوم از آستانه از طریق کانال‌های شما هشدار ایجاد می‌کند.","Disk usage (system)":"مصرف دیسک (سیستم)","Email":"ایمیل","Everything about Resource Sentinel, its detection model and how alerts reach you.":"همه‌چیز درباره Resource Sentinel، مدل تشخیص آن و نحوه رسیدن هشدارها به شما.","Incident log":"گزارش رخدادها","Instant bot messages pushed through the official Bot API.":"پیام‌های فوری ربات از طریق Bot API رسمی ارسال می‌شوند.","Know before it breaks — thresholds that watch your server around the clock.":"قبل از خرابی خبردار شوید؛ آستانه‌هایی که شبانه‌روزی سرور را زیر نظر دارند.","Latest alerts and their channel results":"آخرین هشدارها و نتیجه ارسال در کانال‌ها","Latest monitor and delivery events":"آخرین رویدادهای مانیتورینگ و ارسال","Live":"زنده","Live readings refreshed automatically":"خوانش‌های زنده که خودکار تازه می‌شوند","Live server telemetry":"تله‌متری زنده سرور","Loading alerts":"در حال بارگذاری هشدارها","Loading live resource metrics from this server.":"در حال بارگذاری متریک‌های زنده منابع از این سرور.","Loading telemetry":"در حال بارگذاری تله‌متری","Loading timeline":"در حال بارگذاری تایم‌لاین","Manage rules":"مدیریت قوانین","Metric engine":"موتور متریک","Metrics are sampled locally, credentials are encrypted at rest, and nothing leaves the machine except the notifications you explicitly configure.":"متریک‌ها روی خود سرور نمونه‌برداری می‌شوند، اطلاعات ورود در حالت ذخیره رمزگذاری است و به‌جز اعلان‌هایی که خودتان تنظیم می‌کنید چیزی از سرور خارج نمی‌شود.","Monitor":"مانیتور","New alert rule":"قانون هشدار جدید","Notification log":"گزارش اعلان‌ها","Notifies when the metric returns below the threshold.":"وقتی متریک دوباره به زیر آستانه برگردد اطلاع می‌دهد.","Panel authentication, CSRF protection, encrypted credentials and recovery notifications when conditions return to normal.":"احراز هویت پنل، محافظت CSRF، اطلاعات ورود رمزگذاری‌شده و اعلان بازیابی هنگام عادی‌شدن شرایط.","Push formatted alerts to Telegram and email channels.":"هشدارهای قالب‌بندی‌شده را به تلگرام و ایمیل ارسال کنید.","Resource":"منبع","Resource Sentinel samples CPU, memory, swap, disks, network, load, temperature and processes on a fixed cadence, detects sustained breaches, and pushes alerts to Telegram and email with smart cooldowns and recovery notices.":"Resource Sentinel در بازه‌های ثابت از CPU، حافظه، Swap، دیسک‌ها، شبکه، Load، دما و پردازش‌ها نمونه می‌گیرد، عبور پایدار از آستانه را تشخیص می‌دهد و با Cooldown هوشمند و اعلان بازیابی به تلگرام و ایمیل هشدار می‌فرستد.","Resource gauges":"نشانگرهای منابع","Resource timeline":"تایم‌لاین منابع","ResourceSentinel — Server resource monitoring":"ResourceSentinel — مانیتورینگ منابع سرور","Retrieving the latest sentinel events.":"در حال دریافت آخرین رویدادهای Sentinel.","Rule":"قانون","Rules currently breaching thresholds":"قوانینی که اکنون از آستانه عبور کرده‌اند","Sample all resources every few seconds into a rolling buffer.":"هر چند ثانیه از همه منابع نمونه بگیرید و در یک بافر چرخشی نگه دارید.","Save settings":"ذخیره تنظیمات","Sentinel settings":"تنظیمات Sentinel","Your server stays in control.":"کنترل همیشه دست خود سرور شما می‌ماند.","A clear path from source to recovery":"مسیر روشن از منبع تا بازیابی","Add destination":"افزودن مقصد","All destinations":"همه مقصدها","Apira VPS Backup Center":"مرکز بکاپ Apira VPS","Authentication, CSRF protection, encrypted credentials and controlled downloads protect sensitive operations.":"احراز هویت، محافظت CSRF، اطلاعات ورود رمزگذاری‌شده و دانلودهای کنترل‌شده از عملیات حساس محافظت می‌کنند.","Backup":"بکاپ","Backup Center creates real compressed archives, validates every result with SHA-256 and keeps recovery under your control—from automated scheduling to protected restore staging.":"Backup Center آرشیوهای فشرده واقعی می‌سازد، هر خروجی را با SHA-256 اعتبارسنجی می‌کند و کنترل بازیابی را از زمان‌بندی خودکار تا مرحله‌بندی امن Restore در اختیار شما نگه می‌دارد.","Backup activity":"فعالیت بکاپ","BackupCenter — Backup Management":"BackupCenter — مدیریت بکاپ","Checking recent deliveries…":"در حال بررسی ارسال‌های اخیر…","Configure global backup behavior and security defaults.":"رفتار کلی بکاپ و پیش‌فرض‌های امنیتی را تنظیم کنید.","Configure sources, schedules, destinations and retention rules.":"منابع، زمان‌بندی‌ها، مقصدها و قوانین نگهداری را تنظیم کنید.","Configure the source, schedule, destination and retention policy.":"منبع، زمان‌بندی، مقصد و سیاست نگهداری را تنظیم کنید.","Control everything":"کنترل همه‌چیز","Create a new backup job":"ساخت کار بکاپ جدید","Credentials and archive data stay on your server unless you deliberately configure an external delivery destination.":"اطلاعات ورود و داده‌های آرشیو روی سرور شما می‌مانند مگر اینکه خودتان عمداً یک مقصد ارسال خارجی تنظیم کنید.","Delivery status":"وضعیت ارسال","Download securely or extract into protected staging.":"به‌صورت امن دانلود کنید یا در محیط مرحله‌بندی محافظت‌شده Extract کنید.","Every archive receives a SHA-256 checksum, clear status tracking and retention handling you can audit.":"هر آرشیو یک Checksum از نوع SHA-256 می‌گیرد، وضعیت آن شفاف پیگیری می‌شود و مدیریت نگهداری قابل بررسی است.","Everything you need to know about Backup Center, its security model and how your data moves.":"همه‌چیز درباره Backup Center، مدل امنیتی آن و مسیر جابه‌جایی داده‌های شما.","Execution logs":"لاگ‌های اجرا","Export history":"خروجی تاریخچه","Files and folders":"فایل‌ها و پوشه‌ها","How Backup Center protects your data":"Backup Center چگونه از داده‌های شما محافظت می‌کند","Latest backup executions":"آخرین اجراهای بکاپ","Latest successful and failed destination sends":"آخرین ارسال‌های موفق و ناموفق به مقصدها","Loading real backup status from this server.":"در حال بارگذاری وضعیت واقعی بکاپ از این سرور.","Loading storage":"در حال بارگذاری فضای ذخیره‌سازی","Package selected server paths into a compressed archive.":"مسیرهای انتخاب‌شده سرور را در یک آرشیو فشرده بسته‌بندی کنید.","Retrieving archives and recovery points from protected storage.":"در حال دریافت آرشیوها و نقاط بازیابی از فضای ذخیره‌سازی محافظت‌شده.","Retrieving the latest backup events from your server.":"در حال دریافت آخرین رویدادهای بکاپ از سرور.","Review, download and restore all generated backup files.":"همه فایل‌های بکاپ ساخته‌شده را بررسی، دانلود و بازیابی کنید.","Send backups through Telegram, strict-host-key SFTP, protected email or encrypted S3-compatible storage.":"بکاپ‌ها را از طریق تلگرام، SFTP با بررسی سخت‌گیرانه Host Key، ایمیل محافظت‌شده یا فضای S3-compatible رمزگذاری‌شده ارسال کنید.","Showing the most recent backup files":"نمایش جدیدترین فایل‌های بکاپ","Successful and failed backups during this week":"بکاپ‌های موفق و ناموفق در این هفته","System overview":"نمای کلی سیستم","System settings":"تنظیمات سیستم","Your server remains the source of truth.":"سرور شما همیشه مرجع اصلی داده‌ها باقی می‌ماند."};

(() => {
  'use strict';
  const KEY = 'apira_language';
  const SUPPORTED = new Set(['en', 'fa']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = new Set(['SCRIPT','STYLE','CODE','PRE','TEXTAREA','NOSCRIPT']);
  const messages = window.__APIRA_FA_MESSAGES__ || {};
  const queryLang = (() => { try { const v = new URLSearchParams(location.search).get('lang'); return SUPPORTED.has(v) ? v : null; } catch (_) { return null; } })();
  let lang = queryLang || (SUPPORTED.has(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'en');
  if (queryLang) localStorage.setItem(KEY, queryLang);

  const textOriginal = new WeakMap();
  const attrOriginal = new WeakMap();
  const translatedText = new WeakMap();
  const translatedAttr = new WeakMap();
  const patterns = [
    [/^(\d+) items?$/i,'$1 مورد'], [/^(\d+) files?$/i,'$1 فایل'], [/^(\d+) folders?$/i,'$1 پوشه'],
    [/^(\d+) lines?$/i,'$1 خط'], [/^(\d+) seconds?$/i,'$1 ثانیه'], [/^(\d+) minutes?$/i,'$1 دقیقه'],
    [/^(\d+) hours?$/i,'$1 ساعت'], [/^(\d+) days?$/i,'$1 روز'], [/^(\d+) updates?$/i,'$1 به‌روزرسانی'],
    [/^(\d+) rule\(s\)$/i,'$1 قانون'], [/^(\d+) listener\(s\)$/i,'$1 شنونده'], [/^(\d+) publicly bound$/i,'$1 مورد عمومی'],
    [/^(\d+) failed attempt\(s\)$/i,'$1 تلاش ناموفق'], [/^(\d+) security update\(s\)$/i,'$1 به‌روزرسانی امنیتی'],
    [/^Last checked (.+)$/i,'آخرین بررسی: $1'], [/^Last updated (.+)$/i,'آخرین به‌روزرسانی: $1'],
    [/^Version (.+)$/i,'نسخه $1'], [/^Load: (.+)$/i,'بار: $1'], [/^(.+) available$/i,'$1 در دسترس'],
    [/^Port (\d+)$/i,'پورت $1'], [/^Error: (.+)$/i,'خطا: $1'], [/^Failed: (.+)$/i,'ناموفق: $1'],
    [/^Success: (.+)$/i,'موفق: $1'], [/^Loading (.+)$/i,'در حال بارگذاری $1'], [/^Searching (.+)$/i,'در حال جست‌وجوی $1']
  ];

  function spaced(src, out) {
    const a = src.match(/^\s*/)?.[0] || '', b = src.match(/\s*$/)?.[0] || '';
    return a + out + b;
  }
  function tr(src) {
    if (lang !== 'fa' || !src) return src;
    const x = String(src).trim();
    if (!x || !/[A-Za-z]/.test(x)) return src;
    if (messages[x]) return spaced(src, messages[x]);
    for (const [re, out] of patterns) if (re.test(x)) return spaced(src, x.replace(re, out));
    return src;
  }
  function skipText(n) {
    const p = n.parentElement;
    return !p || SKIP.has(p.tagName) || !!p.closest('[data-i18n-skip]');
  }
  function tx(n, external=false) {
    if (skipText(n)) return;
    const now = n.nodeValue || '';
    if (external || !textOriginal.has(n)) textOriginal.set(n, now);
    const next = tr(textOriginal.get(n));
    if (next !== now) { translatedText.set(n, next); n.nodeValue = next; }
  }
  function attrs(el, externalName=null) {
    if (!el?.hasAttribute || el.closest?.('[data-i18n-skip]')) return;
    let originals = attrOriginal.get(el); if (!originals) { originals = {}; attrOriginal.set(el, originals); }
    let translated = translatedAttr.get(el); if (!translated) { translated = {}; translatedAttr.set(el, translated); }
    for (const name of ATTRS) {
      if (!el.hasAttribute(name)) continue;
      const now = el.getAttribute(name) || '';
      if (externalName === name || originals[name] === undefined) originals[name] = now;
      const next = tr(originals[name]);
      if (next !== now) { translated[name] = next; el.setAttribute(name, next); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return tx(root);
    if (![Node.ELEMENT_NODE, Node.DOCUMENT_NODE].includes(root.nodeType)) return;
    if (root.nodeType === Node.ELEMENT_NODE) attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) n.nodeType === Node.TEXT_NODE ? tx(n) : attrs(n);
  }
  function restore() {
    const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE && textOriginal.has(n)) n.nodeValue = textOriginal.get(n);
      if (n.nodeType === Node.ELEMENT_NODE) { const m = attrOriginal.get(n); if (m) for (const [k,v] of Object.entries(m)) n.setAttribute(k,v); }
    }
  }
  function direction() {
    const fa = lang === 'fa';
    document.documentElement.lang = fa ? 'fa' : 'en';
    document.documentElement.dir = fa ? 'rtl' : 'ltr';
    document.body?.classList.toggle('apira-fa', fa);
  }
  function styles() {
    if (document.getElementById('apiraI18nStyle')) return;
    const s=document.createElement('style'); s.id='apiraI18nStyle'; s.textContent=`
      html[dir="rtl"] body{direction:rtl} html[dir="rtl"] input,html[dir="rtl"] textarea,html[dir="rtl"] select{text-align:right}
      html[dir="rtl"] code,html[dir="rtl"] pre,html[dir="rtl"] .mono{direction:ltr;text-align:left}
      html[dir="rtl"] .sidebar,html[dir="rtl"] .modal,html[dir="rtl"] .panel,html[dir="rtl"] .card{text-align:right}
      .apira-language-select{min-width:150px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.75);color:inherit;border-radius:12px;padding:10px 36px 10px 12px;font:inherit}
      html[dir="rtl"] .apira-language-select{padding:10px 12px 10px 36px}
      .apira-language-panel{margin-bottom:18px}.apira-language-panel-head svg{width:22px;height:22px}.apira-language-panel-body{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.apira-language-panel-body .apira-language-select{margin-inline-start:auto}.apira-language-label{font-weight:700}.apira-language-hint{width:100%;font-size:12px;opacity:.68;line-height:1.7}
      .apira-tool-settings-trigger{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;border:1px solid rgba(148,163,184,.28);border-radius:14px;padding:10px 13px;background:rgba(10,14,28,.92);color:#f8fafc;box-shadow:0 12px 34px rgba(0,0,0,.3);font:inherit;cursor:pointer;backdrop-filter:blur(16px)}.apira-tool-settings-trigger svg{width:18px;height:18px}html[dir="rtl"] .apira-tool-settings-trigger{right:auto;left:18px}
      .apira-tool-settings-modal{position:fixed;inset:0;z-index:2147483001;display:none;place-items:center;padding:18px;background:rgba(2,6,23,.68);backdrop-filter:blur(10px)}.apira-tool-settings-modal.show{display:grid}.apira-tool-settings-dialog{width:min(460px,100%);border:1px solid rgba(148,163,184,.22);border-radius:22px;padding:20px;background:#0d1322;color:#f8fafc;box-shadow:0 24px 70px rgba(0,0,0,.48)}.apira-tool-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.apira-tool-settings-head>div{display:grid;gap:5px}.apira-tool-settings-title{font-size:20px}.apira-tool-settings-subtitle,.apira-lang-desc{font-size:13px;opacity:.7;line-height:1.65}.apira-tool-settings-close{border:0;background:transparent;color:inherit;font-size:28px;line-height:1;cursor:pointer}.apira-tool-settings-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:16px;background:rgba(255,255,255,.035)}.apira-tool-settings-row>div{display:grid;gap:4px}
      @media(max-width:640px){.apira-tool-settings-trigger{bottom:12px;right:12px}.apira-tool-settings-trigger span{display:none}html[dir="rtl"] .apira-tool-settings-trigger{right:auto;left:12px}.apira-tool-settings-row{align-items:stretch;flex-direction:column}.apira-language-panel-body{align-items:stretch;flex-direction:column}.apira-language-panel-body .apira-language-select{margin-inline-start:0;width:100%}}`; document.head.appendChild(s);
  }
  function languageSelectMarkup() {
    return '<select class="apira-language-select" aria-label="Language"><option value="en">English</option><option value="fa">فارسی</option></select>';
  }

  function bindLanguageSelect(root) {
    const select = root?.querySelector?.('.apira-language-select');
    if (!select) return;
    select.value = lang;
    select.addEventListener('change', e => setLanguage(e.target.value));
  }

  function injectIntoNativeSettings() {
    const page = document.querySelector('#settings');
    if (!page || document.getElementById('apiraLanguageSetting')) return false;

    const classicPanel = page.querySelector('.settings-panel');
    if (classicPanel) {
      const row = document.createElement('div');
      row.className = 'settings-option apira-language-native';
      row.id = 'apiraLanguageSetting';
      row.dataset.i18nSkip = '1';
      row.innerHTML = '<div class="settings-option-icon"><i data-lucide="languages"></i></div><div class="settings-option-copy"><strong class="apira-lang-title"></strong><span class="apira-lang-desc"></span></div>' + languageSelectMarkup();
      classicPanel.insertBefore(row, classicPanel.firstChild);
      bindLanguageSelect(row);
      return true;
    }

    const card = document.createElement('section');
    card.className = 'panel apira-language-panel';
    card.id = 'apiraLanguageSetting';
    card.dataset.i18nSkip = '1';
    card.innerHTML = '<div class="panel-header apira-language-panel-head"><div><div class="panel-title apira-lang-title"></div><div class="panel-subtitle apira-lang-desc"></div></div><i data-lucide="languages"></i></div><div class="panel-body apira-language-panel-body"><label class="apira-language-label"></label>' + languageSelectMarkup() + '<div class="apira-language-hint"></div></div>';
    const firstPanel = page.querySelector(':scope > .panel');
    if (firstPanel) page.insertBefore(card, firstPanel);
    else page.appendChild(card);
    bindLanguageSelect(card);
    return true;
  }

  function injectStandaloneSettings() {
    if (document.getElementById('apiraToolSettingsButton')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'apiraToolSettingsButton';
    button.className = 'apira-tool-settings-trigger';
    button.dataset.i18nSkip = '1';
    button.innerHTML = '<i data-lucide="settings"></i><span class="apira-tool-settings-label"></span>';

    const modal = document.createElement('div');
    modal.id = 'apiraToolSettingsModal';
    modal.className = 'apira-tool-settings-modal';
    modal.dataset.i18nSkip = '1';
    modal.innerHTML = '<div class="apira-tool-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="apiraToolSettingsTitle"><div class="apira-tool-settings-head"><div><strong id="apiraToolSettingsTitle" class="apira-tool-settings-title"></strong><span class="apira-tool-settings-subtitle"></span></div><button type="button" class="apira-tool-settings-close" aria-label="Close">×</button></div><div class="apira-tool-settings-row"><div><strong class="apira-lang-title"></strong><span class="apira-lang-desc"></span></div>' + languageSelectMarkup() + '</div><div class="apira-language-hint"></div></div>';

    document.body.append(button, modal);
    bindLanguageSelect(modal);
    const close = () => modal.classList.remove('show');
    button.addEventListener('click', () => { modal.classList.add('show'); updateSetting(); });
    modal.querySelector('.apira-tool-settings-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function settings() {
    if (!injectIntoNativeSettings()) injectStandaloneSettings();
    updateSetting();
    window.lucide?.createIcons?.();
  }

  function updateSetting(){
    const fa = lang === 'fa';
    document.querySelectorAll('.apira-lang-title').forEach(el => el.textContent = fa ? 'زبان' : 'Language');
    document.querySelectorAll('.apira-lang-desc').forEach(el => el.textContent = fa ? 'زبان نمایش همین ابزار را انتخاب کنید.' : 'Choose the display language for this tool.');
    document.querySelectorAll('.apira-language-label').forEach(el => el.textContent = fa ? 'زبان رابط کاربری' : 'Interface language');
    document.querySelectorAll('.apira-language-hint').forEach(el => el.textContent = fa ? 'این انتخاب با پنل اصلی و بقیه ابزارهای Apira VPS همگام می‌شود.' : 'This selection stays synchronized with the main panel and other Apira VPS tools.');
    document.querySelectorAll('.apira-tool-settings-label').forEach(el => el.textContent = fa ? 'تنظیمات' : 'Settings');
    document.querySelectorAll('.apira-tool-settings-title').forEach(el => el.textContent = fa ? 'تنظیمات ابزار' : 'Tool settings');
    document.querySelectorAll('.apira-tool-settings-subtitle').forEach(el => el.textContent = fa ? 'تنظیمات نمایش و زبان این ابزار' : 'Display and language preferences for this tool');
    document.querySelectorAll('.apira-language-select').forEach(el => el.value = lang);
  }

  let observer, timer=0; const roots=new Set(), texts=new Set(), changedAttrs=new Map();
  const opts={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS};
  const observe=()=>observer?.observe(document.documentElement,opts);
  function flush(){ timer=0; observer.disconnect(); try{ for(const n of texts)tx(n); for(const [e] of changedAttrs)attrs(e); for(const r of roots)walk(r); } finally{ roots.clear();texts.clear();changedAttrs.clear();observe(); } }
  function schedule(){ if(!timer)timer=setTimeout(flush,80); }
  observer=new MutationObserver(rs=>{ if(lang!=='fa')return; for(const r of rs){ if(r.type==='characterData'){if(r.target.nodeValue===translatedText.get(r.target))continue;textOriginal.set(r.target,r.target.nodeValue);texts.add(r.target)}else if(r.type==='attributes'){const e=r.target,n=r.attributeName;if(e.getAttribute(n)===translatedAttr.get(e)?.[n])continue;let m=attrOriginal.get(e);if(!m){m={};attrOriginal.set(e,m)}m[n]=e.getAttribute(n)||'';changedAttrs.set(e,n)}else for(const n of r.addedNodes)roots.add(n)} if(roots.size||texts.size||changedAttrs.size)schedule(); });

  function setLanguage(v,{persist=true}={}){ if(!SUPPORTED.has(v))v='en'; if(persist)localStorage.setItem(KEY,v); const changed=v!==lang; lang=v; observer.disconnect(); try{direction();lang==='fa'?walk(document.documentElement):restore();updateSetting()}finally{observe()} if(changed)window.dispatchEvent(new CustomEvent('apira-language-changed',{detail:{language:lang}})); }
  function sync(){const v=localStorage.getItem(KEY);if(SUPPORTED.has(v)&&v!==lang)setLanguage(v,{persist:false})}
  function tagToolLink(a){if(!a?.href)return;try{const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(!/^\/(?:filemanager|wevpsnetwork|backupcenter|resourcesentinel|wevpsapicore|wevpsterminal|wevpsinstaller|wevpsopsdeck)\/?/i.test(u.pathname))return;u.searchParams.set('lang',lang);a.href=u.pathname+u.search+u.hash}catch(_){}}
  function boot(){styles();direction();settings();if(lang==='fa')walk(document.documentElement);observe();window.ApiraI18n={setLanguage,getLanguage:()=>lang,translate:tr};window.addEventListener('storage',e=>{if(e.key===KEY&&SUPPORTED.has(e.newValue)&&e.newValue!==lang)setLanguage(e.newValue,{persist:false})});window.addEventListener('pageshow',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});document.addEventListener('click',e=>tagToolLink(e.target.closest?.('a[href]')),true)}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
