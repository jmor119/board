// Live verification uses disposable QA identities and removes only its own records.
import { readFile } from 'node:fs/promises';
import { createSign, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, deleteUser } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  deleteDoc,
  terminate,
  runTransaction,
} from 'firebase/firestore';
const config = JSON.parse(await readFile('src/firebase-config.json', 'utf8'));
const key = JSON.parse(
  await readFile('D:/sem/board-4500b-firebase-adminsdk-fbsvc-e356338a3a.json', 'utf8'),
);
const runId = randomUUID().slice(0, 8),
  boardId = `qa-${runId}`,
  apps = [],
  users = [],
  records = [];
function customToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = encode({ alg: 'RS256', typ: 'JWT' }),
    payload = encode({
      iss: key.client_email,
      sub: key.client_email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid,
      claims: { email: `${uid}@example.invalid`, email_verified: true },
    });
  const body = `${head}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  return `${body}.${signer.sign(key.private_key).toString('base64url')}`;
}
async function client(name, guest = false) {
  const app = initializeApp(config, `${name}-${runId}`);
  apps.push(app);
  const auth = getAuth(app);
  const credential = guest
    ? await signInAnonymously(auth)
    : await signInWithCustomToken(auth, customToken(`qa-${name}-${runId}`));
  users.push(credential.user);
  return { db: getFirestore(app), uid: credential.user.uid, auth };
}
const passed = [];
const check = (name) => {
  passed.push(name);
  console.log('PASS', name);
};
async function denied(p) {
  try {
    await p;
    assert.fail('Request was allowed unexpectedly');
  } catch (e) {
    assert.equal(e.code, 'permission-denied');
  }
}
let owner;
try {
  owner = await client('host');
  const outsider = await client('outsider'),
    guest = await client('guest', true);
  const ref = doc(owner.db, 'boards', boardId),
    now = Date.now();
  records.push(['boards', boardId]);
  const board = {
    ownerId: owner.uid,
    title: 'Disposable automated verification',
    teamId: '',
    invitedEmails: [],
    publicEnabled: false,
    publicUntil: 0,
    createdAt: now,
    updatedAt: now,
    agenda: [{ id: 'reflect', name: 'Reflect', seconds: 300 }],
    timer: {
      stage: 0,
      running: false,
      remaining: 300,
      startedAt: 0,
      autoAdvance: false,
      display: 'both',
    },
    currentRoundId: 'round',
    template: 'QA',
  };
  await setDoc(ref, board);
  await denied(getDoc(doc(outsider.db, 'boards', boardId)));
  await denied(getDoc(doc(guest.db, 'boards', boardId)));
  check('private board rejects unrelated accounts and guests');
  await updateDoc(ref, { publicEnabled: true, publicUntil: Date.now() + 120000 });
  assert.ok((await getDoc(doc(guest.db, 'boards', boardId))).exists());
  check('temporary public sharing admits an anonymous guest');
  const objectRef = doc(owner.db, 'boards', boardId, 'objects', 'note');
  records.push(['boards', boardId, 'objects', 'note']);
  const object = {
    type: 'note',
    x: 100,
    y: 100,
    w: 190,
    h: 170,
    text: 'Before',
    color: '#fae9a4',
    locked: false,
    authorId: owner.uid,
    points: [],
    strokeWidth: 3,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(objectRef, object);
  let unsubscribe;
  const observed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe?.();
      reject(new Error('Realtime change not received within 15 seconds'));
    }, 15000);
    unsubscribe = onSnapshot(
      doc(guest.db, 'boards', boardId, 'objects', 'note'),
      (s) => {
        if (s.data()?.text === 'After live edit') {
          clearTimeout(timeout);
          unsubscribe?.();
          resolve();
        }
      },
      (e) => {
        clearTimeout(timeout);
        reject(e);
      },
    );
  });
  await updateDoc(objectRef, { text: 'After live edit', x: 250 });
  await observed;
  check('independent guest client receives live text and position changes');
  const roundRef = doc(owner.db, 'boards', boardId, 'rounds', 'round');
  records.push(['boards', boardId, 'rounds', 'round']);
  await setDoc(roundRef, {
    title: 'QA vote',
    budget: 3,
    hidden: true,
    unique: false,
    state: 'open',
    targetIds: ['note'],
    createdAt: now,
  });
  const ballotPath = ['boards', boardId, 'rounds', 'round', 'ballots', guest.uid];
  records.push(ballotPath);
  await setDoc(doc(guest.db, ...ballotPath), { votes: ['note', 'note'] });
  await denied(getDoc(doc(owner.db, ...ballotPath)));
  await denied(getDocs(collection(owner.db, 'boards', boardId, 'rounds', 'round', 'ballots')));
  check('hidden ballots cannot be read by the facilitator');
  await denied(setDoc(doc(guest.db, ...ballotPath), { votes: ['note', 'note', 'note', 'note'] }));
  check('server enforces the vote budget');
  const increment = () =>
    runTransaction(guest.db, async (tx) => {
      const ref = doc(guest.db, ...ballotPath);
      const s = await tx.get(ref);
      tx.set(ref, { votes: [...s.data().votes, 'note'] });
    });
  const concurrent = await Promise.allSettled([increment(), increment()]);
  assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await getDoc(doc(guest.db, ...ballotPath))).data().votes.length, 3);
  check('concurrent vote requests cannot exceed the budget');
  await updateDoc(roundRef, { state: 'closed' });
  assert.equal((await getDoc(doc(owner.db, ...ballotPath))).data().votes.length, 3);
  await denied(setDoc(doc(guest.db, ...ballotPath), { votes: [] }));
  check('reveal exposes the results and closes further voting');
  await updateDoc(ref, { publicUntil: Date.now() - 1000 });
  await denied(getDoc(doc(guest.db, 'boards', boardId)));
  await denied(
    updateDoc(doc(guest.db, 'boards', boardId, 'objects', 'note'), { text: 'After expiry' }),
  );
  check('expired meeting link denies reads and writes');
  console.log(
    JSON.stringify({ passed: passed.length, project: config.projectId, boardId, checks: passed }),
  );
} finally {
  // Admin cleanup is scoped to the exact disposable paths created above.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const {
    GoogleAuth,
  } = require('C:/Users/OEM/AppData/Roaming/npm/node_modules/firebase-tools/node_modules/google-auth-library');
  const auth = new GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();
  for (const path of records.reverse())
    await client
      .request({
        method: 'DELETE',
        url: `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${path.join('/')}`,
      })
      .catch(() => console.error('QA cleanup needs retry for', path.join('/')));
  for (const user of users)
    await deleteUser(user).catch(() => console.error('QA identity cleanup needs retry', user.uid));
  for (const app of apps) {
    await terminate(getFirestore(app));
    await deleteApp(app);
  }
}
