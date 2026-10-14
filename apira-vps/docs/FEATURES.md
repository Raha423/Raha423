# Apira VPS features and limitations

## Control panel

The main control panel provides server resource information, process/service visibility, system information, security checks, service controls, logs, update/extension handling and the shared authentication/session layer used by installed tools.

## File Manager

Provides browser-based file and directory management for the server. Because the panel service runs with administrative privileges, file operations can affect system files; access to the panel must be treated as root-level access.

## Terminal

Provides a web terminal mounted into the main control panel. Commands run with the operating-system permissions of the panel service.

## Network

Provides network diagnostics, listening/network information and related server/network tooling. Downloaded diagnostic report filenames are branded as Apira VPS.

## Backup Center

Provides backup/recovery workflows and support for local and remote destinations exposed by the included application. Some internal default paths and compatibility environment variables may retain historical names.

## Installer

Provides deployment/installation helpers. The main Apira VPS installer itself targets Debian/Ubuntu and can install or build CPython 3.10 if the required runtime is not available.

## OpsDeck

Provides operational tooling around Docker, Git, automation and terminal/session management.

## Resource Sentinel

Provides live server resource monitoring and configurable alerts for CPU, RAM, disk, I/O, network, load and temperature, with the notification channels supported by the included module.

## API Core

Provides a privileged REST API layer for server operations including system metrics, processes, systemd, terminal, files, Docker, networking, firewall/fail2ban, Git, users and cron. It includes scoped/expiring/rate-limited API-key functionality exposed by the original module.

## Authentication model

Apira VPS replaces the original remote WeVPS authentication dependency with local authentication. Each installation currently uses one local administrator credential stored in `/etc/apira-vps/auth.json`. Passwords are stored as salted scrypt hashes.

## Included but not fully editable

The main control engine and several extension engines are compiled CPython `.so` modules. The original Python sources for those modules were not present in the upstream distribution. They are included as distributable binaries and are not reconstructed source code.

## Platform limitations

- Linux x86_64 is required by the included compiled modules.
- The core compiled module requires CPython 3.10.
- Automatic dependency installation targets Debian/Ubuntu.
- The service runs with root privileges because the panel manages privileged server resources.
- HTTPS/TLS termination is not built into the default port-789 deployment; use a reverse proxy or other secure exposure method in production.
- Internal compatibility names such as `vmtool.service`, some extension IDs/routes and `WEVPS_*` environment names remain intentionally unchanged.

## Not included

- No dependency on `api.wevps.space` for login.
- No centralized Apira VPS cloud account service is required for authentication.
- No claim is made that compiled upstream modules have been converted back to their original Python source.
- No bundled public HTTPS certificate/domain configuration is provided by the default installer.
