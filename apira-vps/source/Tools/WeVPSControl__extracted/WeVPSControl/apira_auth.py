from __future__ import annotations
import argparse, base64, getpass, hashlib, hmac, json, os, secrets
from pathlib import Path

DEFAULT_FILE = Path(os.environ.get('APIRA_VPS_AUTH_FILE', '/etc/apira-vps/auth.json'))
N, R, P, DKLEN = 16384, 8, 1, 32


def _derive(secret: str, salt: bytes) -> bytes:
    return hashlib.scrypt(secret.encode('utf-8'), salt=salt, n=N, r=R, p=P, dklen=DKLEN)


def _read(path: Path = DEFAULT_FILE) -> dict:
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def verify(user: str, secret: str, path: Path = DEFAULT_FILE) -> bool:
    try:
        cfg = _read(path)
        if not hmac.compare_digest(str(user), str(cfg.get('username', ''))):
            return False
        salt = base64.b64decode(cfg['salt'], validate=True)
        expected = base64.b64decode(cfg['hash'], validate=True)
        actual = _derive(str(secret), salt)
        return hmac.compare_digest(actual, expected)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return False


def write_credentials(user: str, secret: str, path: Path = DEFAULT_FILE) -> None:
    salt = secrets.token_bytes(16)
    data = {
        'version': 1,
        'username': user,
        'kdf': 'scrypt',
        'n': N, 'r': R, 'p': P,
        'salt': base64.b64encode(salt).decode('ascii'),
        'hash': base64.b64encode(_derive(secret, salt)).decode('ascii'),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def init(path: Path, user: str) -> None:
    if path.exists():
        cfg = _read(path)
        print(f'Apira VPS local authentication already configured for: {cfg.get("username", user)}')
        return
    secret = secrets.token_urlsafe(18)
    write_credentials(user, secret, path)
    print('Apira VPS local authentication created.')
    print(f'Username: {user}')
    print(f'Password: {secret}')
    print('Save this password now; only its hash is stored on the server.')


def main() -> None:
    parser = argparse.ArgumentParser(description='Manage Apira VPS local administrator credentials.')
    parser.add_argument('--file', type=Path, default=DEFAULT_FILE)
    parser.add_argument('--username', default='admin')
    parser.add_argument('--init', action='store_true')
    parser.add_argument('--set-password', action='store_true')
    args = parser.parse_args()
    if args.init:
        init(args.file, args.username)
        return
    if args.set_password:
        first = getpass.getpass('New Apira VPS password: ')
        second = getpass.getpass('Repeat password: ')
        if len(first) < 10:
            raise SystemExit('Password must be at least 10 characters.')
        if first != second:
            raise SystemExit('Passwords do not match.')
        write_credentials(args.username, first, args.file)
        print('Apira VPS password updated.')
        return
    parser.error('choose --init or --set-password')


if __name__ == '__main__':
    main()
