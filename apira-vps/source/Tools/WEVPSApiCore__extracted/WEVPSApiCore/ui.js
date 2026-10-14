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
