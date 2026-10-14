# Apira VPS — Complete capability guide

This document describes the capabilities currently shipped in the Apira VPS distribution. The panel is a privileged server-management system: many actions change the real operating system, services, firewall, files, Docker workloads or network state.

## Quick mental model

Apira VPS is made of nine main parts:

1. **Apira VPS Control** — the main dashboard and service/security/tools center.
2. **File Manager** — browser file management with an SFTP-like workflow.
3. **Terminal** — authenticated web terminal.
4. **Network** — diagnostics plus protected network/firewall operations.
5. **Backup Center** — scheduled backups, verification, restore and delivery.
6. **Installer** — catalog-based server software installation.
7. **OpsDeck** — Docker, Git, cron, GNU Screen and release-watch operations.
8. **Resource Sentinel** — local telemetry and threshold-based alerting.
9. **API Core** — scoped REST API for advanced server automation.

Capabilities that depend on external Linux tools are available when those tools are installed (for example Docker, Git, GNU Screen/tmux, UFW, Fail2ban, traceroute or Supervisor).

---

# 1. Apira VPS Control

The Control panel is the main entry point and shared authenticated shell for the installed extensions.

### Dashboard and health
- Server overview and health status.
- CPU, RAM, swap, disk, network and load information.
- Process visibility and process refresh.
- Recent activity and panel health information.
- Restart the Apira VPS control service from the interface.

### Service manager
- List systemd services and their current state.
- Start a service.
- Stop a service.
- Restart a service.
- Enable a service at boot.
- Disable a service at boot.
- Open service details.
- Read service logs.
- Restart all supported services from the panel.
- Protected/destructive operations require confirmation where implemented.

### System information
- Host/system information in one page.
- Copy system information for support or diagnostics.
- Kernel/platform/runtime information exposed by the control API.

### Security Center
- Server security summary/grade.
- SSH security information.
- Firewall/security status exposed by the control engine.
- Listening/exposed service information.
- Refresh security assessment on demand.
- Change the SSH port from the panel with administrator-password confirmation.

### Tools Center
- Discover the Apira VPS extension catalog.
- See installed/not-installed/update-available state.
- Install supported tools.
- Update supported tools.
- Remove supported non-core tools.
- Open installed tools directly.
- Check all tools for updates.
- Package/update URLs point to the Apira VPS GitHub distribution.

### Notifications and settings
- Pull panel notifications from the Apira VPS notification manifest.
- Refresh notifications manually.
- Shared authenticated session for extensions.
- Local logout/settings flow.

---

# 2. File Manager

A browser-based local file manager using the authenticated panel session. It does not require a separate public SFTP service.

### Navigation
- Browse directories from `/` or the configured managed root.
- Back / forward history.
- Move to parent directory.
- Breadcrumb navigation.
- Quick places supplied by the server session.
- Refresh the current folder.
- Search within the current path.
- Mobile-ready navigation.

### File and folder operations
- Create a new file.
- Create a new folder.
- Upload one or multiple files.
- Drag-and-drop upload.
- Download files.
- Edit text files in the browser.
- Rename files/folders.
- Copy files/folders.
- Move files/folders.
- Create ZIP archives from selected items.
- Extract supported archives.
- Move items to Trash by default instead of immediate permanent deletion.
- Multi-select items.

### Metadata and permissions
- View type, path, size and modification time.
- View UID/GID ownership.
- View symbolic and octal permissions.
- Change octal permissions (chmod) from the Properties dialog.

### Security model
- Uses the same Apira VPS authenticated session.
- Same-origin local API; no separate file-manager network port is required.
- File operations have the privileges of the panel service, so panel access must be treated as administrative/root-level access.

---

# 3. Terminal

An interactive browser terminal mounted inside the authenticated panel.

- Interactive server shell.
- Copy selected terminal text.
- Clipboard paste and a mobile-friendly paste panel.
- Clear terminal output.
- Fullscreen mode.
- Reconnect a closed terminal session.
- Mobile keyboard focus button.
- On-screen quick keys: Ctrl+C, Ctrl+D, Tab, Esc and arrow keys.
- Shared panel logout/session handling.
- Commands run with the operating-system permissions of the panel service.

---

# 4. Network

The Network extension combines read-only diagnostics with real network configuration. Protected network changes use confirmation and rollback logic.

### Overview
- Public IP detection.
- Network interface list and status.
- Interface addresses, speeds and transfer counters.
- DNS resolver information.
- Kernel routes.
- Connection/health overview.

### Global reachability tests
- Concurrent DNS/TCP/HTTP-style reachability checks to common global services.
- The built-in list includes common providers/services such as Cloudflare, Google, GitHub, Docker Hub, Ubuntu, Microsoft, Apple, Amazon/AWS, Azure, Wikipedia, Reddit, Discord, Slack, OpenAI, Stack Overflow, Debian, Fedora, CentOS, npm, PyPI, GitLab, Bitbucket, DigitalOcean and Vultr.

### Network configuration
- View current kernel IP addresses.
- Add a runtime IP address to an interface.
- Remove a runtime IP address.
- View routing tables.
- Add a static/runtime route.
- Remove a route.
- Manage supported link/runtime network state exposed by the backend.
- Protected changes present a review step.
- Connectivity-confirmation window with automatic rollback support for risky network changes.

### Ports, firewall and neighbors
- List listening sockets and owning processes.
- Open a port through the supported firewall backend.
- Close a port.
- Select protocol/zone where supported.
- View ARP/NDP neighbor information.
- Flush DNS cache.
- Clear failed neighbor entries.

### Performance and operations lab
- Internet/server download speed test using the available backend (Cloudflare sample or installed Speedtest backend).
- Live interface throughput monitoring.
- Rank processes by network connection activity.
- Automatic network health diagnosis.
- MTU discovery to find a non-fragmenting path size.
- Self port scanner restricted to this server's addresses.
- IP intelligence: IP, PTR/reverse DNS, ASN/ISP/location information when available.
- Export a JSON support/diagnostic report.
- Create a protected network/kernel-state snapshot.

### Diagnostics
- DNS lookup.
- TCP connectivity test.
- Ping.
- Other supported diagnostic actions exposed by the network backend (for example traceroute/HTTP checks when present).

### IP reputation
- Detect the server public IPv4.
- Check common DNS-based abuse/block lists.
- Show a listed/clean summary and individual list results.

---

# 5. Backup Center

Backup Center creates and manages local archives and can deliver them to several destinations.

### Backup jobs
- Back up files and folders.
- Full TAR.GZ archive mode.
- Exclude patterns such as logs or cache paths.
- Create named backup jobs.
- Run all jobs or individual schedules.
- Pause/enable schedules.
- Retry failed backups.

### Scheduling
- Hourly.
- Daily.
- Weekly.
- Monthly.
- Execution-time selection.
- Browser-local scheduling presentation.

### Destinations
- Local backup storage.
- Remote server through SFTP.
- Telegram delivery.
- Email attachment/delivery.
- S3-compatible object storage / MinIO.
- Test configured destinations.
- Remove configured destinations.

### Delivery modes
- Send the backup file.
- Send only a status message.
- Send a login-protected panel download link.
- Send the file plus a protected link.

### Retention and integrity
- Keep only the newest backup.
- Keep the newest 7 backups.
- Keep the newest 30 backups.
- SHA-256 integrity verification.
- Verify an existing backup.

### Recovery and history
- Download a backup.
- Restore a backup.
- Delete a backup.
- Retry backup delivery/operation where supported.
- Backup/event history.
- Export history from the UI.
- Search jobs, files and destinations.

---

# 6. Installer

The Installer is a catalog-driven software deployment center.

### Catalog and discovery
- Browse all available tools.
- Search the catalog.
- Filter by category.
- Show only installed tools.
- Refresh installation/status information.

### Current catalog categories
- VPN & Tunnels.
- AI Assistants.
- Security.
- Server Platforms.
- Operating Systems.
- Databases.
- Monitoring.

The exact tools inside a category can change with the catalog/package source.

### Installation workflow
- Open a tool details/install dialog.
- Start installation from the browser.
- Follow live installation activity/output.
- View recent installation activity/history.
- Capture credentials generated by an official installer and show them only inside the authenticated session when supported.
- Load the latest operation.

---

# 7. OpsDeck

OpsDeck is the main DevOps/operations workspace. It operates the real local Docker, Git, crontab and GNU Screen/tmux tooling.

## Dashboard
- Running/stopped/paused container counts.
- Image, repository, scheduled-task and screen-session counters.
- Pending update-watcher status.
- Recent activity feed.
- Docker/Git tool-health status.
- Global search.

## Containers
- List/search/filter containers by state.
- Start container.
- Stop container.
- Restart container.
- Remove container with typed confirmation.
- Read container logs (selectable tail sizes up to thousands of lines).
- Download logs as text where exposed by the UI.
- CPU/memory/network/block-I/O snapshot.
- Open a container console/details modal.

### Inside a container
- Browse the container filesystem with clickable folders.
- Breadcrumb and quick-jump navigation (`/`, `/root`, `/app`, `/home`, `/opt`, `/var/log`, `/usr/src/app`).
- Read/tail/head/list files.
- Run shell commands through the container shell.

## Docker images
- List local images with size/age.
- Delete an image with confirmation.
- Prune dangling images to reclaim disk space.

## Git repositories
- Track up to 32 server-side Git checkouts.
- Show current branch.
- Show dirty/changed files.
- Show ahead/behind status.
- View working-tree diff.
- View recent commits.
- List branches.
- Switch/check out a branch.
- Fetch remotes.
- Safe pull using fast-forward-only behavior.
- Stop tracking a repository without deleting the repository itself.

## Scheduled tasks / Cron
- Human-readable crontab editor.
- Schedule builder with next-run preview.
- Create a task.
- Edit a task.
- Enable/disable a task.
- Run a task immediately and capture output.
- Delete/archive a task.
- Restore a deleted task from the OpsDeck database.
- Permanently purge an archived task.
- Filter valid/invalid/enabled/disabled/deleted tasks.

## GNU Screen / terminal sessions
- List attached/detached/dead sessions.
- Create a new detached session.
- Read session buffer/scrollback.
- Send input into a running session.
- View and interact with a live session.
- Kill a session.
- Start a recorded/restorable session again where supported.
- Forget archived session metadata.
- Enable/disable per-session lock/control state.
- Session recording endpoint exposed by the extension.

## Update watchers
- Track GitHub releases for up to 24 tools.
- Match a release asset by filename pattern.
- Optional pre-release tracking.
- Detect available updates.
- Checksum verification.
- Backup before replacement.
- Replace/install the selected asset.
- Restart configured service/process after update.
- Rollback/safety behavior for suspicious downgrade/update states.

## Activity and safety
- Audit trail of the last 200 operations.
- Typed confirmation for destructive operations.
- Strict argument validation.
- Stored tokens/credentials protected by the extension's encrypted-at-rest mechanism where configured.

---

# 8. Resource Sentinel

Resource Sentinel continuously samples local server metrics and evaluates threshold rules.

## Eleven live metric families
- CPU usage.
- RAM usage.
- Swap usage.
- Per-mount disk usage.
- Disk read throughput.
- Disk write throughput.
- Download/network receive traffic.
- Upload/network transmit traffic.
- Load average.
- Thermal/temperature sensors.
- Process count.

## Telemetry
- Local psutil-based sampling.
- Force a fresh sample from the UI.
- Rolling history view (for example last hour, 6 hours or 24 hours).
- Configurable sample interval from seconds to minutes.
- Configurable history retention from hours to days.

## Alert rules
- Create, edit and delete rules.
- Greater-than and less-than comparisons.
- Choose a disk/mount where relevant.
- Severity levels: Info, Warning, Critical.
- Require a breach to persist before alerting (immediate through long sustained windows).
- Per-rule cooldown to prevent notification storms.
- Pause/enable a rule.
- Simulate/test a rule without waiting for a real incident.

## Incident history
- Open and resolved alerts.
- Acknowledge/resolve an incident.
- Recovery notices when metrics return to normal.
- Delivery result/status recorded with incidents.
- Export alert history.
- Clear alert history from the UI.

## Notification channels
- Telegram bot + Chat ID.
- Test Telegram message.
- SMTP email.
- STARTTLS, TLS/SSL or local relay mode.
- Test email message.
- Disconnect/remove a channel.
- Optional host label so notifications from multiple servers can be distinguished.

## Security/privacy
- Metrics are collected locally.
- Panel authentication and CSRF protections are used by the extension.
- Saved channel credentials are protected by the extension's encrypted credential storage.
- Data leaves the server only through notification channels you explicitly configure.

---

# 9. API Core

API Core exposes a privileged, versioned REST gateway for server automation. It is the broadest component in the suite.

## API-key security
- Create named API keys.
- Scope each key to selected modules or all modules.
- Rate limits: selectable presets from 60 to 1000 requests/minute.
- Expiry: never, 7, 30, 90, 365 days.
- Enable/disable a key.
- Revoke a key.
- Last-used tracking.
- Prefix display/search without exposing the full secret again.
- Interactive REST documentation.
- Search endpoints by name/path/scope.
- Try an endpoint directly from the panel.
- Generate/copy examples for cURL, Python, JavaScript, PHP and Go.

## System API
- Liveness/version/time check.
- Hostname, kernel, uptime, load and process count.
- Per-core CPU, memory, swap, disk and network metrics.
- System journal logs with unit/priority filters.
- Pending OS package updates.
- Mounted filesystems and block devices.
- `/proc/mounts` data.
- Hardware CPU/RAM/swap/architecture information.
- Installed package search (dpkg/rpm).
- Get/set hostname.
- OS/distribution details.
- Detailed CPU information.
- Detailed memory information.
- SSH daemon/security configuration information.
- Loaded kernel modules.
- Kernel/process limits.
- Enable/synchronize NTP.
- Server time/timezone/NTP state.
- Temperature sensors.
- Logged-in users/sessions.
- Failed SSH login analysis including top attacker IPs.
- Install pending OS upgrades with explicit confirmation.
- Reboot with explicit confirmation.
- Shutdown with explicit confirmation.

## Processes API
- List/search processes sorted by CPU.
- Full process details.
- Terminate/SIGKILL a process.
- Send POSIX signals (TERM, KILL, HUP, INT, USR1, USR2, CONT, STOP, QUIT).
- List open file descriptors.

## Supervisor API (when Supervisor is installed)
- List programs managed by supervisord.
- Start/stop/restart a Supervisor program.

## systemd Services API
- daemon-reload.
- List services.
- List failed units.
- List timers and next/last run data.
- Unit details.
- Unit journal logs.
- Start/stop/restart/reload.
- Enable/disable at boot.
- Mask/unmask.

## Terminal API
- Execute a shell command with configurable working directory and timeout.
- Audited execution.
- High-risk reboot/shutdown commands are blocked from this generic terminal endpoint and have dedicated confirmed endpoints instead.

## Files API
- Directory listing / metadata.
- Read text files.
- Write/append text files.
- Download/stream files.
- Multipart upload (up to the backend's configured limit; current docs describe 300 MB).
- Server-side HTTP(S) file fetch/download.
- Recursive regex content search.
- Tail last lines of a file.
- Recursive directory tree.
- Directory size (`du`) and file/dir counts.
- Create TAR.GZ archive.
- Safely extract TAR.GZ/TGZ/ZIP with zip-slip protection.
- Delete files/directories with critical-path restrictions.
- Move/rename.
- Create directories.
- Copy files/directories.
- chmod, including recursive mode where allowed.
- chown owner/group.
- SHA-256/SHA-1/MD5 checksum.
- Create symlink.
- Touch/create file timestamps.
- Full metadata including ownership, mode and symlink target.
- Rename within a directory.
- Unified diff between two text files.
- Find/replace in a text file with optional `.bak` backup.
- MIME/file-type detection.

## Screen/tmux API
- List sessions; GNU Screen is preferred and tmux can be used as fallback.
- Create detached session with command/cwd.
- Inspect a session.
- Read window/scrollback logs.
- Send commands/input.
- Kill a session and child processes.
- Clean dead GNU Screen sockets.

## Docker API (when Docker is installed)
- List/filter containers.
- Start/stop/restart/pause/unpause.
- Remove container.
- Inspect container.
- Read logs.
- Execute a command inside a container.
- One-shot CPU/memory/network/block-I/O stats.
- Docker engine information.
- List images.
- Pull image.
- Remove image.
- System prune with optional volumes.
- Register Docker Compose stacks.
- Compose up/down/pull.
- List processes inside a container (`docker top`).
- Rename container.
- Kill with a selected signal.
- List Docker networks.
- Inspect Docker network/IPAM/attached containers.
- List Docker volumes.
- Inspect volume/mountpoint/rough disk usage.

## UFW Firewall API (when UFW is installed)
- Read firewall state/default policies/rules.
- Add allow/deny/reject/limit rule.
- Delete a rule.
- Enable firewall with explicit confirmation.
- Disable firewall with explicit confirmation.
- Reload rules.

## Fail2ban API (when Fail2ban is installed)
- List jails and banned IPs.
- Ban an IPv4 in a jail.
- Unban an IPv4 from a jail.

## Users API
- List interactive users plus root.
- Create a user.
- Set/change password.
- Delete a user (root is protected).
- Optional home-directory removal on user deletion.
- User UID/GID/home/shell/group details.
- List authorized SSH keys with SHA-256 fingerprints.
- Add/deduplicate a public SSH key with safe permissions.
- Remove a selected SSH key.

## Network API
- Public IP.
- Interfaces, IPv4/IPv6/MAC, speed and counters.
- Routes.
- DNS resolvers.
- Listening ports/process owners.
- Active connections.
- ARP/NDP neighbor table.
- Short traffic sample with receive/transmit rate.
- Ping with latency summary.
- Traceroute.
- DNS A lookup.
- DNS records: A, AAAA, MX, TXT, NS, CNAME, SOA, SRV when supported.
- TCP connect test.
- HTTP status/latency check.
- TLS certificate inspection including issuer/subject/expiry/days left.
- Parsed `/etc/hosts`.
- Public-IP geolocation/ASN/org/timezone.
- Latency comparison to common public resolvers/providers.
- Generate a self-signed TLS certificate/key with OpenSSL.

## Git API
- Repository status.
- Commit history.
- Fast-forward pull.
- Checkout branch.
- Clone repository.
- List branches.
- Diff (working tree or staged).
- Push; force push requires extra confirmation.

## Cron API
- Parse current crontab with human-readable meaning/next run.
- Create task.
- Update task atomically.
- Delete task.
- Run task immediately with captured output.

## Audit API
- Full API audit trail.
- Records API calls, denials, rate-limit events and mutating actions.
- Filter by level/event/limit.

---

# Authentication and installation

- Apira VPS uses server-local authentication instead of the original external login backend.
- Default administrator username: `admin`.
- A random administrator password is generated during first installation and shown once.
- Only a salted `scrypt` hash is stored in `/etc/apira-vps/auth.json`.
- Default panel port: `789`.
- Default install directory: `/opt/apira-vps`.
- Automatic installer targets Debian/Ubuntu and installs/builds CPython 3.10 when needed.
- The service is enabled through systemd and starts automatically after reboot.

# Important limitations

- The main control engine and several extension engines are compiled CPython `.so` modules; their original pre-compilation Python source was not published upstream.
- Linux x86_64 is required by the included compiled modules.
- The core compiled extension requires CPython 3.10.
- Several features are conditional on the related Linux CLI/service being installed.
- The default deployment is plain HTTP on port 789. Put the panel behind HTTPS/reverse proxy and appropriate firewall rules before exposing it publicly.
- Because the panel has highly privileged functionality, compromise of the panel account should be treated similarly to compromise of root/server administrator access.

# Repository provenance

Original upstream project:

`https://github.com/WEVPSAPI/VMTOOL`

Apira VPS maintained distribution:

`https://github.com/Raha423/Raha423/tree/main/apira-vps`

Direct installer:

`curl -fsSL https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/install.sh | sudo bash`

The original MIT license and copyright notice are preserved in `LICENSE`/`NOTICE.md`.
