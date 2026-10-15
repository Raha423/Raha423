from __future__ import annotations

import concurrent.futures
import asyncio
import base64
import hashlib
import hmac
import importlib.util
import json
import os
import re
import secrets
import shutil
import smtplib
import sqlite3
import ssl
import subprocess
import sys
import tarfile
import threading
import time
import uuid
from email.message import EmailMessage
from functools import wraps
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urlparse

_MODULE_LOCATION = Path(__file__).resolve().parent
_VENDOR_DIR = (_MODULE_LOCATION if _MODULE_LOCATION.name == "bin" else _MODULE_LOCATION / "bin") / "vendor"
if _VENDOR_DIR.is_dir() and str(_VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(_VENDOR_DIR))

from flask import Flask, jsonify, redirect, request, send_file, send_from_directory, session
from werkzeug.exceptions import HTTPException


MODULE_DIR = Path(__file__).resolve().parent
BASE_DIR = MODULE_DIR.parent if MODULE_DIR.name == "bin" else MODULE_DIR
MAIN_APP_DIR = next(
    (parent for parent in BASE_DIR.parents
     if (parent / "vmtool.py").is_file() or any(parent.glob("vmtool*.so"))),
    BASE_DIR.parent,
)
SECRET_FILE = MAIN_APP_DIR / ".secret_key"
STATE_DIR = Path(os.environ.get("WEVPS_BACKUP_STATE", "/var/lib/wevps-backup-center"))
BACKUP_DIR = Path(os.environ.get("WEVPS_BACKUP_DIR", "/var/backups/wevps"))
RESTORE_DIR = STATE_DIR / "restores"
DB_PATH = STATE_DIR / "backup-center.db"
MAX_WORKERS = 2
MAX_PATHS = 32
MIN_FREE_BYTES = 512 * 1024 * 1024
SECRET_SETTING_KEYS = {
    "telegram_token", "telegram_api_hash", "sftp_password",
    "smtp_password", "s3_secret_key",
}
DENIED_ROOTS = {
    Path("/proc"), Path("/sys"), Path("/dev"), Path("/run"),
    Path("/var/backups/wevps"), STATE_DIR,
}
executor = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS)
active_lock = threading.Lock()
telegram_lock = threading.Lock()
active_jobs: set[str] = set()


def secret_key() -> str:
    if SECRET_FILE.is_file():
        value = SECRET_FILE.read_text(encoding="utf-8").strip()
        if value:
            return value
    raise RuntimeError("The main Apira VPS session key is unavailable.")


app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=secret_key(),
    SESSION_COOKIE_NAME="session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    MAX_CONTENT_LENGTH=64 * 1024,
)


def initialize() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    RESTORE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    with sqlite3.connect(DB_PATH) as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS backups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                completed_at INTEGER,
                size INTEGER NOT NULL DEFAULT 0,
                path TEXT,
                checksum TEXT,
                sources TEXT NOT NULL,
                excludes TEXT NOT NULL,
                error TEXT,
                compression TEXT NOT NULL DEFAULT 'gz'
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                level TEXT NOT NULL,
                event TEXT NOT NULL,
                detail TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sources TEXT NOT NULL,
                excludes TEXT NOT NULL,
                interval_hours INTEGER NOT NULL,
                retention INTEGER NOT NULL,
                delivery TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                next_run INTEGER NOT NULL,
                last_run INTEGER
            );
        """)
        try:
            connection.execute("ALTER TABLE backups ADD COLUMN schedule_id TEXT")
        except sqlite3.OperationalError:
            pass
    try:
        DB_PATH.chmod(0o600)
    except OSError:
        pass


initialize()


def database() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def event(level: str, name: str, detail: str) -> None:
    with database() as connection:
        connection.execute(
            "INSERT INTO events(created_at,level,event,detail) VALUES(?,?,?,?)",
            (int(time.time()), level, name, detail[:2000]),
        )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get("authenticated") is True:
            return view(*args, **kwargs)
        if request.path.startswith("/api/"):
            return jsonify({
                "success": False,
                "error": "authentication_required",
                "login_url": "/login",
            }), 401
        return redirect("/login")
    return wrapped


def mutation_required(view):
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        origin = request.headers.get("Origin", "")
        if origin and urlparse(origin).netloc.lower() != request.host.lower():
            return jsonify({"success": False, "error": "invalid_origin"}), 403
        if request.headers.get("X-Requested-With") != "XMLHttpRequest":
            return jsonify({"success": False, "error": "invalid_request"}), 400
        return view(*args, **kwargs)
    return wrapped


def safe_name(value: object) -> str:
    name = " ".join(str(value or "").strip().split())
    if not 1 <= len(name) <= 80:
        raise ValueError("Backup name must contain between 1 and 80 characters.")
    return name


def safe_sources(values: object) -> list[str]:
    if not isinstance(values, list) or not 1 <= len(values) <= MAX_PATHS:
        raise ValueError(f"Select between 1 and {MAX_PATHS} source paths.")
    result = []
    for raw in values:
        path = Path(str(raw or "").strip())
        if not path.is_absolute():
            raise ValueError("Every source must be an absolute path.")
        try:
            resolved = path.resolve(strict=True)
        except OSError as error:
            raise ValueError(f"Source does not exist: {path}") from error
        if any(
            resolved == denied
            or denied in resolved.parents
            for denied in DENIED_ROOTS
        ):
            raise ValueError(f"This system path cannot be backed up: {resolved}")
        if resolved == Path("/"):
            raise ValueError("Backing up the complete root filesystem is blocked; select specific paths.")
        result.append(str(resolved))
    return sorted(set(result))


def safe_excludes(values: object) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValueError("Excludes must be a list.")
    result: list[str] = []
    # APIRA_BACKUP_RELIABILITY_V2: normalize pasted values on the server too.
    for raw in values:
        for value in re.split(r"[\s,;]+", str(raw or "").strip()):
            if not value:
                continue
            if len(value) > 200 or "\x00" in value:
                raise ValueError("Invalid exclusion pattern.")
            if value not in result:
                result.append(value)
    if len(result) > 32:
        raise ValueError("Excludes must contain at most 32 patterns.")
    return result


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def get_settings() -> dict[str, str]:
    with database() as connection:
        rows = connection.execute("SELECT key,value FROM settings").fetchall()
    values = {row["key"]: row["value"] for row in rows}
    for key in SECRET_SETTING_KEYS:
        if values.get(key, "").startswith("enc2:"):
            try:
                raw = base64.urlsafe_b64decode(values[key][5:].encode())
                nonce, tag, ciphertext = raw[:16], raw[16:48], raw[48:]
                encryption_key = hashlib.sha256(secret_key().encode()).digest()
                expected = hmac.new(encryption_key, b"mac" + nonce + ciphertext, hashlib.sha256).digest()
                if not hmac.compare_digest(tag, expected):
                    raise ValueError("authentication failed")
                plaintext = bytearray()
                for offset in range(0, len(ciphertext), 32):
                    counter = (offset // 32).to_bytes(8, "big")
                    stream = hmac.new(encryption_key, b"stream" + nonce + counter, hashlib.sha256).digest()
                    plaintext.extend(a ^ b for a, b in zip(ciphertext[offset:offset + 32], stream))
                values[key] = bytes(plaintext).decode()
            except Exception as error:
                raise RuntimeError(f"Unable to decrypt saved setting: {key}") from error
        elif values.get(key, "").startswith("enc:"):
            try:
                from cryptography.fernet import Fernet
                encryption_key = base64.urlsafe_b64encode(hashlib.sha256(secret_key().encode()).digest())
                values[key] = Fernet(encryption_key).decrypt(values[key][4:].encode()).decode()
            except ImportError as error:
                raise RuntimeError(
                    f"Legacy encrypted setting {key} requires cryptography once; clear and save it again."
                ) from error
    return values


def encrypt_setting(value: str) -> str:
    encryption_key = hashlib.sha256(secret_key().encode()).digest()
    nonce = secrets.token_bytes(16)
    plaintext = value.encode()
    ciphertext = bytearray()
    for offset in range(0, len(plaintext), 32):
        counter = (offset // 32).to_bytes(8, "big")
        stream = hmac.new(encryption_key, b"stream" + nonce + counter, hashlib.sha256).digest()
        ciphertext.extend(a ^ b for a, b in zip(plaintext[offset:offset + 32], stream))
    encrypted = bytes(ciphertext)
    tag = hmac.new(encryption_key, b"mac" + nonce + encrypted, hashlib.sha256).digest()
    return "enc2:" + base64.urlsafe_b64encode(nonce + tag + encrypted).decode()


def current_panel_url() -> str:
    mount = request.script_root.rstrip("/") or "/backupcenter"
    return f"{request.host_url.rstrip('/')}{mount}"


def curl_bot(method: str, fields: dict[str, str], file_path: Path | None = None) -> dict:
    settings = get_settings()
    token = settings.get("telegram_token", "")
    chat_id = settings.get("telegram_chat_id", "")
    api_base = settings.get("telegram_api_base", "https://api.telegram.org").rstrip("/")
    if not token or not chat_id:
        raise RuntimeError("Telegram token and chat ID are not configured.")
    curl = shutil.which("curl")
    if not curl:
        raise RuntimeError("curl CLI is required for Telegram delivery.")
    config = [
        "silent",
        "show-error",
        "fail-with-body",
        f'url = "{api_base}/bot{token}/{method}"',
        f'form = "chat_id={chat_id}"',
    ]
    for key, value in fields.items():
        clean = str(value).replace("\r", " ").replace("\n", "\\n").replace('"', '\\"')
        config.append(f'form = "{key}={clean}"')
    if file_path:
        local_mode = api_base.startswith(("http://127.0.0.1", "http://localhost"))
        document = f"file://{file_path}" if local_mode else f"@{file_path}"
        config.append(f'form = "document={document}"')
    result = subprocess.run(
        [curl, "--config", "-"],
        input="\n".join(config) + "\n",
        capture_output=True, text=True, errors="replace", timeout=7200, check=False,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-1000:])
    data = json.loads(result.stdout)
    if not data.get("ok"):
        raise RuntimeError(str(data.get("description") or "Telegram rejected the request."))
    return data


def pyrogram_bot(text: str, file_path: Path | None = None) -> None:
    settings = get_settings()
    token = settings.get("telegram_token", "")
    chat_id_raw = settings.get("telegram_chat_id", "")
    api_id_raw = settings.get("telegram_api_id", "")
    api_hash = settings.get("telegram_api_hash", "")
    if not all((token, chat_id_raw, api_id_raw, api_hash)):
        raise RuntimeError("MTProto requires API ID, API Hash, bot token and chat ID.")
    created_loop = False
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())
        created_loop = True
    try:
        from pyrogram import Client
    except ImportError as error:
        if created_loop:
            asyncio.get_event_loop().close()
            asyncio.set_event_loop(None)
        raise RuntimeError("Pyrogram is not installed.") from error
    chat_id: int | str = int(chat_id_raw) if chat_id_raw.lstrip("-").isdigit() else chat_id_raw
    try:
        with telegram_lock:
            client = Client(
                "wevps_backup_bot",
                api_id=int(api_id_raw),
                api_hash=api_hash,
                bot_token=token,
                workdir=str(STATE_DIR),
                no_updates=True,
            )
            with client:
                if file_path:
                    client.send_document(
                        chat_id, str(file_path), caption=text[:1024],
                        file_name=file_path.name, force_document=True,
                    )
                else:
                    client.send_message(chat_id, text[:4096], disable_web_page_preview=True)
    finally:
        for session_path in STATE_DIR.glob("wevps_backup_bot.session*"):
            try:
                session_path.chmod(0o600)
            except OSError:
                pass
        if created_loop:
            loop = asyncio.get_event_loop()
            loop.close()
            asyncio.set_event_loop(None)


def pyrogram_available() -> bool:
    return importlib.util.find_spec("pyrogram") is not None


def sftp_client():
    settings = get_settings()
    try:
        import paramiko
    except ImportError as error:
        raise RuntimeError("Paramiko is not installed.") from error
    host = settings.get("sftp_host", "")
    username = settings.get("sftp_username", "")
    password = settings.get("sftp_password", "")
    if not all((host, username, password)):
        raise RuntimeError("SFTP destination is not configured.")
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    extension_known_hosts = STATE_DIR / "sftp_known_hosts"
    extension_known_hosts.touch(mode=0o600, exist_ok=True)
    extension_known_hosts.chmod(0o600)
    client.load_host_keys(str(extension_known_hosts))
    # Trust on first use: persist the first key, then reject any future mismatch.
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host, port=int(settings.get("sftp_port", "22")), username=username,
        password=password, look_for_keys=False, allow_agent=False,
        timeout=15, banner_timeout=15, auth_timeout=15,
    )
    return client


def deliver_sftp(archive: Path) -> None:
    settings = get_settings()
    remote_dir = settings.get("sftp_directory", "/var/backups/wevps").rstrip("/") or "/"
    client = sftp_client()
    try:
        with client.open_sftp() as sftp:
            current = ""
            for part in PurePosixPath(remote_dir).parts:
                if part == "/":
                    current = "/"
                    continue
                current = f"{current.rstrip('/')}/{part}"
                try:
                    sftp.stat(current)
                except OSError:
                    sftp.mkdir(current, mode=0o700)
            temporary = f"{remote_dir}/{archive.name}.part"
            final = f"{remote_dir}/{archive.name}"
            sftp.put(str(archive), temporary, confirm=True)
            sftp.chmod(temporary, 0o600)
            sftp.rename(temporary, final)
    finally:
        client.close()


def smtp_connection(settings: dict[str, str]):
    host = settings.get("smtp_host", "")
    port = int(settings.get("smtp_port", "587"))
    security = settings.get("smtp_security", "starttls")
    if not host:
        raise RuntimeError("Email destination is not configured.")
    if security == "none" and host not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Unencrypted SMTP is allowed only for a local relay.")
    context = ssl.create_default_context()
    connection = (
        smtplib.SMTP_SSL(host, port, timeout=20, context=context)
        if security == "ssl" else smtplib.SMTP(host, port, timeout=20)
    )
    if security == "starttls":
        connection.starttls(context=context)
    username = settings.get("smtp_username", "")
    if username:
        connection.login(username, settings.get("smtp_password", ""))
    return connection


def deliver_email(
    backup_id: str,
    archive: Path,
    backup_name: str,
    sources: list[str],
    summary: str,
) -> None:
    settings = get_settings()
    limit = int(settings.get("smtp_max_attachment_mb", "25")) * 1024 * 1024
    if archive.stat().st_size > limit:
        raise RuntimeError(f"Backup exceeds the configured email attachment limit ({limit // 1024 // 1024} MB).")
    message = EmailMessage()
    message["Subject"] = f"Apira VPS backup completed: {backup_name}"
    message["From"] = settings.get("smtp_from", "")
    message["To"] = settings.get("smtp_to", "")
    if not message["From"] or not message["To"]:
        raise RuntimeError("Email sender and recipient are required.")
    message.set_content(
        f"{summary}\n"
        f"SHA-256: {checksum(archive)}\n\n"
        f"Source count: {len(sources)}"
    )
    message.add_attachment(
        archive.read_bytes(), maintype="application", subtype="gzip", filename=archive.name,
    )
    connection = smtp_connection(settings)
    try:
        connection.send_message(message)
    finally:
        connection.quit()


def s3_client():
    settings = get_settings()
    try:
        import boto3
    except ImportError as error:
        raise RuntimeError("Boto3 is not installed.") from error
    endpoint = settings.get("s3_endpoint", "") or None
    return boto3.client(
        "s3", endpoint_url=endpoint, region_name=settings.get("s3_region", "") or None,
        aws_access_key_id=settings.get("s3_access_key", "") or None,
        aws_secret_access_key=settings.get("s3_secret_key", "") or None,
    )


def deliver_s3(archive: Path) -> None:
    settings = get_settings()
    bucket = settings.get("s3_bucket", "")
    if not bucket:
        raise RuntimeError("S3 destination is not configured.")
    prefix = settings.get("s3_prefix", "wevps-backups").strip("/")
    key = f"{prefix}/{archive.name}" if prefix else archive.name
    s3_client().upload_file(
        str(archive), bucket, key,
        ExtraArgs={"ServerSideEncryption": "AES256"},
    )


def delivery_targets(delivery: str) -> list[str]:
    legacy = {
        "none": [], "message": ["telegram_message"], "file": ["telegram_file"],
        "link": ["telegram_link"], "both": ["telegram_file", "telegram_link"],
    }
    if delivery in legacy:
        return legacy[delivery]
    targets = [item.strip() for item in delivery.split(",") if item.strip()]
    allowed = {"telegram_message", "telegram_file", "telegram_link", "sftp", "email", "s3"}
    if not targets or len(targets) != len(set(targets)) or any(item not in allowed for item in targets):
        raise ValueError("Invalid delivery targets.")
    return targets


def backup_delivery_summary(backup_id: str, archive: Path) -> tuple[str, str, list[str]]:
    with database() as connection:
        row = connection.execute(
            "SELECT name,sources FROM backups WHERE id=?",
            (backup_id,),
        ).fetchone()
    backup_name = str(row["name"] if row else "Unnamed backup").replace("\r", " ").replace("\n", " ")
    try:
        raw_sources = json.loads(row["sources"]) if row else []
    except (TypeError, json.JSONDecodeError):
        raw_sources = []
    sources = [
        str(source).replace("\r", " ").replace("\n", " ")
        for source in raw_sources
    ]
    source_lines = "\n".join(f"• {source}" for source in sources) or "• Not recorded"
    if len(source_lines) > 560:
        source_lines = source_lines[:557] + "..."
    summary = (
        "Apira VPS Backup completed\n"
        f"Backup: {backup_name}\n"
        f"Sources:\n{source_lines}\n"
        f"ID: {backup_id}\n"
        f"Size: {archive.stat().st_size} bytes\n"
    )
    return summary, backup_name, sources


def protected_download_url(panel_url: str, backup_id: str) -> str:
    normalized = str(panel_url or "").strip().rstrip("/")
    parsed = urlparse(normalized)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise RuntimeError("The protected download URL is missing or invalid. Save settings and try again.")
    return f"{normalized}/download/{quote(backup_id, safe='')}"


def deliver_backup(backup_id: str, archive: Path, delivery: str) -> list[str]:
    settings = get_settings()
    caption, backup_name, sources = backup_delivery_summary(backup_id, archive)
    mtproto = bool(
        settings.get("telegram_api_id")
        and settings.get("telegram_api_hash")
        and pyrogram_available()
    )
    targets = delivery_targets(delivery)
    if "telegram_file" in targets:
        if mtproto:
            if archive.stat().st_size > 2_000_000_000:
                raise RuntimeError("Telegram bot uploads are limited to 2000 MB.")
            pyrogram_bot(caption, archive)
        elif not settings.get("telegram_api_base", "").startswith(("http://127.0.0.1", "http://localhost")) and archive.stat().st_size > 50 * 1024 * 1024:
            raise RuntimeError("Files over 50 MB require a local Telegram Bot API server.")
        else:
            if archive.stat().st_size > 2_000_000_000:
                raise RuntimeError("Telegram bot uploads are limited to 2000 MB.")
            curl_bot("sendDocument", {"caption": caption}, archive)
    if "telegram_message" in targets:
        pyrogram_bot(caption) if mtproto else curl_bot("sendMessage", {"text": caption})
    if "telegram_link" in targets:
        download_url = protected_download_url(settings.get("panel_url", ""), backup_id)
        text = (
            f"{caption}\nLogin-protected download:\n"
            f"{download_url}"
        )
        pyrogram_bot(text) if mtproto else curl_bot("sendMessage", {"text": text})
    if "sftp" in targets:
        deliver_sftp(archive)
    if "email" in targets:
        deliver_email(backup_id, archive, backup_name, sources, caption)
    if "s3" in targets:
        deliver_s3(archive)
    return targets


def enforce_retention(schedule_id: str, keep: int) -> None:
    deleted = []
    with database() as connection:
        rows = connection.execute(
            """SELECT id,path FROM backups WHERE schedule_id=? AND status='completed'
               ORDER BY created_at DESC""", (schedule_id,)
        ).fetchall()
        for row in rows[keep:]:
            Path(row["path"] or "").unlink(missing_ok=True)
            connection.execute("DELETE FROM backups WHERE id=?", (row["id"],))
            deleted.append(row["id"])
    for backup_id in deleted:
        event("info", "retention_deleted", backup_id)


def excluded(path: Path, patterns: list[str]) -> bool:
    text = str(path)
    absolute = Path("/") / text.lstrip("/")
    if any(absolute == denied or denied in absolute.parents for denied in DENIED_ROOTS):
        return True
    return any(path.match(pattern) or text.endswith(pattern) for pattern in patterns)


def backup_worker(
    backup_id: str,
    sources: list[str],
    excludes: list[str],
    schedule_id: str | None = None,
    delivery: str = "none",
    retention: int = 0,
) -> None:
    archive = BACKUP_DIR / f"{backup_id}.tar.gz"
    # APIRA_BACKUP_WORKER_PID_V2
    marker = BACKUP_DIR / f".{backup_id}.worker"
    try:
        marker.write_text(str(os.getpid()), encoding="utf-8")
        marker.chmod(0o600)
        excludes = safe_excludes(excludes)
        if shutil.disk_usage(BACKUP_DIR).free < MIN_FREE_BYTES:
            raise RuntimeError("Backup stopped because less than 512 MB of local disk space is available.")
        checked_members = 0
        def archive_filter(info: tarfile.TarInfo):
            nonlocal checked_members
            checked_members += 1
            if checked_members % 128 == 0 and shutil.disk_usage(BACKUP_DIR).free < MIN_FREE_BYTES:
                raise RuntimeError("Backup stopped because less than 512 MB of local disk space is available.")
            return None if excluded(Path(info.name), excludes) else info

        with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:
            for source_text in sources:
                source = Path(source_text)
                arcname = str(source).lstrip("/")
                bundle.add(source, arcname=arcname, recursive=True, filter=archive_filter)
        archive.chmod(0o600)
        size = archive.stat().st_size
        digest = checksum(archive)
        with database() as connection:
            connection.execute(
                """UPDATE backups SET status='completed',completed_at=?,size=?,
                   path=?,checksum=?,error=NULL WHERE id=?""",
                (int(time.time()), size, str(archive), digest, backup_id),
            )
        event("success", "backup_completed", f"{backup_id} ({size} bytes)")
        if schedule_id and retention:
            enforce_retention(schedule_id, retention)
        if delivery != "none":
            for target in delivery_targets(delivery):
                try:
                    deliver_backup(backup_id, archive, target)
                    event("success", "backup_delivered", f"{backup_id}: {target}")
                except Exception as error:
                    event("error", "delivery_failed", f"{backup_id}: {target}: {error}")
    except Exception as error:
        archive.unlink(missing_ok=True)
        with database() as connection:
            connection.execute(
                "UPDATE backups SET status='failed',completed_at=?,error=? WHERE id=?",
                (int(time.time()), str(error)[:2000], backup_id),
            )
        event("error", "backup_failed", f"{backup_id}: {error}")
    finally:
        marker.unlink(missing_ok=True)
        with active_lock:
            active_jobs.discard(backup_id)


def row_dict(row: sqlite3.Row) -> dict:
    item = dict(row)
    item["sources"] = json.loads(item["sources"])
    item["excludes"] = json.loads(item["excludes"])
    item["download_url"] = f"api/backups/{item['id']}/download" if item["status"] == "completed" else None
    return item


def archive_for(backup_id: str) -> tuple[sqlite3.Row, Path]:
    if not backup_id.replace("-", "").isalnum() or len(backup_id) > 80:
        raise ValueError("Invalid backup identifier.")
    with database() as connection:
        row = connection.execute("SELECT * FROM backups WHERE id=?", (backup_id,)).fetchone()
    if not row:
        raise LookupError("Backup was not found.")
    path = Path(row["path"] or "")
    if row["status"] != "completed" or not path.is_file() or path.parent != BACKUP_DIR:
        raise LookupError("Backup archive is unavailable.")
    return row, path


def validate_members(bundle: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = bundle.getmembers()
    if len(members) > 1_000_000:
        raise ValueError("Archive contains too many entries.")
    for member in members:
        name = PurePosixPath(member.name)
        if name.is_absolute() or ".." in name.parts:
            raise ValueError("Unsafe archive path detected.")
        if member.isdev() or member.isfifo():
            raise ValueError("Device and FIFO entries cannot be restored.")
        if member.issym() or member.islnk():
            link = PurePosixPath(member.linkname)
            if link.is_absolute() or ".." in link.parts:
                raise ValueError("Unsafe archive link detected.")
        member.mode &= 0o777
        member.uid = os.getuid() if hasattr(os, "getuid") else 0
        member.gid = os.getgid() if hasattr(os, "getgid") else 0
        member.uname = ""
        member.gname = ""
    return members


def recover_stale_running(now: int | None = None) -> None:
    """Fail orphaned running jobs and remove their incomplete archives."""
    now = int(now or time.time())
    recovered: list[str] = []
    with database() as connection:
        rows = connection.execute(
            "SELECT id,created_at FROM backups WHERE status='running'"
        ).fetchall()
        for row in rows:
            marker = BACKUP_DIR / f".{row['id']}.worker"
            archive = BACKUP_DIR / f"{row['id']}.tar.gz"
            worker_alive = False
            if marker.exists():
                try:
                    pid = int(marker.read_text(encoding="utf-8").strip())
                    worker_alive = pid > 1 and Path(f"/proc/{pid}").exists()
                except (OSError, ValueError):
                    worker_alive = False
            elif now - int(row['created_at']) < 15 * 60:
                # A queued worker may not have created its marker yet.
                continue
            if worker_alive:
                continue
            archive.unlink(missing_ok=True)
            marker.unlink(missing_ok=True)
            connection.execute(
                "UPDATE backups SET status='failed',completed_at=?,size=0,path=NULL,checksum=NULL,error=? WHERE id=?",
                (now, "Interrupted: backup worker stopped unexpectedly; incomplete archive removed.", row['id']),
            )
            recovered.append(row['id'])
    for backup_id in recovered:
        event("error", "backup_interrupted", backup_id)


def scheduler_loop() -> None:
    while True:
        try:
            now = int(time.time())
            recover_stale_running(now)
            due = []
            with database() as connection:
                connection.execute("BEGIN IMMEDIATE")
                rows = connection.execute(
                    """SELECT * FROM schedules AS s
                       WHERE enabled=1 AND next_run<=?
                       AND NOT EXISTS (
                         SELECT 1 FROM backups AS b
                         WHERE b.schedule_id=s.id AND b.status='running'
                       )""",
                    (now,),
                ).fetchall()
                for row in rows:
                    connection.execute(
                        "UPDATE schedules SET next_run=?,last_run=? WHERE id=?",
                        (now + row["interval_hours"] * 3600, now, row["id"]),
                    )
                    due.append(dict(row))
            for job in due:
                backup_id = time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-" + uuid.uuid4().hex[:10]
                sources = json.loads(job["sources"])
                excludes = json.loads(job["excludes"])
                with database() as connection:
                    connection.execute(
                        """INSERT INTO backups(id,name,status,created_at,sources,excludes,schedule_id)
                           VALUES(?,?, 'running', ?, ?, ?, ?)""",
                        (backup_id, job["name"], now, job["sources"], job["excludes"], job["id"]),
                    )
                executor.submit(
                    backup_worker, backup_id, sources, excludes, job["id"],
                    job["delivery"], job["retention"],
                )
                event("info", "scheduled_backup_started", f"{job['id']}: {backup_id}")
        except Exception as error:
            try:
                event("error", "scheduler_error", str(error))
            except Exception:
                pass
        time.sleep(30)


threading.Thread(target=scheduler_loop, name="wevps-backup-scheduler", daemon=True).start()


@app.get("/")
@login_required
def page():
    return send_from_directory(str(BASE_DIR), "index.html")


@app.get("/ui.js")
@login_required
def ui_script():
    return send_from_directory(str(BASE_DIR), "ui.js", mimetype="application/javascript")


@app.get("/apira-i18n.js")
@login_required
def apira_i18n_script():
    return send_from_directory(str(BASE_DIR), "apira-i18n.js", mimetype="application/javascript")


@app.get("/api/overview")
@login_required
def overview():
    usage = shutil.disk_usage(BACKUP_DIR)
    with database() as connection:
        totals = connection.execute(
            """SELECT COUNT(*) total,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
               SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,
               SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running,
               COALESCE(SUM(size),0) bytes FROM backups"""
        ).fetchone()
        latest = connection.execute(
            "SELECT * FROM backups ORDER BY created_at DESC LIMIT 8"
        ).fetchall()
    return jsonify({
        "success": True,
        "hostname": os.uname().nodename if hasattr(os, "uname") else "server",
        "stats": dict(totals),
        "storage": {
            "path": str(BACKUP_DIR), "total": usage.total,
            "used": usage.used, "free": usage.free,
        },
        "active": totals["running"] or 0,
        "latest": [row_dict(row) for row in latest],
        "version": "1.0.0",
    })


@app.get("/api/backups")
@login_required
def backups():
    with database() as connection:
        rows = connection.execute(
            "SELECT * FROM backups ORDER BY created_at DESC LIMIT 500"
        ).fetchall()
    return jsonify({"success": True, "backups": [row_dict(row) for row in rows]})


@app.post("/api/backups")
@mutation_required
def create_backup():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError("A valid JSON object is required.")
    name = safe_name(payload.get("name"))
    sources = safe_sources(payload.get("sources"))
    excludes = safe_excludes(payload.get("excludes"))
    backup_id = time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-" + uuid.uuid4().hex[:10]
    with database() as connection:
        connection.execute(
            """INSERT INTO backups(id,name,status,created_at,sources,excludes)
               VALUES(?,?, 'running', ?, ?, ?)""",
            (backup_id, name, int(time.time()), json.dumps(sources), json.dumps(excludes)),
        )
    with active_lock:
        active_jobs.add(backup_id)
    executor.submit(backup_worker, backup_id, sources, excludes)
    event("info", "backup_started", f"{backup_id}: {', '.join(sources)}")
    return jsonify({"success": True, "id": backup_id, "message": "Backup started."}), 202


@app.get("/api/backups/<backup_id>/download")
@login_required
def download_backup(backup_id: str):
    row, path = archive_for(backup_id)
    return send_file(
        path, as_attachment=True,
        download_name=f"{row['name'].replace(' ', '_')}-{backup_id}.tar.gz",
        mimetype="application/gzip", conditional=True,
    )


@app.post("/api/backups/<backup_id>/verify")
@mutation_required
def verify_backup(backup_id: str):
    row, path = archive_for(backup_id)
    actual = checksum(path)
    expected = str(row["checksum"] or "").strip()
    checksum_match = bool(expected) and hmac.compare_digest(actual, expected)
    archive_valid = True
    member_count = 0
    try:
        with tarfile.open(path, "r:gz") as bundle:
            members = validate_members(bundle)
            member_count = len(members)
    except (tarfile.TarError, OSError, EOFError, ValueError):
        archive_valid = False

    baseline_created = False
    if not expected and archive_valid:
        with database() as connection:
            connection.execute(
                "UPDATE backups SET checksum=? WHERE id=? AND (checksum IS NULL OR checksum='')",
                (actual, backup_id),
            )
        expected = actual
        checksum_match = True
        baseline_created = True

    valid = archive_valid and checksum_match
    detail = (
        f"{backup_id}: valid={valid}; checksum={checksum_match}; "
        f"archive={archive_valid}; members={member_count}; baseline={baseline_created}"
    )
    event("success" if valid else "error", "backup_verified", detail)
    return jsonify({
        "success": True,
        "valid": valid,
        "checksum_match": checksum_match,
        "archive_valid": archive_valid,
        "baseline_created": baseline_created,
        "sha256": actual,
        "members": member_count,
        "size": path.stat().st_size,
        "message": (
            "Archive structure and SHA-256 checksum are valid."
            if valid and not baseline_created else
            "Archive is readable. A SHA-256 baseline was created for this legacy backup."
            if valid else
            "Verification failed. The archive or its checksum does not match."
        ),
    })


@app.post("/api/backups/<backup_id>/restore")
@mutation_required
def restore_backup(backup_id: str):
    payload = request.get_json(silent=True) or {}
    if payload.get("confirmation") != f"RESTORE {backup_id}":
        raise ValueError(f"Type RESTORE {backup_id} to continue.")
    row, path = archive_for(backup_id)
    if not row["checksum"] or checksum(path) != row["checksum"]:
        raise ValueError("Restore blocked because the archive checksum does not match.")
    target = RESTORE_DIR / f"{backup_id}-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    target.mkdir(mode=0o700)
    try:
        with tarfile.open(path, "r:gz") as bundle:
            members = validate_members(bundle)
            bundle.extractall(target, members=members)
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    event("warning", "backup_restored_to_staging", f"{backup_id}: {target}")
    return jsonify({
        "success": True,
        "path": str(target),
        "message": "Backup was safely restored to a staging directory.",
    })


@app.delete("/api/backups/<backup_id>")
@mutation_required
def delete_backup(backup_id: str):
    payload = request.get_json(silent=True) or {}
    if payload.get("confirmation") != f"DELETE {backup_id}":
        raise ValueError(f"Type DELETE {backup_id} to continue.")
    row, path = archive_for(backup_id)
    path.unlink()
    with database() as connection:
        connection.execute("DELETE FROM backups WHERE id=?", (backup_id,))
    event("warning", "backup_deleted", f"{backup_id}: {row['name']}")
    return jsonify({"success": True, "message": "Backup permanently deleted."})


@app.post("/api/backups/<backup_id>/retry")
@mutation_required
def retry_backup(backup_id: str):
    if not backup_id.replace("-", "").isalnum() or len(backup_id) > 80:
        raise ValueError("Invalid backup identifier.")
    with database() as connection:
        row = connection.execute("SELECT * FROM backups WHERE id=?", (backup_id,)).fetchone()
        schedule = (
            connection.execute("SELECT delivery,retention FROM schedules WHERE id=?", (row["schedule_id"],)).fetchone()
            if row and row["schedule_id"] else None
        )
    if not row or row["status"] != "failed":
        raise ValueError("Only a failed backup can be retried.")
    new_id = time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-" + uuid.uuid4().hex[:10]
    with database() as connection:
        connection.execute(
            """INSERT INTO backups(id,name,status,created_at,sources,excludes,schedule_id)
               VALUES(?,?, 'running', ?, ?, ?, ?)""",
            (new_id, row["name"], int(time.time()), row["sources"], row["excludes"], row["schedule_id"]),
        )
    executor.submit(
        backup_worker, new_id, json.loads(row["sources"]), json.loads(row["excludes"]),
        row["schedule_id"], schedule["delivery"] if schedule else "none",
        schedule["retention"] if schedule else 0,
    )
    event("info", "backup_retried", f"{backup_id}: {new_id}")
    return jsonify({"success": True, "id": new_id}), 202


@app.get("/api/events")
@login_required
def events():
    with database() as connection:
        rows = connection.execute(
            "SELECT * FROM events ORDER BY id DESC LIMIT 200"
        ).fetchall()
    return jsonify({"success": True, "events": [dict(row) for row in rows]})


@app.get("/api/settings")
@login_required
def settings():
    values = get_settings()
    return jsonify({
        "success": True,
        "settings": {
            "telegram_configured": bool(values.get("telegram_token") and values.get("telegram_chat_id")),
            "telegram_chat_id": values.get("telegram_chat_id", ""),
            "telegram_api_id": values.get("telegram_api_id", ""),
            "telegram_mtproto_configured": bool(
                values.get("telegram_api_id")
                and values.get("telegram_api_hash")
                and pyrogram_available()
            ),
            "pyrogram_available": pyrogram_available(),
            "telegram_api_base": values.get("telegram_api_base", "https://api.telegram.org"),
            "panel_url": values.get("panel_url", ""),
            "sftp_configured": bool(values.get("sftp_host") and values.get("sftp_username") and values.get("sftp_password")),
            "sftp_host": values.get("sftp_host", ""),
            "sftp_port": values.get("sftp_port", "22"),
            "sftp_username": values.get("sftp_username", ""),
            "sftp_directory": values.get("sftp_directory", "/var/backups/wevps"),
            "email_configured": bool(values.get("smtp_host") and values.get("smtp_from") and values.get("smtp_to")),
            "smtp_host": values.get("smtp_host", ""),
            "smtp_port": values.get("smtp_port", "587"),
            "smtp_security": values.get("smtp_security", "starttls"),
            "smtp_username": values.get("smtp_username", ""),
            "smtp_from": values.get("smtp_from", ""),
            "smtp_to": values.get("smtp_to", ""),
            "smtp_max_attachment_mb": values.get("smtp_max_attachment_mb", "25"),
            "s3_configured": bool(values.get("s3_bucket") and values.get("s3_access_key") and values.get("s3_secret_key")),
            "s3_endpoint": values.get("s3_endpoint", ""),
            "s3_region": values.get("s3_region", ""),
            "s3_bucket": values.get("s3_bucket", ""),
            "s3_prefix": values.get("s3_prefix", "wevps-backups"),
            "s3_access_key": values.get("s3_access_key", ""),
        },
    })


@app.post("/api/settings")
@mutation_required
def save_settings():
    payload = request.get_json(silent=True) or {}
    token = str(payload.get("telegram_token") or "").strip()
    chat_id = str(payload.get("telegram_chat_id") or "").strip()
    api_id = str(payload.get("telegram_api_id") or "").strip()
    api_hash = str(payload.get("telegram_api_hash") or "").strip()
    api_base = str(payload.get("telegram_api_base") or "https://api.telegram.org").strip().rstrip("/")
    sftp_host = str(payload.get("sftp_host") or "").strip()
    sftp_port = str(payload.get("sftp_port") or "22").strip()
    sftp_username = str(payload.get("sftp_username") or "").strip()
    sftp_password = str(payload.get("sftp_password") or "")
    sftp_directory = str(payload.get("sftp_directory") or "/var/backups/wevps").strip()
    smtp_host = str(payload.get("smtp_host") or "").strip()
    smtp_port = str(payload.get("smtp_port") or "587").strip()
    smtp_security = str(payload.get("smtp_security") or "starttls").strip()
    smtp_username = str(payload.get("smtp_username") or "").strip()
    smtp_password = str(payload.get("smtp_password") or "")
    smtp_from = str(payload.get("smtp_from") or "").strip()
    smtp_to = str(payload.get("smtp_to") or "").strip()
    smtp_limit = str(payload.get("smtp_max_attachment_mb") or "25").strip()
    s3_endpoint = str(payload.get("s3_endpoint") or "").strip().rstrip("/")
    s3_region = str(payload.get("s3_region") or "").strip()
    s3_bucket = str(payload.get("s3_bucket") or "").strip()
    s3_prefix = str(payload.get("s3_prefix") or "wevps-backups").strip("/")
    s3_access_key = str(payload.get("s3_access_key") or "").strip()
    s3_secret_key = str(payload.get("s3_secret_key") or "")
    if token and (":" not in token or len(token) > 200):
        raise ValueError("Enter a valid Telegram bot token.")
    if chat_id and (len(chat_id) > 100 or any(ch.isspace() for ch in chat_id)):
        raise ValueError("Enter a valid Telegram chat ID.")
    if api_id and (not api_id.isdigit() or len(api_id) > 12):
        raise ValueError("Enter a valid Telegram API ID.")
    if api_hash and (len(api_hash) < 20 or len(api_hash) > 100):
        raise ValueError("Enter a valid Telegram API Hash.")
    parsed = urlparse(api_base)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Invalid Telegram Bot API URL.")
    if parsed.hostname not in {"api.telegram.org", "127.0.0.1", "localhost", "::1"}:
        raise ValueError("Bot API endpoint must be Telegram or a local server.")
    if parsed.scheme == "http" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Plain HTTP is allowed only for a local Bot API server.")
    if sftp_host and (len(sftp_host) > 253 or any(ch.isspace() for ch in sftp_host)):
        raise ValueError("Invalid SFTP host.")
    if not sftp_port.isdigit() or not 1 <= int(sftp_port) <= 65535:
        raise ValueError("Invalid SFTP port.")
    if sftp_directory and (not sftp_directory.startswith("/") or ".." in PurePosixPath(sftp_directory).parts):
        raise ValueError("SFTP directory must be an absolute safe path.")
    if smtp_host and (len(smtp_host) > 253 or any(ch.isspace() for ch in smtp_host)):
        raise ValueError("Invalid SMTP host.")
    if not smtp_port.isdigit() or not 1 <= int(smtp_port) <= 65535:
        raise ValueError("Invalid SMTP port.")
    if smtp_security not in {"starttls", "ssl", "none"}:
        raise ValueError("Invalid SMTP security mode.")
    if smtp_security == "none" and smtp_host not in {"", "localhost", "127.0.0.1", "::1"}:
        raise ValueError("Unencrypted SMTP is allowed only for a local relay.")
    if not smtp_limit.isdigit() or not 1 <= int(smtp_limit) <= 100:
        raise ValueError("Email attachment limit must be between 1 and 100 MB.")
    email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    if smtp_from and not email_pattern.match(smtp_from):
        raise ValueError("Invalid sender email address.")
    if smtp_to and not email_pattern.match(smtp_to):
        raise ValueError("Invalid recipient email address.")
    if s3_endpoint:
        s3_url = urlparse(s3_endpoint)
        if s3_url.scheme != "https" or not s3_url.hostname or s3_url.username or s3_url.password:
            raise ValueError("S3 endpoint must be a valid HTTPS URL.")
    if s3_bucket and not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", s3_bucket):
        raise ValueError("Invalid S3 bucket name.")
    updates = {
        "telegram_chat_id": chat_id, "telegram_api_base": api_base,
        "telegram_api_id": api_id,
        "panel_url": current_panel_url(),
        "sftp_host": sftp_host, "sftp_port": sftp_port,
        "sftp_username": sftp_username, "sftp_directory": sftp_directory,
        "smtp_host": smtp_host, "smtp_port": smtp_port,
        "smtp_security": smtp_security, "smtp_username": smtp_username,
        "smtp_from": smtp_from, "smtp_to": smtp_to,
        "smtp_max_attachment_mb": smtp_limit,
        "s3_endpoint": s3_endpoint, "s3_region": s3_region,
        "s3_bucket": s3_bucket, "s3_prefix": s3_prefix,
        "s3_access_key": s3_access_key,
    }
    if token:
        updates["telegram_token"] = encrypt_setting(token)
    if api_hash:
        updates["telegram_api_hash"] = encrypt_setting(api_hash)
    if sftp_password:
        updates["sftp_password"] = encrypt_setting(sftp_password)
    if smtp_password:
        updates["smtp_password"] = encrypt_setting(smtp_password)
    if s3_secret_key:
        updates["s3_secret_key"] = encrypt_setting(s3_secret_key)
    with database() as connection:
        for key, value in updates.items():
            connection.execute(
                """INSERT INTO settings(key,value) VALUES(?,?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value""",
                (key, value),
            )
    event("warning", "settings_updated", "Backup destination settings changed.")
    return jsonify({"success": True, "message": "Settings saved securely."})


@app.post("/api/telegram/test")
@mutation_required
def telegram_test():
    values = get_settings()
    if not values.get("telegram_token") or not values.get("telegram_chat_id"):
        raise ValueError("Enter and save the Telegram bot token and chat ID first.")
    text = "Apira VPS Backup Center connected successfully via Telegram."
    if values.get("telegram_api_id") and values.get("telegram_api_hash") and pyrogram_available():
        pyrogram_bot(text)
    else:
        curl_bot("sendMessage", {"text": text})
    event("success", "telegram_test", "Test message delivered.")
    return jsonify({"success": True, "message": "Telegram test message sent."})


@app.post("/api/destinations/<kind>/test")
@mutation_required
def destination_test(kind: str):
    values = get_settings()
    if kind == "sftp":
        if not all(values.get(key) for key in ("sftp_host", "sftp_username", "sftp_password")):
            raise ValueError("Enter and save the SFTP host, username and password first.")
        client = sftp_client()
        try:
            client.open_sftp().close()
        finally:
            client.close()
    elif kind == "email":
        if not all(values.get(key) for key in ("smtp_host", "smtp_from", "smtp_to")):
            raise ValueError("Enter and save the SMTP host, sender and recipient first.")
        connection = smtp_connection(values)
        try:
            connection.noop()
        finally:
            connection.quit()
    elif kind == "s3":
        bucket = values.get("s3_bucket", "")
        if not all(values.get(key) for key in ("s3_bucket", "s3_access_key", "s3_secret_key")):
            raise ValueError("Enter and save the S3 bucket, access key and secret key first.")
        s3_client().head_bucket(Bucket=bucket)
    else:
        raise LookupError("Destination was not found.")
    event("success", "destination_test", kind)
    return jsonify({"success": True, "message": f"{kind.upper()} connection succeeded."})


@app.delete("/api/destinations/<kind>")
@mutation_required
def disconnect_destination(kind: str):
    keys = {
        "telegram": {"telegram_token", "telegram_chat_id", "telegram_api_id", "telegram_api_hash", "telegram_api_base"},
        "sftp": {"sftp_host", "sftp_port", "sftp_username", "sftp_password", "sftp_directory"},
        "email": {"smtp_host", "smtp_port", "smtp_security", "smtp_username", "smtp_password", "smtp_from", "smtp_to", "smtp_max_attachment_mb"},
        "s3": {"s3_endpoint", "s3_region", "s3_bucket", "s3_prefix", "s3_access_key", "s3_secret_key"},
    }
    if kind not in keys:
        raise LookupError("Destination was not found.")
    payload = request.get_json(silent=True) or {}
    if payload.get("confirmation") != f"DISCONNECT {kind}":
        raise ValueError(f"Type DISCONNECT {kind} to continue.")
    with database() as connection:
        connection.executemany("DELETE FROM settings WHERE key=?", [(key,) for key in keys[kind]])
        needle = "telegram_" if kind == "telegram" else kind
        disabled = connection.execute(
            "UPDATE schedules SET enabled=0 WHERE delivery LIKE ?",
            (f"%{needle}%",),
        ).rowcount
    event("warning", "destination_disconnected", kind)
    return jsonify({
        "success": True,
        "message": f"{kind.upper()} destination disconnected. {disabled} dependent job(s) were paused.",
    })


@app.get("/api/schedules")
@login_required
def schedules():
    with database() as connection:
        rows = connection.execute("SELECT * FROM schedules ORDER BY name").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["sources"] = json.loads(item["sources"])
        item["excludes"] = json.loads(item["excludes"])
        result.append(item)
    return jsonify({"success": True, "schedules": result})


@app.post("/api/schedules")
@mutation_required
def create_schedule():
    payload = request.get_json(silent=True) or {}
    name = safe_name(payload.get("name"))
    sources = safe_sources(payload.get("sources"))
    excludes = safe_excludes(payload.get("excludes"))
    interval = int(payload.get("interval_hours", 24))
    retention = int(payload.get("retention", 7))
    delivery = str(payload.get("delivery", "none"))
    if interval not in {1, 3, 6, 12, 24, 48, 168, 720}:
        raise ValueError("Unsupported schedule interval.")
    if not 1 <= retention <= 365:
        raise ValueError("Retention must be between 1 and 365 backups.")
    targets = delivery_targets(delivery)
    configured = get_settings()
    if any(target.startswith("telegram_") for target in targets):
        if not configured.get("telegram_token") or not configured.get("telegram_chat_id"):
            raise ValueError("Configure Telegram before selecting it.")
    if "telegram_link" in targets:
        configured["panel_url"] = current_panel_url()
    if "sftp" in targets and not all(configured.get(key) for key in ("sftp_host", "sftp_username", "sftp_password")):
        raise ValueError("Configure SFTP before selecting it.")
    if "email" in targets and not all(configured.get(key) for key in ("smtp_host", "smtp_from", "smtp_to")):
        raise ValueError("Configure SMTP before selecting it.")
    if "s3" in targets and not all(configured.get(key) for key in ("s3_bucket", "s3_access_key", "s3_secret_key")):
        raise ValueError("Configure S3 before selecting it.")
    schedule_id = uuid.uuid4().hex[:16]
    first_run = int(payload.get("first_run") or time.time() + 60)
    if first_run < time.time() - 60 or first_run > time.time() + 366 * 86400:
        raise ValueError("Invalid first run time.")
    with database() as connection:
        connection.execute(
            """INSERT INTO settings(key,value) VALUES('panel_url',?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value""",
            (current_panel_url(),),
        )
        connection.execute(
            """INSERT INTO schedules(id,name,sources,excludes,interval_hours,retention,
               delivery,enabled,next_run) VALUES(?,?,?,?,?,?,?,1,?)""",
            (schedule_id, name, json.dumps(sources), json.dumps(excludes),
             interval, retention, delivery, first_run),
        )
    event("info", "schedule_created", f"{schedule_id}: {name}")
    return jsonify({"success": True, "id": schedule_id})


@app.post("/api/schedules/<schedule_id>/toggle")
@mutation_required
def toggle_schedule(schedule_id: str):
    with database() as connection:
        row = connection.execute("SELECT enabled FROM schedules WHERE id=?", (schedule_id,)).fetchone()
        if not row:
            raise LookupError("Schedule was not found.")
        enabled = 0 if row["enabled"] else 1
        connection.execute("UPDATE schedules SET enabled=? WHERE id=?", (enabled, schedule_id))
    event("info", "schedule_toggled", f"{schedule_id}: {enabled}")
    return jsonify({"success": True, "enabled": bool(enabled)})


@app.post("/api/schedules/<schedule_id>/run")
@mutation_required
def run_schedule(schedule_id: str):
    with database() as connection:
        row = connection.execute("SELECT * FROM schedules WHERE id=?", (schedule_id,)).fetchone()
        if not row:
            raise LookupError("Schedule was not found.")
        running = connection.execute(
            "SELECT 1 FROM backups WHERE schedule_id=? AND status='running' LIMIT 1",
            (schedule_id,),
        ).fetchone()
        if running:
            raise ValueError("This backup job is already running.")
        backup_id = time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-" + uuid.uuid4().hex[:10]
        connection.execute(
            """INSERT INTO backups(id,name,status,created_at,sources,excludes,schedule_id)
               VALUES(?,?, 'running', ?, ?, ?, ?)""",
            (backup_id, row["name"], int(time.time()), row["sources"], row["excludes"], schedule_id),
        )
    executor.submit(
        backup_worker, backup_id, json.loads(row["sources"]), json.loads(row["excludes"]),
        schedule_id, row["delivery"], row["retention"],
    )
    event("info", "manual_schedule_run", f"{schedule_id}: {backup_id}")
    return jsonify({"success": True, "backup_id": backup_id}), 202


@app.get("/download/<backup_id>")
def authenticated_download(backup_id: str):
    if session.get("authenticated") is not True:
        next_path = f"{request.script_root}/download/{backup_id}"
        return redirect(f"/login?next={quote(next_path, safe='/')}")
    row, path = archive_for(backup_id)
    event("info", "authenticated_download", backup_id)
    return send_file(
        path, as_attachment=True,
        download_name=f"{row['name'].replace(' ', '_')}-{backup_id}.tar.gz",
        mimetype="application/gzip", conditional=True,
    )


@app.delete("/api/schedules/<schedule_id>")
@mutation_required
def delete_schedule(schedule_id: str):
    payload = request.get_json(silent=True) or {}
    if payload.get("confirmation") != f"DELETE {schedule_id}":
        raise ValueError(f"Type DELETE {schedule_id} to continue.")
    with database() as connection:
        connection.execute("DELETE FROM schedules WHERE id=?", (schedule_id,))
    event("warning", "schedule_deleted", schedule_id)
    return jsonify({"success": True})




@app.errorhandler(ValueError)
def bad_request(error):
    return jsonify({"success": False, "error": "invalid_request", "message": str(error)}), 400


@app.errorhandler(LookupError)
def not_found(error):
    return jsonify({"success": False, "error": "not_found", "message": str(error)}), 404


@app.errorhandler(Exception)
def internal_error(error):
    if isinstance(error, HTTPException):
        return jsonify({
            "success": False, "error": error.name.lower().replace(" ", "_"),
            "message": error.description,
        }), error.code
    try:
        event("error", "api_error", f"{request.method} {request.path}: {error}")
    except Exception:
        pass
    app.logger.exception("Backup Center request failed")
    return jsonify({
        "success": False, "error": "internal_error",
        "message": "Backup Center could not complete the request. Check the service log.",
    }), 500


@app.after_request
def security_headers(response):
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "script-src 'self' https://unpkg.com; connect-src 'self'; "
        "img-src 'self' data:; frame-ancestors 'none'",
    )
    return response
