# Apira VPS — Capability Library

This page is a catalog, not a long-form manual.

Every section uses the same format:

| Feature | What it does | Example |
|---|---|---|

> **Important:** Apira VPS is a privileged server-management panel. Many actions change the real server. Treat panel access like root-level access.

---

## Library index

| Module | What it is for | Typical use |
|---|---|---|
| **Apira VPS Control** | Main server dashboard and control center | Check health, manage services, security and extensions |
| **File Manager** | Browser-based server file manager | Edit configs, upload files, move/rename/archive data |
| **Terminal** | Web shell | Run Linux commands without opening a separate SSH client |
| **Network** | Network diagnostics and protected network changes | Check routes, ports, reputation, MTU, firewall and connectivity |
| **Backup Center** | Backup, restore and delivery system | Schedule backups and send them to SFTP, Telegram, Email or S3 |
| **Installer** | Software deployment catalog | Install supported server software from the web panel |
| **OpsDeck** | DevOps operations center | Docker, Git, Cron, GNU Screen and update watchers |
| **Resource Sentinel** | Resource monitoring and alerts | Alert when CPU/RAM/disk/network/load thresholds are breached |
| **API Core** | Privileged REST API | Automate server administration from bots, apps and scripts |

---

# 1. Apira VPS Control

The main panel and the place most users should start.

| Feature | What it does | Example |
|---|---|---|
| Server overview | Shows the current state of the server in one screen | Check whether the server looks healthy after a reboot |
| CPU monitor | Shows processor usage | Find out whether FFmpeg or another process is saturating CPU |
| RAM monitor | Shows memory usage | Check whether the server is close to running out of RAM |
| Swap monitor | Shows swap usage | Detect memory pressure even when RAM is not fully exhausted |
| Disk monitor | Shows storage usage | Check whether `/` is close to full |
| Network monitor | Shows network counters and activity | See whether traffic suddenly increased |
| Load average | Shows Linux load information | Compare system load with CPU count |
| Process view | Lists running processes | Find a process consuming too much CPU or memory |
| Service manager | Lists systemd services | Find nginx, Docker or a bot service |
| Start service | Starts a stopped systemd service | Start `nginx.service` |
| Stop service | Stops a running service | Stop a broken worker before maintenance |
| Restart service | Restarts a service | Restart nginx after changing its config |
| Enable at boot | Makes a service start after reboot | Enable a bot service permanently |
| Disable at boot | Prevents automatic startup | Disable an unused service |
| Service details | Shows detailed service state | Inspect PID and service status |
| Service logs | Reads journal logs for a service | Check why a service failed |
| Restart supported services | Runs supported restart operations from the panel | Restart managed services after an update |
| System information | Shows host, kernel and runtime details | Copy server information for debugging |
| Copy system information | Copies diagnostic information | Send server details to support |
| Security grade | Summarizes server security state | Quickly spot weak SSH/firewall configuration |
| SSH security view | Shows SSH-related security information | Check authentication and SSH exposure |
| Listening services | Helps identify exposed services | See what is listening publicly |
| Change SSH port | Changes the SSH port with protected confirmation | Move SSH from port 22 to 2222 |
| Tools Center | Shows installable/installed Apira VPS extensions | Open Network or install Resource Sentinel |
| Extension update check | Checks for newer extension packages | See whether OpsDeck has an update |
| Install extension | Installs a supported extension | Add Backup Center |
| Update extension | Updates an installed extension | Upgrade Network while keeping the panel |
| Remove extension | Removes supported extensions where allowed | Remove a tool you no longer use |
| Notifications | Shows project/panel notifications | Read an update notice |
| Restart Control | Restarts the Apira VPS panel itself | Restart the panel after a configuration change |

---

# 2. File Manager

A browser-based file manager with an SFTP-like workflow.

| Feature | What it does | Example |
|---|---|---|
| Folder navigation | Opens server directories from the browser | Browse `/var/www` |
| Breadcrumb navigation | Lets you jump to parent folders quickly | Jump from `/var/www/app/logs` back to `/var/www` |
| Back / Forward | Keeps navigation history | Return to the folder you just left |
| Up | Goes to the parent directory | Move from `/root/project` to `/root` |
| Search current tree | Finds files/folders from the selected path | Search for `config.json` |
| Create folder | Creates a new directory | Create `/root/backups` |
| Create file | Creates a new file | Create `.env` |
| Upload | Uploads files from the browser | Upload a ZIP release |
| Drag & drop upload | Uploads by dropping files into the page | Drop multiple config files into a folder |
| Download | Downloads a selected file | Download a database backup |
| Text editor | Reads and edits text files in the browser | Edit `.env` or `nginx.conf` |
| Rename | Renames a file or folder | Rename `app-old` to `app` |
| Copy | Copies a file or directory | Copy a config before editing it |
| Move | Moves a file or directory | Move logs to an archive folder |
| ZIP archive | Creates a ZIP from selected items | Compress a project folder |
| Extract archive | Extracts supported archives | Extract a release ZIP |
| Trash | Moves an item to Trash instead of immediate permanent deletion | Remove an old config more safely |
| Properties | Shows size, owner, permissions and modification time | Check why a service cannot read a file |
| chmod | Changes Unix permissions | Change a script from `644` to `755` |
| Multi-select | Selects multiple items for grouped actions | Archive several folders together |
| Managed root/session info | Shows the authenticated host and managed filesystem root | Confirm which server you are editing |

---

# 3. Terminal

An authenticated web terminal attached to the server.

| Feature | What it does | Example |
|---|---|---|
| Interactive shell | Runs Linux shell commands | `systemctl status nginx` |
| Live output | Shows command output interactively | Watch a deployment command run |
| Copy | Copies selected terminal text | Copy an error stack trace |
| Paste | Pastes text/commands into the terminal | Paste a multi-line command |
| Clear | Clears the terminal display | Clean the screen before a new task |
| Fullscreen | Expands the terminal | Work comfortably on a desktop browser |
| Reconnect | Reconnects a closed terminal session | Recover after a temporary connection loss |
| Mobile keyboard helper | Focuses the terminal keyboard on mobile | Continue using the terminal from a phone |
| Ctrl+C button | Sends interrupt | Stop a stuck command |
| Ctrl+D button | Sends EOF | Exit a shell/session |
| Tab / Esc / arrows | Provides common terminal keys on touch devices | Navigate shell history on mobile |

---

# 4. Network

A network toolbox that includes both diagnostics and real server changes.

| Feature | What it does | Example |
|---|---|---|
| Network overview | Shows network health at a glance | Check public IP and interface state |
| Interface list | Shows interfaces, addresses, speed and counters | Inspect `eth0` traffic |
| DNS configuration | Shows resolver configuration | Verify which DNS servers are in use |
| Routing table | Shows Linux routes | Check the default gateway |
| Global reachability tests | Tests DNS/TCP/HTTP access to major services | Check GitHub, Docker Hub, Cloudflare and OpenAI reachability |
| Add IP address | Adds a runtime IP to an interface | Add a secondary IPv4 |
| Remove IP address | Removes a runtime address | Remove a temporary IP |
| Add static route | Adds a kernel route | Route a subnet through a gateway |
| Remove route | Removes a route | Remove a test route |
| Protected network change | Requires review/confirmation before a risky change | Confirm before changing a route |
| Automatic rollback | Reverts an unconfirmed network change | Avoid locking yourself out after a bad route change |
| Listening sockets | Shows ports accepting inbound connections | Find what owns port 443 |
| Firewall open port | Opens a protected port rule | Allow `8443/tcp` |
| Firewall close port | Closes a protected port rule | Close an unused port |
| ARP / NDP neighbors | Shows discovered local neighbors | Inspect gateway MAC and state |
| Flush DNS cache | Runs a low-risk DNS recovery action | Fix stale resolver cache |
| Refresh neighbors | Clears failed neighbor entries | Recover a broken local neighbor state |
| Speed test | Measures server download/network performance | Compare network speed between providers |
| Live traffic | Shows current receive/transmit throughput | Watch bandwidth while downloading a file |
| Network-active processes | Ranks processes by connections | Find which process opened many connections |
| Automatic network diagnosis | Checks common routing/resolver/packet problems | Diagnose why outbound access is failing |
| MTU discovery | Finds a non-fragmenting path MTU | Diagnose tunnel fragmentation |
| Self port scanner | Scans ports only on this server's allowed addresses | Check whether 22/80/443/789 are open locally |
| IP intelligence | Shows ASN, ISP, location and reverse DNS | Identify the server network/provider |
| JSON report | Exports network diagnostic data | Send a report to support |
| Protected snapshot | Preserves current kernel/network state | Take a snapshot before risky networking changes |
| DNS lookup | Resolves a hostname | Resolve `example.com` |
| TCP test | Tests whether a TCP destination is reachable | Test `db.example.com:5432` |
| Ping | Tests ICMP reachability | Ping `1.1.1.1` |
| HTTP test | Tests web reachability and status where supported | Check whether a site answers from this server |
| Public IP reputation | Checks DNS-based abuse/block lists | See whether the server IP is listed |
| IP blocklist summary | Summarizes reputation results | Check how many DNSBLs report the IP |

---

# 5. Backup Center

Backup creation, delivery, verification and restore management.

| Feature | What it does | Example |
|---|---|---|
| Backup job | Saves a reusable backup definition | Create a backup job for `/var/www/app` |
| Files/folders source | Backs up a local path | Back up `/root/project` |
| Exclude patterns | Skips files matching patterns | Exclude `*.log` and `cache/*` |
| TAR.GZ mode | Creates compressed full archives | Produce `project.tar.gz` |
| Hourly schedule | Runs a job every hour | Hourly database export folder backup |
| Daily schedule | Runs once per day | Nightly app backup |
| Weekly schedule | Runs weekly | Weekly full archive |
| Monthly schedule | Runs monthly | Monthly long-term archive |
| Manual run | Runs a saved job immediately | Make a backup before an update |
| Pause/resume schedule | Enables or disables a scheduled job | Pause backups during migration |
| SFTP destination | Delivers backups to another server | Send a backup to a storage VPS |
| Telegram destination | Sends supported backup/status delivery through Telegram | Send a small archive or completion notice |
| Email destination | Sends supported backup/status delivery through email | Email a backup result |
| S3 / MinIO destination | Sends archives to object storage | Store backups in MinIO |
| Send backup file | Delivers the archive itself | Send the generated TAR.GZ |
| Send status only | Delivers only success/failure information | Notify without transferring the archive |
| Protected panel link | Sends a login-protected download link | Share a backup without attaching it |
| Retention: latest only | Keeps only the newest backup | Minimize disk usage |
| Retention: latest 7 | Keeps seven recent backups | Keep one week of daily backups |
| Retention: latest 30 | Keeps thirty recent backups | Keep a month of history |
| SHA-256 verification | Verifies archive integrity | Detect a corrupted backup |
| Backup download | Downloads an existing archive | Download yesterday's backup |
| Restore | Restores a supported backup | Recover deleted project files |
| Retry | Retries a failed backup/delivery | Retry after SFTP came back online |
| Delete backup | Removes a stored backup | Remove an obsolete archive |
| Backup history | Shows previous runs | Find the last successful backup |
| Export history | Exports backup history where supported | Keep an audit/report copy |
| Test destination | Tests configured remote delivery | Verify SFTP or Telegram before scheduling |
| Telegram test | Sends a test Telegram notification | Confirm bot token/chat ID |
| Settings | Stores Backup Center configuration | Configure retention/delivery behavior |

---

# 6. Installer

A catalog-based deployment interface.

| Feature | What it does | Example |
|---|---|---|
| Software catalog | Shows supported installable server tools | Browse available server platforms |
| Search | Finds a tool by name/category | Search for a monitoring tool |
| VPN & Tunnels category | Groups supported VPN/tunnel installers | Browse VPN software |
| AI Assistants category | Groups supported AI-related tools | Find an AI service installer |
| Security category | Groups security tools | Find a supported security package |
| Server Platforms category | Groups hosting/server platforms | Install a supported management platform |
| Operating Systems category | Groups supported OS/deployment helpers | Browse OS deployment options |
| Databases category | Groups database installers | Find a database stack |
| Monitoring category | Groups monitoring software | Install a monitoring service |
| Installed filter | Shows tools already installed | See what is already on the server |
| Live installation activity | Shows installer output | Watch package installation progress |
| Installation history | Keeps recent installation activity | Check what was installed yesterday |
| Generated credentials | Displays credentials produced by supported installers inside the authenticated session | Save a generated admin password |
| Refresh status | Rechecks installed state | Confirm an installation completed |

> The exact catalog can change as packages/manifests change.

---

# 7. OpsDeck

A DevOps operations center for Docker, Git, Cron, Screen and release tracking.

## Docker and containers

| Feature | What it does | Example |
|---|---|---|
| Container list | Shows Docker containers and state | Find a stopped API container |
| Search/filter | Filters containers by name/state | Show only running containers |
| Start | Starts a container | Start `web` |
| Stop | Stops a container | Stop a broken worker |
| Restart | Restarts a container | Restart after config changes |
| Remove | Removes a container with confirmation | Delete an obsolete stopped container |
| Container logs | Reads recent logs | Read the last 300 lines |
| Log tail size | Selects 100/300/1000/5000-line views | Inspect a longer failure history |
| Download logs | Saves logs as text where exposed by the UI | Keep logs for debugging |
| Container stats | Shows CPU/memory/network/block I/O | Find a heavy container |
| Browse inside container | Browses container filesystem | Open `/app/logs` |
| Read files inside container | Reads head/tail/list views | Inspect an app log |
| Execute inside container | Runs shell commands in a container | `ps aux` or `ls -la` |
| Image list | Shows Docker images | Find old images |
| Delete image | Removes one image | Remove an unused tag |
| Prune images | Removes dangling images | Reclaim disk space |

## Git repositories

| Feature | What it does | Example |
|---|---|---|
| Track repository | Adds an existing server checkout to OpsDeck | Track `/var/www/app` |
| Branch status | Shows current branch | Confirm production is on `main` |
| Dirty state | Shows uncommitted files | Notice a locally edited config |
| Ahead/behind | Compares local state with remote | See that server is 2 commits behind |
| Fetch | Fetches remote refs | Check remote changes without modifying files |
| Safe pull | Uses fast-forward-only behavior | Update production without merge commits |
| Branch list | Shows available branches | Find `develop` |
| Checkout branch | Switches branch | Move a staging checkout to `develop` |
| Commit history | Shows recent commits | Verify which commit is deployed |
| Diff viewer | Shows working-tree changes | Review edits before pulling |

## Scheduled tasks / Cron

| Feature | What it does | Example |
|---|---|---|
| Cron list | Parses current scheduled tasks | See all automation jobs |
| Human-readable schedule | Explains cron timing | Understand `*/10 * * * *` |
| Create task | Adds a cron entry | Run cleanup every night |
| Edit task | Updates an existing cron job | Change frequency |
| Enable/disable | Toggles a task without deleting it | Pause a backup job |
| Run now | Executes a task immediately and captures output | Test a cron command |
| Delete/archive | Removes a task from active crontab | Remove an old job |
| Restore | Restores a deleted task from OpsDeck storage | Recover an accidentally deleted cron |
| Delete forever | Permanently removes an archived task | Clean the task archive |
| Next-run preview | Shows expected next execution | Verify scheduling before saving |

## GNU Screen / session management

| Feature | What it does | Example |
|---|---|---|
| Session list | Lists screen sessions by state | Find a detached bot session |
| Create session | Starts a new detached session | Start `python bot.py` in screen |
| View content | Reads visible buffer/scrollback | Check a long-running task |
| Send input | Types into a live session | Send a command to an interactive process |
| Kill session | Terminates a session | Stop a stuck screen |
| Restart saved session | Starts a previous session again | Relaunch a worker |
| Enable/disable tracked session | Controls tracked session behavior | Disable a saved session |
| Recording support | Records session output where configured | Keep a session log |

## Update watchers and safety

| Feature | What it does | Example |
|---|---|---|
| GitHub release watcher | Tracks releases for configured tools | Watch a GitHub project for a new version |
| Update available state | Marks tools with newer releases | See pending updates |
| Asset pattern | Selects matching release assets | Track only `linux-amd64` builds |
| Pre-release option | Can include/exclude pre-releases | Ignore beta builds |
| Checksum verification | Validates downloaded update assets | Reject a corrupted release |
| Backup before replacement | Preserves current install | Roll back if update fails |
| Restart after update | Restarts the updated service/tool | Apply a new binary automatically |
| Downgrade protection/rollback | Protects against unsafe version replacement | Restore the previous version |
| Activity log | Keeps recent operations | See who/what action ran |
| Typed confirmations | Protects destructive actions | Require a phrase before deleting a container |

---

# 8. Resource Sentinel

Local resource telemetry plus threshold-based alerts.

| Feature | What it does | Example |
|---|---|---|
| CPU metric | Samples CPU usage | Alert above 90% |
| RAM metric | Samples memory usage | Alert above 85% |
| Swap metric | Samples swap usage | Detect memory pressure |
| Disk usage per mount | Monitors filesystem usage | Alert when `/` exceeds 90% |
| Disk read throughput | Monitors read I/O | Detect unusual disk activity |
| Disk write throughput | Monitors write I/O | Detect heavy writes |
| Download traffic | Monitors receive throughput | Alert on unusual ingress |
| Upload traffic | Monitors transmit throughput | Alert on unusual egress |
| Load average | Watches Linux load | Detect overloaded server |
| Temperature | Reads available thermal sensors | Alert on high temperature |
| Process count | Watches number of processes | Detect runaway process creation |
| Historical ranges | Shows recent metric history | View last 1/6/24 hours |
| Alert rule | Defines a threshold condition | RAM > 90% |
| Greater-than rule | Fires when a value exceeds a threshold | CPU > 95% |
| Less-than rule | Fires when a value drops below a threshold | Free-space-related custom rule |
| Sustained duration | Requires a breach to persist | CPU > 90% for 5 minutes |
| Immediate alert | Fires without persistence delay | Disk > 98% immediately |
| Cooldown | Prevents notification storms | Notify at most every 30 minutes |
| Severity | Marks info/warning/critical rules | Disk 95% = critical |
| Pause/enable rule | Temporarily disables a rule | Pause an alert during maintenance |
| Simulate | Generates a simulated alert | Test notification formatting |
| Alert history | Stores incidents | Review last week's alerts |
| Open/resolved filter | Filters incident state | Show unresolved alerts only |
| Acknowledge/resolve | Closes an incident | Mark a known issue as handled |
| Recovery notification | Notifies when values normalize | Receive “CPU recovered” |
| Telegram channel | Sends alerts through a Telegram bot | Alert your admin chat |
| Email channel | Sends alerts through SMTP | Send alerts to operations email |
| Telegram test | Sends a test message | Verify token/chat ID |
| Email test | Sends a test email | Verify SMTP settings |
| Sampling interval | Controls how often metrics are collected | Sample every 15 seconds |
| History retention | Controls metric history duration | Keep 7 days |
| Host label | Adds a server name to alerts | Distinguish `DE-1` from `IR-1` |

---

# 9. API Core

API Core exposes privileged server administration through API keys. It is intended for bots, dashboards, automations and external applications.

## API key management

| Feature | What it does | Example |
|---|---|---|
| Create API key | Creates a new automation credential | Create `deploy-bot` key |
| Scopes | Restricts a key to selected modules | Give a bot Docker access but no user-management access |
| Rate limits | Limits requests per minute | Cap a key at 120 requests/minute |
| Expiration | Sets an optional lifetime | Make a key expire after 30 days |
| Never-expire option | Keeps a key valid until revoked | Internal permanent integration |
| Enable/disable | Temporarily turns a key off | Pause an integration |
| Revoke | Permanently removes a key | Revoke a leaked key |
| Last-used data | Shows key usage information | Find an unused integration |
| Interactive REST docs | Lets you browse endpoints in the panel | Search for Docker endpoints |
| Try request | Sends a test API call from the docs | Test `/system` |
| Code samples | Generates cURL/Python/JavaScript/PHP/Go examples | Copy Python integration code |

## System

| Feature | What it does | Example |
|---|---|---|
| Liveness | Checks API health/version/time | Monitoring probe |
| System summary | Hostname, kernel, uptime, load and process count | Inventory dashboard |
| Live metrics | CPU, memory, swap, disks, load and network | External monitoring |
| Journal logs | Reads system journal with filters | Fetch error logs |
| Pending updates | Lists OS package updates | Check apt updates |
| Disks | Lists filesystems and block devices | Find free space |
| Mounts | Reads kernel mount table | Audit mounted storage |
| Hardware | Shows CPU/RAM/architecture | Server inventory |
| Packages | Searches installed packages | Check whether nginx is installed |
| Get/set hostname | Reads or changes hostname | Rename server to `app-1` |
| OS details | Reads distro/kernel/boot data | Asset inventory |
| CPU details | Reads model, cores and frequency | Capacity planning |
| Memory details | Reads `/proc/meminfo` + swap | Memory diagnostics |
| SSH status/config | Reads sshd state and security settings | Audit PermitRootLogin |
| Kernel modules | Lists loaded modules | Search `nf_*` |
| Kernel/process limits | Reads file/thread/PID/rlimits | Diagnose limit issues |
| NTP sync | Enables/checks time synchronization | Repair server clock |
| Time info | Returns timezone/local/UTC/NTP state | Compare server clock |
| Temperature | Reads thermal sensors | Hardware monitoring |
| Logged-in sessions | Lists `who` sessions | See active SSH users |
| Failed SSH attempts | Summarizes failed logins and attacker IPs | Security monitoring |
| OS upgrade | Runs supported package-manager upgrade | Patch the server |
| Reboot | Reboots with explicit confirmation | Planned restart |
| Shutdown | Powers off with explicit confirmation | Planned shutdown |

## Processes and Supervisor

| Feature | What it does | Example |
|---|---|---|
| Process list | Lists/searches processes | Find `python` processes |
| Process detail | Shows memory, threads, parent and nice | Inspect a worker |
| Kill | Sends TERM or KILL | Stop a stuck process |
| POSIX signals | Sends HUP/INT/USR1/etc. | Reload a daemon with HUP |
| Open files | Lists process file descriptors | Find what a process keeps open |
| Supervisor status | Lists supervisord programs | Check worker state |
| Supervisor control | Start/stop/restart supervised program | Restart a Supervisor worker |

## systemd services

| Feature | What it does | Example |
|---|---|---|
| daemon-reload | Reloads systemd configuration | Apply a new unit file |
| Service list | Lists systemd services | Build a service dashboard |
| Failed units | Lists failed services | Alert on failures |
| Timers | Lists systemd timers | Inspect scheduled units |
| Service detail | Reads unit state | Diagnose one unit |
| Service logs | Reads journal for a unit | Fetch nginx logs |
| Start/stop/restart/reload | Controls a unit | Restart a bot |
| Enable/disable | Controls boot startup | Enable app service |
| Mask/unmask | Prevents/allows unit startup | Lock a service off |

## Remote shell

| Feature | What it does | Example |
|---|---|---|
| Execute command | Runs `bash -lc` with cwd/timeout controls and auditing | Run `uptime` from a bot |

## Files

| Feature | What it does | Example |
|---|---|---|
| List/metadata | Lists a directory or file metadata | Inspect `/var/www` |
| Read text | Reads a text file | Read `/etc/hostname` |
| Write/append | Writes text with limits | Update an app `.env` |
| Download | Streams a file | Download a log |
| Upload | Uploads multipart files | Deploy a ZIP |
| Fetch URL | Downloads an HTTP(S) file server-side | Fetch a release artifact |
| Content search | Regex-searches a tree | Find `ERROR` under `/var/log` |
| Tail | Reads last N lines | Tail a log |
| Tree | Builds a directory tree | Inspect `/srv` structure |
| Disk usage | Calculates tree size and counts | Measure Docker data folder |
| Archive | Creates `.tar.gz` | Archive `/opt/app` |
| Unarchive | Safely extracts tar/zip | Deploy an archive |
| Delete | Deletes a non-protected path | Remove temp data |
| Move | Moves/renames paths | Move a backup |
| mkdir | Creates directories | Create `/srv/app` |
| Copy | Copies files/trees | Duplicate config |
| chmod | Changes mode | Set `750` |
| chown | Changes owner/group | Set `www-data:www-data` |
| Checksum | Calculates SHA-256/SHA1/MD5 | Verify a release |
| Symlink | Creates a symbolic link | Point `/srv/current` to a release |
| Touch | Creates/updates timestamp | Create a lock file |
| File info | Returns detailed metadata | Inspect symlink target/owner |
| Rename | Renames inside directory | Rename config |
| Diff | Unified diff of text files | Compare configs |
| Replace | Find/replace with optional backup | Toggle a config value |
| File type | Detects MIME/file type | Identify an unknown file |

## Screen/tmux sessions

| Feature | What it does | Example |
|---|---|---|
| List sessions | Lists GNU Screen or tmux fallback sessions | Find background tasks |
| Create session | Starts a detached session | Launch deploy script |
| Inspect session | Gets session state | Check build session |
| Read logs/buffer | Captures visible output and scrollback | Read deployment output |
| Send command | Types into a session | Run a follow-up command |
| Kill | Terminates session/children | Stop a stuck build |
| Wipe dead sockets | Cleans dead Screen sockets | Repair stale session list |

## Docker

| Feature | What it does | Example |
|---|---|---|
| Containers | Lists containers by state | Show running containers |
| Start/stop/restart | Controls containers | Restart API |
| Pause/unpause | Freezes/resumes workload | Pause a heavy job |
| Remove | Removes a container | Delete old worker |
| Inspect | Reads image/mount/PID/network details | Debug container setup |
| Logs | Reads container logs | Fetch last 300 lines |
| Exec | Runs commands in container | `ps aux` |
| Stats | CPU/memory/network/block I/O snapshot | Monitor usage |
| Engine info | Docker version/resources summary | Inventory Docker host |
| Images | Lists local images | Audit image storage |
| Pull | Pulls an image | Pull `nginx:latest` |
| Delete image | Removes an image | Clean old version |
| System prune | Prunes unused Docker data | Reclaim disk |
| Compose register | Registers a compose stack path | Track `/opt/app` |
| Compose up/down/pull | Controls Compose stack | Redeploy a stack |
| Container top | Lists processes inside container | Debug high CPU |
| Rename container | Renames a container | Rename `old-api` |
| Kill with signal | Sends container signal | Send KILL/HUP |
| Networks | Lists/inspects Docker networks | Debug networking |
| Volumes | Lists/inspects named volumes | Check volume mountpoint/size |

## Firewall and Fail2ban

| Feature | What it does | Example |
|---|---|---|
| UFW status | Shows firewall state/rules | Audit exposed ports |
| Add rule | allow/deny/reject/limit | Allow 443/tcp |
| Delete rule | Removes a matching rule | Remove old SSH allowlist |
| Enable/disable UFW | Toggles firewall with confirmation | Enable firewall after allowing SSH |
| Reload UFW | Reloads rules | Apply rule changes |
| Fail2ban status | Shows jails/banned IPs | Inspect sshd jail |
| Ban IP | Bans an address in a jail | Block attacker IP |
| Unban IP | Removes a ban | Unblock trusted IP |

## Users and SSH keys

| Feature | What it does | Example |
|---|---|---|
| User list | Lists interactive accounts | Inventory admins |
| Create user | Creates account/home/shell/password | Add `deploy` user |
| Change password | Updates account password | Rotate credentials |
| Delete user | Deletes account, optionally home | Remove old admin |
| User detail | Shows UID/GID/groups/home/shell | Audit permissions |
| SSH key list | Lists keys + fingerprints | Review authorized keys |
| Add SSH key | Appends deduplicated public key | Add laptop key |
| Delete SSH key | Removes key by index | Revoke old key |

## Network API

| Feature | What it does | Example |
|---|---|---|
| Public IP | Returns outbound public IPv4 | Check current egress IP |
| Interfaces | IPv4/IPv6/MAC/speed/counters | Inventory NICs |
| Routes | Kernel route table | Check gateway |
| DNS | Resolver list | Diagnose DNS |
| Listening ports | Ports + owning process | Security audit |
| Connections | Active network connections | Connection monitoring |
| ARP/neighbors | Neighbor table | Check gateway reachability |
| Traffic sample | Measures RX/TX rate | Bandwidth graph |
| Ping | ICMP test | Ping Cloudflare |
| Traceroute | Route path test | Diagnose latency path |
| DNS lookup | Resolves A records | Resolve a domain |
| DNS records | A/AAAA/MX/TXT/NS/CNAME/SOA/SRV | Inspect mail DNS |
| TCP check | Connects to host:port | Test database port |
| HTTP check | Status + latency | Check website health |
| TLS/SSL check | Reads certificate and expiry | Alert before certificate expires |
| `/etc/hosts` | Parses local hosts file | Audit overrides |
| GeoIP | Country/city/org/ASN | Identify server egress |
| Multi-provider latency | Pings Google/Cloudflare/Quad9 | Compare internet latency |
| Self-signed certificate | Generates a local TLS cert/key | Create temporary internal cert |

## Git

| Feature | What it does | Example |
|---|---|---|
| Status | Shows working-tree changes | Check deployment modifications |
| Log | Returns recent commits | Show deployed history |
| Pull | Fast-forward pull | Update production |
| Checkout | Switches branch | Change staging branch |
| Clone | Clones HTTPS/SSH repo | Deploy a new app |
| Branches | Lists local/remote branches | Build branch selector |
| Diff | Returns patch/stat | Review changes |
| Push | Pushes to remote, with protection around force | Publish server-side commit |

## Cron and audit

| Feature | What it does | Example |
|---|---|---|
| Cron list | Parses crontab and next run | Automation dashboard |
| Add cron | Adds a scheduled command | Run backup every 10 minutes |
| Update cron | Changes a scheduled command | Change timing |
| Delete cron | Removes a task | Remove old job |
| Run cron now | Executes immediately and captures output | Test before waiting |
| Audit logs | Records API calls, denials, rate limits and mutations | Investigate automation activity |

---

# What requires external Linux tools?

Some features only work when their underlying tools are installed.

| Tool | Features that depend on it | Example |
|---|---|---|
| Docker | Containers, images, Compose, networks, volumes | OpsDeck/API Docker features |
| Git | Repository management | Fetch/pull/checkout/diff |
| GNU Screen or tmux | Session management | Background shell sessions |
| UFW | Firewall API | Allow/deny ports |
| Fail2ban | Ban/jail management | Block malicious IP |
| traceroute | Traceroute diagnostics | Network path test |
| Supervisor | Supervisor program controls | Restart supervised workers |
| `dig` | Full DNS record queries | MX/TXT/SRV lookups |

---

# Important limitations

| Limitation | Meaning | Example |
|---|---|---|
| Linux x86_64 | Compiled modules target 64-bit Linux | ARM VPS is not supported by the included binaries |
| CPython 3.10 core | Main compiled engine requires Python 3.10 ABI | Installer prepares Python 3.10 |
| Debian/Ubuntu automation | Automatic dependency repair targets apt-based systems | Ubuntu 24.04 works through installer preparation |
| Root-level power | The panel performs privileged operations | File/network/service changes affect the real server |
| HTTPS is not built into port 789 | Default install is plain HTTP | Put the panel behind nginx/Caddy + TLS for public use |
| Some internal historical IDs remain | Compiled compatibility identifiers cannot be blindly renamed | `vmtool.service`, `WeVPSControl`, some `WEVPS_*` names |
| Compiled engines are not reconstructed source | `.so` modules are distributed binaries | UI/installers/wrappers are editable; compiled core source is not available |

---

# Authentication model

| Item | Current Apira VPS behavior | Example |
|---|---|---|
| Login backend | Local to the server | No `api.wevps.space` login dependency |
| Credential file | `/etc/apira-vps/auth.json` | Local admin credential record |
| Password storage | Salted `scrypt` hash | Plain password is not stored |
| Default username | `admin` | Created on first install |
| Initial password | Random strong password shown once during install | Save it immediately after installation |

---

# Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/install.sh | sudo bash
```

Then open:

```text
http://YOUR_SERVER_IP:789/login
```

---

# Repositories

| Repository | Purpose |
|---|---|
| `Raha423/Raha423 → apira-vps` | Apira VPS maintained distribution, documentation, packages and installer |
| `WEVPSAPI/VMTOOL` | Original upstream project used as the historical source of the MIT-licensed components |

See `LICENSE` and `NOTICE.md` for attribution and licensing details.
