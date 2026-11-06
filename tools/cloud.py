"""Firebase administration. Credentials stay outside the checkout and stdout."""
import json, sys, time
from pathlib import Path
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

PROJECT = 'board-4500b'
KEY = Path('D:/sem/board-4500b-firebase-adminsdk-fbsvc-e356338a3a.json')

def session():
    credentials = service_account.Credentials.from_service_account_file(str(KEY), scopes=['https://www.googleapis.com/auth/cloud-platform'])
    return AuthorizedSession(credentials)

def inspect():
    s = session()
    endpoints = {
        'project': f'https://firebase.googleapis.com/v1beta1/projects/{PROJECT}',
        'apps': f'https://firebase.googleapis.com/v1beta1/projects/{PROJECT}/webApps',
        'databases': f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases',
        'auth': f'https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config',
        'google_provider': f'https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/defaultSupportedIdpConfigs/google.com',
        'billing': f'https://cloudbilling.googleapis.com/v1/projects/{PROJECT}/billingInfo',
        'hosting': f'https://firebasehosting.googleapis.com/v1beta1/projects/{PROJECT}/sites',
    }
    for name, url in endpoints.items():
        r = s.get(url, timeout=30)
        data = r.json()
        if name == 'auth' and r.ok:
            data = {'name':data.get('name'),'authorizedDomains':data.get('authorizedDomains'),'signIn':{k:data.get('signIn',{}).get(k) for k in ['email','anonymous']}}
        if name == 'google_provider' and r.ok:
            data = {k: data.get(k) for k in ['name', 'enabled', 'clientId']}
        print(name, r.status_code, json.dumps(data))

def result(r):
    if not r.ok:
        raise RuntimeError(f'{r.status_code}: {r.text[:1500]}')
    return r.json() if r.content else {}

def wait_operation(s, data, base):
    for _ in range(40):
        if data.get('done'):
            if data.get('error'):
                raise RuntimeError(str(data['error']))
            return data.get('response', {})
        time.sleep(2)
        data = result(s.get(f"{base}/{data['name']}", timeout=30))
    raise RuntimeError('Operation did not finish in 80 seconds')

def setup():
    s = session()
    for service in ['firestore.googleapis.com','identitytoolkit.googleapis.com','firebaserules.googleapis.com']:
        r = s.post(f'https://serviceusage.googleapis.com/v1/projects/{PROJECT}/services/{service}:enable', json={}, timeout=40)
        print('enable', service, r.status_code, flush=True)
        if not r.ok: print(r.text[:1000], flush=True)
    apps = result(s.get(f'https://firebase.googleapis.com/v1beta1/projects/{PROJECT}/webApps', timeout=30)).get('apps', [])
    if not apps:
        op = result(s.post(f'https://firebase.googleapis.com/v1beta1/projects/{PROJECT}/webApps', json={'displayName':'Board web'}, timeout=30))
        app = wait_operation(s, op, 'https://firebase.googleapis.com/v1beta1')
    else: app = apps[0]
    config = result(s.get(f"https://firebase.googleapis.com/v1beta1/{app['name']}/config", timeout=30))
    Path('src').mkdir(exist_ok=True)
    Path('src/firebase-config.json').write_text(json.dumps({k:v for k,v in config.items() if k in ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId']}, indent=2))
    print('Web configuration written (public SDK config only)', flush=True)
    r = s.get(f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases', timeout=30)
    if r.ok and not r.json().get('databases'):
        r = s.post(f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases?databaseId=(default)', json={'type':'FIRESTORE_NATIVE','locationId':'australia-southeast1'}, timeout=40)
        print('create database', r.status_code, flush=True)
        if not r.ok: print(r.text[:1000])
    r = s.get(f'https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config', timeout=30)
    if r.status_code == 404:
        r = s.post(f'https://identitytoolkit.googleapis.com/v2/projects/{PROJECT}/identityPlatform:initializeAuth', json={}, timeout=40)
        print('initialize auth', r.status_code, r.text[:700], flush=True)
    r = s.patch(f'https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config?updateMask=signIn.email,signIn.anonymous,authorizedDomains',json={'signIn':{'email':{'enabled':True,'passwordRequired':True},'anonymous':{'enabled':True}},'authorizedDomains':['localhost','127.0.0.1',f'{PROJECT}.web.app',f'{PROJECT}.firebaseapp.com']},timeout=30)
    print('configure auth', r.status_code, flush=True)
    if not r.ok: print(r.text[:1000])

if __name__ == '__main__':
    {'inspect':inspect,'setup':setup}[sys.argv[1] if len(sys.argv)>1 else 'inspect']()
