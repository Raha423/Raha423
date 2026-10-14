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

## Languages

Apira VPS supports both **English** and **Persian (فارسی)**.

Open **Settings → Language** and choose:

- **English** — left-to-right interface.
- **فارسی** — Persian translation with right-to-left (RTL) layout.

The selected language is stored locally in the browser and is shared across the main control panel and installed Apira VPS extensions. Dynamic interface text such as status cards, dialogs, notifications and operation messages is translated as it appears.

Technical identifiers and executable content such as shell commands, Linux paths, API fields, Docker/Git names, code blocks and protocol names remain unchanged where translating them could make the interface inaccurate or break copy/paste workflows.

Translation resources are maintained in:

```text
apira-vps/i18n/apira-i18n.js
apira-vps/i18n/apira-fa.json
```

The package publishing workflow embeds these resources directly into the HTML of every published tool, so Persian support does not depend on an external translation service or a separate static-file route.

## Interactive Security Guides

Security recommendations in the **Security Center** are interactive. Supported cards open a structured guide instead of acting as display-only warnings.

Each guide contains an explanation, safety notes, numbered steps, command blocks, one-tap **Copy** buttons and a verification step. The firewall guide also reads the live SSH port from the server before generating the UFW command, so it does not assume port 22.

Current interactive guides cover:

- Host firewall / UFW setup
- Direct root SSH login restrictions
- SSH password authentication
- Security package updates
- Failed and successful SSH login review

See **[`docs/SECURITY-GUIDES.md`](docs/SECURITY-GUIDES.md)** for the full guide behavior and safety model.

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

### Capability Library

The full documentation is organized as a catalog instead of a long article. Every module is split into tables with three columns: **Feature**, **What it does**, and **Example**.

**[`docs/FEATURES.md` — Open the Apira VPS Capability Library](docs/FEATURES.md)**

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
├── i18n/               # English/Persian localization resources
├── patches/            # maintained UI/runtime patches
├── Tools/              # installable packages
├── source/             # expanded project files
└── docs/
    ├── FEATURES.md
    └── SECURITY-GUIDES.md
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

## Repositories

- **Apira VPS maintained distribution:** https://github.com/Raha423/Raha423/tree/main/apira-vps
- **Original upstream project:** https://github.com/WEVPSAPI/VMTOOL

## License and attribution

This distribution contains modified components originating from an MIT-licensed upstream project. The original copyright and MIT permission notice are preserved in [`LICENSE`](LICENSE), and modification/attribution notes are documented in [`NOTICE.md`](NOTICE.md).

The product branding, local-auth adaptation, package hosting, bilingual interface and public distribution in this repository are provided as **Apira VPS**.
