#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root: sudo ./install.sh" >&2
  exit 1
fi

CONTROL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3.10 || true)}"
SERVICE_NAME="vmtool.service"
PORT="${WEVPS_PORT:-789}"

if [[ -z "${PYTHON_BIN}" || ! -x "${PYTHON_BIN}" ]]; then
  echo "Python 3.10 is required because this package contains a CPython 3.10 module." >&2
  echo "Install python3.10 and python3.10-venv, then run this installer again." >&2
  exit 1
fi

if [[ "$("${PYTHON_BIN}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')" != "3.10" ]]; then
  echo "PYTHON_BIN must point to CPython 3.10." >&2
  exit 1
fi

if [[ ! -f "${CONTROL_DIR}/vmtool.cpython-310-x86_64-linux-gnu.so" ]]; then
  echo "Missing vmtool.cpython-310-x86_64-linux-gnu.so in ${CONTROL_DIR}" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This build requires Linux x86_64." >&2
  exit 1
fi

mkdir -p "${CONTROL_DIR}/Extensions"
if [[ ! -f "${CONTROL_DIR}/Extensions.txt" ]]; then
  printf '# One extension directory name per line.\n' > "${CONTROL_DIR}/Extensions.txt"
fi

"${PYTHON_BIN}" -m venv "${CONTROL_DIR}/.venv"
"${CONTROL_DIR}/.venv/bin/python" -m pip install --upgrade pip wheel
"${CONTROL_DIR}/.venv/bin/python" -m pip install -r "${CONTROL_DIR}/requirements.txt"

"${CONTROL_DIR}/.venv/bin/python" "${CONTROL_DIR}/apira_auth.py" --init --file /etc/apira-vps/auth.json --username admin

"${CONTROL_DIR}/.venv/bin/python" -c \
  "import sys; sys.path.insert(0, '${CONTROL_DIR}'); import apira_entry; print('Apira VPS Control module verified')"

cat > "/etc/systemd/system/${SERVICE_NAME}" <<EOF
[Unit]
Description=Apira VPS Control
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${CONTROL_DIR}
Environment=PYTHONUNBUFFERED=1
Environment=APIRA_VPS_AUTH_FILE=/etc/apira-vps/auth.json
Environment=WEVPS_EXTENSIONS_MANIFEST_URL=https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/Extensions
ExecStart=${CONTROL_DIR}/.venv/bin/python -m gunicorn --workers 2 --threads 50 --timeout 0 --bind 0.0.0.0:${PORT} apira_entry:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo
echo "Apira VPS Control installed successfully."
echo "Address: http://SERVER_IP:${PORT}/login"
echo "Service: ${SERVICE_NAME}"
systemctl status "${SERVICE_NAME}" --no-pager
