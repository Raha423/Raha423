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
