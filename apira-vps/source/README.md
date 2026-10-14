# Apira VPS

**Apira VPS** is a self-hosted Linux server control panel for managing a VPS from a single web interface.

It includes system monitoring, file management, terminal access, service controls, networking tools, backups, automation, resource alerts and a privileged REST API layer.

## Quick install

Run this command as root on a Debian/Ubuntu server:

```bash
curl -fsSL https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/install.sh | sudo bash
```

The installer places the panel in:

```text
/opt/apira-vps
```

After installation, open:

```text
http://YOUR_SERVER_IP:789/login
```

The default administrator username is:

```text
admin
```

A strong random password is generated during the first installation and shown once in the terminal. Only its salted `scrypt` hash is stored afterwards.

## Included modules

- **Apira VPS Control** — dashboard, CPU/RAM/disk/network information, system details, processes, services, logs and security overview.
- **File Manager** — browse and manage files and directories from the browser.
- **Terminal** — web terminal mounted inside the panel.
- **Network** — network diagnostics and server/network information tools.
- **Backup Center** — backup, recovery and supported local/remote backup workflows.
- **Installer** — operating-system and deployment helpers included with the project.
- **OpsDeck** — Docker, Git, automation and terminal/session operations.
- **Resource Sentinel** — CPU, RAM, disk, I/O, network, load and temperature monitoring with configurable alerts.
- **API Core** — privileged REST API for system metrics, processes, systemd, files, terminal, Docker, network, firewall/fail2ban, Git, users and cron with API-key controls.

More details are available in [`docs/FEATURES.md`](docs/FEATURES.md).

## Local authentication

Apira VPS uses server-local authentication. No external account/login backend is required.

Credential data is stored in:

```text
/etc/apira-vps/auth.json
```

Passwords are never stored in plaintext.

## Requirements

- Linux x86_64
- Debian/Ubuntu for automatic installation
- root privileges
- TCP port `789` by default
- CPython 3.10 for the compiled control engine

The installer can install or build Python 3.10 when the required runtime is not already available.

## Project files

```text
apira-vps/
├── README.md
├── LICENSE
├── NOTICE.md
├── install.sh
├── SHA256SUMS
├── Backend
├── Extensions
├── Notifications
├── Tools/               # installable packages
├── source/              # expanded project files
└── docs/
    └── FEATURES.md
```

The `source/` directory is automatically generated from the published packages so the project structure and readable files can be inspected directly on GitHub.

## Source availability

The UI, installers, configuration, authentication wrapper and several Python files are readable and editable.

The main control engine and several extension engines are distributed as compiled CPython `.so` modules. Their original pre-compilation Python source is not included in the upstream distribution, so this repository does not claim to be a source-code reconstruction of those compiled modules.

## Compatibility identifiers

The public product name is **Apira VPS**. Some internal identifiers are intentionally preserved because the compiled modules depend on them, including examples such as:

```text
vmtool.service
vmtool.cpython-310-x86_64-linux-gnu.so
WeVPSControl
WEVPSNetwork
WEVPS_*
```

These names are implementation/compatibility identifiers and are not the user-facing brand.

## Service management

Restart:

```bash
systemctl restart vmtool.service
```

Status:

```bash
systemctl status vmtool.service --no-pager -l
```

Logs:

```bash
journalctl -u vmtool.service -f
```

## Package integrity

SHA-256 checksums for all published ZIP packages are available in [`SHA256SUMS`](SHA256SUMS).

## Security

Apira VPS is a privileged server-administration panel. Terminal, file, service and API access should be treated as root-level access.

For production use, place the panel behind HTTPS/reverse-proxy protection and appropriate firewall/access rules instead of exposing port `789` openly to the Internet.

## License and attribution

This distribution contains modified components originating from an MIT-licensed upstream project. The original copyright and MIT permission notice are preserved in [`LICENSE`](LICENSE), and modification/attribution notes are documented in [`NOTICE.md`](NOTICE.md).

The product branding, local-auth adaptation, package hosting and public distribution in this repository are provided as **Apira VPS**.
