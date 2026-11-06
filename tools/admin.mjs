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
if (mode === 'mail-permissions' || mode === 'mcp-permissions') {
  const fn = await request(
    'https://cloudfunctions.googleapis.com/v2/projects/chronological-9f536/locations/australia-southeast1/functions/sendQueuedMail',
  );
  const serviceAccount = fn.serviceConfig.serviceAccountEmail;
  if (!serviceAccount) throw new Error('Mail runtime account not found');
  const mcp = mode === 'mcp-permissions';
  const roleId = mcp ? 'boardMcpData' : 'boardAccountMail';
  const roleName = `projects/${PROJECT}/roles/${roleId}`;
  const roles = await request(`https://iam.googleapis.com/v1/projects/${PROJECT}/roles`);
  if (!roles.roles?.some((r) => r.name === roleName))
    await request(`https://iam.googleapis.com/v1/projects/${PROJECT}/roles`, 'POST', {
      roleId,
      role: {
        title: mcp ? 'Board MCP data access' : 'Board account mail',
        description: mcp
          ? 'Read and edit Board data through authenticated MCP tools with per-board membership checks.'
          : 'Read Board accounts and generate account email links for the shared FierceSpeed mail queue.',
        includedPermissions: mcp
          ? [
              'datastore.databases.get',
              'datastore.entities.get',
              'datastore.entities.list',
              'datastore.entities.create',
              'datastore.entities.update',
              'datastore.entities.delete',
            ]
          : ['firebaseauth.users.get', 'firebaseauth.users.sendEmail'],
        stage: 'GA',
      },
    });
  const base = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`;
  const policy = await request(`${base}:getIamPolicy`, 'POST', {});
  const member = `serviceAccount:${serviceAccount}`;
  let binding = policy.bindings.find((b) => b.role === roleName);
  if (!binding) {
    binding = { role: roleName, members: [] };
    policy.bindings.push(binding);
  }
  if (!binding.members.includes(member)) {
    binding.members.push(member);
    await request(`${base}:setIamPolicy`, 'POST', { policy });
  }
  console.log(
    mcp
      ? 'Shared runtime has Board-only data access for MCP:'
      : 'Shared mail runtime can read Board accounts and generate action links:',
    serviceAccount,
  );
} else if (mode === 'domain-inspect' || mode === 'domain-connect') {
  const domain = 'board.fiercespeed.nz';
  const parent = `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT}/sites/${PROJECT}`;
  const list = await request(`${parent}/customDomains`);
  let entry = list.customDomains?.find((d) => d.name.endsWith('/' + domain));
  if (!entry && mode === 'domain-connect') {
    const operation = await request(`${parent}/customDomains?customDomainId=${domain}`, 'POST', {});
    console.log('Custom domain requested', operation.name);
  }
  if (entry) console.log('Hosting domain', JSON.stringify(entry));
  else console.log('Hosting domain not yet present');
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}`;
  const config = await request(`${base}/config`);
  if (mode === 'domain-connect' && !config.authorizedDomains.includes(domain)) {
    await request(`${base}/config?updateMask=authorizedDomains`, 'PATCH', {
      authorizedDomains: [...config.authorizedDomains, domain],
    });
    console.log('Authorized custom domain for sign-in');
  }
  console.log('Authorized domains', config.authorizedDomains);
  const provider = await request(`${base}/defaultSupportedIdpConfigs/google.com`);
  console.log('Google provider', { enabled: provider.enabled, clientId: provider.clientId });
} else if (mode === 'setup') {
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
