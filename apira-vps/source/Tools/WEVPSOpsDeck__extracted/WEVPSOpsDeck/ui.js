(() => {
    "use strict";
    const UI_VERSION = "1.1.8";
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const mount = location.pathname === "/" ? "/" : `/${location.pathname.split("/").filter(Boolean)[0]}/`;
    const icons = {
        layers: "▤", "layout-dashboard": "▦", container: "▥", "hard-drive": "▰",
        "git-branch": "⑂", "settings-2": "⚙", history: "↶", info: "i", menu: "☰",
        search: "⌕", "refresh-cw": "↻", plus: "+", save: "✓", play: "▶",
        square: "■", x: "×", "loader-circle": "↻", "cloud-off": "☁",
        eraser: "◻", "lock-keyhole": "▣", terminal: "▶_", scroll: "≡",
        clock: "◷", pencil: "✎", "arrow-down-to-line": "↓", "package-check": "▣"
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
    const date = value => value ? new Date(value * 1000).toLocaleString() : "—";
    const ago = ts => {
        if (!ts) return "—";
        const diff = Math.max(0, Date.now() / 1000 - ts);
        if (diff < 60) return `${Math.round(diff)}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };
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
        item.innerHTML = `<div class="toast-icon" style="color:${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#22c55e"};background:${type === "success" ? "" : type === "error" ? "rgba(239,68,68,.12)" : "rgba(245,158,11,.12)"}">${type === "success" ? "✓" : "!"}</div><div><div class="toast-title">${esc(title)}</div><div class="toast-message">${esc(message)}</div></div><button class="toast-close">×</button>`;
        container.appendChild(item);
        const remove = () => item.remove();
        $(".toast-close", item).onclick = remove;
        setTimeout(remove, 5200);
    }

    const sidebar = $("#sidebar"), overlay = $("#mobileOverlay");
    const repoModal = $("#repoModal"), logModal = $("#logModal"),
        branchModal = $("#branchModal"), commitModal = $("#commitModal"),
        cronModal = $("#cronModal"), runModal = $("#runModal"), diffModal = $("#diffModal"),
        watcherModal = $("#watcherModal"), screenModal = $("#screenModal"),
        newScreenModal = $("#newScreenModal");
    let containersList = [], reposList = [], cronJobs = [], cronArchived = [], editingCronId = null,
        watchersList = [], editingWatcherId = null, screensList = [], activeScreenName = null;

    function navigateTo(id) {
        $$(".page").forEach(p => p.classList.toggle("active", p.id === id));
        $$(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === id));
        sidebar.classList.remove("open"); overlay.classList.remove("show");
        if (id === "dashboard") loadDashboard();
        if (id === "containers") loadContainers();
        if (id === "images") loadImages();
        if (id === "repos") loadRepos();
        if (id === "cron") loadCron();
        if (id === "screens") loadScreens();
        if (id === "watchers") loadWatchers();
        if (id === "events") loadEvents();
        if (id === "settings") loadSettings();
        if (id === "info") loadInfo();
    }
    $$(".nav-item[data-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.page));
    $$("[data-go-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.goPage));
    $("#menuButton").onclick = () => { sidebar.classList.add("open"); overlay.classList.add("show"); };
    overlay.onclick = () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); };

    function bindModal(modal, closeId) {
        $(closeId).onclick = () => modal.classList.remove("show");
        modal.onclick = e => { if (e.target === modal) modal.classList.remove("show"); };
    }
    bindModal(repoModal, "#closeRepoModal");
    bindModal(logModal, "#closeLogModal");
    bindModal(branchModal, "#closeBranchModal");
    bindModal(commitModal, "#closeCommitModal");
    bindModal(cronModal, "#closeCronModal");
    bindModal(runModal, "#closeRunModal");
    bindModal(diffModal, "#closeDiffModal");
    bindModal(watcherModal, "#closeWatcherModal");
    bindModal(screenModal, "#closeScreenModal");
    bindModal(newScreenModal, "#closeNewScreenModal");

    /* Dashboard */

    async function loadDashboard() {
        try {
            const data = await api("/api/overview");
            applyOverview(data);
            const running = data.counts.running;
            if (!data.tools.docker) {
                $("#runningList").innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Docker unavailable</h3><p>The docker CLI was not found. Install Docker or set a custom path in Settings.</p></div>`;
            } else {
                try {
                    const list = (await api("/api/containers")).containers.filter(c => c.state === "running").slice(0, 6);
                    renderRunning(list);
                } catch (_) { renderRunning([]); }
            }
            drawIcons($("#runningList"));
        } catch (error) {
            $("#recentEvents").innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Overview unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons($("#recentEvents"));
        }
    }
    function applyOverview(data) {
        $("#statRunning").textContent = data.tools.docker ? data.counts.running : "—";
        $("#runningLabel").textContent = data.tools.docker
            ? `running · ${data.counts.stopped} stopped · ${data.counts.paused} paused`
            : "Docker unavailable";
        $("#statImages").textContent = data.tools.docker ? data.counts.images_total : "—";
        $("#statRepos").textContent = data.counts.repos_total;
        $("#statCron").textContent = data.counts.cron_total === null ? "—" : data.counts.cron_enabled ?? "—";
        $("#containerCount").textContent = data.counts.containers_total;
        $("#repoCount").textContent = data.counts.repos_total;
        $("#cronCount").textContent = data.counts.cron_total === null ? "?" : data.counts.cron_total;
        $("#screenCount").textContent = data.counts.screens_total === null || data.counts.screens_total === undefined ? "?" : data.counts.screens_total;
        const watcherBadge = $("#watcherCount");
        watcherBadge.textContent = data.counts.updates_available || 0;
        const cronTrend = $("#cronTrend");
        if (data.counts.cron_total === null) {
            cronTrend.textContent = "Cron missing";
            cronTrend.className = "trend off";
        } else if (data.counts.updates_available > 0) {
            cronTrend.textContent = `${data.counts.updates_available} update${data.counts.updates_available > 1 ? "s" : ""} ready`;
            cronTrend.className = "trend warn";
        } else {
            cronTrend.textContent = "All caught up";
            cronTrend.className = "trend";
        }
        const dockerEl = $("#dockerTrend"), gitEl = $("#gitTrend");
        dockerEl.textContent = data.tools.docker ? `Docker ${esc((data.docker_version || "").replace("Docker version ", ""))}` : "Docker missing";
        dockerEl.className = `trend ${data.tools.docker ? "" : "off"}`;
        gitEl.textContent = data.tools.git ? "Git ready" : "Git missing";
        gitEl.className = `trend ${data.tools.git ? "" : "off"}`;
        $("#dockerTool").textContent = data.tools.docker
            ? `Docker · ${(data.docker_version || "").replace("Docker version ", "")}`
            : "Docker · not found";
        $("#dockerTool").className = `tool-row strong ${data.tools.docker ? "dot-ok" : "dot-off"}`;
        $("#dockerTool").style.color = "";
        $("#gitTool").textContent = data.tools.git
            ? `Git · ${(data.git_version || "").replace("git version ", "")}`
            : "Git · not found";
        $("#gitTool").className = `tool-row strong ${data.tools.git ? "dot-ok" : "dot-off"}`;
        const desc = $("#dashboard .page-description");
        desc.textContent = !data.tools.docker && !data.tools.git
            ? "Neither the docker nor the git CLI was found on this server."
            : `${data.counts.running} running container(s) · ${data.counts.repos_total} tracked repo(s). Every action here runs locally through the real CLIs.`;
        renderEvents(data.recent_events, $("#recentEvents"), true);
    }
    function renderRunning(items) {
        const list = $("#runningList");
        list.innerHTML = items.map(c => `
            <div class="activity"><div class="activity-icon" style="color:#61c7ff">▶</div>
            <div><div class="activity-title">${esc(c.name)}</div>
            <div class="activity-detail">${esc(c.image)} · ${esc(c.status)}</div></div>
            <button class="run-btn" data-quick-stop="${esc(c.id)}"><i data-lucide="square"></i>Stop</button></div>`).join("")
            || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="container"></i></div><h3>No containers running</h3><p>Start a workload from the Containers page.</p></div>`;
        $$("[data-quick-stop]", list).forEach(b => b.onclick = () => containerAction("stop", b.dataset.quickStop, () => loadDashboard()));
        drawIcons(list);
    }
    function renderEvents(events, target, compact = false) {
        const iconMap = {
            container_started: ["▶", "#62dc8a"], container_stopped: ["■", "#fbbf58"],
            container_restarted: ["↻", "#61c7ff"], container_removed: ["×", "#ff7979"],
            image_deleted: ["×", "#ff7979"], images_pruned: ["◻", "#ff9caa"],
            repo_added: ["+", "#62dc8a"], repo_removed: ["−", "#fbbf58"],
            git_pulled: ["↓", "#62dc8a"], git_fetched: ["⟳", "#61c7ff"],
            git_checkout: ["⑂", "#c084fc"], settings_updated: ["⚙", "#a99aff"],
            job_created: ["+", "#62dc8a"], job_edited: ["✎", "#61c7ff"],
            job_deleted: ["×", "#ff7979"], job_toggled: ["◐", "#fbbf58"],
            job_ran: ["▶", "#c084fc"], watcher_added: ["+", "#62dc8a"],
            watcher_removed: ["−", "#fbbf58"], watcher_checked: ["◉", "#61c7ff"],
            watcher_error: ["!", "#ff7979"], update_started: ["↻", "#7fdcee"],
            update_applied: ["▲", "#62dc8a"], update_failed: ["▼", "#ff7979"]
        };
        target.innerHTML = events.slice(0, compact ? 8 : 200).map(item => {
            const [glyph, color] = iconMap[item.event] || ["•", "#858da3"];
            return compact
                ? `<div class="activity"><div class="activity-icon" style="color:${color}">${glyph}</div>
                   <div><div class="activity-title">${esc(item.event.replaceAll("_", " "))}</div>
                   <div class="activity-detail">${esc(item.detail)}</div></div>
                   <time style="color:#747c90;font-size:9px">${date(item.created_at)}</time></div>`
                : `<tr><td>${date(item.created_at)}</td>
                   <td><span class="status ${item.level}">${item.level}</span></td>
                   <td>${esc(item.event.replaceAll("_", " "))}</td>
                   <td class="mono" style="white-space:normal">${esc(item.detail)}</td></tr>`;
        }).join(compact ? "" : "") || (compact
            ? `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="history"></i></div><h3>No activity yet</h3><p>Operations will appear here as they happen.</p></div>`
            : "");
    }

    /* Containers */

    function stateClass(state) {
        return { running: "running", paused: "paused", exited: "exited", created: "created", dead: "dead" }[state] || "info";
    }
    async function loadContainers() {
        const grid = $("#containersGrid");
        grid.innerHTML = `<div class="empty-state is-loading" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading containers</h3><p>Querying the Docker engine.</p></div>`;
        drawIcons(grid);
        try {
            const data = await api("/api/containers");
            containersList = data.containers;
            $("#containerCount").textContent = containersList.length;
            renderContainers();
        } catch (error) {
            grid.innerHTML = `<div class="empty-state is-error" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Docker unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(grid);
        }
    }
    function renderContainers() {
        const search = ($("#globalSearch").value || "").toLowerCase();
        const filter = $("#stateFilter").value;
        const visible = containersList.filter(c =>
            (c.name.toLowerCase().includes(search) || c.image.toLowerCase().includes(search)) &&
            (filter === "all" || c.state === filter));
        $("#containersGrid").innerHTML = visible.map(c => `
            <article class="op-card" data-name="${esc(c.name.toLowerCase())}" style="--metric-color:${c.state === "running" ? "#46c8de" : c.state === "paused" ? "#fbbf24" : "#94a3b8"}">
                <div class="op-head"><span class="op-badge" style="border:1px solid color-mix(in srgb,var(--metric-color) 30%,transparent);background:color-mix(in srgb,var(--metric-color) 12%,transparent);color:var(--metric-color)"><i data-lucide="container"></i></span>
                <div class="op-primary"><h3 title="${esc(c.name)}">${esc(c.name)}</h3><p class="op-sub" title="${esc(c.image)}">${esc(c.image)}</p></div>
                <button class="job-menu" data-remove-container="${esc(c.id)}" data-name="${esc(c.name)}" title="Remove container"><i data-lucide="trash-2"></i></button></div>
                <div class="op-meta">
                    <div><span>ID</span><strong class="mono">${esc(c.id)}</strong></div>
                    <div><span>UPTIME</span><strong title="${esc(c.created)}">${esc(c.created)}</strong></div>
                </div>
                <div class="op-strip"><span class="strip-icon"><i data-lucide="terminal"></i></span><span class="strip-copy" title="${esc(c.ports || "no published ports")}">${esc(c.ports || "No published ports")}</span></div>
                <div class="op-footer"><span class="status ${stateClass(c.state)}">${esc(c.state)}</span>
                <div class="job-controls">
                    <button class="run-btn green-action" data-caction="start" data-ref="${esc(c.id)}" ${c.state === "running" ? "disabled style='opacity:.45;cursor:default'" : ""}><i data-lucide="play"></i>Start</button>
                    <button class="run-btn amber-action" data-caction="stop" data-ref="${esc(c.id)}" ${c.state !== "running" && c.state !== "paused" ? "disabled style='opacity:.45;cursor:default'" : ""}><i data-lucide="square"></i>Stop</button>
                    <button class="run-btn" data-caction="restart" data-ref="${esc(c.id)}"><i data-lucide="refresh-cw"></i>Restart</button>
                    <button class="run-btn" data-logs="${esc(c.id)}" data-logname="${esc(c.name)}" data-state="${esc(c.state)}"><i data-lucide="terminal"></i>Console</button>
                </div></div>
            </article>`).join("")
            || `<div class="empty-state"><div class="empty-icon"><i data-lucide="${search || filter !== "all" ? "search-x" : "container"}"></i></div><h3>${search || filter !== "all" ? "No matching containers" : "No containers found"}</h3><p>${search || filter !== "all" ? "Adjust the search or the state filter." : "Workloads started through docker or compose will appear here."}</p></div>`;
        $$("[data-caction]").forEach(b => b.onclick = () => {
            if (b.disabled) return;
            containerAction(b.dataset.caction, b.dataset.ref, loadContainers);
        });
        $$("[data-remove-container]").forEach(b => b.onclick = () => removeContainer(b.dataset.removeContainer, b.dataset.name));
        $$("[data-logs]").forEach(b => b.onclick = () => openLogs(b.dataset.logs, b.dataset.logname, b.dataset.state));
        drawIcons($("#containersGrid"));
    }
    async function containerAction(action, ref, done) {
        try {
            const d = await api(`/api/containers/${ref}/${action}`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast(`Container ${action}ed`, d.message);
        } catch (error) {
            toast(`${action} failed`, error.message, "error");
        }
        if (done) done();
    }
    async function removeContainer(ref, name) {
        const phrase = `REMOVE ${ref}`;
        if (prompt(`Type ${phrase} to remove "${name}". Running containers are force-removed.`) !== phrase) return;
        try {
            const d = await api(`/api/containers/${ref}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Container removed", d.message);
            loadContainers();
        } catch (error) { toast("Remove failed", error.message, "error"); }
    }
    let consoleRef = null;
    let browsePath = "/";
    const browseStorageKey = () => `opsdeck-browse-${consoleRef}`;
    async function openLogs(ref, name, state) {
        consoleRef = ref;
        try { browsePath = localStorage.getItem(browseStorageKey()) || "/"; } catch (_) { browsePath = "/"; }
        $("#logTitle").textContent = name || ref;
        $("#logSubtitle").textContent = "Logs, files and shell — everything inside this container";
        switchCtab("logs");
        $("#logStats").style.display = "none";
        $("#logContent").textContent = "Loading…";
        $("#consoleOutput").textContent = "Output appears here.";
        logModal.classList.add("show");
        drawIcons(logModal);
        const load = async () => {
            const tail = $("#tailSelect").value;
            try {
                const [logData, statsData] = await Promise.allSettled([
                    api(`/api/containers/${ref}/logs?tail=${tail}`),
                    api(`/api/containers/${ref}/stats`)
                ]);
                if (logData.status === "fulfilled") {
                    $("#logContent").textContent = logData.value.content.trim() || "(empty log output)";
                    $("#logContent").scrollTop = $("#logContent").scrollHeight;
                } else {
                    $("#logContent").textContent = `Failed to read logs: ${logData.reason.message}`;
                }
                if (statsData.status === "fulfilled") {
                    const s = statsData.value;
                    $("#logStats").style.display = "";
                    $("#logStats").innerHTML = `
                        <div class="stat-mini"><span>CPU</span><strong>${esc(s.cpu)}</strong></div>
                        <div class="stat-mini"><span>Memory</span><strong>${esc(s.memory)}</strong></div>
                        <div class="stat-mini"><span>Mem %</span><strong>${esc(s.mem_percent)}</strong></div>
                        <div class="stat-mini"><span>Net I/O</span><strong>${esc(s.net_io)}</strong></div>
                        <div class="stat-mini"><span>Block I/O</span><strong>${esc(s.block_io)}</strong></div>`;
                } else {
                    $("#logStats").style.display = "none";
                }
            } catch (error) {
                $("#logContent").textContent = error.message;
            }
        };
        $("#tailSelect").onchange = load;
        $("#downloadLogs").onclick = e => {
            e.preventDefault();
            location.href = `${mount}api/containers/${ref}/logs?tail=5000&download=1`;
        };
        await load();
    }
    function switchCtab(tab) {
        $$("[data-ctab]").forEach(b => b.classList.toggle("active", b.dataset.ctab === tab));
        $("#ctab-logs").style.display = tab === "logs" ? "" : "none";
        $("#ctab-inside").style.display = tab === "inside" ? "" : "none";
        if (tab === "inside") loadContainerBrowser();
    }
    $$("[data-ctab]").forEach(b => b.onclick = () => switchCtab(b.dataset.ctab));

    const fmtSize = bytes => {
        if (!bytes) return "";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    };
    const joinBrowsePath = (base, name) => base.replace(/\/+$/, "") + "/" + name;
    async function loadContainerBrowser(path) {
        if (path !== undefined) browsePath = path;
        const listEl = $("#containerFiles"), crumbsEl = $("#browseCrumbs");
        if (!consoleRef || !listEl) return;
        let acc = "", crumbs = `<span class="crumb" data-crumb="/">root</span>`;
        for (const part of browsePath.split("/").filter(Boolean)) {
            acc += "/" + part;
            crumbs += ` <span style="color:#4d5566">›</span> <span class="crumb" data-crumb="${esc(acc)}">${esc(part)}</span>`;
        }
        crumbsEl.innerHTML = crumbs;
        $$("#browseCrumbs [data-crumb]").forEach(s => s.onclick = () => loadContainerBrowser(s.dataset.crumb));
        listEl.innerHTML = `<div class="empty-state compact is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading files</h3></div>`;
        try {
            const d = await api(`/api/containers/${encodeURIComponent(consoleRef)}/browse?path=${encodeURIComponent(browsePath)}`);
            try { localStorage.setItem(browseStorageKey(), browsePath); } catch (_) {}
            listEl.innerHTML = d.entries.map(e => {
                const isDir = e.type === "dir" || e.type === "link";
                return `<div class="branch-item" data-entry-name="${esc(e.name)}" data-entry-type="${e.type}" style="padding:7px 10px;font-size:11px;cursor:pointer">
                    <i data-lucide="${isDir ? "folder" : "scroll"}"></i>
                    <span style="flex:1;color:${isDir ? "#8fdcef" : "#c9d2de"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.name)}${e.type === "dir" ? "/" : e.type === "link" ? " →" : ""}</span>
                    <span style="color:#5a6273;font-size:9.5px">${isDir ? "" : fmtSize(e.size)}</span>
                </div>`;
            }).join("")
                || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="folder"></i></div><h3>Empty directory</h3></div>`
                + (d.truncated ? `<p class="hint-text" style="margin:6px 2px 0">Only the first 400 entries are shown — type a deeper path below.</p>` : "");
            drawIcons(listEl);
            $$("#containerFiles [data-entry-name]").forEach(item => item.onclick = () => {
                const full = joinBrowsePath(browsePath, item.dataset.entryName);
                if (item.dataset.entryType === "dir" || item.dataset.entryType === "link") {
                    loadContainerBrowser(full);
                } else {
                    $("#innerPath").value = full;
                    innerFile("read");
                }
            });
        } catch (error) {
            listEl.innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Browse failed</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(listEl);
        }
    }
    $("#browseUp").onclick = () => {
        const parts = browsePath.split("/").filter(Boolean);
        parts.pop();
        loadContainerBrowser("/" + parts.join("/"));
    };
    $$(".browse-shortcut").forEach(b => b.onclick = () => loadContainerBrowser(b.dataset.shortcut));
    async function innerFile(action) {
        const path = $("#innerPath").value.trim();
        if (!path.startsWith("/")) {
            $("#consoleOutput").textContent = "Enter an absolute path inside the container (starts with /).";
            return;
        }
        $("#consoleOutput").textContent = action === "list" ? "Listing…" : "Reading…";
        try {
            const d = await api(`/api/containers/${consoleRef}/file?path=${encodeURIComponent(path)}&lines=${$("#innerLines").value}&action=${action}`);
            $("#consoleOutput").textContent = d.content || "(empty)";
        } catch (error) {
            $("#consoleOutput").textContent = error.message;
        }
    }
    $$("[data-inner-action]").forEach(b => b.onclick = () => innerFile(b.dataset.innerAction));
    async function runExec() {
        const command = $("#execCommand").value.trim();
        if (!command) return;
        $("#execRun").disabled = true;
        $("#consoleOutput").textContent = "Running…";
        try {
            const d = await api(`/api/containers/${consoleRef}/exec`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ command })
            });
            $("#consoleOutput").textContent =
                `$ ${command}\n${d.output.trim() || "(no output)"}\n\n# exit ${d.exit_code}`;
        } catch (error) {
            $("#consoleOutput").textContent = error.message;
        } finally {
            $("#execRun").disabled = false;
        }
    }
    $("#execRun").onclick = runExec;

    /* Images */

    async function loadImages() {
        const tbody = $("#imagesBody");
        try {
            const data = await api("/api/images");
            const search = ($("#globalSearch").value || "").toLowerCase();
            const visible = data.images.filter(i =>
                i.repository.toLowerCase().includes(search) || i.id.includes(search));
            tbody.innerHTML = visible.map(img => `
                <tr><td><strong>${esc(img.repository || "&lt;none&gt;")}</strong></td>
                <td class="mono">${esc(img.tag)}</td>
                <td class="mono">${esc(img.id)}</td>
                <td>${esc(img.created)}</td>
                <td class="mono">${esc(img.size)}</td>
                <td><button class="run-btn danger-action" data-del-image="${esc(img.id)}">Delete</button></td></tr>`).join("")
                || `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><i data-lucide="${search ? "search-x" : "hard-drive"}"></i></div><h3>${search ? "No matching images" : "No local images"}</h3><p>${search ? "Try a different search term." : "Pulled or built images will be listed here."}</p></div></td></tr>`;
            $$("[data-del-image]").forEach(b => b.onclick = () => deleteImage(b.dataset.delImage));
            drawIcons(tbody);
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Images unavailable</h3><p>${esc(error.message)}</p></div></td></tr>`;
            drawIcons(tbody);
        }
    }
    async function deleteImage(ref) {
        const phrase = `DELETE IMAGE ${ref}`;
        if (prompt(`Type ${phrase} to delete image ${ref}. Images in use are rejected.`) !== phrase) return;
        try {
            const d = await api(`/api/images/${ref}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Image deleted", d.message);
            loadImages();
        } catch (error) { toast("Delete failed", error.message, "error"); }
    }
    $("#pruneImages").onclick = async () => {
        const phrase = "PRUNE IMAGES";
        if (prompt(`Type ${phrase} to delete all dangling (unused untagged) images.`) !== phrase) return;
        try {
            const d = await api("/api/images/prune", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Prune complete", d.message);
        } catch (error) { toast("Prune failed", error.message, "error"); }
    };

    /* Repos */

    $("#openRepoModal").onclick = () => repoModal.classList.add("show");
    $$("[data-open-repo-modal]").forEach(b => b.onclick = () => repoModal.classList.add("show"));
    $("#cancelRepoModal").onclick = () => repoModal.classList.remove("show");
    $$("[data-open-cron-modal]").forEach(b => b.onclick = () => openCronModal());
    $("#saveCronButton").onclick = () => saveCronTask();
    $("#cancelCronModal").onclick = () => cronModal.classList.remove("show");
    $("#cronBuilderFields").addEventListener("input", syncExpr);
    $("#cronBuilderFields").addEventListener("change", syncExpr);
    $("#cronSchedule").addEventListener("input", syncExpr);
    $("#cronSchedule").addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); $("#cronCommand").focus(); }
    });
    $("#cronCommand").addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); saveCronTask(); }
    });
    $("#createRepoButton").onclick = async () => {
        const path = $("#repoPath").value.trim();
        try {
            const d = await api("/api/repos", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ path })
            });
            repoModal.classList.remove("show");
            $("#repoPath").value = "";
            toast("Repository tracked", d.message);
            navigateTo("repos");
        } catch (error) { toast("Unable to track repository", error.message, "error"); }
    };

    async function loadRepos() {
        const grid = $("#reposGrid");
        grid.innerHTML = `<div class="empty-state is-loading" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading repositories</h3><p>Reading branch and working-tree status for each checkout.</p></div>`;
        drawIcons(grid);
        try {
            const data = await api("/api/repos");
            reposList = data.repos;
            $("#repoCount").textContent = reposList.length;
            renderRepos();
        } catch (error) {
            grid.innerHTML = `<div class="empty-state is-error" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Repositories unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(grid);
        }
    }
    function renderRepos() {
        const search = ($("#globalSearch").value || "").toLowerCase();
        const visible = reposList.filter(r =>
            r.name.toLowerCase().includes(search) || r.path.toLowerCase().includes(search));
        $("#reposGrid").innerHTML = visible.map(r => {
            const st = r.status;
            const chips = !st ? ""
                : `${st.ahead ? `<span class="mini-chip chip-ahead">↑${st.ahead}</span>` : ""}${st.behind ? `<span class="mini-chip chip-behind">↓${st.behind}</span>` : ""}${st.changes_total ? `<span class="mini-chip chip-dirty" title="${esc(st.dirty_summary || "uncommitted changes")}">${st.changes_total} changed</span>` : `<span class="mini-chip chip-clean">clean</span>`}`;
            return `
            <article class="op-card" data-name="${esc(r.name.toLowerCase())}" style="--metric-color:#f59e0b">
                <div class="op-head"><span class="op-badge" style="border:1px solid rgba(245,158,11,.32);background:rgba(245,158,11,.12);color:#ffd27e"><i data-lucide="git-branch"></i></span>
                <div class="op-primary"><h3 title="${esc(r.name)}">${esc(r.name)}</h3><p class="op-sub" title="${esc(r.path)}">${esc(r.path)}</p></div>
                <button class="job-menu" data-forget-repo="${esc(r.id)}" data-name="${esc(r.name)}" title="Stop tracking"><i data-lucide="trash-2"></i></button></div>
                <div class="op-meta">
                    <div><span>BRANCH</span><strong class="mono" title="${esc(st?.branch || "?")}">${esc(st?.branch || "unknown")}</strong></div>
                    <div><span>LAST COMMIT</span><strong title="${esc(st?.last_commit_ts ? date(st.last_commit_ts) : "")}">${ago(st?.last_commit_ts)}</strong></div>
                </div>
                <div class="op-strip"><span class="strip-icon"><i data-lucide="history"></i></span><span class="strip-copy" title="${esc(st?.dirty_summary || "")}">${esc(st?.dirty_summary || (r.status_error ? r.status_error : "Working tree clean"))}</span>${chips}</div>
                <div class="op-footer"><span class="status ${st && st.changes_total ? "warning" : "success"}">${st ? (st.changes_total ? `${st.changes_total} change(s)` : "Clean tree") : "Unreadable"}</span>
                <div class="job-controls">
                    <button class="run-btn green-action" data-pull-repo="${esc(r.id)}"><i data-lucide="arrow-down-to-line"></i>Pull</button>
                    <button class="run-btn" data-fetch-repo="${esc(r.id)}"><i data-lucide="refresh-cw"></i>Fetch</button>
                    <button class="run-btn" data-branches-repo="${esc(r.id)}" data-name="${esc(r.name)}"><i data-lucide="git-branch"></i>Branches</button>
                    <button class="run-btn" data-commits-repo="${esc(r.id)}" data-name="${esc(r.name)}"><i data-lucide="history"></i>History</button>
                </div></div>
            </article>`;
        }).join("")
            || `<div class="empty-state"><div class="empty-icon"><i data-lucide="${search ? "search-x" : "git-branch"}"></i></div><h3>${search ? "No matching repositories" : "No repositories tracked"}</h3><p>${search ? "Adjust your search." : "Track an existing server-side checkout to review and sync it from here."}</p>${search ? "" : `<button class="run-btn" data-open-repo-modal style="margin-top:16px"><i data-lucide="plus"></i>Track repository</button>`}</div>`;
        $$("[data-open-repo-modal]").forEach(b => b.onclick = () => repoModal.classList.add("show"));
        $$("[data-pull-repo]").forEach(b => b.onclick = () => repoSync("pull", b.dataset.pullRepo));
        $$("[data-fetch-repo]").forEach(b => b.onclick = () => repoSync("fetch", b.dataset.fetchRepo));
        $$("[data-branches-repo]").forEach(b => b.onclick = () => openBranches(b.dataset.branchesRepo, b.dataset.name));
        $$("[data-commits-repo]").forEach(b => b.onclick = () => openCommits(b.dataset.commitsRepo, b.dataset.name));
        $$("[data-forget-repo]").forEach(b => b.onclick = () => forgetRepo(b.dataset.forgetRepo, b.dataset.name));
        drawIcons($("#reposGrid"));
    }
    async function repoSync(kind, id) {
        const button = $(`[data-${kind}-repo="${id}"]`);
        button.disabled = true;
        button.classList.add("is-busy");
        try {
            const d = await api(`/api/repos/${id}/${kind}`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast(kind === "pull" ? "Pull finished" : "Fetch finished", d.message);
            loadRepos();
        } catch (error) {
            toast(kind === "pull" ? "Pull failed" : "Fetch failed", error.message, "error");
            button.disabled = false;
            button.classList.remove("is-busy");
        }
    }
    async function openBranches(id, name) {
        $("#branchTitle").textContent = `Branches · ${name}`;
        $("#branchList").innerHTML = `<div class="empty-state compact is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading branches</h3></div>`;
        branchModal.classList.add("show");
        try {
            const data = await api(`/api/repos/${id}/branches`);
            $("#branchList").innerHTML = data.branches.map(b => `
                <div class="branch-item ${b.current ? "current" : ""}" data-checkout="${b.current ? "" : esc(b.name)}">
                    <span>${esc(b.name)} ${b.current ? '<span class="mini-chip chip-clean">current</span>' : ""}</span>
                    ${b.current ? "" : '<span class="mono">switch →</span>'}
                </div>`).join("") || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="git-branch"></i></div><h3>No branches found</h3></div>`;
            $$("[data-checkout]", $("#branchList")).forEach(item => item.onclick = async () => {
                const branch = item.dataset.checkout;
                if (!branch) return;
                if (!confirm(`Switch this repository to "${branch}"? Uncommitted changes may block the checkout.`)) return;
                try {
                    const d = await api(`/api/repos/${id}/checkout`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                        body: JSON.stringify({ branch })
                    });
                    branchModal.classList.remove("show");
                    toast("Branch switched", d.message);
                    loadRepos();
                } catch (error) { toast("Checkout failed", error.message, "error"); }
            });
        } catch (error) {
            $("#branchList").innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Unavailable</h3><p>${esc(error.message)}</p></div>`;
        }
        drawIcons(branchModal);
    }
    async function openCommits(id, name) {
        $("#commitTitle").textContent = `History · ${name}`;
        $("#commitList").innerHTML = `<div class="empty-state compact is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading commits</h3></div>`;
        commitModal.classList.add("show");
        try {
            const data = await api(`/api/repos/${id}/commits?limit=15`);
            $("#commitList").innerHTML = data.commits.map(c => `
                <div class="commit-item">
                    <span class="commit-hash">${esc(c.hash)}</span>
                    <span class="commit-author">${esc(c.author)}</span>
                    <span class="commit-msg" title="${esc(c.message)}">${esc(c.message)}</span>
                    <span class="commit-time">${ago(c.ts)} · ${c.ts ? date(c.ts) : ""}</span>
                </div>`).join("") || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="history"></i></div><h3>No commits yet</h3></div>`;
        } catch (error) {
            $("#commitList").innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Unavailable</h3><p>${esc(error.message)}</p></div>`;
        }
        drawIcons(commitModal);
    }
    async function forgetRepo(id, name) {
        const phrase = `FORGET ${id}`;
        if (prompt(`Type ${phrase} to stop tracking "${name}". Files stay untouched.`) !== phrase) return;
        try {
            const d = await api(`/api/repos/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Repository untracked", d.message);
            loadRepos();
        } catch (error) { toast("Failed", error.message, "error"); }
    }

    /* Scheduled tasks (cron) */

    const CRON_MODES = [
        { id: "minutes", label: "Every N min" },
        { id: "hours", label: "Every N hours" },
        { id: "daily", label: "Daily at…" },
        { id: "weekly", label: "Weekly on…" },
        { id: "monthly", label: "Monthly on…" },
        { id: "boot", label: "At boot" },
        { id: "custom", label: "Custom" }
    ];
    const WEEKDAYS = [["0", "Sunday"], ["1", "Monday"], ["2", "Tuesday"],
        ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"]];
    let cronMode = "hours";
    function clampInt(raw, low, high, fallback) {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return fallback;
        return Math.min(high, Math.max(low, n));
    }
    function initCronModes() {
        $("#cronModes").innerHTML = CRON_MODES.map(m =>
            `<button type="button" class="preset-chip${m.id === cronMode ? " active-mode" : ""}" data-mode="${m.id}">${m.label}</button>`).join("");
        $$("#cronModes .preset-chip").forEach(chip => chip.onclick = () => setCronMode(chip.dataset.mode));
    }
    function numField(id, label, value, min, max) {
        return `<div class="field"><label>${label}</label><input class="input" data-builder type="number" id="${id}" value="${value}" min="${min}" max="${max}"></div>`;
    }
    function timeField(id, label, value) {
        return `<div class="field"><label>${label}</label><input class="input" data-builder type="time" id="${id}" value="${value}"></div>`;
    }
    function selectField(id, label, options, selected) {
        return `<div class="field"><label>${label}</label><select class="input" data-builder id="${id}">${
            options.map(([v, l]) => `<option value="${v}"${v === selected ? " selected" : ""}>${l}</option>`).join("")
        }</select></div>`;
    }
    function renderCronBuilder() {
        const wrap = $("#cronBuilderFields");
        $("#customWrap").style.display = cronMode === "custom" ? "" : "none";
        wrap.style.display = cronMode === "custom" ? "none" : "";
        if (cronMode === "minutes") {
            wrap.innerHTML = numField("bEvery", "RUN EVERY (MINUTES)", 10, 1, 59);
        } else if (cronMode === "hours") {
            wrap.innerHTML = numField("bEvery", "RUN EVERY (HOURS)", 6, 1, 23) +
                numField("bAtMin", "AT MINUTE", 0, 0, 59);
        } else if (cronMode === "daily") {
            wrap.innerHTML = timeField("bTime", "AT TIME", "03:00");
        } else if (cronMode === "weekly") {
            wrap.innerHTML = selectField("bDay", "ON WEEKDAY", WEEKDAYS, "1") +
                timeField("bTime", "AT TIME", "03:00");
        } else if (cronMode === "monthly") {
            wrap.innerHTML = selectField("bDom", "ON DAY OF MONTH",
                Array.from({ length: 28 }, (_, i) => [String(i + 1), String(i + 1)]), "1") +
                timeField("bTime", "AT TIME", "00:00");
        } else {
            wrap.innerHTML = "";
        }
        drawIcons(wrap);
    }
    function buildExpr() {
        const v = id => ($(id) || {}).value;
        if (cronMode === "boot") return "@reboot";
        if (cronMode === "custom") return $("#cronSchedule").value.trim();
        if (cronMode === "minutes") return `*/${clampInt(v("#bEvery"), 1, 59, 10)} * * * *`;
        if (cronMode === "hours") {
            const n = clampInt(v("#bEvery"), 1, 23, 6);
            const at = clampInt(v("#bAtMin"), 0, 59, 0);
            return `${at} ${n === 1 ? "*" : `*/${n}`} * * *`;
        }
        const parsed = /^(\d{1,2}):(\d{2})$/.exec(v("#bTime") || "");
        const H = parsed ? String(+parsed[1]) : "3";
        const M = parsed ? String(+parsed[2]) : "0";
        if (cronMode === "daily") return `${M} ${H} * * *`;
        if (cronMode === "weekly") return `${M} ${H} * * ${v("#bDay") ?? "1"}`;
        if (cronMode === "monthly") return `${M} ${H} ${v("#bDom") ?? "1"} * *`;
        return "";
    }
    let previewTimer = null;
    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(previewCron, 320);
    }
    async function previewCron() {
        const raw = $("#cronSchedule").value.trim();
        const box = $("#cronPreview");
        if (!raw) { box.style.display = "none"; return; }
        try {
            const d = await api("/api/cron/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ schedule: raw })
            });
            box.style.display = "";
            box.style.borderColor = "";
            box.style.background = "";
            $("#cronPreviewHuman").style.color = "";
            $("#cronPreviewHuman").textContent = d.human;
            $("#cronPreviewNext").textContent = d.next.length
                ? `Next runs: ${d.next.map(ts => new Date(ts * 1000).toLocaleString()).join("  ·  ")}`
                : "This expression never produces a future run.";
        } catch (error) {
            box.style.display = "";
            box.style.borderColor = "rgba(239,68,68,.35)";
            box.style.background = "rgba(239,68,68,.06)";
            $("#cronPreviewHuman").style.color = "#ff8b99";
            $("#cronPreviewHuman").textContent = error.message;
            $("#cronPreviewNext").textContent = "";
        }
    }
    function syncExpr() {
        const expr = buildExpr();
        $("#cronExprEcho").textContent = expr || "—";
        $("#cronSchedule").value = expr;
        schedulePreview();
    }
    function setCronMode(mode) {
        cronMode = mode;
        initCronModes();
        renderCronBuilder();
        syncExpr();
    }
    function loadScheduleIntoBuilder(expr) {
        let m;
        if (expr.startsWith("@")) {
            setCronMode(expr === "@reboot" ? "boot" : "custom");
            if (expr !== "@reboot") $("#cronSchedule").value = expr;
            syncExpr();
            return;
        }
        const padTime = (H, M) => `${String(+H).padStart(2, "0")}:${M.padStart(2, "0")}`;
        if ((m = new RegExp("^\\*/(\\d+) \\* \\* \\* \\*$").exec(expr))) {
            setCronMode("minutes");
            $("#bEvery").value = m[1];
        } else if ((m = new RegExp("^(\\d+) \\*/(\\d+) \\* \\* \\*$").exec(expr))) {
            setCronMode("hours");
            $("#bAtMin").value = String(+m[1]);
            $("#bEvery").value = m[2];
        } else if ((m = new RegExp("^(\\d+) (\\d+) \\* \\* \\*$").exec(expr))) {
            setCronMode("daily");
            $("#bTime").value = padTime(m[2], m[1]);
        } else if ((m = new RegExp("^(\\d+) (\\d+) \\* \\* (\\d)$").exec(expr))) {
            setCronMode("weekly");
            $("#bDay").value = m[3];
            $("#bTime").value = padTime(m[2], m[1]);
        } else if ((m = new RegExp("^(\\d+) (\\d+) (\\d+) \\* \\*$").exec(expr))) {
            setCronMode("monthly");
            $("#bDom").value = m[3];
            $("#bTime").value = padTime(m[2], m[1]);
        } else {
            setCronMode("custom");
            $("#cronSchedule").value = expr;
        }
        syncExpr();
    }
    function openCronModal(job) {
        editingCronId = job ? job.id : null;
        $("#cronModalTitle").textContent = job ? "Edit scheduled task" : "New scheduled task";
        $("#cronModalSubtitle").textContent = job
            ? "Changes are written back to the crontab atomically."
            : "Pick a pattern, write the command - OpsDeck builds the cron line for you.";
        $("#saveCronButton").innerHTML = job
            ? '<i data-lucide="save"></i>Save changes'
            : '<i data-lucide="plus"></i>Create task';
        $("#cronCommand").value = job ? job.command : "";
        $("#cronComment").value = job ? job.comment : "";
        $("#cronPreview").style.display = "none";
        if (job) loadScheduleIntoBuilder(job.schedule);
        else setCronMode("hours");
        cronModal.classList.add("show");
        drawIcons(cronModal);
    }
    async function loadCron() {
        const tbody = $("#cronBody");
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading crontab</h3><p>Reading the current user's scheduled tasks.</p></div></td></tr>`;
        try {
            const data = await api("/api/cron");
            if (data.available === false) {
                $("#cronCount").textContent = "?";
                tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Crontab unavailable</h3><p>${esc(data.error || "The crontab CLI was not found.")}</p></div></td></tr>`;
                drawIcons(tbody);
                return;
            }
            cronJobs = data.jobs;
            cronArchived = data.archived || [];
            const enabledCount = cronJobs.filter(j => j.enabled).length;
            $("#cronCount").textContent = cronJobs.length;
            renderCron();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Crontab unavailable</h3><p>${esc(error.message)}</p></div></td></tr>`;
            drawIcons(tbody);
        }
    }
    function renderCron() {
        const filter = $("#cronFilter").value;
        const search = ($("#globalSearch").value || "").toLowerCase();
        const matches = (command, comment, schedule) =>
            !search || command.toLowerCase().includes(search) ||
            (comment || "").toLowerCase().includes(search) || schedule.includes(search);
        const visible = cronJobs.filter(job =>
            matches(job.command, job.comment, job.schedule) &&
            (filter === "all" ||
             (filter === "enabled" && job.enabled) ||
             (filter === "disabled" && !job.enabled) ||
             (filter === "invalid" && !job.valid)));
        const visibleDeleted = (filter === "all" || filter === "deleted")
            ? cronArchived.filter(j => matches(j.command, j.comment, j.schedule))
            : [];
        const tbody = $("#cronBody");
        const liveRows = visible.map(job => `
            <tr>
                <td>
                    <div style="font-weight:800;color:#eef1f6;font-size:11.5px;letter-spacing:-.01em">${esc(job.human || (job.valid ? job.schedule : "invalid"))}</div>
                    <div class="mono" style="color:#7d8598;font-size:9px;margin-top:4px">${esc(job.schedule)}</div>
                </td>
                <td>${job.enabled && job.valid && job.next_run ? new Date(job.next_run * 1000).toLocaleString() : "&mdash;"}</td>
                <td class="cron-cmd" title="${esc(job.command)}">${esc(job.command)}${job.comment ? `<br><span style="color:#7d8598"># ${esc(job.comment)}</span>` : ""}</td>
                <td><span class="status ${!job.valid ? "failed" : job.enabled ? "success" : "paused"}">${!job.valid ? "invalid" : job.enabled ? "enabled" : "disabled"}</span></td>
                <td><div class="table-actions">
                    <button class="run-btn green-action" data-cron-run="${esc(job.id)}" ${job.valid ? "" : "disabled style='opacity:.45'"}>Run now</button>
                    <button class="run-btn" data-cron-edit="${esc(job.id)}">Edit</button>
                    <button class="run-btn ${job.enabled ? "amber-action" : "green-action"}" data-cron-toggle="${esc(job.id)}">${job.enabled ? "Disable" : "Enable"}</button>
                    <button class="run-btn danger-action" data-cron-delete="${esc(job.id)}">Delete</button>
                </div></td>
            </tr>`);
        const deletedRows = visibleDeleted.map(job => `
            <tr style="opacity:.72">
                <td>
                    <div style="font-weight:800;color:#eef1f6;font-size:11.5px;letter-spacing:-.01em">${esc(job.human || job.schedule)}</div>
                    <div class="mono" style="color:#7d8598;font-size:9px;margin-top:4px">${esc(job.schedule)}</div>
                </td>
                <td>&mdash;</td>
                <td class="cron-cmd" title="${esc(job.command)}">${esc(job.command)}${job.comment ? `<br><span style="color:#7d8598"># ${esc(job.comment)}</span>` : ""}</td>
                <td><span class="status failed">deleted</span><div style="color:#7d8598;font-size:9px;margin-top:4px">removed ${ago(job.removed_at)}</div></td>
                <td><div class="table-actions">
                    <button class="run-btn green-action" data-cron-restore="${esc(job.id)}">Restore</button>
                    <button class="run-btn danger-action" data-cron-purge="${esc(job.id)}">Delete forever</button>
                </div></td>
            </tr>`);
        tbody.innerHTML = [...liveRows, ...deletedRows].join("")
            || `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon"><i data-lucide="clock"></i></div><h3>${filter === "deleted" ? "Archive is empty" : search || filter !== "all" ? "No matching tasks" : "No scheduled tasks yet"}</h3><p>${filter === "deleted" ? "Deleted tasks are kept here so they can be restored." : search || filter !== "all" ? "Adjust the filter or search." : "Create your first task and it will be appended to this user's crontab."}</p></div></td></tr>`;
        $$("[data-cron-edit]").forEach(b => b.onclick = () => {
            const job = cronJobs.find(j => j.id === b.dataset.cronEdit);
            if (job) openCronModal(job);
        });
        $$("[data-cron-toggle]").forEach(b => b.onclick = () => cronToggle(b.dataset.cronToggle));
        $$("[data-cron-delete]").forEach(b => b.onclick = () => cronDelete(b.dataset.cronDelete));
        $$("[data-cron-run]").forEach(b => b.onclick = () => cronRun(b.dataset.cronRun));
        $$("[data-cron-restore]").forEach(b => b.onclick = () => cronRestore(b.dataset.cronRestore));
        $$("[data-cron-purge]").forEach(b => b.onclick = () => cronPurge(b.dataset.cronPurge));
        drawIcons(tbody);
    }
    async function saveCronTask() {
        const payload = {
            schedule: buildExpr(),
            command: $("#cronCommand").value.trim(),
            comment: $("#cronComment").value.trim()
        };
        try {
            if (editingCronId) {
                const d = await api(`/api/cron/${editingCronId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(payload)
                });
                toast("Task updated", d.message);
            } else {
                const d = await api("/api/cron", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(payload)
                });
                toast("Task created", d.message);
            }
            cronModal.classList.remove("show");
            loadCron();
        } catch (error) {
            toast(editingCronId ? "Update failed" : "Create failed", error.message, "error");
        }
    }
    async function cronToggle(id) {
        try {
            const d = await api(`/api/cron/${id}/toggle`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast(d.enabled ? "Task enabled" : "Task disabled", d.message, d.enabled ? "success" : "warn");
            loadCron();
        } catch (error) { toast("Toggle failed", error.message, "error"); }
    }
    async function cronDelete(id) {
        const phrase = `DELETE TASK ${id}`;
        if (prompt(`Type ${phrase} to remove this line from the crontab. It stays in the archive and can be restored.`) !== phrase) return;
        try {
            const d = await api(`/api/cron/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Task deleted", d.message);
            loadCron();
        } catch (error) { toast("Delete failed", error.message, "error"); }
    }
    async function cronRestore(id) {
        try {
            const d = await api(`/api/cron/${id}/restore`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast("Task restored", d.message);
            loadCron();
        } catch (error) { toast("Restore failed", error.message, "error"); }
    }
    async function cronPurge(id) {
        const phrase = `PURGE TASK ${id}`;
        if (prompt(`Type ${phrase} to permanently remove this archived task from the database. This cannot be undone.`) !== phrase) return;
        try {
            const d = await api(`/api/cron/${id}/archive`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Archive cleaned", d.message);
            loadCron();
        } catch (error) { toast("Purge failed", error.message, "error"); }
    }
    async function cronRun(id) {
        const phrase = `RUN TASK ${id}`;
        if (prompt(`Type ${phrase} to execute this task immediately. Output appears when it finishes.`) !== phrase) return;
        $("#runMeta").textContent = "Executing…";
        $("#runOutput").textContent = "Running…";
        runModal.classList.add("show");
        try {
            const d = await api(`/api/cron/${id}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            $("#runMeta").textContent = d.message;
            $("#runStats").innerHTML = `
                <div class="stat-mini"><span>Exit code</span><strong style="color:${d.exit_code === 0 ? "#62dc8a" : "#ff7979"}">${d.exit_code}</strong></div>
                <div class="stat-mini"><span>Duration</span><strong>${d.duration_seconds}s</strong></div>`;
            $("#runOutput").textContent = d.output.trim() || "(no output)";
            loadCron();
        } catch (error) {
            $("#runMeta").textContent = "Execution failed";
            $("#runOutput").textContent = error.message;
        }
        drawIcons(runModal);
    }

    /* Screen sessions */

    const screenStateChip = state => {
        const map = {
            attached: ["success", "attached"],
            detached: ["paused", "detached"],
            dead: ["failed", "dead"],
            previous: ["unknown", "previous"],
            other: ["unknown", "unknown"]
        };
        const [cls, label] = map[state] || map.other;
        return `<span class="status ${cls}">${label}</span>`;
    };
    async function loadScreens() {
        const tbody = $("#screensBody");
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading sessions</h3><p>Listing the screen sockets of this user.</p></div></td></tr>`;
        try {
            const data = await api("/api/screens");
            if (data.available === false) {
                $("#screenCount").textContent = "?";
                tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Screen unavailable</h3><p>${esc(data.error || "The screen CLI was not found. Install it or set a custom path in Settings.")}</p></div></td></tr>`;
                drawIcons(tbody);
                return;
            }
            screensList = data.sessions;
            $("#screenCount").textContent = screensList.length;
            renderScreens();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Sessions unavailable</h3><p>${esc(error.message)}</p></div></td></tr>`;
            drawIcons(tbody);
        }
    }
    function renderScreens() {
        const filter = $("#screenFilter").value;
        const search = ($("#globalSearch").value || "").toLowerCase();
        const visible = screensList.filter(s =>
            (s.name.toLowerCase().includes(search) || s.pid.includes(search)) &&
            (filter === "all" || s.state === filter));
        const tbody = $("#screensBody");
        tbody.innerHTML = visible.map(s => `
            <tr${s.running ? "" : ' style="opacity:.62"'}>
                <td style="font-weight:800;color:#eef1f6;font-size:11.5px;letter-spacing:-.01em" class="mono">${esc(s.name)}</td>
                <td class="mono" style="color:#7d8598">${esc(s.pid || "—")}</td>
                <td>${screenStateChip(s.state)}<div style="color:#7d8598;font-size:9px;margin-top:4px">${esc(s.status)}</div></td>
                <td><div class="table-actions">
                    ${(() => { const ref = esc(s.sid || s.name); return s.running
                        ? `<button class="run-btn green-action" data-screen-view="${ref}">View & interact</button>
                           <button class="run-btn danger-action" data-screen-kill="${ref}">Kill</button>`
                        : `<button class="run-btn green-action" data-screen-start="${ref}">Start again</button>
                           <button class="run-btn danger-action" data-screen-forget="${ref}">Forget</button>`; })()}
                    <button class="run-btn ${s.enabled ? "" : "green-action"}" data-screen-toggle="${esc(s.sid || s.name)}">${s.enabled ? "Disable" : "Enable"}</button>
                </div></td>
            </tr>`).join("")
            || `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon"><i data-lucide="terminal"></i></div><h3>${search || filter !== "all" ? "No matching sessions" : "No screen sessions yet"}</h3><p>${search || filter !== "all" ? "Adjust the filter or search." : "Start a detached session and it will appear here."}</p></div></td></tr>`;
        $$("[data-screen-view]").forEach(b => b.onclick = () => openScreenViewer(b.dataset.screenView));
        $$("[data-screen-kill]").forEach(b => b.onclick = () => killScreen(b.dataset.screenKill));
        $$("[data-screen-toggle]").forEach(b => b.onclick = () => toggleScreen(b.dataset.screenToggle));
        $$("[data-screen-start]").forEach(b => b.onclick = () => startStoredScreen(b.dataset.screenStart));
        $$("[data-screen-forget]").forEach(b => b.onclick = () => forgetScreen(b.dataset.screenForget));
        drawIcons(tbody);
    }
    async function openScreenViewer(name, window, history) {
        activeScreenName = name;
        $("#screenModalTitle").textContent = name;
        $("#screenModalSubtitle").textContent = "Live buffer · reading…";
        $("#screenOutput").textContent = "Loading…";
        $("#screenWindow").value = window ?? $("#screenWindow").value ?? 0;
        $("#screenHistory").checked = history ?? $("#screenHistory").checked;
        screenModal.classList.add("show");
        drawIcons(screenModal);
        await refreshScreenContent();
    }
    async function refreshScreenContent() {
        if (!activeScreenName) return;
        try {
            const params = new URLSearchParams({
                window: $("#screenWindow").value.trim() || "0",
                history: $("#screenHistory").checked ? "1" : "0"
            });
            const d = await api(`/api/screens/${encodeURIComponent(activeScreenName)}/content?${params}`);
            $("#screenStateChip").className = `status ${d.state === "dead" ? "failed" : d.state === "attached" ? "success" : d.state === "detached" ? "paused" : "unknown"}`;
            $("#screenStateChip").textContent = d.state;
            $("#screenModalSubtitle").textContent = `Live buffer · window ${d.window}${d.truncated ? " · truncated to last 60k chars" : ""}`;
            $("#screenOutput").textContent = d.content.trim() || "(empty buffer)";
            $("#screenOutput").scrollTop = $("#screenOutput").scrollHeight;
        } catch (error) {
            $("#screenModalSubtitle").textContent = "Read failed";
            $("#screenOutput").textContent = error.message;
        }
    }
    async function sendScreenInput() {
        if (!activeScreenName) return;
        const text = $("#screenInput").value;
        const enter = $("#screenEnter").checked;
        if (!text && !enter) return;
        try {
            const d = await api(`/api/screens/${encodeURIComponent(activeScreenName)}/input`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ text, enter, window: $("#screenWindow").value.trim() || "0" })
            });
            $("#screenInput").value = "";
            $("#screenOutput").textContent = d.content.trim() || "(empty buffer)";
            $("#screenOutput").scrollTop = $("#screenOutput").scrollHeight;
        } catch (error) { toast("Send failed", error.message, "error"); }
    }
    async function killScreen(name) {
        const phrase = `KILL SCREEN ${name}`;
        if (prompt(`Type ${phrase} to terminate this session and all processes inside it.`) !== phrase) return;
        try {
            const d = await api(`/api/screens/${encodeURIComponent(name)}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Session closed", d.message);
            screenModal.classList.remove("show");
            loadScreens();
        } catch (error) { toast("Kill failed", error.message, "error"); }
    }
    async function createScreen() {
        const payload = {
            name: $("#newScreenName").value.trim(),
            command: $("#newScreenCommand").value.trim(),
            cwd: $("#newScreenCwd").value.trim()
        };
        try {
            const d = await api("/api/screens", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify(payload)
            });
            toast("Session started", d.message);
            newScreenModal.classList.remove("show");
            loadScreens();
        } catch (error) { toast("Create failed", error.message, "error"); }
    }
    async function toggleScreen(name) {
        try {
            const d = await api(`/api/screens/${encodeURIComponent(name)}/toggle`, {
                method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }
            });
            toast("Screen updated", d.message);
            loadScreens();
        } catch (error) { toast("Toggle failed", error.message, "error"); }
    }
    async function startStoredScreen(ref) {
        const stored = screensList.find(s => (s.sid || s.name) === ref);
        if (!stored) return;
        try {
            const d = await api("/api/screens", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ name: stored.name, command: stored.command, cwd: stored.cwd })
            });
            toast("Session started", d.message);
            loadScreens();
        } catch (error) { toast("Start failed", error.message, "error"); }
    }
    async function forgetScreen(name) {
        const phrase = `FORGET SCREEN ${name}`;
        if (prompt(`Type ${phrase} to remove "${name}" from the saved screen history.`) !== phrase) return;
        try {
            const d = await api(`/api/screens/${encodeURIComponent(name)}/record`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Record removed", d.message);
            loadScreens();
        } catch (error) { toast("Forget failed", error.message, "error"); }
    }

    async function openDiff(id, name) {
        $("#diffTitle").textContent = `Working tree changes · ${name}`;
        $("#diffContent").textContent = "Loading diff…";
        diffModal.classList.add("show");
        try {
            const d = await api(`/api/repos/${id}/diff`);
            const files = (d.status?.changed_files || []).map(f => `${f.state} ${f.path}`).join("\n");
            $("#diffContent").textContent =
                (files ? `Changed files:\n${files}\n\n${"-".repeat(60)}\n\n` : "") +
                (d.diff.trim() || "(no textual diff — binary or whitespace-only changes)");
            $("#diffContent").scrollTop = 0;
        } catch (error) {
            $("#diffContent").textContent = error.message;
        }
    }

    /* Update watchers */

    function watcherStatusChip(w) {
        const map = {
            ok: ["success", "Up to date"],
            available: ["available", "Update available"],
            error: ["error", "Check failed"],
            updating: ["updating", "Updating…"],
            unknown: ["unknown", w.installed_version ? "Unknown state" : "Not installed"]
        };
        const [cls, label] = map[w.status] || ["info", w.status];
        return `<span class="status ${cls} ${w.status === "updating" ? "pulse-dot" : ""}">${label}</span>`;
    }
    async function loadWatchers() {
        const grid = $("#watchersGrid");
        try {
            const data = await api("/api/watchers");
            watchersList = data.watchers;
            $("#watcherCount").textContent = data.updates_available;
            renderWatchers();
            if (data.any_updating) setTimeout(() => {
                if ($("#watchers").classList.contains("active")) loadWatchers();
            }, 2500);
        } catch (error) {
            grid.innerHTML = `<div class="empty-state is-error" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Watchers unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(grid);
        }
    }
    function renderWatchers() {
        const filter = $("#watcherFilter").value;
        const search = ($("#globalSearch").value || "").toLowerCase();
        const visible = watchersList.filter(w =>
            (w.name.toLowerCase().includes(search) || w.repo.toLowerCase().includes(search)) &&
            (filter === "all" || w.status === filter));
        $("#watchersGrid").innerHTML = visible.map(w => `
            <article class="op-card" style="--metric-color:${w.status === "available" ? "#fb923c" : w.status === "error" ? "#f87171" : "#46c8de"}">
                <div class="op-head"><span class="op-badge" style="border:1px solid color-mix(in srgb,var(--metric-color) 30%,transparent);background:color-mix(in srgb,var(--metric-color) 12%,transparent);color:var(--metric-color)"><i data-lucide="package-check"></i></span>
                <div class="op-primary"><h3 title="${esc(w.name)}">${esc(w.name)}</h3><p class="op-sub" title="${esc(w.repo)}">github.com/${esc(w.repo)}</p></div>
                <button class="job-menu" data-watcher-delete="${esc(w.id)}" data-name="${esc(w.name)}"><i data-lucide="trash-2"></i></button></div>
                <div class="op-meta">
                    <div><span>INSTALLED</span><strong class="mono">${esc(w.installed_version || "not detected")}</strong></div>
                    <div><span>LATEST RELEASE</span><strong class="mono">${esc(w.latest_tag || "—")}</strong></div>
                </div>
                <div class="op-strip"><span class="strip-icon"><i data-lucide="terminal"></i></span><span class="strip-copy" title="${esc(w.detail || w.install_path)}">${esc(w.detail || w.install_path)}</span></div>
                <div class="op-footer">${watcherStatusChip(w)}
                <div class="job-controls">
                    ${w.status === "available"
                        ? `<button class="run-btn green-action" data-watcher-apply="${esc(w.id)}"><i data-lucide="arrow-down-to-line"></i>Update now</button>` : ""}
                    <button class="run-btn" data-watcher-check="${esc(w.id)}" ${w.status === "updating" ? "disabled style='opacity:.45'" : ""}><i data-lucide="refresh-cw"></i>Check</button>
                    <button class="run-btn" data-watcher-edit="${esc(w.id)}">Edit</button>
                </div></div>
            </article>`).join("")
            || `<div class="empty-state"><div class="empty-icon"><i data-lucide="${search || filter !== "all" ? "search-x" : "package-check"}"></i></div><h3>${search || filter !== "all" ? "No matching watchers" : "No watchers yet"}</h3><p>${search || filter !== "all" ? "Adjust the filter or search." : "Track a GitHub release feed of any tool installed here and update it in one click."}</p>${search ? "" : `<button class="run-btn" data-open-watcher-modal style="margin-top:16px"><i data-lucide="plus"></i>Add watcher</button>`}</div>`;
        $$("[data-open-watcher-modal]").forEach(b => b.onclick = () => openWatcherModal());
        $$("[data-watcher-check]").forEach(b => b.onclick = () => checkWatcher(b.dataset.watcherCheck, b));
        $$("[data-watcher-apply]").forEach(b => b.onclick = () => applyWatcher(b.dataset.watcherApply));
        $$("[data-watcher-edit]").forEach(b => b.onclick = () => {
            const w = watchersList.find(item => item.id === b.dataset.watcherEdit);
            if (w) openWatcherModal(w);
        });
        $$("[data-watcher-delete]").forEach(b => b.onclick = () => deleteWatcher(b.dataset.watcherDelete, b.dataset.name));
        drawIcons($("#watchersGrid"));
    }
    function openWatcherModal(w) {
        editingWatcherId = w ? w.id : null;
        $("#watcherModalTitle").textContent = w ? "Edit watcher" : "Track a tool release";
        $("#saveWatcherButton").innerHTML = w
            ? '<i data-lucide="save"></i>Save changes'
            : '<i data-lucide="package-check"></i>Create watcher';
        $("#wName").value = w?.name || "";
        $("#wRepo").value = w?.repo || "";
        $("#wPath").value = w?.install_path || "";
        $("#wPattern").value = w?.asset_pattern || "";
        $("#wArgs").value = w?.version_args || "--version";
        $("#wRegex").value = w?.version_regex || "(\\d+(?:\\.\\d+)+)";
        $("#wRestart").value = w?.restart_command || "";
        $("#wPrerelease").checked = Boolean(w?.prerelease);
        watcherModal.classList.add("show");
        drawIcons(watcherModal);
    }
    async function saveWatcher() {
        const payload = {
            name: $("#wName").value.trim(),
            repo: $("#wRepo").value.trim(),
            install_path: $("#wPath").value.trim(),
            asset_pattern: $("#wPattern").value.trim(),
            version_args: $("#wArgs").value.trim(),
            version_regex: $("#wRegex").value.trim(),
            restart_command: $("#wRestart").value.trim(),
            prerelease: $("#wPrerelease").checked
        };
        try {
            if (editingWatcherId) {
                const d = await api(`/api/watchers/${editingWatcherId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(payload)
                });
                toast("Watcher updated", d.message);
            } else {
                const d = await api("/api/watchers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(payload)
                });
                toast("Watcher created", d.message);
            }
            watcherModal.classList.remove("show");
            loadWatchers();
        } catch (error) { toast("Save failed", error.message, "error"); }
    }
    async function checkWatcher(id, button) {
        button.disabled = true;
        button.classList.add("is-busy");
        try {
            const d = await api(`/api/watchers/${id}/check`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast("Check complete", d.message);
            loadWatchers();
        } catch (error) {
            toast("Check failed", error.message, "error");
            button.disabled = false;
            button.classList.remove("is-busy");
        }
    }
    async function applyWatcher(id) {
        const w = watchersList.find(item => item.id === id);
        if (!confirm(`Update "${w?.name}" to ${w?.latest_tag || "the latest release"}?\n\nA backup of the current binary is kept and OpsDeck rolls back automatically if verification fails.`)) return;
        try {
            const d = await api(`/api/watchers/${id}/apply`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            toast("Update started", d.message);
            loadWatchers();
        } catch (error) { toast("Update failed", error.message, "error"); }
    }
    async function deleteWatcher(id, name) {
        const phrase = `DELETE WATCHER ${id}`;
        if (prompt(`Type ${phrase} to remove the "${name}" watcher. Installed files stay untouched.`) !== phrase) return;
        try {
            const d = await api(`/api/watchers/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ confirmation: phrase })
            });
            toast("Watcher removed", d.message);
            loadWatchers();
        } catch (error) { toast("Failed", error.message, "error"); }
    }
    $$("[data-open-watcher-modal]").forEach(b => b.onclick = () => openWatcherModal());
    $("#cancelWatcherModal").onclick = () => watcherModal.classList.remove("show");
    $("#saveWatcherButton").onclick = saveWatcher;
    $("#refreshWatchers").onclick = loadWatchers;
    $("#watcherFilter").onchange = renderWatchers;

    /* Events */

    async function loadEvents() {
        const tbody = $("#eventsBody");
        try {
            const data = await api("/api/events");
            tbody.innerHTML = data.events.map(item => `
                <tr><td>${date(item.created_at)}</td>
                <td><span class="status ${item.level}">${item.level}</span></td>
                <td>${esc(item.event.replaceAll("_", " "))}</td>
                <td class="mono" style="white-space:normal">${esc(item.detail)}</td></tr>`).join("")
                || `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon"><i data-lucide="history"></i></div><h3>No activity yet</h3><p>Operations will be recorded here automatically.</p></div></td></tr>`;
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Activity unavailable</h3><p>${esc(error.message)}</p></div></td></tr>`;
        }
        drawIcons(tbody);
    }

    /* Settings */

    async function loadSettings() {
        const body = $("#settingsBody");
        body.style.visibility = "visible";
        try {
            const d = await api("/api/settings"), s = d.settings;
            body.innerHTML = `<form class="settings-stack">
                <section class="provider-settings">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark"><i data-lucide="container"></i></span><div><div class="panel-title">Docker CLI</div><p>Custom binary location when docker is outside PATH.</p></div></div><span class="provider-badge">${s.docker_available ? "Found" : "Not found"}</span></div>
                <div class="form-grid">
                <div class="field full"><label>DOCKER BINARY</label><input class="input mono" id="dockerBin" value="${esc(s.docker_bin)}" placeholder="/usr/bin/docker"></div>
                </div></section>

                <section class="provider-settings">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark"><i data-lucide="git-branch"></i></span><div><div class="panel-title">Git CLI</div><p>Custom binary location when git is outside PATH.</p></div></div><span class="provider-badge">${s.git_available ? "Found" : "Not found"}</span></div>
                <div class="form-grid">
                <div class="field full"><label>GIT BINARY</label><input class="input mono" id="gitBin" value="${esc(s.git_bin)}" placeholder="/usr/bin/git"></div>
                <div class="field full"><label>DEFAULT LOG TAIL</label><input class="input" id="logTail" type="number" value="${esc(s.log_tail)}"><p class="hint-text">Initial number of lines fetched in the container log viewer (50–5000).</p></div>
                </div></section>

                <section class="provider-settings">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark"><i data-lucide="terminal"></i></span><div><div class="panel-title">Screen CLI</div><p>Custom binary location when GNU screen is outside PATH.</p></div></div><span class="provider-badge">${s.screen_available ? "Found" : "Not found"}</span></div>
                <div class="form-grid">
                <div class="field full"><label>SCREEN BINARY</label><input class="input mono" id="screenBin" value="${esc(s.screen_bin || "")}" placeholder="/usr/bin/screen"></div>
                </div></section>
            </form>`;
            drawIcons(body);
        } catch (error) {
            body.innerHTML = `<div class="empty-state is-error"><div class="empty-icon"><i data-lucide="settings-2"></i></div><h3>Settings unavailable</h3><p>${esc(error.message)}</p></div>`;
            drawIcons(body);
        }
    }
    $("#saveSettings").onclick = async () => {
        if (!$("#dockerBin")) return;
        try {
            const d = await api("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({
                    docker_bin: $("#dockerBin").value,
                    git_bin: $("#gitBin").value,
                    screen_bin: $("#screenBin").value,
                    log_tail: $("#logTail").value
                })
            });
            toast("Settings saved", d.message);
            loadSettings();
        } catch (error) { toast("Save failed", error.message, "error"); }
    };

    /* Info */

    async function loadInfo() {
        try {
            const d = await api("/api/overview");
            const versionEl = $("#infoVersion"), dockerEl = $("#infoDockerTool"), gitEl = $("#infoGitTool");
            if (versionEl) versionEl.textContent = `OpsDeck ${d.version || ""}`.trim() || "—";
            if (dockerEl) {
                const v = (d.docker_version || "").replace("Docker version ", "");
                dockerEl.textContent = d.tools.docker ? `Ready${v ? ` · ${v}` : ""}` : "Not found";
            }
            if (gitEl) gitEl.textContent = d.tools.git ? "Ready" : "Not found";
        } catch (_) { }
    }

    /* Global bindings */

    $("#globalSearch").oninput = () => {
        const page = $(".page.active").id;
        if (page === "containers") renderContainers();
        else if (page === "repos") renderRepos();
        else if (page === "images") loadImages();
        else if (page === "cron") renderCron();
        else if (page === "screens") renderScreens();
        else if (page === "watchers") renderWatchers();
    };
    document.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            $("#globalSearch").focus();
        }
    });
    $("#stateFilter").onchange = renderContainers;
    $("#refreshButton").onclick = () => navigateTo($(".page.active").id);
    $("#refreshContainers").onclick = loadContainers;

    /* Screen bindings */

    $("#refreshScreens").onclick = loadScreens;
    $("#screenFilter").onchange = renderScreens;
    $("#openScreenModal").onclick = () => {
        $("#newScreenName").value = "";
        $("#newScreenCommand").value = "";
        $("#newScreenCwd").value = "";
        newScreenModal.classList.add("show");
        drawIcons(newScreenModal);
    };
    $("#cancelNewScreenModal").onclick = () => newScreenModal.classList.remove("show");
    $("#createScreenButton").onclick = createScreen;
    $("#refreshScreenContent").onclick = refreshScreenContent;
    $("#sendScreenInput").onclick = sendScreenInput;
    $("#screenInput").onkeydown = e => { if (e.key === "Enter") sendScreenInput(); };
    $("#killScreenButton").onclick = () => activeScreenName && killScreen(activeScreenName);

    drawIcons();
    loadDashboard();
    setInterval(() => {
        const active = $(".page.active").id;
        if (active === "dashboard") loadDashboard();
        if (active === "containers") loadContainers();
    }, 7000);
    console.log("[OpsDeck] UI " + UI_VERSION + " loaded");
})();
