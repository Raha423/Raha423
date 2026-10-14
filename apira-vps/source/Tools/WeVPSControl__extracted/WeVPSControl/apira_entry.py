from __future__ import annotations
import vmtool
from apira_auth import verify


def _local_auth(user: str, secret: str) -> dict:
    if verify(user, secret):
        return {'status': 'success', 'ok': True, 'success': True, 'provider': 'apira-local'}
    return {'status': 'invalid_credentials', 'ok': False, 'success': False, 'provider': 'apira-local'}


# Keep the original binary and routes, but replace all remote authentication hooks.
vmtool.authenticate_against_backend = _local_auth
vmtool.authenticate_with_backend = _local_auth
vmtool.get_backend_api_url = lambda: 'local://apira-vps'
vmtool.get_backend_url = lambda: 'local://apira-vps'
vmtool.EXTENSIONS_MANIFEST_URL = 'https://raw.githubusercontent.com/Raha423/Raha423/main/apira-vps/Extensions'

app = vmtool.app
