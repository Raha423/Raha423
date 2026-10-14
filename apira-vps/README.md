# Apira VPS

Apira VPS is a self-hosted Linux server control panel based on the original MIT-licensed WeVPS/VMTOOL project, rebranded and adapted to use Apira VPS resources and server-local authentication.

## Quick install

Run as root on a fresh Debian/Ubuntu server:

```bash
curl -fsSL https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/install.sh | sudo bash
```

After installation, open:

```text
http://YOUR_SERVER_IP:789/login
```

The installer creates a local administrator account. The generated password is shown once during installation. Only a password hash is stored afterwards.

## Included modules

- **Apira VPS Control** — dashboard, system information, resource usage, services and security overview.
- **File Manager** — browse, upload, download and manage server files.
- **Terminal** — browser-based terminal access through the control panel.
- **Network** — network diagnostics and IP/network information tools.
- **Backup Center** — local/remote backup and recovery workflows.
- **Installer** — server and operating-system installation/deployment helpers.
- **OpsDeck** — Docker, Git, automation and terminal-session operations.
- **Resource Sentinel** — CPU, RAM, disk, I/O, network, load and temperature monitoring with alert support.
- **API Core** — REST API for system metrics, processes, systemd, files, terminal, Docker, networking, firewall/fail2ban, Git, users and cron with API-key controls.

## Authentication

Apira VPS does **not** require the original external WeVPS authentication service.

Authentication is local to each server:

```text
/etc/apira-vps/auth.json
```

Passwords are stored as salted `scrypt` hashes, not plaintext. The current implementation uses one local administrator credential per installation.

## Requirements

- Linux x86_64
- Debian/Ubuntu for the automatic installer
- root privileges
- CPython 3.10 for the compiled control module
- default TCP port: `789`

The installer can install or build Python 3.10 when needed.

## What is editable source and what is not

Most UI, installer, configuration, extension and Python files are included in readable form. However, the original core and several extension engines were distributed as compiled CPython `.so` modules. Their original Python source was not present in the upstream repository.

Apira VPS keeps those compiled modules and wraps the control core with editable Python files such as `apira_auth.py` and `apira_entry.py` to provide local authentication and Apira-specific behavior.

This repository therefore contains the complete distributable project, but it is **not a 100% source-code reconstruction of the compiled upstream modules**.

## Compatibility identifiers

Some internal names are intentionally preserved because the compiled modules depend on them. Examples include:

- `vmtool.service`
- `vmtool.cpython-310-x86_64-linux-gnu.so`
- internal extension IDs such as `WeVPSControl`, `WEVPSNetwork` and similar route/config identifiers
- some `WEVPS_*` environment-variable names

These are compatibility identifiers, not the public product brand. User-facing text is branded as **Apira VPS**.

## Service management

```bash
systemctl restart vmtool.service
systemctl status vmtool.service --no-pager -l
journalctl -u vmtool.service -f
```

## Repository layout

```text
apira-vps/
├── README.md
├── LICENSE
├── NOTICE.md
├── install.sh
├── Backend
├── Extensions
├── Notifications
├── Tools/               # installable ZIP packages
├── source/              # expanded/readable distribution tree
└── docs/
```

## Security notes

Apira VPS is a privileged server-management panel. It can expose terminal, file-management, service-management and other administrative capabilities. Do not expose port 789 directly to the public Internet without appropriate firewall rules and HTTPS/reverse-proxy protection.

Review access controls before production use and keep the server and dependencies updated.

## License and attribution

The upstream project is licensed under the MIT License. The original copyright and MIT license notice are preserved in `LICENSE` as required by that license.

Apira VPS is a modified distribution and rebrand; retaining internal compatibility identifiers does not imply affiliation or endorsement by the original project.