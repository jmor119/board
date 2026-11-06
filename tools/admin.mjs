import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const auth = require('C:/Users/OEM/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Firebase CLI is not signed in.');
const tokens = await auth.getAccessToken(account.tokens.refresh_token, [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/firebase',
]);
const PROJECT = 'board-4500b';
async function request(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.status === 204 ? {} : await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(data).slice(0, 800)}`);
  return data;
}
const mode = process.argv[2];
if (mode === 'setup') {
  for (const service of [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'firebaserules.googleapis.com',
  ]) {
    await request(
      `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}:enable`,
      'POST',
      {},
    );
    console.log('Enabled', service);
  }
  const databases = await request(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases`,
  );
  if (!databases.databases?.length) {
    await request(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=(default)`,
      'POST',
      { type: 'FIRESTORE_NATIVE', locationId: 'australia-southeast1' },
    );
    console.log('Created Firestore in Sydney');
  }
} else if (mode === 'ui-setup') {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const { initializeApp } = await import('firebase/app');
  const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
  const config = JSON.parse(await readFile('src/firebase-config.json', 'utf8'));
  const app = initializeApp(config);
  const email = `board-ui-${randomUUID()}@example.invalid`;
  const password = randomUUID() + '!aA9';
  const { user } = await createUserWithEmailAndPassword(getAuth(app), email, password);
  await updateProfile(user, { displayName: 'Release QA' });
  await mkdir('.work', { recursive: true });
  await writeFile('.work/ui-fixture.json', JSON.stringify({ uid: user.uid, email, password }));
  console.log('Created disposable browser QA account; no email sent.');
  process.exit(0);
} else if (mode === 'ui-cleanup') {
  const { readFile, unlink } = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile('.work/ui-fixture.json', 'utf8'));
  if (!fixture.email.startsWith('board-ui-') || !fixture.email.endsWith('@example.invalid'))
    throw new Error('Refusing to clean up a non-QA identity.');
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  async function removeTree(name) {
    const collections = await request(
      `https://firestore.googleapis.com/v1/${name}:listCollectionIds`,
      'POST',
      {},
    );
    for (const collectionId of collections.collectionIds || []) {
      let pageToken;
      do {
        const page = await request(
          `https://firestore.googleapis.com/v1/${name}/${collectionId}?pageSize=100${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`,
        );
        for (const child of page.documents || []) await removeTree(child.name);
        pageToken = page.nextPageToken;
      } while (pageToken);
    }
    await request(`https://firestore.googleapis.com/v1/${name}`, 'DELETE');
  }
  let deleted = 0;
  for (const collectionId of ['boards', 'teams', 'templates']) {
    const rows = await request(`${base}:runQuery`, 'POST', {
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ownerId' },
            op: 'EQUAL',
            value: { stringValue: fixture.uid },
          },
        },
      },
    });
    for (const row of rows)
      if (row.document) {
        await removeTree(row.document.name);
        deleted++;
      }
  }
  await request(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
    'POST',
    { localId: fixture.uid },
  );
  await unlink('.work/ui-fixture.json');
  console.log(`Removed ${deleted} disposable QA records and the browser QA account.`);
} else if (mode === 'auth') {
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}`;
  const config = await request(`${base}/config`);
  console.log('Auth configuration present', !!config.name);
  await request(
    `${base}/config?updateMask=signIn.email,signIn.anonymous,authorizedDomains`,
    'PATCH',
    {
      signIn: { email: { enabled: true, passwordRequired: true }, anonymous: { enabled: true } },
      authorizedDomains: [
        'localhost',
        '127.0.0.1',
        `${PROJECT}.web.app`,
        `${PROJECT}.firebaseapp.com`,
      ],
    },
  );
  console.log('Enabled email and anonymous sign-in');
  const providers = await request(`${base}/defaultSupportedIdpConfigs`);
  console.log(
    'Providers',
    providers.defaultSupportedIdpConfigs?.map((p) => ({ name: p.name, enabled: p.enabled })) || [],
  );
}
