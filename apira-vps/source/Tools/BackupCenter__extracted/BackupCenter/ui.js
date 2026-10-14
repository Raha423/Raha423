(() => {
    "use strict";
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const mount = location.pathname === "/" ? "/" : `/${location.pathname.split("/").filter(Boolean)[0]}/`;
    const icons = {
        "cloud-cog": "◆", "layout-dashboard": "▦", "database-backup": "◫",
        history: "↶", send: "➤", "settings-2": "⚙", "bell-ring": "◉",
        "circle-help": "?", menu: "☰", search: "⌕", "refresh-cw": "↻",
        bell: "◉", plus: "+", play: "▶", "circle-check-big": "✓",
        "hard-drive": "▰", "clock-3": "◷", database: "▤",
        "folder-archive": "▣", server: "▥", mail: "✉", download: "↓",
        "file-archive": "▧", "file-warning": "!", cloud: "☁", save: "✓",
        x: "×", timer: "◷", sun: "☀", "calendar-days": "□",
        "calendar-range": "▦", sparkles: "✦", "rotate-cw": "↻",
        pause: "Ⅱ", trash: "×", "trash-2": "×", archive: "▣",
        info: "i", shield: "◇", check: "✓", "server-cog": "▥",
        "mail-check": "✉", "database-zap": "◫", "loader-circle": "↻",
        activity: "⌁", "cloud-off": "☁", "search-x": "⌕",
        "calendar-plus-2": "□", "archive-restore": "↶", "calendar-clock": "◷",
        "badge-check": "✓", "shield-check": "◇", route: "⌁", "lock-keyhole": "▣", "circle-x": "×",
        "chart-no-axes-column-increasing": "▥"
    };
    const providerIcon = kind => {
        if (kind === "telegram") {
            return `<span class="provider-icon telegram-glyph" aria-hidden="true"></span>`;
        }
        const names = {sftp: "server-cog", email: "mail-check", s3: "database-zap"};
        return `<span class="provider-icon"><i data-lucide="${names[kind] || "cloud"}"></i></span>`;
    };
    function drawIcons(root = document) {
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons({attrs: {"aria-hidden": "true"}});
        } else {
            $$("[data-lucide]", root).forEach(i => {
                i.textContent = icons[i.dataset.lucide] || "•";
                i.style.cssText += ";display:inline-grid;place-items:center;font-style:normal;line-height:1";
            });
        }
        $$(".provider-icon img", root).forEach(image => {
            image.addEventListener("error", () => {
                image.style.display = "none";
                const fallback = image.nextElementSibling;
                if (fallback) fallback.style.display = "block";
            }, {once: true});
        });
    }
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
    const bytes = n => {
        if (!Number.isFinite(n)) return "—";
        const units = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
        while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
        return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
    };
    const date = value => value ? new Date(value * 1000).toLocaleString() : "—";
    async function api(path, options = {}) {
        const endpoint = path.startsWith("/api/") ? mount + path.slice(1) : path;
        const response = await fetch(endpoint, {credentials: "same-origin", cache: "no-store", ...options});
        if (response.status === 401) {
            const data = await response.json(); location.href = data.login_url || "/login";
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
        item.innerHTML = `<div class="toast-icon" style="color:${type === "error" ? "#ef4444" : "#22c55e"}">${type === "error" ? "!" : "✓"}</div><div><div class="toast-title">${esc(title)}</div><div class="toast-message">${esc(message)}</div></div><button class="toast-close">×</button>`;
        container.appendChild(item);
        const remove = () => item.remove();
        $(".toast-close", item).onclick = remove;
        setTimeout(remove, 4500);
    }

    const sidebar = $("#sidebar"), overlay = $("#mobileOverlay"), modal = $("#createModal");
    function navigateTo(id) {
        $$(".page").forEach(p => p.classList.toggle("active", p.id === id));
        $$(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === id));
        sidebar.classList.remove("open"); overlay.classList.remove("show");
        if (id === "dashboard") loadDashboard();
        if (id === "jobs") loadSchedules();
        if (id === "history") loadBackups();
        if (id === "destinations") loadDestinations();
        if (id === "settings") loadSettings();
    }
    $$(".nav-item[data-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.page));
    $$("[data-go-page]").forEach(b => b.onclick = () => navigateTo(b.dataset.goPage));
    $("#menuButton").onclick = () => {sidebar.classList.add("open"); overlay.classList.add("show")};
    overlay.onclick = () => {sidebar.classList.remove("open"); overlay.classList.remove("show")};
    function openModal() { modal.classList.add("show"); }
    function closeModal() { modal.classList.remove("show"); }
    function populateScheduleTimes() {
        const select = $("#scheduleTime");
        if (!select) return;
        select.innerHTML = Array.from({length: 96}, (_, index) => {
            const hour = Math.floor(index / 4);
            const minute = (index % 4) * 15;
            const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
            const displayHour = hour % 12 || 12;
            const label = `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
            return `<option value="${value}">${label}</option>`;
        }).join("");
        select.value = "03:00";
    }
    $("#openCreateModal").onclick = openModal;
    $$("[data-open-modal]").forEach(b => b.onclick = openModal);
    $("#closeCreateModal").onclick = closeModal; $("#cancelCreateModal").onclick = closeModal;
    modal.onclick = e => { if (e.target === modal) closeModal(); };

    let overviewData = null, schedules = [], backups = [];
    function updateDashboardHeading() {
        const now = new Date();
        const hour = now.getHours();
        $("#dashboard h1").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        $("#dashboard .eyebrow").textContent = `System overview · ${now.toLocaleDateString(undefined, {month:"short", day:"numeric"})}`;
    }
    async function loadDashboard() {
        updateDashboardHeading();
        const values = $$(".stat-value");
        values.forEach(value => value.textContent = "—");
        $(".storage-card .progress-fill").style.width = "0%";
        $(".activity-list").innerHTML = `<div class="empty-state compact is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading recent activity</h3><p>Retrieving the latest backup events from your server.</p></div>`;
        drawIcons($(".activity-list"));
        try {
            const data = await api("/api/overview"); overviewData = data;
            const stats = data.stats;
            values[0].textContent = stats.total || 0;
            values[1].textContent = stats.completed || 0;
            values[2].textContent = bytes(data.storage.used);
            values[3].textContent = data.active || 0;
            $("#totalBackups").textContent = stats.total || 0;
            const card = $(".storage-card"), percent = Math.min(100, data.storage.used / data.storage.total * 100);
            $(".storage-row strong", card).textContent = `${percent.toFixed(0)}%`;
            $(".progress-fill", card).style.width = `${percent}%`;
            $$(".storage-row", card)[1].innerHTML = `<span>${bytes(data.storage.used)} used</span><span>${bytes(data.storage.free)} free</span>`;
            const healthy = stats.completed > 0 && !stats.failed;
            $("#dashboard .page-description").textContent = healthy
                ? "Your real backup infrastructure is healthy and recovery points are available."
                : stats.total ? "Some backup operations need your attention." : "Create your first protected backup policy.";
            const recent = $(".activity-list");
            recent.innerHTML = data.latest.slice(0, 5).map(item => `
                <div class="activity"><div class="activity-icon" style="color:${item.status === "failed" ? "#ff7979" : "#62dc8a"}">▣</div>
                <div><div class="activity-title">${esc(item.name)}</div><div class="activity-detail">${bytes(item.size)} · ${date(item.created_at)}</div></div>
                <span class="status ${item.status === "completed" ? "success" : item.status}">${esc(item.status)}</span></div>`).join("")
                || `<div class="empty-state compact"><div class="empty-icon"><i data-lucide="activity"></i></div><h3>No activity yet</h3><p>Your latest backup runs and recovery events will appear here.</p></div>`;
            drawIcons(recent);
            await loadSchedules(false);
            updateChart(data.latest);
        } catch (error) {
            $(".activity-list").innerHTML = `<div class="empty-state compact is-error"><div class="empty-icon"><i data-lucide="cloud-off"></i></div><h3>Activity is temporarily unavailable</h3><p>Backup Center could not retrieve server activity. Refresh to try again.</p></div>`;
            drawIcons($(".activity-list"));
            toast("Dashboard unavailable", error.message, "error");
        }
    }
    function updateChart(items) {
        const chart = $(".chart");
        $(".chart-empty", chart)?.remove();
        chart.classList.toggle("no-data", !items.length);
        if (!items.length) {
            chart.insertAdjacentHTML("beforeend", `<div class="chart-empty"><div class="chart-empty-icon"><i data-lucide="chart-no-axes-column-increasing"></i></div><strong>No backup data this week</strong><span>Your first completed backup will start building this activity chart.</span></div>`);
            drawIcons(chart);
        }
        const bars = $$(".chart .bar-group");
        const days = Array.from({length: 7}, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toDateString();
        });
        bars.forEach((group, index) => {
            const matching = items.filter(x => new Date(x.created_at * 1000).toDateString() === days[index]);
            const good = matching.filter(x => x.status === "completed").length;
            const bad = matching.filter(x => x.status === "failed").length;
            $(".success", group).style.height = `${Math.min(94, good ? 25 + good * 16 : 4)}%`;
            $(".failed", group).style.height = `${Math.min(50, bad ? 10 + bad * 12 : 2)}%`;
        });
    }
    function jobCard(job) {
        const labels = {telegram_file:"Telegram file",telegram_message:"Telegram message",telegram_link:"Protected link",sftp:"SFTP",email:"Email",s3:"S3 / MinIO",file:"Telegram file",message:"Telegram message",link:"Protected link",both:"Telegram file + link",none:"Local only"};
        const destinations = job.delivery.split(",").map(item => labels[item] || item).join(" + ");
        return `<article class="job-card" data-name="${esc(job.name.toLowerCase())}" data-enabled="${job.enabled}">
            <div class="job-head"><div class="job-icon"><i data-lucide="archive"></i></div><div class="job-primary"><h3>${esc(job.name)}</h3><p class="job-source" title="${esc(job.sources.join(" · "))}">${job.sources.map(esc).join(" &middot; ")}</p></div><button class="job-menu" data-delete="${job.id}" title="Delete schedule"><i data-lucide="trash-2"></i></button></div>
            <div class="job-meta"><div><span>Schedule</span><strong>Every ${job.interval_hours}h</strong></div><div><span>Next run</span><strong>${date(job.next_run)}</strong></div></div>
            <div class="job-destinations"><span class="destination-icon"><i data-lucide="route"></i></span><span class="destination-copy">${esc(destinations)}</span><span class="job-retention">${job.retention} retained</span></div>
            <div class="job-footer"><span class="status ${job.enabled ? "success" : "paused"}">${job.enabled ? "Active" : "Paused"}</span>
            <div class="job-controls"><button class="run-btn" data-run="${job.id}"><i data-lucide="play"></i>Run now</button><button class="run-btn" data-toggle="${job.id}">${job.enabled ? "Pause" : "Enable"}</button></div></div></article>`;
    }
    async function loadSchedules(render = true) {
        try {
            const data = await api("/api/schedules"); schedules = data.schedules;
            $("#jobCount").textContent = schedules.length;
            if (!render) return;
            renderJobs();
        } catch (error) { toast("Jobs unavailable", error.message, "error"); }
    }
    function renderJobs() {
        const search = ($("#globalSearch").value || "").toLowerCase();
        const filter = $("#statusFilter").value;
        const destination = $("#destinationFilter").value;
        const destinationNeedle = destination.includes("SFTP") ? "sftp" : destination.includes("Email") ? "email" : destination.includes("Telegram") ? "telegram" : destination.includes("S3") ? "s3" : "";
        const visible = schedules.filter(j => j.name.toLowerCase().includes(search) &&
            (filter === "all" || (filter === "paused" ? !j.enabled : j.enabled)) &&
            (!destinationNeedle || j.delivery.toLowerCase().includes(destinationNeedle)));
        const hasFilters = Boolean(search || filter !== "all" || destinationNeedle);
        $("#jobsGrid").innerHTML = visible.map(jobCard).join("") ||
            `<div class="empty-state"><div class="empty-icon"><i data-lucide="${hasFilters ? "search-x" : "calendar-plus-2"}"></i></div><h3>${hasFilters ? "No matching backup jobs" : "No backup jobs yet"}</h3><p>${hasFilters ? "Try adjusting your search or filters to find an existing automation." : "Create your first automated backup policy and choose when and where it should run."}</p>${hasFilters ? "" : `<button class="empty-action" data-empty-create><i data-lucide="plus"></i>Create backup job</button>`}</div>`;
        $$("[data-toggle]").forEach(b => b.onclick = () => toggleJob(b.dataset.toggle));
        $$("[data-run]").forEach(b => b.onclick = () => runJob(b.dataset.run));
        $$("[data-delete]").forEach(b => b.onclick = () => deleteJob(b.dataset.delete));
        $("[data-empty-create]")?.addEventListener("click", openModal);
        drawIcons($("#jobsGrid"));
    }
    async function toggleJob(id) {
        try { await api(`/api/schedules/${id}/toggle`, {method:"POST", headers:{"X-Requested-With":"XMLHttpRequest"}}); await loadSchedules(); toast("Job updated", "Automation state changed."); }
        catch (error) { toast("Unable to update", error.message, "error"); }
    }
    async function runJob(id) {
        try { await api(`/api/schedules/${id}/run`, {method:"POST", headers:{"X-Requested-With":"XMLHttpRequest"}}); toast("Backup started", "The real archive is being created in the background."); navigateTo("history"); }
        catch (error) { toast("Unable to run job", error.message, "error"); }
    }
    async function deleteJob(id) {
        const phrase = `DELETE ${id}`;
        if (prompt(`Type ${phrase} to delete this schedule. Existing backups remain.`) !== phrase) return;
        try { await api(`/api/schedules/${id}`, {method:"DELETE", headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"}, body:JSON.stringify({confirmation:phrase})}); await loadSchedules(); toast("Schedule deleted", "Generated archives were kept."); }
        catch (error) { toast("Delete failed", error.message, "error"); }
    }

    async function loadBackups() {
        try {
            const data = await api("/api/backups"); backups = data.backups;
            const tbody = $("#history tbody");
            tbody.style.visibility = "visible";
            tbody.innerHTML = backups.map(item => `<tr data-backup-row="${item.id}"><td><span class="table-file"><i data-lucide="file-archive"></i> ${esc(item.name)}.tar.gz</span></td>
                <td>${item.schedule_id ? "Scheduled job" : "Manual backup"}</td><td>${date(item.created_at)}</td><td>${bytes(item.size)}</td>
                <td>${item.status === "completed" ? "Local protected storage" : "&mdash;"}</td>
                <td><span class="status ${item.status === "completed" ? "success" : item.status}">${esc(item.status)}</span></td>
                <td>${item.status === "completed" ? `<div class="table-actions"><button class="run-btn" data-download="${item.id}">Download</button><button class="run-btn" data-verify="${item.id}">Verify</button><button class="run-btn" data-restore="${item.id}">Stage restore</button><button class="run-btn danger-action" data-delete-backup="${item.id}">Delete</button></div>` : item.status === "failed" ? `<button class="run-btn" data-retry="${item.id}">Retry</button>` : "&mdash;"}</td></tr>`).join("")
                || `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon"><i data-lucide="archive-restore"></i></div><h3>No recovery points yet</h3><p>Completed backup archives will appear here with verification, download and restore controls.</p><button class="empty-action" data-empty-jobs><i data-lucide="calendar-clock"></i>View backup jobs</button></div></td></tr>`;
            $$("[data-download]").forEach(b => b.onclick = () => location.href = `api/backups/${b.dataset.download}/download`);
            $$("[data-verify]").forEach(b => b.onclick = () => verifyBackup(b));
            $$("[data-restore]").forEach(b => b.onclick = () => restoreBackup(b.dataset.restore));
            $$("[data-delete-backup]").forEach(b => b.onclick = () => deleteBackup(b.dataset.deleteBackup));
            $$("[data-retry]").forEach(b => b.onclick = () => retryBackup(b.dataset.retry));
            $("[data-empty-jobs]")?.addEventListener("click", () => navigateTo("jobs"));
            drawIcons(tbody);
        } catch (error) {
            const tbody = $("#history tbody");
            tbody.style.visibility = "visible";
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state is-error"><div class="empty-icon"><i data-lucide="database-zap"></i></div><h3>Backup history is unavailable</h3><p>Backup Center could not retrieve archive records. Refresh to try again.</p></div></td></tr>`;
            drawIcons(tbody);
            toast("History unavailable", error.message, "error");
        }
    }
    async function verifyBackup(button) {
        const id = button.dataset.verify;
        const original = button.innerHTML;
        button.disabled = true;
        button.classList.add("is-verifying");
        button.innerHTML = `<i data-lucide="loader-circle"></i>Verifying…`;
        drawIcons(button);
        try {
            const d = await api(`/api/backups/${id}/verify`, {method:"POST",headers:{"X-Requested-With":"XMLHttpRequest"}});
            button.classList.remove("is-verifying");
            button.classList.add(d.valid ? "verified-action" : "verification-failed");
            button.innerHTML = `<i data-lucide="${d.valid ? "shield-check" : "circle-x"}"></i>${d.valid ? "Verified" : "Invalid"}`;
            button.title = `SHA-256: ${d.sha256} · ${d.members} archive entries`;
            drawIcons(button);
            toast(
                d.valid ? "Backup verified" : "Verification failed",
                `${d.message} ${d.members} archive entries checked. SHA-256: ${d.sha256.slice(0, 12)}…`,
                d.valid ? "success" : "error"
            );
        } catch (error) {
            button.classList.remove("is-verifying");
            button.innerHTML = original;
            button.disabled = false;
            drawIcons(button);
            toast("Verify failed", error.message, "error");
        }
    }
    async function restoreBackup(id) {
        const phrase = `RESTORE ${id}`; if (prompt(`Type ${phrase} to extract into protected staging.`) !== phrase) return;
        try { const d = await api(`/api/backups/${id}/restore`, {method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({confirmation:phrase})}); toast("Recovery staged", d.path); }
        catch (error) { toast("Restore failed", error.message, "error"); }
    }
    async function deleteBackup(id) {
        if (!confirm("Permanently delete this backup archive? This action cannot be undone.")) return;
        const phrase = `DELETE ${id}`;
        try { await api(`/api/backups/${id}`,{method:"DELETE",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({confirmation:phrase})}); toast("Backup deleted","The archive and its metadata were removed."); loadBackups(); }
        catch (error) { toast("Delete failed", error.message, "error"); }
    }
    async function retryBackup(id) {
        try { await api(`/api/backups/${id}/retry`,{method:"POST",headers:{"X-Requested-With":"XMLHttpRequest"}}); toast("Backup restarted","A new background attempt was created."); loadBackups(); }
        catch (error) { toast("Retry failed", error.message, "error"); }
    }

    async function loadDestinations() {
        const grid = $("#destinations .placeholder-grid");
        loadDeliveryStatus();
        grid.innerHTML = `<article class="destination-card" id="addDestination"><div class="job-icon"><i data-lucide="plus"></i></div><h3>Add destination</h3><p>Connect a delivery channel for automated backups.</p><button class="run-btn">Add destination</button></article>`;
        $("#addDestination").onclick = openDestinationModal;
        drawIcons(grid);
        try {
            const d = await api("/api/settings"), s = d.settings;
            grid.innerHTML = `${s.telegram_configured ? `<article class="destination-card" data-provider="telegram"><div class="job-icon">${providerIcon("telegram")}</div><h3>Telegram</h3><p>Messages, files and protected panel links.</p><span class="status success">${s.telegram_mtproto_configured ? "MTProto ready" : "Bot API ready"}</span><button class="run-btn" data-configure>Configure</button><button class="run-btn" data-disconnect="telegram">Disconnect</button></article>` : ""}
                ${s.sftp_configured ? `<article class="destination-card" data-provider="sftp"><div class="job-icon">${providerIcon("sftp")}</div><h3>Remote server</h3><p>Encrypted SFTP archive delivery.</p><span class="status success">Connected</span><button class="run-btn" data-configure>Configure</button><button class="run-btn" data-disconnect="sftp">Disconnect</button></article>` : ""}
                ${s.email_configured ? `<article class="destination-card" data-provider="email"><div class="job-icon">${providerIcon("email")}</div><h3>Email</h3><p>TLS-protected SMTP attachment delivery.</p><span class="status success">Connected</span><button class="run-btn" data-configure>Configure</button><button class="run-btn" data-disconnect="email">Disconnect</button></article>` : ""}
                ${s.s3_configured ? `<article class="destination-card" data-provider="s3"><div class="job-icon">${providerIcon("s3")}</div><h3>S3 / MinIO</h3><p>Encrypted compatible object storage.</p><span class="status success">Connected</span><button class="run-btn" data-configure>Configure</button><button class="run-btn" data-disconnect="s3">Disconnect</button></article>` : ""}
                <article class="destination-card" id="addDestination"><div class="job-icon"><i data-lucide="plus"></i></div><h3>Add destination</h3><p>Connect a delivery channel for automated backups.</p><button class="run-btn">Add destination</button></article>`;
            $("#addDestination").onclick = openDestinationModal;
            $$("[data-configure]", grid).forEach(button => button.onclick = () => navigateTo("settings"));
            $$("[data-disconnect]", grid).forEach(button => button.onclick = () => disconnectDestination(button.dataset.disconnect));
            drawIcons(grid);
        } catch (error) { toast("Destinations unavailable", error.message, "error"); }
    }
    async function loadDeliveryStatus() {
        const list = $("#deliveryStatusList");
        if (!list) return;
        list.innerHTML = `<div class="delivery-state-loading"><i data-lucide="loader-circle"></i><span>Checking recent deliveries…</span></div>`;
        drawIcons(list);
        try {
            const data = await api("/api/events");
            const attempts = data.events.filter(item => ["backup_delivered", "delivery_failed", "telegram_test"].includes(item.event)).slice(0, 8);
            list.innerHTML = attempts.map(item => {
                const failed = item.event === "delivery_failed";
                const parts = item.detail.split(":");
                const backupId = parts.shift()?.trim() || "Connection test";
                const target = (parts.shift()?.trim() || (item.event === "telegram_test" ? "telegram" : "destination")).replaceAll("_", " ");
                const error = failed ? parts.join(":").trim() : "";
                return `<div class="delivery-row ${failed ? "failed" : "delivered"}">
                    <div class="delivery-result-icon"><i data-lucide="${failed ? "circle-x" : "circle-check-big"}"></i></div>
                    <div class="delivery-result-copy"><strong>${failed ? "Delivery failed" : "Delivered successfully"}</strong><span>${esc(target)} · ${esc(backupId)}</span>${error ? `<small>${esc(error)}</small>` : ""}</div>
                    <time>${date(item.created_at)}</time>
                </div>`;
            }).join("") || `<div class="delivery-empty"><div class="delivery-result-icon"><i data-lucide="send"></i></div><div><strong>No delivery attempts yet</strong><span>Successful and failed sends will be recorded here.</span></div></div>`;
            drawIcons(list);
        } catch (error) {
            list.innerHTML = `<div class="delivery-empty is-error"><div class="delivery-result-icon"><i data-lucide="cloud-off"></i></div><div><strong>Status unavailable</strong><span>${esc(error.message)}</span></div></div>`;
            drawIcons(list);
        }
    }
    function openDestinationModal() {
        let box = $("#destinationModal");
        if (!box) {
            box = document.createElement("div");
            box.className = "modal-backdrop"; box.id = "destinationModal";
            box.innerHTML = `<div class="modal"><div class="modal-header"><div><h2>Add destination</h2><p>Choose a supported delivery provider.</p></div><button class="icon-btn" id="closeDestination">&times;</button></div><div class="modal-content"><div class="placeholder-grid">
                <article class="destination-card" data-provider="telegram" data-choose-destination><div class="job-icon">${providerIcon("telegram")}</div><h3>Telegram</h3><p>Pyrogram MTProto messages, files and protected links.</p><span class="status success">Available</span></article>
                <article class="destination-card" data-provider="sftp" data-choose-destination><div class="job-icon">${providerIcon("sftp")}</div><h3>Remote server</h3><p>SFTP with strict system host-key verification.</p><span class="status success">Available</span></article>
                <article class="destination-card" data-provider="email" data-choose-destination><div class="job-icon">${providerIcon("email")}</div><h3>Email</h3><p>SMTP using STARTTLS or implicit TLS.</p><span class="status success">Available</span></article>
                <article class="destination-card" data-provider="s3" data-choose-destination><div class="job-icon">${providerIcon("s3")}</div><h3>S3 / MinIO</h3><p>HTTPS object storage with server-side encryption.</p><span class="status success">Available</span></article>
            </div></div></div>`;
            document.body.appendChild(box);
            drawIcons(box);
            $("#closeDestination").onclick = () => box.classList.remove("show");
            box.onclick = e => { if (e.target === box) box.classList.remove("show"); };
            $$("[data-choose-destination]", box).forEach(card => card.onclick = () => { box.classList.remove("show"); navigateTo("settings"); });
        }
        box.classList.add("show");
    }
    async function loadSettings() {
        const body = $("#settings .panel-body");
        body.style.visibility = "visible";
        body.innerHTML = `<div class="empty-state is-loading"><div class="empty-icon"><i data-lucide="loader-circle"></i></div><h3>Loading destination settings</h3><p>Securely retrieving your saved destination configuration.</p></div>`;
        drawIcons(body);
        try {
            const d = await api("/api/settings"), s = d.settings;
            body.innerHTML = `<form id="destinationSettings" class="settings-stack">
                <section class="provider-settings telegram-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark">${providerIcon("telegram")}</span><div><div class="panel-title">Telegram / Pyrogram MTProto</div><p>Fast notifications, protected links and large-file delivery.</p></div></div><span class="provider-badge">${s.telegram_configured ? "Configured" : "Setup required"}</span></div>
                <div class="form-grid">
                <div class="field"><label>BOT TOKEN</label><input class="input" id="tgToken" type="password" placeholder="Leave blank to keep saved token"></div>
                <div class="field"><label>CHAT ID</label><input class="input" id="tgChat" value="${esc(s.telegram_chat_id)}" placeholder="-1001234567890"></div>
                <div class="field"><label>MTPROTO API ID</label><input class="input" id="tgApiId" value="${esc(s.telegram_api_id)}" placeholder="my.telegram.org"></div>
                <div class="field"><label>MTPROTO API HASH</label><input class="input" id="tgHash" type="password" placeholder="Leave blank to keep saved hash"></div>
                <div class="field full"><label>FALLBACK BOT API</label><input class="input" id="tgEndpoint" value="${esc(s.telegram_api_base)}"></div>
                <div class="field full"><div class="choice-grid"><button type="button" class="secondary-btn" id="testTelegram">Send test message</button><span class="status ${s.telegram_mtproto_configured ? "success" : "paused"}">${s.telegram_mtproto_configured ? "Pyrogram MTProto ready" : s.telegram_configured ? "Bot API ready" : "Not configured"}</span></div></div>
                </div></section>
                <section class="provider-settings sftp-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark">${providerIcon("sftp")}</span><div><div class="panel-title">Remote server / SFTP</div><p>The first host key is saved automatically; future key changes are rejected.</p></div></div><span class="provider-badge">${s.sftp_configured ? "Configured" : "Setup required"}</span></div>
                <div class="form-grid">
                <div class="field"><label>HOST</label><input class="input" id="sftpHost" value="${esc(s.sftp_host)}" placeholder="backup.example.com"></div>
                <div class="field"><label>PORT</label><input class="input" id="sftpPort" type="number" value="${esc(s.sftp_port)}"></div>
                <div class="field"><label>USERNAME</label><input class="input" id="sftpUser" value="${esc(s.sftp_username)}"></div>
                <div class="field"><label>PASSWORD</label><input class="input" id="sftpPassword" type="password" placeholder="Leave blank to keep saved password"></div>
                <div class="field full"><label>REMOTE DIRECTORY</label><input class="input" id="sftpDirectory" value="${esc(s.sftp_directory)}"></div>
                <div class="field full"><button type="button" class="secondary-btn" data-test-destination="sftp">Test SFTP connection</button></div>
                </div></section>
                <section class="provider-settings email-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark">${providerIcon("email")}</span><div><div class="panel-title">Email / SMTP</div><p>Deliver compact archives through a protected mail server.</p></div></div><span class="provider-badge">${s.email_configured ? "Configured" : "Setup required"}</span></div>
                <div class="form-grid">
                <div class="field"><label>SMTP HOST</label><input class="input" id="smtpHost" value="${esc(s.smtp_host)}"></div>
                <div class="field"><label>PORT</label><input class="input" id="smtpPort" type="number" value="${esc(s.smtp_port)}"></div>
                <div class="field"><label>SECURITY</label><select class="input" id="smtpSecurity"><option value="starttls">STARTTLS</option><option value="ssl">TLS / SSL</option><option value="none">None (local relay)</option></select></div>
                <div class="field"><label>USERNAME</label><input class="input" id="smtpUser" value="${esc(s.smtp_username)}"></div>
                <div class="field"><label>PASSWORD</label><input class="input" id="smtpPassword" type="password" placeholder="Leave blank to keep saved password"></div>
                <div class="field"><label>MAX ATTACHMENT (MB)</label><input class="input" id="smtpLimit" type="number" value="${esc(s.smtp_max_attachment_mb)}"></div>
                <div class="field"><label>FROM</label><input class="input" id="smtpFrom" type="email" value="${esc(s.smtp_from)}"></div>
                <div class="field"><label>TO</label><input class="input" id="smtpTo" type="email" value="${esc(s.smtp_to)}"></div>
                <div class="field full"><button type="button" class="secondary-btn" data-test-destination="email">Test SMTP connection</button></div>
                </div></section>
                <section class="provider-settings s3-provider">
                <div class="settings-section-heading"><div class="provider-heading"><span class="provider-mark">${providerIcon("s3")}</span><div><div class="panel-title">S3 / MinIO</div><p>Store encrypted backup objects in compatible cloud storage.</p></div></div><span class="provider-badge">${s.s3_configured ? "Configured" : "Setup required"}</span></div>
                <div class="form-grid">
                <div class="field full"><label>HTTPS ENDPOINT (BLANK FOR AWS)</label><input class="input" id="s3Endpoint" value="${esc(s.s3_endpoint)}" placeholder="https://s3.example.com"></div>
                <div class="field"><label>REGION</label><input class="input" id="s3Region" value="${esc(s.s3_region)}"></div>
                <div class="field"><label>BUCKET</label><input class="input" id="s3Bucket" value="${esc(s.s3_bucket)}"></div>
                <div class="field"><label>PREFIX</label><input class="input" id="s3Prefix" value="${esc(s.s3_prefix)}"></div>
                <div class="field"><label>ACCESS KEY</label><input class="input" id="s3AccessKey" value="${esc(s.s3_access_key)}"></div>
                <div class="field"><label>SECRET KEY</label><input class="input" id="s3SecretKey" type="password" placeholder="Leave blank to keep saved secret"></div>
                <div class="field full"><button type="button" class="secondary-btn" data-test-destination="s3">Test S3 connection</button></div>
                </div></section>
            </form>`;
            drawIcons(body);
            $("#smtpSecurity").value = s.smtp_security;
            $("#testTelegram").onclick = async () => {
                if (await saveSettings(false, true)) await testTelegram();
            };
            $$("[data-test-destination]").forEach(button => button.onclick = async () => {
                if (await saveSettings(false, true)) {
                    await testDestination(button.dataset.testDestination);
                }
            });
        } catch (error) {
            body.innerHTML = `<div class="empty-state is-error"><div class="empty-icon"><i data-lucide="settings-2"></i></div><h3>Settings are unavailable</h3><p>Backup Center could not retrieve destination configuration. Refresh to try again.</p></div>`;
            drawIcons(body);
            toast("Settings unavailable", error.message, "error");
        }
    }
    async function saveSettings(reload = true, quiet = false) {
        if (!$("#tgChat")) return false;
        const body = {
            telegram_token:$("#tgToken").value,telegram_chat_id:$("#tgChat").value,telegram_api_id:$("#tgApiId").value,telegram_api_hash:$("#tgHash").value,telegram_api_base:$("#tgEndpoint").value,
            sftp_host:$("#sftpHost").value,sftp_port:$("#sftpPort").value,sftp_username:$("#sftpUser").value,sftp_password:$("#sftpPassword").value,sftp_directory:$("#sftpDirectory").value,
            smtp_host:$("#smtpHost").value,smtp_port:$("#smtpPort").value,smtp_security:$("#smtpSecurity").value,smtp_username:$("#smtpUser").value,smtp_password:$("#smtpPassword").value,smtp_from:$("#smtpFrom").value,smtp_to:$("#smtpTo").value,smtp_max_attachment_mb:$("#smtpLimit").value,
            s3_endpoint:$("#s3Endpoint").value,s3_region:$("#s3Region").value,s3_bucket:$("#s3Bucket").value,s3_prefix:$("#s3Prefix").value,s3_access_key:$("#s3AccessKey").value,s3_secret_key:$("#s3SecretKey").value
        };
        try {
            const d = await api("/api/settings",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify(body)});
            if (!quiet) toast("Settings saved", d.message);
            if (reload) loadSettings();
            return true;
        }
        catch (error) { toast("Save failed", error.message, "error"); return false; }
    }
    async function testTelegram() {
        try { const d = await api("/api/telegram/test",{method:"POST",headers:{"X-Requested-With":"XMLHttpRequest"}}); toast("Telegram connected", d.message); }
        catch (error) { toast("Telegram failed", error.message, "error"); }
    }
    async function testDestination(kind) {
        try { const d = await api(`/api/destinations/${kind}/test`,{method:"POST",headers:{"X-Requested-With":"XMLHttpRequest"}}); toast("Connection successful", d.message); }
        catch (error) { toast("Connection failed", error.message, "error"); }
    }
    async function disconnectDestination(kind) {
        const phrase = `DISCONNECT ${kind}`;
        if (prompt(`Type ${phrase} to erase its saved credentials.`) !== phrase) return;
        try { const d = await api(`/api/destinations/${kind}`,{method:"DELETE",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({confirmation:phrase})}); toast("Destination removed", d.message); loadDestinations(); }
        catch (error) { toast("Disconnect failed", error.message, "error"); }
    }
    $("#saveSettings").onclick = () => saveSettings();

    $("#createJobButton").onclick = async () => {
        const name = $("#jobName").value.trim(), source = $("#sourcePath").value.trim();
        const frequency = $('input[name="frequency"]:checked')?.value || "Daily";
        const interval = {Hourly:1,Daily:24,Weekly:168,Monthly:720}[frequency];
        const retentionText = $("#retentionPolicy").value;
        const retention = retentionText.includes("30") ? 30 : retentionText.includes("7") ? 7 : 1;
        const targets = [];
        const telegram = $("#telegram").checked;
        const method = $("#deliveryMethod").value.toLowerCase();
        if (telegram) {
            if (method.includes("file and")) targets.push("telegram_file", "telegram_link");
            else if (method.includes("backup file")) targets.push("telegram_file");
            else if (method.includes("protected panel link")) targets.push("telegram_link");
            else targets.push("telegram_message");
        }
        if ($("#remoteServer").checked) targets.push("sftp");
        if ($("#email").checked) targets.push("email");
        if ($("#cloudStorage").checked) targets.push("s3");
        const delivery = targets.length ? targets.join(",") : "none";
        const excludes = ($("#excludePatterns")?.value || "").split(",").map(x=>x.trim()).filter(Boolean);
        const [hour, minute] = $("#scheduleTime").value.split(":").map(Number);
        const first = new Date(); first.setHours(hour, minute, 0, 0); if (first <= new Date()) first.setDate(first.getDate() + 1);
        try {
            await api("/api/schedules",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({name,sources:source.split(",").map(x=>x.trim()).filter(Boolean),excludes,interval_hours:interval,retention,delivery,first_run:Math.floor(first.getTime()/1000)})});
            closeModal(); toast("Backup job created","The automation policy is active."); navigateTo("jobs");
        } catch (error) { toast("Unable to create job",error.message,"error"); }
    };
    $("#globalSearch").oninput = () => { if (!$("#jobs").classList.contains("active")) navigateTo("jobs"); else renderJobs(); };
    document.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            $("#globalSearch").focus();
        }
    });
    $("#statusFilter").onchange = renderJobs;
    $("#destinationFilter").onchange = renderJobs;
    $("#refreshButton").onclick = () => navigateTo($(".page.active").id);
    $("#refreshDeliveryStatus").onclick = loadDeliveryStatus;
    $("#runAllButton").onclick = async () => {
        const enabled = schedules.filter(x => x.enabled);
        let started = 0, skipped = 0;
        for (const job of enabled) {
            try { await api(`/api/schedules/${job.id}/run`,{method:"POST",headers:{"X-Requested-With":"XMLHttpRequest"}}); started++; }
            catch (_) { skipped++; }
        }
        toast("Run all completed",`${started} job(s) queued; ${skipped} already running or unavailable.`, skipped && !started ? "error" : "success");
    };
    $("#exportHistory").onclick = () => {
        const content = ["id,name,status,created,size",...backups.map(b=>[b.id,JSON.stringify(b.name),b.status,date(b.created_at),b.size].join(","))].join("\n");
        const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:"text/csv"}));a.download="backup-history.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    };
    populateScheduleTimes(); drawIcons(); updateDashboardHeading(); loadDashboard();
    setInterval(() => { if ($("#dashboard").classList.contains("active")) loadDashboard(); }, 7000);
})();
