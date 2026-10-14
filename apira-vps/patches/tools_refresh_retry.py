#!/usr/bin/env python3
from pathlib import Path
import sys

MARKER = 'APIRA_TOOLS_REFRESH_RETRY_V1'


def patch(path: Path) -> None:
    s = path.read_text(encoding='utf-8')
    if MARKER in s or 'refreshToolsUntilSettled' in s:
        return

    old_load = '''            async function loadTools({ silent = false } = {}) {\n                try {\n                    const data = await fetchJson(API.tools);\n                    state.tools = Array.isArray(data) ? data : (Array.isArray(data.tools) ? data.tools : []);\n                    renderTools();\n                } catch (error) {\n                    state.tools = [];\n                    renderTools();\n                    if (!silent) toast("Tools error", "Could not load tools from the API.", "error");\n                }\n            }\n'''
    new_load = '''            // APIRA_TOOLS_REFRESH_RETRY_V1\n            async function loadTools({ silent = false } = {}) {\n                try {\n                    const data = await fetchJson(API.tools);\n                    state.tools = Array.isArray(data) ? data : (Array.isArray(data.tools) ? data.tools : []);\n                    renderTools();\n                    return true;\n                } catch (error) {\n                    // Extension install/remove can restart Gunicorn for a few seconds.\n                    // Preserve the last known cards during that brief reconnect window.\n                    if (!silent) {\n                        state.tools = [];\n                        renderTools();\n                        toast("Tools error", "Could not load tools from the API.", "error");\n                    }\n                    return false;\n                }\n            }\n\n            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));\n\n            async function refreshToolsUntilSettled(name, action, attempts = 12) {\n                for (let attempt = 0; attempt < attempts; attempt += 1) {\n                    try {\n                        const data = await fetchJson(API.tools);\n                        const tools = Array.isArray(data) ? data : (Array.isArray(data.tools) ? data.tools : []);\n                        const tool = tools.find(item => String(item.name || "").toLowerCase() === String(name || "").toLowerCase());\n                        const settled = action === "remove" ? !tool?.installed : Boolean(tool?.installed);\n                        if (settled) {\n                            state.tools = tools;\n                            renderTools();\n                            return true;\n                        }\n                    } catch (_) {\n                        // Expected briefly while the service reloads extension mounts.\n                    }\n                    await sleep(Math.min(700 + attempt * 200, 1800));\n                }\n                return loadTools({ silent: true });\n            }\n'''
    if old_load not in s:
        raise SystemExit('loadTools anchor not found')
    s = s.replace(old_load, new_load, 1)

    old_success = '''                    toast("Extensions", data.message || `${name} ${action} completed`, "success");\n                    await loadTools({ silent: true });\n                } catch (error) {\n                    toast("Extension error", error.message || "Operation failed", "error");\n                    button.disabled = false;\n                    button.innerHTML = original;\n                    refreshIcons();\n                }\n'''
    new_success = '''                    toast("Extensions", data.message || `${name} ${action} completed`, "success");\n                    const refreshed = await refreshToolsUntilSettled(name, action);\n                    if (!refreshed) toast("Extensions", "The operation completed, but status refresh is still reconnecting. Tap refresh once.", "warning");\n                } catch (error) {\n                    const message = String(error?.message || "Operation failed");\n                    if (/already installed/i.test(message)) {\n                        toast("Extensions", `${name} is already installed. Refreshing status...`, "success");\n                        await refreshToolsUntilSettled(name, "install");\n                        return;\n                    }\n                    toast("Extension error", message, "error");\n                    button.disabled = false;\n                    button.innerHTML = original;\n                    refreshIcons();\n                }\n'''
    if old_success not in s:
        raise SystemExit('manageTool success/catch anchor not found')
    s = s.replace(old_success, new_success, 1)
    path.write_text(s, encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: tools_refresh_retry.py <control index.html>')
    patch(Path(sys.argv[1]))
