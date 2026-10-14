# Apira VPS Terminal

Terminal is an independent Flask application mounted by the main Apira VPS WSGI
application. It does not run on a second port and has no separate login page.

Routes on the single Apira VPS port:

- `/` — blank themed page
- `/login` — main Apira VPS login
- `/index` — main Apira VPS Control panel
- `/terminal/` — authenticated Terminal UI
- `/terminal/api/*` — Terminal-only API

The main and Terminal applications share the same Flask `.secret_key` and
session cookie. The user signs in once through `/login`; opening `/terminal/`
then validates the existing session automatically.

Run the main application exactly as before:

```bash
pip install -r Extensions/Terminal/requirements.txt
gunicorn --workers 2 --threads 50 --bind 0.0.0.0:789 vmtool:app
```

The extension is enabled by listing `Terminal` in the root `Extensions.txt`.
Future Terminal changes remain inside `Extensions/Terminal`; the main app loads
enabled extension applications dynamically.

Commands execute with the operating-system permissions of the main Apira VPS
service user.

The Terminal uses Flask-Sock, WebSocket, a real Linux PTY, and xterm.js. Each
connected shell occupies a Gunicorn thread, so threaded Gunicorn is required.

## Compile only the Terminal Python module (Linux)

Run this on the target Linux server from the project root:

```bash
chmod +x Extensions/Terminal/bin/build-linux.sh
Extensions/Terminal/bin/build-linux.sh
```

The generated `Extensions/Terminal/bin/app*.so` is preferred automatically by
the main extension loader. Build it with the same Python major/minor version
and CPU architecture used to run Apira VPS. After testing, `app.py` can be moved
to a private backup outside `Extensions/Terminal`; `index.html` must remain.
