# Apira VPS — Interactive Security Guides

The **Security Center** includes interactive help for recommendations that would otherwise only be informational.

Each supported recommendation opens a structured guide with:

| Part | What it shows |
|---|---|
| Explanation | What the security warning means |
| Before you start | Lockout or service-impact warnings |
| Numbered steps | A safe order for performing the change |
| Command boxes | Linux commands separated from explanatory text |
| Copy button | Copies the exact command even when the panel is served over plain HTTP |
| Verification | How to confirm the change actually worked |

The guide follows the selected **English / فارسی** interface language. Code blocks, Linux paths and commands stay left-to-right so they remain safe to copy.

## Available guides

| Recommendation | Guide includes |
|---|---|
| Enable a host firewall | Check SSH, allow the live SSH port, inspect listeners, allow required ports, review and enable UFW |
| Restrict direct root login | Back up SSH config, inspect effective settings, apply a safer root policy, validate and reload SSH |
| Disable SSH password authentication | Verify authorized keys, test a second key-based session, disable password login, validate and reload |
| Install security updates | Refresh package indexes, review updates, simulate upgrade, apply updates and verify services |
| Review failed SSH logins | Review failed and successful SSH events, inspect login history, optionally configure Fail2ban |

## Server-aware commands

The firewall guide reads the current SSH port from the live Security Center response. For example, if SSH is currently listening on port `41080`, the copied command becomes:

```bash
sudo ufw allow 41080/tcp
```

It does **not** assume port 22 and it does not change the SSH port.

## Safety model

These guides teach and provide commands; they do not automatically execute firewall, SSH or package-management changes. This is intentional because enabling a firewall or changing SSH settings can disconnect a remote administrator if the server has not been reviewed first.
