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
