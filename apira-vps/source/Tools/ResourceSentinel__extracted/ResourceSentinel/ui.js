(() => {
    "use strict";
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const mount = location.pathname === "/" ? "/" : `/${location.pathname.split("/").filter(Boolean)[0]}/`;
    const icons = {
        "cloud-cog": "◆", "layout-dashboard": "▦", radar: "◉", "bell-plus": "◔",
        "bell-ring": "◉", send: "➤", "settings-2": "⚙", info: "i", menu: "☰",
        search: "⌕", "refresh-cw": "↻", plus: "+", zap: "⚡", cpu: "▤",
        "memory-stick": "▥", "hard-drive": "▰", download: "↓", save: "✓",
        x: "×", sparkles: "✦", trash: "×", "trash-2": "×", play: "▶",
        pause: "Ⅱ", activity: "⌁", timer: "◷", flame: "▲",
        "triangle-alert": "!", "loader-circle": "↻", "mail-check": "✉",
        route: "⌁", "shield-check": "◇", "lock-keyhole": "▣", "circle-x": "×",
        "arrow-down": "↓", "arrow-up": "↑", thermometer: "♨", boxes: "▦",
        repeat: "↻", "list-tree": "≣", cloud: "☁", "search-x": "⌕", pencil: "✎",
        gauge: "◐", "arrow-down-to-line": "↓", "arrow-up-from-line": "↑",
        "hard-drive-download": "⤓", "hard-drive-upload": "⤒"
    };
    const METRICS = {
        cpu: { label: "CPU usage", unit: "%", icon: "cpu", color: "#a78bfa" },
        memory: { label: "Memory usage", unit: "%", icon: "memory-stick", color: "#34d399" },
        swap: { label: "Swap usage", unit: "%", icon: "repeat", color: "#22d3ee" },
        disk: { label: "Disk usage", unit: "%", icon: "hard-drive", color: "#fbbf24" },
        network_down: { label: "Download traffic", unit: "KB/s", icon: "arrow-down-to-line", color: "#56b5ff" },
        network_up: { label: "Upload traffic", unit: "KB/s", icon: "arrow-up-from-line", color: "#2dd4bf" },
        disk_read: { label: "Disk read activity", unit: "KB/s", icon: "hard-drive-download", color: "#60a5fa" },
        disk_write: { label: "Disk write activity", unit: "KB/s", icon: "hard-drive-upload", color: "#f472b6" },
        load: { label: "Load average", unit: "", icon: "gauge", color: "#fb923c" },
        temperature: { label: "Temperature", unit: "°C", icon: "thermometer", color: "#f87171" },
        processes: { label: "Processes", unit: "procs", icon: "boxes", color: "#c084fc" }
    };
    function drawIcons(root = document) {
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
        } else {
            $$("[data-lucide]", root).forEach(i => {
                i.textContent = icons[i.dataset.lucide] || "•";
                i.style.cssText += ";display:inline-grid;place-items:center;font-style:normal;line-height:1";
            });
        }
    }
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
    const num = (v, digits = 1) => Number.isFinite(Number(v)) ? `${Number(v).toFixed(Number(v) % 1 ? digits : 0).replace(/\.0$/, "")}` : "—";
    const fmtValue = (metric, value) => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
        const spec = METRICS[metric] || {};
        return `${num(value)}${spec.unit ? (spec.unit === "%" ? "%" : ` ${spec.unit}`) : ""}`;
    };
    const fmtDuration = s => {
        if (!Number.isFinite(s)) return "—";
        if (s < 60) return `${Math.round(s)}s`;
        if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
        return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    };
    const date = value => value ? new Date(value * 1000).toLocaleString() : "—";
    async function api(path, options = {}) {
        const endpoint = path.startsWith("/api/") ? mount + path.slice(1) : path;
        const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", ...options });
        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            location.href = data.login_url || "/login";
            throw Error("Authentication required");
        }
        if (!(response.headers.get("content-type") || "").includes("application/json"))
            throw Error(`Unexpected server response (${response.status})`);
        const data = await response.json();
        if (!response.ok || data.success === false) throw Error(data.message || data.error || "Request failed");
        return data;
    }
    function toast(title, message, type = "success") {
        const container = $("#toastContainer");
        const item = document.createElement("div");
        item.className = "toast";
        item.innerHTML = `<div class="toast-icon" style="color:${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#22c55e"};background:${type === "error" ? "rgba(239,68,68,.12)" : type === "warn" ? "rgba(245,158,11,.12)" : ""}">${type === "success" ? "✓" : "!"}</div><div><div class="toast-title">${esc(title)}</div><div class="toast-message">${esc(message)}</div></div><button class="toast-close">×</button>`;
        container.appendChild(item);
        const remove = () => item.remove();
        $(".toast-close", item).onclick = remove;
        setTimeout(remove, 5000);
    }

    const sidebar = $("#sidebar"), overlay = $("#mobileOverlay");
    const ruleModal = $("#ruleModal"), channelModal = $("#channelModal");
    let overviewData = null, rules = [], alertsList = [], diskScopes = [];
    let editingRuleId = null;

    function navigateTo(id) {
        $$(".page").forEach(p => p.classList.toggle("active", p.id === id));
        $$(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === id));
        sidebar.classList.remove("open"); overlay.classList.remove("show");
        if (id === "dashboard") loadDashboard();
        if (id === "rules") loadRules();
        if (id === "alerts") loadAlerts();
        if (id === "channels") loadChannels();
        if (id === "settings") loadSettings();
    }
    $$(".nav-item[data-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.page));
    $$("[data-go-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.goPage));
    $("#menuButton").onclick = () => { sidebar.classList.add("open"); overlay.classList.add("show"); };
    overlay.onclick = () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); };

    function setRuleModalMode(rule) {
        const isEdit = Boolean(rule);
        editingRuleId = isEdit ? rule.id : null;
        $("#ruleModalTitle").textContent = isEdit ? "Edit alert rule" : "Create an alert rule";
        $("#ruleModalSubtitle").textContent = isEdit
            ? "Update the name, metric, condition, channels or cooldown behavior."
            : "Define the metric, condition, notifications and cooldown behavior.";
        $("#createRuleButton").innerHTML = isEdit
            ? '<i data-lucide="save"></i>Save changes'
            : '<i data-lucide="sparkles"></i>Create rule';
        drawIcons($("#createRuleButton"));
    }
    function ensureOption(select, value, label) {
        if (!value) return;
        if (![...select.options].some(o => o.value === String(value))) {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = label || String(value);
            select.appendChild(option);
        }
        select.value = String(value);
    }
    async function fillRuleForm(rule) {
        $("#ruleName").value = rule.name;
        $("#ruleMetric").value = METRICS[rule.metric] ? rule.metric : "cpu";
        updateMetricUI();
        $("#ruleOperator").value = rule.operator === "<" ? "<" : ">";
        $("#ruleThreshold").value = rule.threshold;
        ensureOption($("#ruleDuration"), rule.duration, fmtDuration(rule.duration));
        ensureOption($("#ruleCooldown"), rule.cooldown,
            rule.cooldown >= 60 ? `${rule.cooldown / 60}h`.replace(".0h", "h") : `${rule.cooldown}m`);
        const severityInput = $(`input[name="ruleSeverity"][value="${rule.severity}"]`);
        if (severityInput) severityInput.checked = true;
        $("#chTelegram").checked = (rule.channels || []).includes("telegram");
        $("#chEmail").checked = (rule.channels || []).includes("email");
        $("#ruleRecovery").checked = Boolean(rule.recovery);
        if (rule.metric === "disk") {
            await populateDiskScope();
            ensureOption($("#ruleScope"), rule.scope);
        }
    }
    function openRuleModal(rule) {
        const target = rule && rule.id && rule.metric ? rule : null;
        setRuleModalMode(target);
        if (target) fillRuleForm(target);
        else {
            $("#ruleName").value = "";
            $("#ruleThreshold").value = "";
            $("#chTelegram").checked = false;
            $("#chEmail").checked = false;
            const warning = $('input[name="ruleSeverity"][value="warning"]');
            if (warning) warning.checked = true;
        }
        ruleModal.classList.add("show");
    }
    function editRule(id) {
        const rule = rules.find(item => item.id === id);
        if (!rule) return;
        openRuleModal(rule);
    }
    function closeRuleModal() { ruleModal.classList.remove("show"); }
    $("#openRuleModal").onclick = () => openRuleModal();
    $$("[data-open-rule-modal]").forEach(b => b.onclick = () => openRuleModal());
    $("#closeRuleModal").onclick = closeRuleModal;
    $("#cancelRuleModal").onclick = closeRuleModal;
    ruleModal.onclick = e => { if (e.target === ruleModal) closeRuleModal(); };
    function openChannelModal() { channelModal.classList.add("show"); }
    $("#closeChannelModal").onclick = () => channelModal.classList.remove("show");
    $$("[data-open-channel-modal]").forEach(b => b.onclick = openChannelModal);
    channelModal.onclick = e => { if (e.target === channelModal) channelModal.classList.remove("show"); };
    $$("[data-pick-channel]").forEach(card => card.onclick = () => {
        channelModal.classList.remove("show");
        navigateTo("settings");
    });

    function updateDashboardHeading() {
        const now = new Date(), hour = now.getHours();
        $("#dashboard h1").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        $("#dashboard .eyebrow").textContent = `Live server telemetry · ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }

    function ringSvg(percent, color) {
        const radius = 36, circumference = 2 * Math.PI * radius;
        const clamped = Math.max(0, Math.min(100, percent || 0));
        const offset = circumference * (1 - clamped / 100);
        return `<svg class="gauge-ring" viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="${radius}"></circle><circle class="value" style="--gc:${color}" cx="42" cy="42" r="${radius}" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle></svg>`;
    }

    function renderGauges(current) {
        const grid = $("#gaugesGrid");
        if (!current || current.ts === undefined) {
            grid.innerHTML = `<div class="empty-state compact is-error" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>No telemetry yet</h3><p>The sampling engine has not produced a reading. Confirm psutil is installed.</p></div>`;
            drawIcons(grid);
            return;
        }
        const tiles = [
            { metric: "cpu", ring: true, pct: current.cpu, value: `${num(current.cpu)}%` },
            { metric: "memory", ring: true, pct: current.memory, value: `${num(current.memory)}%` },
            { metric: "swap", ring: true, pct: current.swap, value: `${num(current.swap)}%` },
            { metric: "disk", ring: true, pct: current.disk,
              value: current.disk === null || current.disk === undefined ? "—" : `${num(current.disk)}%` },
            { metric: "load", value: num(current.load) },
            { metric: "network_down", value: num(current.network_down, 0), unit: "KB/s" },
            { metric: "network_up", value: num(current.network_up, 0), unit: "KB/s" },
            { metric: "disk_read", value: current.disk_read === null || current.disk_read === undefined ? "—" : num(current.disk_read, 0), unit: "KB/s" },
            { metric: "disk_write", value: current.disk_write === null || current.disk_write === undefined ? "—" : num(current.disk_write, 0), unit: "KB/s" },
            ...(current.temperature !== null && current.temperature !== undefined
                ? [{ metric: "temperature", value: num(current.temperature), unit: "°C" }] : []),
            { metric: "processes", value: num(current.processes, 0), unit: "procs" },
            ...(current.uptime !== undefined
                ? [{ custom: { icon: "timer", color: "#94a3b8", label: "Server uptime" }, value: fmtDuration(current.uptime) }] : [])
        ];
        grid.innerHTML = tiles.map(tile => {
            const spec = tile.custom || METRICS[tile.metric];
            return `<div class="gauge-tile" style="--gc:${spec.color}">
                <div class="tile-head"><span class="tile-chip"><i data-lucide="${spec.icon}"></i></span><span class="tile-name">${esc(spec.label)}</span></div>
                ${tile.ring
                    ? `<div class="ring-wrap">${ringSvg(tile.pct, spec.color)}<span class="ring-value">${esc(tile.value)}</span></div>`
                    : `<div class="tile-big">${esc(tile.value)}${tile.unit ? `<small>${esc(tile.unit)}</small>` : ""}</div>`}
            </div>`;
        }).join("");
        drawIcons(grid);
    }

    function renderTimeline(points, hours = 6) {
        const wrap = $("#historyChartWrap");
        wrap.querySelectorAll("svg.chart-svg, .chart-empty, .chart-xlabels").forEach(n => n.remove());
        const subtitle = $("#timelineSubtitle");
        if (subtitle) subtitle.textContent = `Last ${hours}h · ${points.length} samples · CPU, memory and swap`;
        if (!points.length) {
            wrap.insertAdjacentHTML("beforeend", `<div class="chart-empty dynamic"><div class="empty-icon" style="margin-bottom:13px;width:44px;height:44px;border-radius:14px"><i data-lucide="loader-circle"></i></div><strong>No samples in the last ${hours}h</strong><span>The timeline fills as the monitor keeps sampling every few seconds.</span></div>`);
            drawIcons(wrap);
            return;
        }
        const width = 720, height = 240, pad = 6;
        const nowTs = Math.floor(Date.now() / 1000);
        const t0 = nowTs - hours * 3600;
        const t1 = Math.max(nowTs, points[points.length - 1].ts);
        const series = [
            { key: "cpu", cls: "series-cpu" },
            { key: "memory", cls: "series-memory" },
            { key: "swap", cls: "series-swap" }
        ];
        const x = ts => ((ts - t0) / (t1 - t0)) * (width - pad * 2) + pad;
        const y = v => height - pad - (Math.max(0, Math.min(100, v)) / 100) * (height - pad * 2);
        const gridLines = [25, 50, 75].map(p =>
            `<line class="chart-grid-line" x1="0" y1="${y(p)}" x2="${width}" y2="${y(p)}"></line>`).join("");
        const paths = series.map(s => {
            const pts = points.filter(p => p[s.key] !== null && p[s.key] !== undefined)
                .map(p => `${x(p.ts).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(" ");
            return pts ? `<polyline class="series ${s.cls}" points="${pts}"></polyline>` : "";
        }).join("");
        const stamp = ts => {
            const d = new Date(ts * 1000);
            const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            return t1 - t0 > 6 * 3600
                ? `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${hm}`
                : hm;
        };
        wrap.insertAdjacentHTML("beforeend",
            `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${gridLines}${paths}</svg>
             <div class="chart-xlabels"><span>${stamp(t0)}</span><span>${stamp((t0 + t1) / 2)}</span><span>${stamp(t1)}</span></div>`);
    }

    async function loadHistory(hours) {
        const h = Math.max(1, Number(hours) || 6);
        try {
            const data = await api(`/api/metrics/history?hours=${h}`);
            renderTimeline(data.points || [], h);
        } catch (error) {
            const wrap = $("#historyChartWrap");
            wrap.querySelectorAll("svg.chart-svg, .chart-empty, .chart-xlabels").forEach(n => n.remove());
            wrap.insertAdjacentHTML("beforeend", `<div class="chart-empty dynamic"><div class="empty-icon" style="margin-bottom:13px;width:44px;height:44px;border-radius:14px"><i data-lucide="triangle-alert"></i></div><strong>Timeline unavailable</strong><span>${esc(error.message)}</span></div>`);
            drawIcons(wrap);
        }
    }

    function severityTrend(sev) { return sev === "critical" ? "alert" : sev === "warning" ? "warn" : ""; }

    function renderActiveAlerts(active) {
        const list = $("#activeAlertList");
        list.innerHTML = active.map(item => {
            const spec = METRICS[item.metric] || {};
            return `<div class="activity">
                <div class="activity-icon" style="color:${item.severity === "critical" ? "#ff7979" : item.severity === "warning" ? "#fbbf58" : "#61c7ff"}">!</div>
                <div><div class="activity-title">${esc(item.rule_name)}</div>
                <div class="activity-detail">${esc(spec.label || item.metric)} peak ${esc(fmtValue(item.metric, item.peak))} · since ${date(item.opened_at)}</div></div>
                <span class="status open">${esc(item.severity)}</span></div>`;
        }).join("") || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="shield-check"></i></div><h3>All thresholds normal</h3><p>No rule is currently breaching. Open incidents will appear here in real time.</p></div>`;
        drawIcons(list);
    }

    function renderRecentEvents(events) {
        const list = $("#recentEvents");
        const iconMap = {
            alert_triggered: ["!", "#ff7979"], alert_simulated: ["~", "#a99aff"],
            alert_resolved: ["✓", "#62dc8a"], notification_delivered: ["➤", "#62dc8a"],
            notification_failed: ["×", "#ff7979"], settings_updated: ["⚙", "#a99aff"],
            telegram_test: ["➤", "#62dc8a"], email_test: ["✉", "#ffc765"],
            monitor_started: ["▶", "#61c7ff"], monitor_error: ["!", "#ff7979"]
        };
        list.innerHTML = events.slice(0, 6).map(item => {
            const [glyph, color] = iconMap[item.event] || ["•", "#858da3"];
            return `<div class="activity"><div class="activity-icon" style="color:${color}">${glyph}</div>
                <div><div class="activity-title">${esc(item.event.replaceAll("_", " "))}</div>
                <div class="activity-detail">${esc(item.detail)}</div></div>
                <time style="color:#747c90;font-size:9px">${date(item.created_at)}</time></div>`;
        }).join("") || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="activity"></i></div><h3>No activity yet</h3><p>Monitor events and deliveries will appear here.</p></div>`;
        drawIcons(list);
    }

    function applyOverview(data, silent) {
        overviewData = data;
        const c = data.current || {};
        const setStat = (id, value) => { $(id).textContent = value; };
        setStat("#statCpu", c.cpu !== undefined ? `${num(c.cpu)}%` : "—");
        setStat("#statMemory", c.memory !== undefined ? `${num(c.memory)}%` : "—");
        setStat("#statDisk", c.disk !== undefined && c.disk !== null ? `${num(c.disk)}%` : "—");
        setStat("#statAlerts", data.counts.alerts_open);
        const level = pct => pct === null || pct === undefined ? ["Live", ""] : pct >= 90 ? ["High", "alert"] : pct >= 75 ? ["Elevated", "warn"] : ["Normal", ""];
        [["#cpuTrend", c.cpu], ["#memTrend", c.memory], ["#diskTrend", c.disk]].forEach(([id, v]) => {
            const [label, cls] = level(v);
            const el = $(id); el.textContent = label; el.className = `trend ${cls}`;
        });
        const alertEl = $("#alertTrend");
        alertEl.textContent = data.counts.alerts_open ? "Action needed" : "Healthy";
        alertEl.className = `trend ${data.counts.alerts_open ? "alert" : ""}`;
        $("#alertCount").textContent = data.counts.alerts_open;
        $("#ruleCount").textContent = `${data.counts.rules_enabled}/${data.counts.rules_total}`;
        const card = $(".resource-card"), cpuPct = Math.min(100, c.cpu || 0);
        $(".resource-row strong", card).textContent = c.cpu !== undefined ? `${num(c.cpu)}%` : "—";
        $(".progress-fill", card).style.width = `${cpuPct}%`;
        $$(".resource-row", card)[1].innerHTML =
            `<span>RAM ${c.memory !== undefined ? num(c.memory) + "%" : "—"} · Disk ${c.disk != null ? num(c.disk) + "%" : "—"}</span><span>+${fmtDuration(data.monitor.uptime)} uptime</span>`;
        $("#dashboard .page-description").textContent = !data.psutil_available
            ? "psutil is missing on this server; install it to activate live sampling."
            : data.counts.alerts_open
                ? `${data.counts.alerts_open} open incident(s) need your attention.`
                : `Sampling every ${data.monitor.interval}s · all monitored resources are within their thresholds.`;
        renderGauges(c);
        renderActiveAlerts(data.active_alerts);
        renderRecentEvents(data.recent_events);
    }

    async function loadDashboard() {
        updateDashboardHeading();
        try {
            const data = await api("/api/overview");
            applyOverview(data, false);
            await loadHistory($("#dashRange").value);
        } catch (error) {
            $("#activeAlertList").innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Telemetry unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons($("#activeAlertList"));
        }
    }
    $("#dashRange").onchange = () => loadHistory($("#dashRange").value);
    $("#forceSample").onclick = async () => {
        const button = $("#forceSample");
        button.disabled = true;
        try {
            const d = await api("/api/metrics/live");
            applyOverview({ ...overviewData, current: d.sample }, true);
            toast("Fresh sample collected", "The gauge panel now reflects an on-demand reading.");
        } catch (error) {
            toast("Sample failed", error.message, "error");
        } finally {
            button.disabled = false;
        }
    };

    function describeRule(rule) {
        const spec = METRICS[rule.metric] || {};
        const scopePart = rule.metric === "disk" && rule.scope ? ` on ${rule.scope}` : "";
        const duration = rule.duration > 0 ? ` for ${fmtDuration(rule.duration)}` : " instantly";
        return `${spec.label}${scopePart} ${rule.operator === "<" ? "<" : ">"} ${fmtValue(rule.metric, rule.threshold)}${duration}`;
    }
    function humanChannels(channels) {
        if (!channels.length) return "Log only (no channel)";
        return channels.map(c => c === "telegram" ? "Telegram" : "Email").join(" + ");
    }
    function ruleCard(rule) {
        const spec = METRICS[rule.metric] || {};
        const stateClass = !rule.enabled ? "paused" : rule.state === "breaching" ? "breaching" : "normal";
        const stateLabel = !rule.enabled ? "Paused" : rule.state === "breaching" ? "Breaching" : "Watching";
        return `<article class="rule-card" style="--metric-color:${spec.color}" data-name="${esc(rule.name.toLowerCase())}" data-enabled="${rule.enabled}" data-severity="${rule.severity}">
            <div class="rule-head"><span class="metric-badge" style="--metric-color:${spec.color};color:${spec.color};border-color:${spec.color}44;background:${spec.color}1f"><i data-lucide="${spec.icon}"></i></span>
            <div class="rule-primary"><h3>${esc(rule.name)}</h3><code class="condition-code" title="${esc(describeRule(rule))}">${esc(describeRule(rule))}</code></div>
            <button class="job-menu" data-delete="${rule.id}" title="Delete rule"><i data-lucide="trash-2"></i></button></div>
            <div class="rule-meta"><div><span>CHECKED EVERY</span><strong>monitor interval</strong></div><div><span>RE-NOTIFY AFTER</span><strong>${rule.cooldown >= 60 ? `${rule.cooldown / 60}h`.replace(".0h", "h") : `${rule.cooldown}m`}</strong></div></div>
            <div class="rule-channels"><span class="destination-icon"><i data-lucide="route"></i></span><span class="destination-copy">${esc(humanChannels(rule.channels))}</span><span class="sev-chip ${rule.severity}">${rule.severity}</span></div>
            <div class="rule-footer"><span class="status ${stateClass}">${stateLabel}</span>
            <div class="job-controls"><button class="run-btn" data-edit="${rule.id}"><i data-lucide="pencil"></i>Edit</button>
            <button class="run-btn" data-test="${rule.id}" title="Generate a simulated alert"><i data-lucide="zap"></i>Simulate</button>
            <button class="run-btn" data-toggle="${rule.id}">${rule.enabled ? "Pause" : "Enable"}</button></div></div></article>`;
    }
    async function loadRules(render = true) {
        try {
            const data = await api("/api/rules");
            rules = data.rules;
            $("#ruleCount").textContent = `${rules.filter(r => r.enabled).length}/${rules.length}`;
            if (!render) return;
            renderRules();
        } catch (error) { toast("Rules unavailable", error.message, "error"); }
    }
    function renderRules() {
        const search = ($("#globalSearch").value || "").toLowerCase();
        const statusFilter = $("#ruleStatusFilter").value;
        const severityFilter = $("#ruleSeverityFilter").value;
        const visible = rules.filter(r => r.name.toLowerCase().includes(search) &&
            (statusFilter === "all" || (statusFilter === "paused" ? !r.enabled : r.enabled)) &&
            (severityFilter === "all" || r.severity === severityFilter));
        const hasFilters = Boolean(search || statusFilter !== "all" || severityFilter !== "all");
        $("#rulesGrid").innerHTML = visible.map(ruleCard).join("") ||
            `<div class="empty-state"><div class="empty-icon"><i data-lucide="${hasFilters ? "search-x" : "bell-plus"}"></i></div><h3>${hasFilters ? "No matching rules" : "No alert rules yet"}</h3><p>${hasFilters ? "Adjust the search or filters to find an existing rule." : "Create your first threshold rule and Resource Sentinel will watch that metric around the clock."}</p>${hasFilters ? "" : `<button class="empty-action" data-empty-create><i data-lucide="plus"></i>Create alert rule</button>`}</div>`;
        $$("[data-toggle]").forEach(b => b.onclick = () => toggleRule(b.dataset.toggle));
        $$("[data-test]").forEach(b => b.onclick = () => simulateRule(b));
        $$("[data-edit]").forEach(b => b.onclick = () => editRule(b.dataset.edit));
        $$("[data-delete]").forEach(b => b.onclick = () => deleteRule(b.dataset.delete));
        $("[data-empty-create]")?.addEventListener("click", openRuleModal);
        drawIcons($("#rulesGrid"));
    }
    async function toggleRule(id) {
        try {
            await api(`/api/rules/${id}/toggle`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            await loadRules();
            toast("Rule updated", "Automation state changed.");
        } catch (error) { toast("Unable to update", error.message, "error"); }
    }
    async function simulateRule(button) {
        button.disabled = true;
        button.classList.add("is-busy");
        try {
            const d = await api(`/api/rules/${button.dataset.test}/test`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast("Simulation sent", d.message);
        } catch (error) {
            toast("Simulation failed", error.message, "error");
        } finally {
            button.disabled = false;
            button.classList.remove("is-busy");
        }
    }
    async function deleteRule(id) {
        const phrase = `DELETE ${id}`;
        if (prompt(`Type ${phrase} to delete this rule. Alert history remains.`) !== phrase) return;
        try {
            await api(`/api/rules/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            await loadRules();
            toast("Rule deleted", "Alert history was kept.");
        } catch (error) { toast("Delete failed", error.message, "error"); }
    }

    function deliveredBadges(delivered) {
        if (!delivered || !delivered.length) return "&mdash;";
        return delivered.map(d => {
            const label = d.channel === "telegram" ? "Telegram" : "Email";
            return d.ok
                ? `<span class="chan-badge">${esc(label)} ✓</span>`
                : `<span class="chan-badge fail" title="${esc(d.detail || "delivery failed")}">${esc(label)} ✗</span>`;
        }).join(" ");
    }
    async function loadAlerts() {
        try {
            const status = $("#alertStatusFilter").value;
            const data = await api(`/api/alerts${status ? `?status=${status}` : ""}`);
            alertsList = data.alerts;
            $("#alertCount").textContent = alertsList.filter(a => a.status === "open").length;
            const tbody = $("#alertsBody");
            tbody.innerHTML = alertsList.map(item => `<tr>
                <td><span class="table-file"><i data-lucide="${(METRICS[item.metric] || {}).icon || "bell-ring"}"></i> ${esc(item.rule_name)}</span></td>
                <td>${esc((METRICS[item.metric] || {}).label || item.metric)} ${item.operator === "<" ? "&lt;" : "&gt;"} ${esc(fmtValue(item.metric, item.threshold))}</td>
                <td>${esc(fmtValue(item.metric, item.peak))}</td>
                <td><span class="sev-chip ${item.severity}">${item.severity}</span></td>
                <td>${date(item.opened_at)}</td>
                <td>${item.resolved_at ? date(item.resolved_at) : "&mdash;"}</td>
                <td>${deliveredBadges(item.delivered)}</td>
                <td><span class="status ${item.simulated ? "info" : item.status}">${item.simulated ? "simulated" : item.status}</span></td>
                <td>${item.status === "open" && !item.simulated ? `<button class="run-btn" data-resolve="${item.id}"><i data-lucide="check"></i>Acknowledge</button>` : "&mdash;"}</td>
            </tr>`).join("") || `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon"><i data-lucide="bell-ring"></i></div><h3>No alerts recorded</h3><p>When a threshold breach fires you will see the full incident trail here with delivery results.</p><button class="empty-action" data-empty-rules><i data-lucide="bell-plus"></i>Create a rule</button></div></td></tr>`;
            $$("[data-resolve]", tbody).forEach(b => b.onclick = () => resolveAlert(b.dataset.resolve));
            $("[data-empty-rules]")?.addEventListener("click", () => navigateTo("rules"));
            drawIcons(tbody);
        } catch (error) {
            const tbody = $("#alertsBody");
            tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>History unavailable</h3><p>${esc(error.message)}</p></div></td></tr>`;
            drawIcons(tbody);
        }
    }
    async function resolveAlert(id) {
        try {
            const d = await api(`/api/alerts/${id}/resolve`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast("Alert acknowledged", d.message);
            loadAlerts();
        } catch (error) { toast("Acknowledge failed", error.message, "error"); }
    }
    $("#alertStatusFilter").onchange = loadAlerts;
    $("#exportAlerts").onclick = () => {
        const content = ["id,rule,metric,severity,status,peak,threshold,opened,resolved",
            ...alertsList.map(a => [a.id, JSON.stringify(a.rule_name), a.metric, a.severity, a.status,
            a.peak, a.threshold, date(a.opened_at), a.resolved_at ? date(a.resolved_at) : ""].join(","))].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
        a.download = "sentinel-alert-history.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("#clearAlerts").onclick = async () => {
        const phrase = "CLEAR ALERTS";
        if (prompt(`Type ${phrase} to erase the entire alert history.`) !== phrase) return;
        try {
            const d = await api("/api/alerts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("History cleared", d.message);
            loadAlerts();
        } catch (error) { toast("Clear failed", error.message, "error"); }
    };

    async function loadChannels() {
        const grid = $("#channelsGrid");
        grid.innerHTML = `<div class="empty-state is-loading" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading channels</h3><p>Checking saved Telegram and email configuration.</p></div>`;
        drawIcons(grid);
        loadNotificationLog();
        try {
            const d = await api("/api/settings"), s = d.settings;
            grid.innerHTML = `
                <article class="destination-card" data-provider="telegram">
                    <div class="job-icon telegram-glyph"></div>
                    <h3>Telegram</h3>
                    <p>Instant bot messages pushed through the official Bot API.</p>
                    <span class="status ${s.telegram_configured ? "success" : "paused"}">${s.telegram_configured ? "Connected" : "Setup required"}</span>
                    <div style="display:flex;gap:6px;margin-top:14px"><button class="run-btn" data-configure>Configure</button>${s.telegram_configured ? `<button class="run-btn danger-action" data-disconnect-channel="telegram">Disconnect</button>` : ""}</div>
                </article>
                <article class="destination-card" data-provider="email">
                    <div class="job-icon"><i data-lucide="mail-check"></i></div>
                    <h3>Email</h3>
                    <p>TLS-protected SMTP delivery for formatted alert messages.</p>
                    <span class="status ${s.email_configured ? "success" : "paused"}">${s.email_configured ? "Connected" : "Setup required"}</span>
                    <div style="display:flex;gap:6px;margin-top:14px"><button class="run-btn" data-configure>Configure</button>${s.email_configured ? `<button class="run-btn danger-action" data-disconnect-channel="email">Disconnect</button>` : ""}</div>
                </article>
                <article class="destination-card clickable" id="addChannelCard">
                    <div class="job-icon"><i data-lucide="plus"></i></div>
                    <h3>Add channel</h3>
                    <p>Connect another delivery provider for automated alerts.</p>
                    <button class="run-btn">Add channel</button>
                </article>`;
            drawIcons(grid);
            $$("[data-configure]", grid).forEach(button => button.onclick = () => navigateTo("settings"));
            $("#addChannelCard").onclick = openChannelModal;
            $$("[data-disconnect-channel]", grid).forEach(button => button.onclick = () => disconnectChannel(button.dataset.disconnectChannel));
        } catch (error) {
            grid.innerHTML = `<div class="empty-state is-error" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Channels unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(grid);
        }
    }
    async function loadNotificationLog() {
        const list = $("#notificationLog");
        list.innerHTML = `<div class="delivery-state-loading"><i data-lucide="loader-circle"></i><span>Checking recent notifications…</span></div>`;
        drawIcons(list);
        try {
            const data = await api("/api/alerts?limit=8");
            list.innerHTML = data.alerts.map(item => {
                const results = Array.isArray(item.delivered) ? item.delivered : [];
                const failed = results.some(r => !r.ok);
                const summary = results.length
                    ? results.map(r => `${r.channel === "telegram" ? "Telegram" : "Email"}: ${r.ok ? "delivered" : "failed"}`).join(" · ")
                    : "No channel was attached to this rule.";
                return `<div class="delivery-row ${failed ? "failed" : ""}">
                    <div class="delivery-result-icon"><i data-lucide="${failed ? "circle-x" : item.status === "open" ? "bell-ring" : "circle-check-big"}"></i></div>
                    <div class="delivery-result-copy"><strong>${esc(item.rule_name)}${item.simulated ? " (simulation)" : ""}</strong><span>${esc(summary)}</span></div>
                    <time>${date(item.opened_at)}</time></div>`;
            }).join("") || `<div class="delivery-empty"><div class="delivery-result-icon"><i data-lucide="send"></i></div><div><strong>No notifications yet</strong><span>Fired alerts and their channel results will be listed here.</span></div></div>`;
            drawIcons(list);
        } catch (error) {
            list.innerHTML = `<div class="delivery-empty is-error"><div class="delivery-result-icon"><i data-lucide="cloud-off"></i></div><div><strong>Status unavailable</strong><span>${esc(error.message)}</span></div></div>`;
            drawIcons(list);
        }
    }
    $("#refreshNotificationLog").onclick = loadNotificationLog;
    async function disconnectChannel(kind) {
        const phrase = `DISCONNECT ${kind}`;
        if (prompt(`Type ${phrase} to erase its saved credentials. Dependent rules will pause.`) !== phrase) return;
        try {
            const d = await api(`/api/channels/${kind}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Channel removed", d.message);
            loadChannels();
        } catch (error) { toast("Disconnect failed", error.message, "error"); }
    }

    function populateMetricSelect() {
        const select = $("#ruleMetric");
        select.innerHTML = Object.entries(METRICS).map(([key, spec]) =>
            `<option value="${key}">${esc(spec.label)}</option>`).join("");
        select.value = "cpu";
        updateMetricUI();
    }
    function updateMetricUI() {
        const metric = $("#ruleMetric").value;
        const spec = METRICS[metric];
        $("#metricHint").textContent = {
            cpu: "Total processor utilization across all cores.",
            memory: "Physical RAM utilization of the whole server.",
            swap: "Swap space utilization; growth signals memory pressure.",
            disk: "Used space percentage on the selected mount point.",
            network_down: "Average inbound network throughput in kilobytes per second.",
            network_up: "Average outbound network throughput in kilobytes per second.",
            disk_read: "Average physical disk read throughput in kilobytes per second.",
            disk_write: "Average physical disk write throughput in kilobytes per second.",
            load: "One minute kernel run queue average.",
            temperature: "Highest reported thermal zone sensor value.",
            processes: "Total process count; spikes hint at fork abuse."
        }[metric] || "";
        $("#thresholdUnit").textContent = spec.unit ? `Values are expressed in ${spec.unit}.` : "A plain numeric value without a unit.";
        $("#thresholdLabel").textContent = `THRESHOLD (${spec.unit || "value"})`;
        $("#scopeField").style.display = metric === "disk" ? "" : "none";
        if (metric === "disk") populateDiskScope();
    }
    async function populateDiskScope() {
        const select = $("#ruleScope");
        try {
            const d = await api("/api/disks");
            diskScopes = d.disks;
            select.innerHTML = diskScopes.map(disk =>
                `<option value="${esc(disk.mount)}">${esc(disk.mount)} — ${num(disk.percent)}% used</option>`).join("")
                || `<option value="/">/</option>`;
        } catch (_) {
            select.innerHTML = `<option value="/">/</option>`;
        }
    }
    $("#ruleMetric").onchange = updateMetricUI;

    async function createRule() {
        const payload = {
            name: $("#ruleName").value.trim(),
            metric: $("#ruleMetric").value,
            operator: $("#ruleOperator").value,
            threshold: parseFloat($("#ruleThreshold").value),
            duration: parseInt($("#ruleDuration").value, 10),
            cooldown: parseInt($("#ruleCooldown").value, 10),
            severity: ($('input[name="ruleSeverity"]:checked') || {}).value || "warning",
            channels: [$("#chTelegram").checked ? "telegram" : "", $("#chEmail").checked ? "email" : ""].filter(Boolean),
            recovery: $("#ruleRecovery").checked,
            scope: $("#ruleMetric").value === "disk" ? $("#ruleScope").value : ""
        };
        if (Number.isNaN(payload.threshold)) {
            toast("Threshold required", "Enter a numeric threshold for this metric.", "error");
            return;
        }
        try {
            if (editingRuleId) {
                await api(`/api/rules/${editingRuleId}/update`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(payload)
                });
                closeRuleModal();
                toast("Alert rule updated", "The sentinel is watching with the new configuration.");
            } else {
                await api("/api/rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(payload)
                });
                closeRuleModal();
                toast("Alert rule created", "The sentinel is now watching this metric.");
            }
            navigateTo("rules");
        } catch (error) { toast(editingRuleId ? "Unable to update rule" : "Unable to create rule", error.message, "error"); }
    }
    $("#createRuleButton").onclick = createRule;

    async function loadSettings() {
        const body = $("#settings .panel-body");
        body.style.visibility = "visible";
        body.innerHTML = `<div class="empty-state is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading settings</h3><p>Securely retrieving your saved configuration.</p></div>`;
        drawIcons(body);
        try {
            const d = await api("/api/settings"), s = d.settings;
            body.innerHTML = `<form id="sentinelSettings" class="settings-stack">
                <section class="provider-settings telegram-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark telegram-glyph"></span><div><div class="panel-title">Telegram bot</div><p>Instant alert delivery through the official Bot API.</p></div></div><span class="provider-badge">${s.telegram_configured ? "Configured" : "Setup required"}</span></div>
                <div class="form-grid">
                <div class="field"><label>BOT TOKEN</label><input class="input" id="tgToken" type="password" placeholder="Leave blank to keep saved token"></div>
                <div class="field"><label>CHAT ID</label><input class="input" id="tgChat" value="${esc(s.telegram_chat_id)}" placeholder="-1001234567890"></div>
                <div class="field full"><label>BOT API ENDPOINT</label><input class="input" id="tgEndpoint" value="${esc(s.telegram_api_base)}"><p class="hint-text">Keep the default api.telegram.org unless you operate a local Bot API server.</p></div>
                <div class="field full"><button type="button" class="secondary-btn" id="testTelegram">Send test message</button></div>
                </div></section>

                <section class="provider-settings email-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark"><i data-lucide="mail-check"></i></span><div><div class="panel-title">Email / SMTP</div><p>Formatted alert messages through a protected mail server.</p></div></div><span class="provider-badge">${s.email_configured ? "Configured" : "Setup required"}</span></div>
                <div class="form-grid">
                <div class="field"><label>SMTP HOST</label><input class="input" id="smtpHost" value="${esc(s.smtp_host)}"></div>
                <div class="field"><label>PORT</label><input class="input" id="smtpPort" type="number" value="${esc(s.smtp_port)}"></div>
                <div class="field"><label>SECURITY</label><select class="input" id="smtpSecurity"><option value="starttls">STARTTLS</option><option value="ssl">TLS / SSL</option><option value="none">None (local relay)</option></select></div>
                <div class="field"><label>USERNAME</label><input class="input" id="smtpUser" value="${esc(s.smtp_username)}"></div>
                <div class="field"><label>PASSWORD</label><input class="input" id="smtpPassword" type="password" placeholder="Leave blank to keep saved password"></div>
                <div class="field"><label>FROM</label><input class="input" id="smtpFrom" type="email" value="${esc(s.smtp_from)}"></div>
                <div class="field"><label>TO</label><input class="input" id="smtpTo" type="email" value="${esc(s.smtp_to)}"></div>
                <div class="field full"><button type="button" class="secondary-btn" id="testEmail">Send test email</button></div>
                </div></section>

                <section class="provider-settings engine-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark"><i data-lucide="activity"></i></span><div><div class="panel-title">Monitoring engine</div><p>Cadence, identity and history retention for the sampler.</p></div></div><span class="provider-badge">${s.psutil_available ? "Engine ready" : "psutil missing"}</span></div>
                <div class="form-grid">
                <div class="field"><label>SAMPLE EVERY</label><select class="input" id="checkInterval">
                    <option value="5">5 seconds</option><option value="10">10 seconds</option>
                    <option value="15">15 seconds</option><option value="30">30 seconds</option>
                    <option value="60">1 minute</option><option value="120">2 minutes</option>
                    <option value="300">5 minutes</option></select></div>
                <div class="field"><label>HISTORY RETENTION</label><select class="input" id="historyHours">
                    <option value="6">6 hours</option><option value="12">12 hours</option>
                    <option value="24">24 hours</option><option value="48">2 days</option>
                    <option value="72">3 days</option><option value="168">7 days</option></select></div>
                <div class="field full"><label>HOST LABEL</label><input class="input" id="hostLabel" value="${esc(s.host_label)}" placeholder="Auto (server hostname)"><p class="hint-text">Shown inside every alert message so multi-server deployments stay identifiable.</p></div>
                </div></section>
            </form>`;
            drawIcons(body);
            $("#smtpSecurity").value = s.smtp_security;
            $("#checkInterval").value = s.check_interval_seconds;
            $("#historyHours").value = s.history_hours;
            if (!s.psutil_available) toast("psutil missing", "Install psutil on this server to enable live sampling.", "warn");
            $("#testTelegram").onclick = async () => {
                if (await saveSettings(false, true)) await testEndpoint("/api/channels/telegram/test", "Telegram");
            };
            $("#testEmail").onclick = async () => {
                if (await saveSettings(false, true)) await testEndpoint("/api/channels/email/test", "Email");
            };
        } catch (error) {
            body.innerHTML = `<div class="empty-state is-error"><div class="empty-icon"><i data-lucide="settings-2"></i></div><h3>Settings unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(body);
        }
    }
    async function saveSettings(reload = true, quiet = false) {
        if (!$("#tgChat")) return false;
        const payload = {
            telegram_token: $("#tgToken").value, telegram_chat_id: $("#tgChat").value, telegram_api_base: $("#tgEndpoint").value,
            smtp_host: $("#smtpHost").value, smtp_port: $("#smtpPort").value, smtp_security: $("#smtpSecurity").value,
            smtp_username: $("#smtpUser").value, smtp_password: $("#smtpPassword").value,
            smtp_from: $("#smtpFrom").value, smtp_to: $("#smtpTo").value,
            check_interval_seconds: $("#checkInterval").value,
            history_hours: $("#historyHours").value,
            host_label: $("#hostLabel").value.trim()
        };
        try {
            const d = await api("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify(payload)
            });
            if (!quiet) toast("Settings saved", d.message);
            if (reload) loadSettings();
            return true;
        } catch (error) {
            toast("Save failed", error.message, "error");
            return false;
        }
    }
    $("#saveSettings").onclick = () => saveSettings();
    async function testEndpoint(path, label) {
        try {
            const d = await api(path, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast(`${label} connected`, d.message);
        } catch (error) {
            toast(`${label} failed`, error.message, "error");
        }
    }

    $("#globalSearch").oninput = () => {
        if ($("#rules").classList.contains("active")) renderRules();
        else navigateTo("rules");
    };
    document.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            $("#globalSearch").focus();
        }
    });
    $("#ruleStatusFilter").onchange = renderRules;
    $("#ruleSeverityFilter").onchange = renderRules;
    $("#refreshButton").onclick = () => navigateTo($(".page.active").id);

    populateMetricSelect();
    drawIcons();
    updateDashboardHeading();
    loadDashboard();
    setInterval(() => {
        if ($("#dashboard").classList.contains("active")) loadDashboard();
    }, 5000);
})();
