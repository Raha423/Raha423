(() => {
    "use strict";
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const mount = location.pathname === "/" ? "/" : `/${location.pathname.split("/").filter(Boolean)[0]}/`;
    const icons = {
        "key-round": "k", "book-open": "b", menu: "=", "refresh-cw": "r", plus: "+", search: "s",
        activity: "~", "shield-check": "v", "shield-alert": "!", x: "x",
        sparkles: "*", "clipboard-copy": "[]", copy: "[]", send: "->", "send-horizontal": "->",
        "plug-zap": "p", "loader-circle": "@", "layout-dashboard": "#", monitor: "m",
        terminal: ">_", files: "f", docker: "d", network: "n", cron: "%", processes: "%",
        services: "y", audit: "a", clock: "c", "chevron-down": "v", play: ">", "cloud-off": "o",
        shield: "!", users: "u"
    };
    function drawIcons(root = document) {
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
        } else {
            $$("[data-lucide]", root).forEach(i => {
                i.textContent = icons[i.dataset.lucide] || "*";
                i.style.cssText += ";display:inline-grid;place-items:center;font-style:normal;line-height:1";
            });
        }
    }
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
    const date = value => value ? new Date(value * 1000).toLocaleString() : "never";
    const nowSec = () => Math.floor(Date.now() / 1000);
    function agoHuman(ts) {
        if (!ts) return "never";
        const s = Math.max(1, nowSec() - ts);
        if (s < 60) return `${s}s ago`;
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    }
    function fmtUptime(seconds) {
        if (seconds == null) return "-";
        const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600),
              m = Math.floor(seconds % 3600 / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }
    function fmtBytes(bytes, perSec = false) {
        if (bytes == null || isNaN(bytes)) return "-";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let value = Math.abs(Number(bytes)), unit = 0;
        while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
        const text = `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}${perSec ? "/s" : ""}`;
        return bytes < 0 ? `-${text}` : text;
    }
    const fmtNum = n => n == null ? "-" : Number(n).toLocaleString();

    async function api(path, options = {}) {
        const endpoint = path.startsWith("/api/") ? mount + path.slice(1) : path;
        const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", ...options });
        if (response.status === 401) {
            location.href = "/login";
            throw Error("Panel login required");
        }
        if (!(response.headers.get("content-type") || "").includes("application/json"))
            throw Error(`Unexpected response (${response.status})`);
        const data = await response.json();
        if (!response.ok || data.success === false)
            throw Error(data.error?.message || data.message || data.error?.code || "Request failed");
        return data;
    }
    function toast(title, message, type = "success") {
        const item = document.createElement("div");
        item.className = "toast";
        item.innerHTML = `<div class="toast-icon" style="color:${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#22c55e"};background:${type === "success" ? "" : type === "error" ? "rgba(239,68,68,.12)" : "rgba(245,158,11,.12)"}">${type === "success" ? "OK" : "!"}</div><div><div class="toast-title">${esc(title)}</div><div class="toast-message">${esc(message)}</div></div><button class="toast-close">x</button>`;
        $("#toastContainer").appendChild(item);
        const remove = () => item.remove();
        $(".toast-close", item).onclick = remove;
        setTimeout(remove, 5200);
    }

    const sidebar = $("#sidebar"), overlay = $("#mobileOverlay");
    const keyModal = $("#keyModal"), tryModal = $("#tryModal"), confirmModal = $("#confirmModal");

    /* Navigation */

    function navigateTo(id) {
        $$(".page").forEach(p => p.classList.toggle("active", p.id === id));
        $$(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === id));
        sidebar.classList.remove("open"); overlay.classList.remove("show");
        stopDashPolling();
        if (id === "dash") startDashPolling();
        if (id === "keys") { loadKeys(); loadOverview(); }
        if (id === "docs") renderDocs($("#docSearch") ? $("#docSearch").value : "");
    }
    $$(".nav-item[data-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.page));
    $("#menuButton").onclick = () => { sidebar.classList.add("open"); overlay.classList.add("show"); };
    overlay.onclick = () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); };
    $("#refreshButton").onclick = () => navigateTo($(".page.active").id);

    async function copyText(text, button) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            const helper = document.createElement("textarea");
            helper.value = text;
            document.body.appendChild(helper);
            helper.select();
            document.execCommand("copy");
            helper.remove();
        }
        if (button) {
            const old = button.innerHTML;
            button.innerHTML = "Copied!";
            setTimeout(() => { button.innerHTML = old; drawIcons(button); }, 1400);
        } else {
            toast("Copied", "Value copied to clipboard.");
        }
    }

    /* Base URL */

    let baseUrlFull = "";
    function setBaseUrl(full) {
        baseUrlFull = full.replace(/\/$/, "");
        const el = $("#baseUrlCode");
        el.dataset.full = baseUrlFull;
        let shown = full;
        if (full.length > 44) {
            try {
                const parsed = new URL(full);
                shown = full.length > 44 ? `${parsed.host}/...${parsed.pathname.slice(-14)}` : full;
            } catch (_) { shown = `${full.slice(0, 41)}...`; }
        }
        el.textContent = shown;
        el.title = `${full} - click to copy`;
    }

    /* Overview (stats shared by dashboard + keys page) */

    let overviewCache = null;
    async function loadOverview() {
        try {
            const data = await api("/api/overview");
            overviewCache = data;
            applyOverview(data);
        } catch (error) {
            toast("Overview failed", error.message, "error");
        }
    }
    function applyOverview(data) {
        const active = data.counts.keys_active ?? 0, total = data.counts.keys_total ?? 0;
        const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
        set("#statActive", fmtNum(active));
        set("#statTotal", fmtNum(total));
        set("#statRequests", fmtNum(data.counts.requests_24h));
        set("#statDenied", fmtNum(data.counts.denied_24h));
        set("#dashKeys", fmtNum(active));
        set("#dashReq", fmtNum(data.counts.requests_24h));
        set("#dashDenied", fmtNum(data.counts.denied_24h));
        set("#dashUptime", fmtUptime(data.server?.uptime_seconds));
        setBaseUrl(data.base_url.replace(/\/api\/v1$/, "") + "/api/v1");
        renderCurlSample(data.base_url);
        if (data.recent_events) renderFeed(data.recent_events);
    }
    function renderCurlSample(baseUrl) {
        $("#curlSample").textContent =
            `curl -X GET "${baseUrl}/api/v1/system" \\\n` +
            `  -H "Authorization: Bearer wac_xxxxxxxxxxxxxxxx"`;
    }
    function renderFeed(events) {
        const feed = $("#activityFeed");
        if (!feed) return;
        feed.innerHTML = events.map(item => `
            <div class="feed-item ${esc(item.level)}">
                <span class="feed-dot"></span>
                <div class="feed-body">
                    <div class="feed-title">${esc(item.event)}</div>
                    <div class="feed-detail">${esc(item.detail)}</div>
                </div>
                <span class="feed-time">${agoHuman(item.created_at)}</span>
            </div>`).join("")
            || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="audit"></i></div><h3>No activity yet</h3></div>`;
        drawIcons(feed);
    }

    /* Dashboard live polling */

    const dash = { timer: null, busy: false, cpu: [], ram: [], netPrev: null, warned: false };
    function drawSpark(canvas, points, color) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || 130;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,255,255,.07)";
        [0.25, 0.5, 0.75].forEach(f => {
            ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke();
        });
        const max = Math.max(10, ...points) * 1.15;
        const step = points.length > 1 ? w / (points.length - 1) : w;
        const xy = i => [i * step, h - (points[i] / max) * (h - 8) - 4];
        if (points.length >= 2) {
            ctx.beginPath();
            points.forEach((_, i) => { const [x, y] = xy(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
            const [lx, ly] = xy(points.length - 1), [fx, fy] = xy(0);
            ctx.lineTo(lx, h); ctx.lineTo(fx, h); ctx.closePath();
            const gradient = ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, `${color}44`); gradient.addColorStop(1, `${color}00`);
            ctx.fillStyle = gradient; ctx.fill();
            ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
        }
    }
    function applyMetrics(metrics) {
        const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
        if (!metrics.available) {
            set("#cpuSub", "unavailable (install psutil)");
            set("#ramSub", "unavailable (install psutil)");
            return;
        }
        dash.cpu.push(metrics.cpu.percent); dash.cpu = dash.cpu.slice(-48);
        dash.ram.push(metrics.memory.percent); dash.ram = dash.ram.slice(-48);
        set("#cpuVal", Math.round(metrics.cpu.percent));
        set("#cpuSub", `${metrics.cpu.cores_logical ?? "?"} cores  |  physical ${metrics.cpu.cores_physical ?? "?"}`);
        set("#load1", metrics.load?.["1m"] ?? "-");
        set("#load5", metrics.load?.["5m"] ?? "-");
        set("#procCount", fmtNum(metrics.processes));
        set("#ramVal", Math.round(metrics.memory.percent));
        set("#ramSub", `${fmtBytes(metrics.memory.total)} total`);
        set("#ramUsed", fmtBytes(metrics.memory.used));
        set("#ramFree", fmtBytes(metrics.memory.available));
        set("#swapVal", metrics.swap.total ? fmtBytes(metrics.swap.used) : "none");
        drawSpark($("#cpuSpark"), dash.cpu, "#8065ff");
        drawSpark($("#ramSpark"), dash.ram, "#56b5ff");
        const diskList = $("#diskList");
        if (diskList && Array.isArray(metrics.disks)) {
            diskList.innerHTML = metrics.disks.map(disk => {
                const level = disk.percent >= 90 ? "crit" : disk.percent >= 75 ? "warn" : "";
                return `
                <div class="disk-row">
                    <div class="disk-meta">
                        <span class="mount mono" title="${esc(disk.device)}">${esc(disk.mount)}</span>
                        <span class="nums">${fmtBytes(disk.used)} / ${fmtBytes(disk.total)}  |  ${disk.percent}%</span>
                    </div>
                    <div class="disk-bar"><div class="disk-fill ${level}" style="width:${Math.min(100, disk.percent)}%"></div></div>
                </div>`;
            }).join("") || `<div class="empty-state compact"><h3>No mounted filesystems found</h3></div>`;
        }
        const prev = dash.netPrev;
        const nowMs = Date.now();
        set("#netRecv", fmtBytes(metrics.network.bytes_recv));
        set("#netSent", fmtBytes(metrics.network.bytes_sent));
        if (prev) {
            const dt = Math.max(1, (nowMs - prev.ts) / 1000);
            const rx = Math.max(0, (metrics.network.bytes_recv - prev.recv) / dt);
            const tx = Math.max(0, (metrics.network.bytes_sent - prev.sent) / dt);
            set("#netRxRate", fmtBytes(rx, true));
            set("#netTxRate", fmtBytes(tx, true));
            set("#netRate", `down ${fmtBytes(rx, true)}/s | up ${fmtBytes(tx, true)}/s`);
        }
        dash.netPrev = { ts: nowMs, recv: metrics.network.bytes_recv, sent: metrics.network.bytes_sent };
    }
    async function pollDash() {
        if (dash.busy || $(".page.active").id !== "dash") return;
        dash.busy = true;
        const [metricsRes, overviewRes] = await Promise.allSettled([
            api("/api/panel/metrics"), api("/api/overview")
        ]);
        if (overviewRes.status === "fulfilled") {
            overviewCache = overviewRes.value;
            applyOverview(overviewRes.value);
        }
        if (metricsRes.status === "fulfilled") {
            applyMetrics(metricsRes.value.data);
        } else if (!dash.warned) {
            dash.warned = true;
            toast("Live metrics unavailable", metricsRes.reason?.message || "Request failed", "warn");
        }
        dash.busy = false;
    }
    function startDashPolling() {
        pollDash();
        clearInterval(dash.timer);
        dash.timer = setInterval(() => {
            if (document.visibilityState === "visible") pollDash();
        }, 5000);
    }
    function stopDashPolling() { clearInterval(dash.timer); dash.timer = null; }

    /* Keys */

    const SCOPES = ["system", "processes", "services", "terminal", "files",
                    "screens", "docker", "network", "cron", "audit", "firewall", "users"];
    function initScopesGrid() {
        $("#scopesGrid").innerHTML =
            `<label class="scope-check all"><input type="checkbox" id="scopeAll"> All modules</label>` +
            SCOPES.map(s => `<label class="scope-check"><input type="checkbox" data-scope="${s}"> ${s}</label>`).join("");
        $("#scopeAll").onchange = () => {
            $$("[data-scope]").forEach(box => box.checked = $("#scopeAll").checked);
        };
        $$("[data-scope]").forEach(box => box.onchange = () => {
            $("#scopeAll").checked = SCOPES.every(s => $(`[data-scope="${s}"]`).checked);
        });
    }
    function selectedScopes() {
        const picked = $$("[data-scope]:checked").map(box => box.dataset.scope);
        return picked.length === SCOPES.length ? ["*"] : picked;
    }

    let lastCreatedKey = "";
    async function createKey() {
        const payload = {
            name: $("#keyName").value.trim(),
            rate_limit: parseInt($("#keyRate").value, 10),
            expires_days: parseInt($("#keyExpires").value, 10),
            scopes: selectedScopes()
        };
        try {
            const d = await api("/api/keys", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify(payload)
            });
            lastCreatedKey = d.key;
            $("#keyCreateView").style.display = "none";
            $("#keyRevealView").style.display = "";
            $("#keyModalFooter").style.display = "none";
            $("#revealedKey").textContent = d.key;
            toast("API key created", "Copy it now - shown only once.");
            drawIcons($("#keyRevealView"));
        } catch (error) {
            toast("Create failed", error.message, "error");
        }
    }
    function openKeyModal() {
        navigateTo("keys");
        $("#keyCreateView").style.display = "";
        $("#keyRevealView").style.display = "none";
        $("#keyModalFooter").style.display = "";
        $("#keyName").value = "";
        $("#keyExpires").value = "0";
        $("#keyRate").value = "120";
        initScopesGrid();
        keyModal.classList.add("show");
        drawIcons(keyModal);
    }
    $("#createKeyButton").onclick = createKey;
    $("#openKeyModal").onclick = openKeyModal;
    $("#closeKeyModal").onclick = () => keyModal.classList.remove("show");
    $("#cancelKeyModal").onclick = () => keyModal.classList.remove("show");
    keyModal.onclick = e => { if (e.target === keyModal) keyModal.classList.remove("show"); };
    $("#copyKeyButton").onclick = () => copyText(lastCreatedKey, $("#copyKeyButton"));
    $("#savedItButton").onclick = () => { keyModal.classList.remove("show"); loadKeys(); };

    /* Confirm modal */

    let confirmPhrase = "", confirmCb = null;
    function openConfirm({ title, message, phrase, acceptLabel, onAccept }) {
        $("#confirmTitle").textContent = title || "Are you sure?";
        $("#confirmMessage").textContent = message || "";
        confirmPhrase = phrase || "";
        confirmCb = onAccept || null;
        const input = $("#confirmInput"), accept = $("#confirmAccept");
        input.value = "";
        input.placeholder = confirmPhrase || "...";
        accept.disabled = Boolean(confirmPhrase);
        accept.textContent = acceptLabel || "Confirm";
        confirmModal.classList.add("show");
        setTimeout(() => input.focus(), 80);
    }
    $("#confirmInput").addEventListener("input", e => {
        $("#confirmAccept").disabled = !confirmPhrase || e.target.value !== confirmPhrase;
    });
    $("#confirmInput").addEventListener("keydown", e => {
        if (e.key === "Enter" && !$("#confirmAccept").disabled) $("#confirmAccept").click();
    });
    $("#confirmAccept").onclick = () => {
        confirmModal.classList.remove("show");
        if (confirmCb) Promise.resolve(confirmCb()).catch(error => toast("Action failed", error.message, "error"));
    };
    $("#cancelConfirm").onclick = () => confirmModal.classList.remove("show");
    $("#closeConfirmModal").onclick = () => confirmModal.classList.remove("show");
    confirmModal.onclick = e => { if (e.target === confirmModal) confirmModal.classList.remove("show"); };

    /* Keys table */

    let keysCache = [], keyFilter = "";
    function expiryBadge(key) {
        if (!key.expires_at) return `<span class="mono" style="color:#7d8598">never</span>`;
        const left = key.expires_at - nowSec();
        if (left <= 0) return `<span class="status expired">expired</span>`;
        return `<span class="status expiring">${Math.ceil(left / 86400)}d left</span>`;
    }
    function renderKeys() {
        const tbody = $("#keysBody");
        const term = keyFilter.trim().toLowerCase();
        const visible = keysCache.filter(key =>
            !term || `${key.name} ${key.prefix} ${key.scopes_list.join(" ")}`.toLowerCase().includes(term));
        tbody.innerHTML = visible.map(key => `
            <tr>
                <td style="font-weight:750;color:#f2f3f9">${esc(key.name)}</td>
                <td class="mono">${esc(key.prefix)}...
                    <button class="run-btn" data-copy-prefix="${esc(key.prefix)}" title="Copy prefix"><i data-lucide="copy"></i></button></td>
                <td>${key.scopes_list.map(s => `<span class="scope-chip">${esc(s)}</span>`).join("")}</td>
                <td class="mono">${key.rate_limit}/min</td>
                <td class="mono">${fmtNum(key.request_count)}</td>
                <td>${expiryBadge(key)}</td>
                <td title="${date(key.last_used)}">${agoHuman(key.last_used)}</td>
                <td><span class="status ${key.enabled ? "success" : "paused"}">${key.enabled ? "active" : "disabled"}</span></td>
                <td><div class="table-actions">
                    <button class="run-btn ${key.enabled ? "" : "green-action"}" data-toggle-key="${key.id}">${key.enabled ? "Disable" : "Enable"}</button>
                    <button class="run-btn danger-action" data-revoke-key="${key.id}" data-name="${esc(key.name)}">Revoke</button>
                </div></td>
            </tr>`).join("")
            || (keysCache.length
                ? `<tr><td colspan="9"><div class="empty-state compact"><h3>No keys match "${esc(keyFilter)}"</h3></div></td></tr>`
                : `<tr><td colspan="9"><div class="empty-state compact"><div class="empty-icon"><i data-lucide="key-round"></i></div><h3>No API keys yet</h3><p>Create your first scoped key to start calling the gateway.</p></div></td></tr>`);
        $$("[data-copy-prefix]", tbody).forEach(b => b.onclick = () => copyText(b.dataset.copyPrefix, b));
        $$("[data-toggle-key]", tbody).forEach(b => b.onclick = async () => {
            try {
                const d = await api(`/api/keys/${b.dataset.toggleKey}/toggle`, {
                    method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }
                });
                toast(d.enabled ? "Key enabled" : "Key disabled", d.message, d.enabled ? "success" : "warn");
                loadKeys();
            } catch (error) { toast("Toggle failed", error.message, "error"); }
        });
        $$("[data-revoke-key]", tbody).forEach(b => b.onclick = () => {
            const id = b.dataset.revokeKey, name = b.dataset.name;
            openConfirm({
                title: "Revoke API key",
                message: `"${name}" will be blocked instantly across every client using it. This cannot be undone.`,
                phrase: `REVOKE ${id}`,
                acceptLabel: "Revoke key",
                onAccept: async () => {
                    const d = await api(`/api/keys/${id}`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                        body: JSON.stringify({ confirmation: `REVOKE ${id}` })
                    });
                    toast("Key revoked", d.message);
                    loadKeys();
                }
            });
        });
        drawIcons(tbody);
    }
    async function loadKeys() {
        const tbody = $("#keysBody");
        try {
            const data = await api("/api/keys");
            keysCache = data.keys;
            renderKeys();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Keys unavailable</h3><p>${esc(error.message)}</p></div></td></tr>`;
            drawIcons(tbody);
        }
    }
    $("#keySearch").addEventListener("input", e => { keyFilter = e.target.value; renderKeys(); });

    /* Documentation */

    const GROUPS = [
        { name: "System", icon: "server", items: [
            { m: "GET", p: "/ping", s: "*", d: "Liveness check. Accepts ANY valid key regardless of scopes; returns version and server time." },
            { m: "GET", p: "/system", s: "system", d: "Hostname, kernel, uptime, load average and process count." },
            { m: "GET", p: "/system/metrics", s: "system", d: "Live CPU (per-core), memory, swap, disks, load and network counters." },
            { m: "GET", p: "/system/logs?tail=300&priority=err", s: "system", d: "System-wide journalctl. Optional unit= and priority= (emerg...debug) filters." },
            { m: "GET", p: "/system/updates", s: "system", d: "Pending OS package updates via apt/dnf/yum with package list." },
            { m: "GET", p: "/system/disks", s: "system", d: "Mounted filesystems with used/free bytes plus lsblk block devices." },
            { m: "GET", p: "/system/mounts", s: "system", d: "Kernel mount table from /proc/mounts." },
            { m: "GET", p: "/system/hardware", s: "system", d: "CPU model/cores, RAM, swap and architecture." },
            { m: "GET", p: "/system/packages?search=nginx&limit=50", s: "system", d: "Installed packages (dpkg or rpm) with optional name filter." },
            { m: "POST", p: "/system/hostname", s: "system", d: "Set the system hostname via hostnamectl. Body: {\"hostname\":\"app-1\"}.",
              body: { hostname: "app-1" } },
            { m: "GET", p: "/system/hostname", s: "system", d: "Current hostname from /proc/sys/kernel/hostname." },
            { m: "GET", p: "/system/os", s: "system", d: "Distro from /etc/os-release, kernel, machine arch, hostname and boot id." },
            { m: "GET", p: "/system/cpu", s: "system", d: "CPU model, logical/physical cores, frequency and 1-minute load." },
            { m: "GET", p: "/system/memory", s: "system", d: "Full /proc/meminfo breakdown plus psutil virtual/swap summary." },
            { m: "GET", p: "/system/ssh", s: "system", d: "sshd state/PID and security-relevant sshd_config keys (Port, PermitRootLogin, PasswordAuthentication...)." },
            { m: "GET", p: "/system/modules?search=nf_", s: "system", d: "Loaded kernel modules (lsmod) with optional name filter." },
            { m: "GET", p: "/system/limits", s: "system", d: "Kernel limits (fs.file-max, threads-max, pid_max) and this process rlimits." },
            { m: "POST", p: "/system/time/sync", s: "system", d: "Enable NTP via timedatectl and report synchronization state." },
            { m: "GET", p: "/system/time", s: "system", d: "Server clock: unix epoch, local and UTC strings, timezone name, UTC offset seconds and timedatectl NTP sync flags." },
            { m: "GET", p: "/system/temperature", s: "system", d: "Kernel thermal sensor readings per device with current/high/critical thresholds (requires psutil)." },
            { m: "GET", p: "/system/who", s: "system", d: "Currently logged-in sessions from who(1): user, tty, source host and login time, plus the raw output." },
            { m: "GET", p: "/system/login-attempts?hours=24", s: "system", d: "Failed SSH logins parsed from journalctl over a 1-168 hour window: attempt count, invalid usernames, top attacker IPs and sample lines." },
            { m: "POST", p: "/system/upgrade", s: "system", d: "Install pending OS updates (apt-get/dnf/yum -y upgrade). Body: {\"confirm\":true}. Long-running (timeout 1h); returns manager, exit_code, duration_seconds and output.",
              body: { confirm: true } },
            { m: "POST", p: "/system/reboot", s: "system", d: "Reboot the server NOW. Body: {\"confirm\":true} required. Audited.",
              body: { confirm: true } },
            { m: "POST", p: "/system/shutdown", s: "system", d: "Power off the server NOW. Body: {\"confirm\":true} required. Audited.",
              body: { confirm: true } },
        ]},
        { name: "Processes", icon: "activity", items: [
            { m: "GET", p: "/processes?limit=200&search=nginx", s: "processes", d: "List processes sorted by CPU with search filter.", },
            { m: "GET", p: "/processes/{pid}", s: "processes", d: "Full detail for one process: memory, threads, parent, nice, start time." },
            { m: "POST", p: "/processes/{pid}/kill", s: "processes", d: "Terminate a process. Body: {\"force\": true} escalates to SIGKILL.",
              body: { force: true } },
            { m: "POST", p: "/processes/{pid}/signal", s: "processes", d: "Send a POSIX signal. Body: {\"signal\":\"hup\"} (term|kill|hup|int|usr1|usr2|cont|stop|quit).",
              body: { signal: "hup" } },
            { m: "GET", p: "/processes/{pid}/open-files", s: "processes", d: "Open file descriptors from /proc/{pid}/fd." },
        ]},
        { name: "Supervisor", icon: "list-checks", items: [
            { m: "GET", p: "/supervisor", s: "processes", d: "Programs managed by supervisord (supervisorctl status) with name, state and detail." },
            { m: "POST", p: "/supervisor/{name}/{action}", s: "processes", d: "Control one program: action = start | stop | restart. Names are restricted to letters, digits and _.:@+-." },
        ]},
        { name: "Services (systemd)", icon: "cog", items: [
            { m: "POST", p: "/services/daemon-reload", s: "services", d: "Reload the systemd manager configuration after unit changes." },
            { m: "GET", p: "/services", s: "services", d: "All systemd units of type service with active state." },
            { m: "GET", p: "/services/failed", s: "services", d: "Units currently in a failed state." },
            { m: "GET", p: "/services/timers", s: "services", d: "All systemd timer units (systemctl list-timers): next/last run, remaining time and the service each timer activates." },
            { m: "GET", p: "/services/{service}", s: "services", d: "Detailed state of a single unit." },
            { m: "GET", p: "/services/{service}/logs?tail=200", s: "services", d: "journalctl output for the unit." },
            { m: "POST", p: "/services/{service}/start", s: "services", d: "Start the unit." },
            { m: "POST", p: "/services/{service}/stop", s: "services", d: "Stop the unit." },
            { m: "POST", p: "/services/{service}/restart", s: "services", d: "Restart the unit." },
            { m: "POST", p: "/services/{service}/reload", s: "services", d: "Reload the unit configuration (systemctl reload)." },
            { m: "POST", p: "/services/{service}/enable", s: "services", d: "Enable at boot." },
            { m: "POST", p: "/services/{service}/disable", s: "services", d: "Disable at boot." },
            { m: "POST", p: "/services/{service}/mask", s: "services", d: "Mask the unit so it cannot be started." },
            { m: "POST", p: "/services/{service}/unmask", s: "services", d: "Unmask a previously masked unit." },
        ]},
        { name: "Terminal", icon: "terminal", items: [
            { m: "POST", p: "/terminal/execute", s: "terminal", d: "Run a shell command (bash -lc). Body: {\"command\":\"uptime\",\"timeout\":60,\"cwd\":\"/root\"}. Reboot/shutdown are blocked by policy; every call is audited.",
              body: { command: "uptime", timeout: 30 } },
        ]},
        { name: "Files", icon: "files", items: [
            { m: "GET", p: "/files?path=/var/www", s: "files", d: "Directory listing or file metadata." },
            { m: "GET", p: "/files/read?path=/etc/hostname&bytes=65536", s: "files", d: "Read a text file as JSON (up to 256KB per call)." },
            { m: "PUT", p: "/files/write", s: "files", d: "Write or append text. Body: {\"path\":\"/opt/app/.env\",\"content\":\"KEY=1\",\"append\":false,\"create_dirs\":false}. Max 2MB.",
              body: { path: "/tmp/example.txt", content: "hello" } },
            { m: "GET", p: "/files/download?path=/var/log/syslog&attachment=1", s: "files", d: "Stream a file; attachment=1 forces download." },
            { m: "POST", p: "/files/upload", s: "files", d: "multipart/form-data: field 'file' + 'path' destination. Max 300MB.", body: null, multipart: true },
            { m: "POST", p: "/files/fetch", s: "files", d: "Server-side download from an http(s) URL. Body: {\"url\":\"https://.../file.zip\",\"path\":\"/opt/file.zip\"}. Max 300MB.",
              body: { url: "https://example.com/installer.sh", path: "/tmp/installer.sh" } },
            { m: "POST", p: "/files/search", s: "files", d: "Recursive content search (regex). Body: {\"path\":\"/var/log\",\"pattern\":\"error\",\"ignore_case\":true,\"max_results\":200}.",
              body: { path: "/var/log", pattern: "error", ignore_case: true } },
            { m: "GET", p: "/files/tail?path=/var/log/syslog&lines=200", s: "files", d: "Last N lines (default 200, max 5000) read from the final 1MB of a file; non-printable characters stripped per line." },
            { m: "GET", p: "/files/tree?path=/srv&depth=3", s: "files", d: "Recursive directory tree (depth 1-4, default 2, max 1500 nodes) with entries nested under 'children'." },
            { m: "GET", p: "/files/du?path=/var/lib/docker", s: "files", d: "Total size of a directory tree with file/dir counts." },
            { m: "POST", p: "/files/archive", s: "files", d: "Create a .tar.gz. Body: {\"src\":\"/opt/app\",\"dst\":\"/backups/app.tar.gz\"}.",
              body: { src: "/opt/app", dst: "/tmp/app.tar.gz" } },
            { m: "POST", p: "/files/unarchive", s: "files", d: "Extract tar.gz/tgz/zip safely (zip-slip protected). Body: {\"src\":\"/tmp/app.tar.gz\",\"dest\":\"/srv/app\"}.",
              body: { src: "/tmp/app.tar.gz", dest: "/srv/app" } },
            { m: "DELETE", p: "/files", s: "files", d: "Delete a path. Body: {\"path\":\"/tmp/x\",\"recursive\":false}. Critical paths refused.",
              body: { path: "/tmp/example.txt", recursive: false } },
            { m: "POST", p: "/files/move", s: "files", d: "Move or rename. Body: {\"src\":\"/a\",\"dst\":\"/b\"}",
              body: { src: "/root/old", dst: "/var/backups/old" } },
            { m: "POST", p: "/files/mkdir", s: "files", d: "Create directory. Body: {\"path\":\"/srv/app\",\"recursive\":true}",
              body: { path: "/srv/app", recursive: true } },
            { m: "POST", p: "/files/copy", s: "files", d: "Copy a file or directory tree. Body: {\"src\":\"/opt/app\",\"dst\":\"/backup/app\",\"overwrite\":false}; an existing dst directory absorbs the source under its own name.",
              body: { src: "/opt/app/config.yml", dst: "/tmp/config.yml.copy" } },
            { m: "POST", p: "/files/chmod", s: "files", d: "Set mode with an octal string (3-4 digits like '644' or '0755'). Body: {\"path\":\"/srv/app\",\"mode\":\"750\",\"recursive\":true}. Recursive on critical system paths refused.",
              body: { path: "/srv/app/run.sh", mode: "750" } },
            { m: "POST", p: "/files/chown", s: "files", d: "Change owner and/or group by name (at least one required). Body: {\"path\":\"/srv/app\",\"owner\":\"www-data\",\"group\":\"www-data\",\"recursive\":true}.",
              body: { path: "/srv/app", owner: "www-data" } },
            { m: "GET", p: "/files/checksum?path=/etc/hostname&algo=sha256", s: "files", d: "SHA-256 (or sha1/md5) checksum of a file up to 200MB." },
            { m: "POST", p: "/files/symlink", s: "files", d: "Create a symlink. Body: {\"src\":\"/opt/app\",\"dst\":\"/srv/app\"}.",
              body: { src: "/opt/app", dst: "/srv/current" } },
            { m: "POST", p: "/files/touch", s: "files", d: "Create or update a file timestamp. Body: {\"path\":\"/tmp/lock\",\"create_dirs\":true}.",
              body: { path: "/tmp/lock", create_dirs: true } },
            { m: "GET", p: "/files/info?path=/etc/hosts", s: "files", d: "Full metadata: type, size, octal mode, owner/group names, mtimes, symlink target." },
            { m: "POST", p: "/files/rename", s: "files", d: "Rename inside the same directory. Body: {\"path\":\"/srv/old.txt\",\"name\":\"new.txt\"}.",
              body: { path: "/srv/old.txt", name: "new.txt" } },
            { m: "GET", p: "/files/diff?left=/a.conf&right=/b.conf&context=3", s: "files", d: "Unified diff of two text files (up to 512KB each) with add/remove counts." },
            { m: "PUT", p: "/files/replace", s: "files", d: "Find & replace inside a text file up to 5MB. Body: {\"path\":\"/etc/app.conf\",\"find\":\"old\",\"replace\":\"new\",\"regex\":false,\"backup\":true} - backup stores the original as <file>.bak.",
              body: { path: "/tmp/example.txt", find: "DEBUG=False", replace: "DEBUG=True", backup: true } },
            { m: "GET", p: "/files/file-type?path=/tmp/blob", s: "files", d: "MIME type detection via file(1) with magic-bytes fallback." },
        ]},
        { name: "Screen sessions", icon: "monitor", items: [
            { m: "GET", p: "/screens", s: "screens", d: "All terminal-multiplexer sessions (GNU screen, or tmux automatically when screen is missing) with PID, state and creation date." },
            { m: "POST", p: "/screens", s: "screens", d: "Create a detached session (screen -dmS or tmux new-session ... bash -lc ...). Body: {\"name\":\"build\",\"command\":\"./deploy.sh\",\"cwd\":\"/opt/app\",\"keep_alive\":true}. keep_alive (default true) leaves an interactive shell so the session does not exit when the command finishes.",
              body: { name: "build", command: "./deploy.sh", cwd: "/opt/app", keep_alive: true } },
            { m: "GET", p: "/screens/{name}", s: "screens", d: "Inspect one session (pid, id, state, created)." },
            { m: "GET", p: "/screens/{name}/logs?tail=200", s: "screens", d: "Capture the visible window plus scrollback of a session." },
            { m: "POST", p: "/screens/{name}/command", s: "screens", d: "Type text into window 0; Enter appended unless execute=false. Body: {\"command\":\"tail -f x.log\",\"execute\":true}.",
              body: { command: "echo hello", execute: true } },
            { m: "POST", p: "/screens/{name}/kill", s: "screens", d: "Terminate the session and its children." },
            { m: "POST", p: "/screens/wipe", s: "screens", d: "Remove dead GNU screen sockets (screen -wipe); no-op under the tmux backend." },
        ]},
        { name: "Docker", icon: "container", items: [
            { m: "GET", p: "/docker/containers?state=running", s: "docker", d: "All containers with state/status/ports." },
            { m: "POST", p: "/docker/containers/{id}/start", s: "docker", d: "Start a container (id or name)." },
            { m: "POST", p: "/docker/containers/{id}/stop", s: "docker", d: "Stop a container." },
            { m: "POST", p: "/docker/containers/{id}/restart", s: "docker", d: "Restart a container." },
            { m: "POST", p: "/docker/containers/{id}/pause", s: "docker", d: "Pause a running container." },
            { m: "POST", p: "/docker/containers/{id}/unpause", s: "docker", d: "Resume a paused container." },
            { m: "DELETE", p: "/docker/containers/{id}", s: "docker", d: "Remove a container (must be stopped unless force). Body: {\"force\":true}.",
              body: { force: false } },
            { m: "GET", p: "/docker/containers/{id}/inspect", s: "docker", d: "Inspect image, mounts, pid, restart count and network mode." },
            { m: "GET", p: "/docker/containers/{id}/logs?tail=300", s: "docker", d: "Container logs." },
            { m: "POST", p: "/docker/containers/{id}/exec", s: "docker", d: "Run sh -c inside. Body: {\"command\":\"ps aux\",\"timeout\":60}.",
              body: { command: "ps aux", timeout: 60 } },
            { m: "GET", p: "/docker/stats", s: "docker", d: "One-shot docker stats --no-stream snapshot per container: CPU %, memory usage/limit, network and block IO." },
            { m: "GET", p: "/docker/info", s: "docker", d: "Docker engine summary: version, running containers, images, driver, CPUs, memory." },
            { m: "GET", p: "/docker/images", s: "docker", d: "Local images." },
            { m: "POST", p: "/docker/images/pull", s: "docker", d: "Pull an image. Body: {\"image\":\"nginx:latest\"}.",
              body: { image: "nginx:latest" } },
            { m: "POST", p: "/docker/prune", s: "docker", d: "docker system prune -f. Body: {\"confirm\":true,\"volumes\":false}.",
              body: { confirm: true, volumes: false } },
            { m: "DELETE", p: "/docker/images/{id}", s: "docker", d: "Remove a local image by id or repository:tag." },
            { m: "GET", p: "/docker/compose", s: "docker", d: "Registered compose stacks." },
            { m: "POST", p: "/docker/compose", s: "docker", d: "Register a stack dir (must contain compose.yaml/docker-compose.yml). Body: {\"path\":\"/opt/app\"}.",
              body: { path: "/opt/app" } },
            { m: "POST", p: "/docker/compose/up", s: "docker", d: "docker compose up -d. Body: {\"path\":\"/opt/app\",\"services\":[\"web\"]} (path optional when exactly one stack is registered).",
              body: { path: "/opt/app" } },
            { m: "POST", p: "/docker/compose/down", s: "docker", d: "compose down. Body: {\"path\":\"/opt/app\",\"remove_volumes\":false}.",
              body: { path: "/opt/app", remove_volumes: false } },
            { m: "POST", p: "/docker/compose/pull", s: "docker", d: "docker compose pull - refresh images of a stack. Body: {\"path\":\"/opt/app\"} (optional when exactly one stack is registered).",
              body: { path: "/opt/app" } },
            { m: "GET", p: "/docker/containers/{ref}/top", s: "docker", d: "Processes running inside a container (docker top)." },
            { m: "POST", p: "/docker/containers/{ref}/rename", s: "docker", d: "Rename a container. Body: {\"name\":\"new-name\"}.",
              body: { name: "new-name" } },
            { m: "POST", p: "/docker/containers/{ref}/kill", s: "docker", d: "Kill a container with a signal. Body: {\"signal\":\"KILL\"} (TERM|KILL|HUP|INT|QUIT|USR1|USR2).",
              body: { signal: "KILL" } },
            { m: "GET", p: "/docker/networks", s: "docker", d: "List all Docker networks (docker network ls) with name, driver and scope." },
            { m: "GET", p: "/docker/volumes", s: "docker", d: "List all named volumes (docker volume ls) with driver details." },
            { m: "GET", p: "/docker/volumes/{name}", s: "docker", d: "Volume inspect: driver, mountpoint, labels, options and rough bytes used on disk." },
            { m: "GET", p: "/docker/networks/{name}", s: "docker", d: "Network inspect: driver, IPAM subnets/gateway and attached containers." },
        ]},
        { name: "Firewall (ufw)", icon: "shield", items: [
            { m: "GET", p: "/firewall/status", s: "firewall", d: "ufw status: enabled flag, default policies and numbered rule list." },
            { m: "POST", p: "/firewall/rules", s: "firewall", d: "Add a rule. Body: {\"action\":\"allow\",\"port\":22,\"proto\":\"tcp\",\"from\":\"203.0.113.0/24\",\"comment\":\"ssh office\"}. action = allow|deny|reject|limit.",
              body: { action: "allow", port: 443, proto: "tcp" } },
            { m: "DELETE", p: "/firewall/rules", s: "firewall", d: "Delete a rule with the same body shape used to create it.",
              body: { action: "allow", port: 443, proto: "tcp" } },
            { m: "POST", p: "/firewall/enable", s: "firewall", d: "Enable ufw. Body: {\"confirm\":true} required. Make sure SSH is allowed first!",
              body: { confirm: true } },
            { m: "POST", p: "/firewall/disable", s: "firewall", d: "Disable ufw. Body: {\"confirm\":true} required.",
              body: { confirm: true } },
            { m: "POST", p: "/firewall/reload", s: "firewall", d: "Reload ufw rules without toggling the firewall." },
        ]},
        { name: "Fail2ban", icon: "shield-off", items: [
            { m: "GET", p: "/fail2ban/status", s: "firewall", d: "Jail list and currently banned IPs (requires fail2ban-client)." },
            { m: "POST", p: "/fail2ban/unban", s: "firewall", d: "Unban an IPv4 address from a jail. Body: {\"jail\":\"sshd\",\"ip\":\"203.0.113.10\"}.",
              body: { jail: "sshd", ip: "203.0.113.10" } },
            { m: "POST", p: "/fail2ban/ban", s: "firewall", d: "Ban an IPv4 address in a jail. Body: {\"jail\":\"sshd\",\"ip\":\"203.0.113.10\"}.",
              body: { jail: "sshd", ip: "203.0.113.10" } },
        ]},
        { name: "Users", icon: "users", items: [
            { m: "GET", p: "/users", s: "users", d: "Interactive accounts (uid>=1000 plus root) with home and shell." },
            { m: "POST", p: "/users", s: "users", d: "Create a user. Body: {\"username\":\"deploy\",\"password\":\"s3cret\",\"shell\":\"/bin/bash\",\"create_home\":true}.",
              body: { username: "deploy", password: "change-me-123" } },
            { m: "POST", p: "/users/{username}/password", s: "users", d: "Set a new password (6-128 chars) via chpasswd.",
              body: { password: "new-pass-456" } },
            { m: "DELETE", p: "/users/{username}", s: "users", d: "Delete a user. Body: {\"confirm\":\"username\",\"remove_home\":false}. Root cannot be deleted.",
              body: { confirm: "deploy", remove_home: true } },
            { m: "GET", p: "/users/{username}", s: "users", d: "Account detail: uid/gid, gecos, home (and whether it exists), shell, member groups." },
            { m: "GET", p: "/users/{username}/ssh-keys", s: "users", d: "List authorized_keys with SHA256 fingerprints and line indexes." },
            { m: "POST", p: "/users/{username}/ssh-keys", s: "users", d: "Append an OpenSSH public key (deduplicated, perms 700/600). Body: {\"key\":\"ssh-ed25519 AAAA... laptop\",\"comment\":\"laptop\"}.",
              body: { key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... key-comment" } },
            { m: "DELETE", p: "/users/{username}/ssh-keys/{key_index}", s: "users", d: "Remove the authorized key at the given index (from the list endpoint)." },
        ]},
        { name: "Network", icon: "network", items: [
            { m: "GET", p: "/network/public-ip", s: "network", d: "Outbound public IPv4 as seen by the internet." },
            { m: "GET", p: "/network/interfaces", s: "network", d: "Interfaces with IPv4/IPv6/MAC, speed and counters." },
            { m: "GET", p: "/network/routes", s: "network", d: "Kernel routing table (ip route)." },
            { m: "GET", p: "/network/dns", s: "network", d: "Resolvers from /etc/resolv.conf." },
            { m: "GET", p: "/network/ports", s: "network", d: "Listening sockets with owning process." },
            { m: "GET", p: "/network/connections?kind=inet", s: "network", d: "Active connections." },
            { m: "GET", p: "/network/arp", s: "network", d: "Neighbour table from ip neigh (with /proc/net/arp fallback): ip, mac, interface and reachability state. Max 500 entries." },
            { m: "GET", p: "/network/traffic-sample?seconds=2", s: "network", d: "Samples global counters for 1-10 seconds (default 2) and reports rx_bps/tx_bps in bytes per second plus human-readable totals." },
            { m: "POST", p: "/network/ping", s: "network", d: "ICMP ping. Body: {\"host\":\"1.1.1.1\",\"count\":4}. Returns min/avg/max latency.",
              body: { host: "1.1.1.1", count: 4 } },
            { m: "POST", p: "/network/traceroute", s: "network", d: "Traceroute. Body: {\"host\":\"1.1.1.1\",\"max_hops\":15}. Requires traceroute binary.",
              body: { host: "1.1.1.1", max_hops: 15 } },
            { m: "POST", p: "/network/dns-lookup", s: "network", d: "Resolve A records. Body: {\"host\":\"example.com\"}.",
              body: { host: "example.com" } },
            { m: "POST", p: "/network/dns-records", s: "network", d: "Fetch DNS record sets: type = A|AAAA|MX|TXT|NS|CNAME|SOA|SRV. Uses dig when installed with getaddrinfo fallback for A/AAAA only. Body: {\"host\":\"example.com\",\"type\":\"MX\"}.",
              body: { host: "example.com", type: "MX" } },
            { m: "POST", p: "/network/tcp-check", s: "network", d: "TCP connect test. Body: {\"host\":\"db.local\",\"port\":5432,\"timeout\":5}.",
              body: { host: "localhost", port: 22, timeout: 5 } },
            { m: "POST", p: "/network/http-check", s: "network", d: "HTTP reachability + status + latency. Body: {\"url\":\"https://example.com\",\"timeout\":10}.",
              body: { url: "https://example.com", timeout: 10 } },
            { m: "POST", p: "/network/ssl-check", s: "network", d: "TLS certificate inspection via openssl s_client: subject, issuer, issued_at/expires_at, days_left and expired flag. Body: {\"host\":\"example.com\",\"port\":443}.",
              body: { host: "example.com", port: 443 } },
            { m: "GET", p: "/network/hosts", s: "network", d: "Parsed /etc/hosts entries." },
            { m: "GET", p: "/network/geoip", s: "network", d: "Server public IP geolocation: country, region, city, lat/lon, timezone, org, ASN." },
            { m: "GET", p: "/network/latency", s: "network", d: "Ping Google, Cloudflare and Quad9 and report average latency to each." },
            { m: "POST", p: "/network/ssl-generate", s: "network", d: "Generate a self-signed cert+key with openssl. Body: {\"path\":\"/etc/ssl/self\",\"common_name\":\"example.com\",\"days\":365,\"key_type\":\"rsa\",\"key_size\":2048}.",
              body: { path: "/tmp", common_name: "example.com", days: 365 } },
        ]},
        { name: "Git", icon: "git-branch", items: [
            { m: "GET", p: "/git/status?path=/opt/app", s: "files", d: "git status --porcelain for a repository path." },
            { m: "GET", p: "/git/log?path=/opt/app&limit=15", s: "files", d: "Recent commits (hash, author, date, subject)." },
            { m: "POST", p: "/git/pull", s: "files", d: "Fast-forward pull. Body: {\"path\":\"/opt/app\",\"remote\":\"origin\",\"branch\":\"main\"}.",
              body: { path: "/opt/app", remote: "origin", branch: "main" } },
            { m: "POST", p: "/git/checkout", s: "files", d: "Checkout a branch. Body: {\"path\":\"/opt/app\",\"branch\":\"main\"}.",
              body: { path: "/opt/app", branch: "main" } },
            { m: "POST", p: "/git/clone", s: "files", d: "Clone a repo (https/ssh/git@). Body: {\"url\":\"https://github.com/org/repo.git\",\"path\":\"/srv/repo\",\"branch\":\"main\",\"depth\":1}.",
              body: { url: "https://github.com/org/repo.git", path: "/srv/repo", depth: 1 } },
            { m: "GET", p: "/git/branches?path=/opt/app", s: "files", d: "Local and remote branches plus the current one." },
            { m: "GET", p: "/git/diff?path=/opt/app&staged=0", s: "files", d: "git diff --stat plus the patch (up to 200KB). staged=1 for the index." },
            { m: "POST", p: "/git/push", s: "files", d: "Push to a remote. Body: {\"path\":\"/opt/app\",\"remote\":\"origin\",\"branch\":\"main\",\"force\":false}. force needs confirm=true.",
              body: { path: "/opt/app", remote: "origin" } },
        ]},
        { name: "Scheduled tasks (cron)", icon: "clock", items: [
            { m: "GET", p: "/cron", s: "cron", d: "Parsed crontab with human meaning and next run per job." },
            { m: "POST", p: "/cron", s: "cron", d: "Append a task. Body: {\"schedule\":\"*/10 * * * *\",\"command\":\"/usr/local/bin/job.sh\",\"comment\":\"Nightly\"}.",
              body: { schedule: "*/10 * * * *", command: "/usr/local/bin/job.sh", comment: "Nightly" } },
            { m: "PUT", p: "/cron/{id}", s: "cron", d: "Update an existing line atomically (same body shape)." },
            { m: "DELETE", p: "/cron/{id}", s: "cron", d: "Remove the task from the crontab." },
            { m: "POST", p: "/cron/{id}/run", s: "cron", d: "Execute immediately. Body: {\"timeout\":60}. Output captured.",
              body: { timeout: 60 } },
        ]},
        { name: "Audit", icon: "scroll-text", items: [
            { m: "GET", p: "/audit-logs?limit=100", s: "audit", d: "Full audit trail: every API call, denial, rate-limit hit and mutating action. Filters: level, event, limit." },
        ]},
    ];

    function renderDocs(filterTerm = "") {
        const term = String(filterTerm || "").trim().toLowerCase();
        const wrap = $("#docsGroups");
        let rendered = 0;
        wrap.innerHTML = GROUPS.map(group => {
            const matched = group.items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => !term ||
                    `${item.m} ${item.p} ${item.d} ${item.s}`.toLowerCase().includes(term));
            if (!matched.length) return "";
            rendered += matched.length;
            return `
            <section class="doc-group">
                <div class="doc-group-header">
                    <span class="doc-group-icon"><i data-lucide="${group.icon}"></i></span>
                    <h3>${esc(group.name)}</h3>
                    <span class="count">${matched.length} endpoint${matched.length > 1 ? "s" : ""}</span>
                    <i data-lucide="chevron-down" class="chev"></i>
                </div>
                <div class="endpoint-list">
                    ${matched.map(({ item, index }) => `
                        <div class="endpoint-row">
                            <span class="method ${item.m}">${item.m}</span>
                            <div style="min-width:0">
                                <div class="endpoint-path">${esc(item.p)}</div>
                                <span class="endpoint-desc">${esc(item.d)}</span>
                            </div>
                            <div class="endpoint-side">
                                <span class="scope-tag" title="Required scope">${esc(item.s)}</span>
                                <button class="run-btn" data-try="${group.name}|${index}"><i data-lucide="send-horizontal"></i>Try</button>
                            </div>
                        </div>`).join("")}
                </div>
            </section>`;
        }).join("")
            || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="search"></i></div><h3>No endpoints match "${esc(filterTerm)}"</h3></div>`;
        $$(".doc-group-header", wrap).forEach(header =>
            header.onclick = () => header.closest(".doc-group").classList.toggle("collapsed"));
        $$("[data-try]", wrap).forEach(button => button.onclick = () => openTry(button.dataset.try));
        drawIcons(wrap);
        return rendered;
    }
    $("#docSearch")?.addEventListener("input", e => renderDocs(e.target.value));

    let currentTry = null;
    function resolvePath(pattern) {
        const params = [...pattern.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
        let resolved = pattern;
        for (const param of params) {
            const sample = param === "pid" ? "1234"
                : param === "name" ? "build"
                : param === "id" || param === "ref" ? "abc123def456"
                : param === "service" ? "nginx"
                : param === "username" ? "deploy"
                : param === "key_index" ? "0" : "value";
            resolved = resolved.replace(`{${param}}`, sample);
        }
        return { resolved, params };
    }
    function openTry(key) {
        const [groupName, indexStr] = key.split("|");
        const group = GROUPS.find(g => g.name === groupName);
        const item = group.items[Number(indexStr)];
        currentTry = item;
        $("#tryMethod").textContent = item.m;
        $("#tryMethod").className = `method ${item.m}`;
        const { resolved } = resolvePath(item.p);
        $("#tryPathLabel").textContent = resolved;
        $("#tryDesc").textContent = item.d;
        const baseUrl = ($("#baseUrlCode").dataset.full || baseUrlFull ||
            `${location.origin}${mount}api/v1`).replace(/\/$/, "");
        $("#tryUrl").value = baseUrl + resolved;
        $("#tryKey").value = sessionStorage.getItem("ac_try_key") || "";
        $("#tryBodyWrap").style.display = (item.body === undefined && !item.multipart) ? "none" : "";
        $("#tryBody").value = item.body ? JSON.stringify(item.body, null, 2) : "";
        $("#tryOutput").textContent = "Response appears here.";
        selectTryLang(tryLangId);
        tryModal.classList.add("show");
        drawIcons(tryModal);
    }
    function buildCurl() {
        const url = $("#tryUrl").value.trim();
        const parts = [`curl -X ${currentTry.m} "${url}"`, `  -H "Authorization: Bearer <your-key>"`];
        const raw = $("#tryBody").value.trim();
        if (!["GET", "DELETE"].includes(currentTry.m) && raw && !currentTry.multipart) {
            parts.push(`  -H "Content-Type: application/json"`,
                       `  -d '${raw.replace(/'/g, "'\\''")}'`);
        }
        return parts.join(" \\\n");
    }
    $("#tryCurlBtn").onclick = () => copyText(buildCurl(), $("#tryCurlBtn"));
    $("#sendTryButton").onclick = async () => {
        const url = $("#tryUrl").value.trim();
        const key = $("#tryKey").value.trim();
        sessionStorage.setItem("ac_try_key", key);
        if (!url.startsWith("http")) {
            $("#tryOutput").textContent = "Enter the full URL.";
            return;
        }
        const options = { method: currentTry.m, headers: {} };
        options.headers["Authorization"] = `Bearer ${key}`;
        options.headers["X-API-Key"] = key;
        if (currentTry.multipart) {
            $("#tryOutput").textContent = "Multipart upload cannot be sent from Try-it - use curl:\n\n" +
                `curl -X POST "${url}" \\\n  -H "Authorization: Bearer <key>" \\\n  -F "file=@localfile.txt" \\\n  -F "path=/tmp/localfile.txt"`;
            return;
        }
        if (!["GET", "DELETE"].includes(currentTry.m)) {
            const raw = $("#tryBody").value.trim();
            if (raw) {
                try {
                    JSON.parse(raw);
                } catch (_) {
                    $("#tryOutput").textContent = "JSON body is invalid.";
                    return;
                }
                options.headers["Content-Type"] = "application/json";
                options.body = raw;
            }
        }
        const started = performance.now();
        $("#sendTryButton").disabled = true;
        $("#tryOutput").textContent = "Sending...";
        try {
            const response = await fetch(url, options);
            const ms = Math.round(performance.now() - started);
            const text = await response.text();
            let pretty = text;
            try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
            const cls = response.status < 400 ? "ok" : response.status < 500 ? "warn" : "err";
            $("#tryOutput").innerHTML =
                `<span class="try-meta ${cls}">HTTP ${response.status}  |  ${ms}ms</span>\n${esc(pretty.slice(0, 20000))}`;
        } catch (error) {
            $("#tryOutput").textContent = `Request error: ${error.message}`;
        } finally {
            $("#sendTryButton").disabled = false;
        }
    };
    $("#closeTryModal").onclick = () => tryModal.classList.remove("show");
    $("#cancelTry").onclick = () => tryModal.classList.remove("show");
    tryModal.onclick = e => { if (e.target === tryModal) tryModal.classList.remove("show"); };

    /* Global wiring */

    $("#baseUrlCode").onclick = () => copyText(baseUrlFull || $("#baseUrlCode").textContent.trim());
    $("#baseUrlCopy").onclick = () => copyText(baseUrlFull, $("#baseUrlCopy"));
    /* Try-it : the same request in multiple languages */

    let tryLangId = "curl";
    function selectTryLang(id) {
        tryLangId = id;
        $$("#tryLangTabs .lang-tab").forEach(t =>
            t.classList.toggle("active", t.dataset.lang === id));
        $$("#tryLangPanes .lang-pane").forEach(p =>
            p.classList.toggle("active", p.dataset.pane === id));
        fillTrySnippets();
    }
    $$("#tryLangTabs .lang-tab").forEach(t =>
        t.onclick = () => selectTryLang(t.dataset.lang));

    function requestShape() {
        return {
            url: $("#tryUrl").value.trim(),
            method: currentTry ? currentTry.m : "GET",
            raw: currentTry && !currentTry.multipart ? $("#tryBody").value.trim() : "",
            multipart: !!(currentTry && currentTry.multipart),
        };
    }

    function pyLiteral(raw) {
        return raw.replace(/\n/g, "\n    ")
            .replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False")
            .replace(/\bnull\b/g, "None");
    }

    function multipartSnippets(s) {
        $("#snipCurl").textContent =
            `curl -X POST "${s.url}" \\\n` +
            `  -H "Authorization: Bearer <your-key>" \\\n` +
            `  -F "file=@localfile.txt" \\\n` +
            `  -F "path=/tmp/localfile.txt"`;
        $("#snipPython").textContent =
            `import requests\n\nurl = "${s.url}"\nheaders = {"Authorization": "Bearer <your-key>"}\n\n` +
            `with open("localfile.txt", "rb") as fh:\n` +
            `    response = requests.post(url, headers=headers,\n` +
            `                             files={"file": fh},\n` +
            `                             data={"path": "/tmp/localfile.txt"},\n` +
            `                             timeout=300)\nprint(response.json())`;
        $("#snipJs").textContent =
            `const form = new FormData();\n` +
            `form.append("file", document.querySelector("#fileInput").files[0]);\n` +
            `form.append("path", "/tmp/localfile.txt");\n\n` +
            `const response = await fetch("${s.url}", {\n` +
            `  method: "POST",\n` +
            `  headers: { Authorization: "Bearer <your-key>" }, // no Content-Type!\n` +
            `  body: form,\n});\n\nconsole.log(await response.json());`;
        $("#snipPhp").textContent =
            `<?php\n$ch = curl_init("${s.url}");\ncurl_setopt_array($ch, [\n` +
            `    CURLOPT_RETURNTRANSFER => true,\n` +
            `    CURLOPT_HTTPHEADER     => ["Authorization: Bearer <your-key>"],\n` +
            `    CURLOPT_POSTFIELDS     => [\n` +
            `        "file" => new CURLFile("localfile.txt"),\n` +
            `        "path" => "/tmp/localfile.txt",\n` +
            `    ],\n]);\n\nvar_export(json_decode(curl_exec($ch), true));`;
        $("#snipGo").textContent =
            `package main\n\nimport (\n\t"bytes"\n\t"encoding/json"\n\t"fmt"\n\t"io"\n` +
            `\t"mime/multipart"\n\t"net/http"\n\t"os"\n)\n\nfunc main() {\n` +
            `\tfile, _ := os.Open("localfile.txt")\n\tdefer file.Close()\n\n` +
            `\tvar buf bytes.Buffer\n\twriter := multipart.NewWriter(&buf)\n` +
            `\tpart, _ := writer.CreateFormFile("file", "localfile.txt")\n\tio.Copy(part, file)\n` +
            `\twriter.WriteField("path", "/tmp/localfile.txt")\n\twriter.Close()\n\n` +
            `\treq, _ := http.NewRequest("POST", "${s.url}", &buf)\n` +
            `\treq.Header.Set("Authorization", "Bearer <your-key>")\n` +
            `\treq.Header.Set("Content-Type", writer.FormDataContentType())\n\n` +
            `\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n` +
            `\tdefer res.Body.Close()\n\n` +
            `\tvar out map[string]any\n\tjson.NewDecoder(res.Body).Decode(&out)\n` +
            `\tfmt.Printf("%+v\\n", out)\n}`;
    }

    function jsonSnippets(s) {
        const hasBody = s.raw !== "" && !["GET", "DELETE"].includes(s.method);

        $("#snipCurl").textContent =
            `curl -X ${s.method} "${s.url}" \\\n` +
            `  -H "Authorization: Bearer <your-key>"` +
            (hasBody ? ` \\\n  -H "Content-Type: application/json" \\\n` +
                `  -d '${s.raw.replace(/'/g, "'\\''")}'` : "");

        let py = `import requests\n\nurl = "${s.url}"\nheaders = {"Authorization": "Bearer <your-key>"`;
        if (hasBody) py += `, "Content-Type": "application/json"`;
        py += "}\n\n";
        if (hasBody) py += `payload = ${pyLiteral(s.raw)}\n\n`;
        py += `response = requests.${s.method.toLowerCase()}(url, headers=headers`;
        if (hasBody) py += ", json=payload";
        py += ", timeout=60)\nprint(response.json())";
        $("#snipPython").textContent = py;

        let js = `const response = await fetch("${s.url}", {\n  method: "${s.method}",\n  headers: {\n` +
            `    Authorization: "Bearer <your-key>"`;
        if (hasBody) js += `,\n    "Content-Type": "application/json"`;
        js += "\n  }";
        if (hasBody) js += `,\n  body: JSON.stringify(${s.raw.replace(/\n/g, "\n    ")})`;
        js += "\n});\n\nconsole.log(await response.json());";
        $("#snipJs").textContent = js;

        let php = `<?php\n$ch = curl_init("${s.url}");\ncurl_setopt_array($ch, [\n` +
            `    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_CUSTOMREQUEST  => "${s.method}",\n` +
            `    CURLOPT_HTTPHEADER     => ["Authorization: Bearer <your-key>"`;
        if (hasBody) php += `,\n                               "Content-Type: application/json"`;
        php += "]";
        if (hasBody) php += `,\n    CURLOPT_POSTFIELDS     => '${s.raw.replace(/'/g, "'\\''")}'`;
        php += "\n]);\n\nvar_export(json_decode(curl_exec($ch), true));";
        $("#snipPhp").textContent = php;

        const goImports = hasBody
            ? `"bytes"\n\t"encoding/json"\n\t"fmt"\n\t"net/http"`
            : `"encoding/json"\n\t"fmt"\n\t"net/http"`;
        let go = `package main\n\nimport (\n\t${goImports}\n)\n\nfunc main() {\n`;
        go += hasBody
            ? `\tpayload := []byte(\`${s.raw}\`)\n` +
              `\treq, err := http.NewRequest("${s.method}",\n\t\t"${s.url}", bytes.NewReader(payload))\n`
            : `\treq, err := http.NewRequest("${s.method}", "${s.url}", nil)\n`;
        go += `\tif err != nil {\n\t\tpanic(err)\n\t}\n\n` +
              `\treq.Header.Set("Authorization", "Bearer <your-key>")\n`;
        if (hasBody) go += `\treq.Header.Set("Content-Type", "application/json")\n`;
        go += `\n\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n` +
              `\tdefer res.Body.Close()\n\n` +
              `\tvar out map[string]any\n\tjson.NewDecoder(res.Body).Decode(&out)\n` +
              `\tfmt.Printf("%+v\\n", out)\n}`;
        $("#snipGo").textContent = go;
    }

    function fillTrySnippets() {
        if (!currentTry) return;
        const s = requestShape();
        if (!s.url || !s.url.startsWith("http")) {
            s.url = ".../api/v1" + ($("#tryPathLabel").textContent || "");
        }
        if (s.multipart) multipartSnippets(s); else jsonSnippets(s);
    }

    $$("[data-copy-code]").forEach(button => button.onclick = () => {
        const scope = button.closest(".code-block") || document.body;
        const target = scope.querySelector(".code-text") || $("#curlSample");
        copyText(target.textContent.replace(/\s+$/, ""), button);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            $$(".modal-backdrop.show").forEach(modal => modal.classList.remove("show"));
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            openKeyModal();
        }
    });

    drawIcons();
    initScopesGrid();
    renderDocs();
    navigateTo("dash");
})();
