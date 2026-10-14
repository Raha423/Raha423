#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root, for example:" >&2
  echo "curl -fsSL https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/install.sh | sudo bash" >&2
  exit 1
fi

REPO_RAW="https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps"
PACKAGE_URL="${REPO_RAW}/Tools/WeVPSControl.zip"
WORK_DIR="$(mktemp -d -t apira-vps-install.XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

export DEBIAN_FRONTEND=noninteractive
if ! command -v curl >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Automatic installation currently supports Debian/Ubuntu (apt-get)." >&2
    exit 1
  fi
  apt-get update
  apt-get install -y curl unzip ca-certificates
fi

echo "Downloading Apira VPS..."
curl --fail --location --retry 3 --connect-timeout 15 \
  "${PACKAGE_URL}" --output "${WORK_DIR}/ApiraVPS.zip"

unzip -q "${WORK_DIR}/ApiraVPS.zip" -d "${WORK_DIR}/package"
CONTROL_DIR="$(find "${WORK_DIR}/package" -maxdepth 2 -type f -name install-bro -printf '%h\n' | head -n1)"

if [[ -z "${CONTROL_DIR}" || ! -f "${CONTROL_DIR}/install-bro" ]]; then
  echo "Apira VPS package is invalid: install-bro was not found." >&2
  exit 1
fi

chmod +x "${CONTROL_DIR}/install-bro"
cd "${CONTROL_DIR}"
bash ./install-bro

echo
echo "Apira VPS installation finished."
echo "Open: http://YOUR_SERVER_IP:789/login"
echo "Service: vmtool.service"
