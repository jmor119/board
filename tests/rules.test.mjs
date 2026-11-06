import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

test(
  'Firestore access, templates, sharing and voting boundaries',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async (t) => {
    const env = await initializeTestEnvironment({
      projectId: 'demo-board',
      firestore: { rules: await readFile('firestore.rules', 'utf8') },
    });
    await env.clearFirestore();
    const host = env
      .authenticatedContext('host', {
        email: 'host@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const member = env
      .authenticatedContext('member', {
        email: 'member@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const outsider = env
      .authenticatedContext('outsider', {
        email: 'outsider@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const unverified = env
      .authenticatedContext('unverified', {
        email: 'member@example.com',
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    const guest = env
      .authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore();
    const guest2 = env
      .authenticatedContext('guest2', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore();
    const noAuth = env.unauthenticatedContext().firestore();
    const board = {
      ownerId: 'host',
      title: 'Test retro',
      teamId: '',
      invitedEmails: ['member@example.com'],
      publicEnabled: false,
      publicUntil: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agenda: [{ id: 'reflect', name: 'Reflect', seconds: 300 }],
      timer: {
        stage: 0,
        running: false,
        remaining: 300,
        startedAt: 0,
        autoAdvance: false,
        display: 'both',
      },
      currentRoundId: 'round1',
      template: 'Blank',
    };
    const obj = {
      type: 'note',
      x: 1,
      y: 1,
      w: 190,
      h: 170,
      text: 'Discuss this',
      color: '#fae9a4',
      locked: false,
      authorId: 'host',
      points: [],
      strokeWidth: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await assertSucceeds(setDoc(doc(host, 'boards', 'private'), board));
      await t.test('private boards require owner or verified invitation', async () => {
        await assertSucceeds(getDoc(doc(member, 'boards', 'private')));
        await assertFails(getDoc(doc(outsider, 'boards', 'private')));
        await assertFails(getDoc(doc(unverified, 'boards', 'private')));
        await assertFails(getDoc(doc(guest, 'boards', 'private')));
        await assertFails(getDoc(doc(noAuth, 'boards', 'private')));
        await assertFails(getDocs(collection(host, 'boards')));
        await assertSucceeds(
          getDocs(query(collection(host, 'boards'), where('ownerId', '==', 'host'))),
        );
        await assertSucceeds(
          getDocs(
            query(
              collection(member, 'boards'),
              where('invitedEmails', 'array-contains', 'member@example.com'),
            ),
          ),
        );
      });
      await t.test('participants cannot change sharing or impersonate an owner', async () => {
        await assertFails(
          updateDoc(doc(member, 'boards', 'private'), {
            publicEnabled: true,
            publicUntil: Date.now() + 60000,
          }),
        );
        await assertFails(updateDoc(doc(host, 'boards', 'private'), { ownerId: 'outsider' }));
        await assertFails(
          setDoc(doc(guest, 'boards', 'guest-owned'), { ...board, ownerId: 'guest' }),
        );
        await assertFails(
          updateDoc(doc(host, 'boards', 'private'), {
            publicEnabled: true,
            publicUntil: Date.now() + 90000000,
          }),
        );
      });
      await t.test('individual objects and locked layouts have enforced permissions', async () => {
        await assertSucceeds(setDoc(doc(host, 'boards', 'private', 'objects', 'note1'), obj));
        await assertSucceeds(
          updateDoc(doc(member, 'boards', 'private', 'objects', 'note1'), {
            text: 'An edited idea',
          }),
        );
        await assertSucceeds(
          updateDoc(doc(host, 'boards', 'private', 'objects', 'note1'), { locked: true }),
        );
        await assertFails(
          updateDoc(doc(member, 'boards', 'private', 'objects', 'note1'), { text: 'Bypass lock' }),
        );
        await assertFails(deleteDoc(doc(member, 'boards', 'private', 'objects', 'note1')));
        await assertFails(
          setDoc(doc(member, 'boards', 'private', 'objects', 'forged'), {
            ...obj,
            authorId: 'host',
          }),
        );
        await assertFails(
          setDoc(doc(member, 'boards', 'private', 'objects', 'huge'), {
            ...obj,
            authorId: 'member',
            text: 'x'.repeat(5001),
          }),
        );
        await assertSucceeds(
          updateDoc(doc(host, 'boards', 'private', 'objects', 'note1'), { locked: false }),
        );
        await assertSucceeds(deleteDoc(doc(member, 'boards', 'private', 'objects', 'note1')));
        await assertSucceeds(
          setDoc(doc(member, 'boards', 'private', 'objects', 'note1'), {
            ...obj,
            authorId: 'member',
          }),
        );
      });
      await t.test('public guests can collaborate only during the meeting window', async () => {
        await assertSucceeds(
          updateDoc(doc(host, 'boards', 'private'), {
            publicEnabled: true,
            publicUntil: Date.now() + 60000,
          }),
        );
        await assertSucceeds(getDoc(doc(guest, 'boards', 'private')));
        await assertSucceeds(
          setDoc(doc(guest, 'boards', 'private', 'objects', 'guest-note'), {
            ...obj,
            authorId: 'guest',
          }),
        );
        await assertFails(getDocs(collection(guest, 'boards')));
        await assertSucceeds(
          updateDoc(doc(host, 'boards', 'private'), { publicUntil: Date.now() - 1000 }),
        );
        await assertFails(getDoc(doc(guest, 'boards', 'private')));
        await assertFails(
          updateDoc(doc(guest, 'boards', 'private', 'objects', 'guest-note'), {
            text: 'After expiry',
          }),
        );
        await assertSucceeds(getDoc(doc(member, 'boards', 'private')));
        await assertSucceeds(
          updateDoc(doc(host, 'boards', 'private'), {
            publicEnabled: true,
            publicUntil: Date.now() + 60000,
          }),
        );
      });
      const round = {
        title: 'Vote',
        budget: 3,
        hidden: true,
        unique: false,
        state: 'open',
        targetIds: ['note1', 'guest-note'],
        createdAt: Date.now(),
      };
      await t.test('hidden ballots are private even from the host', async () => {
        await assertSucceeds(setDoc(doc(host, 'boards', 'private', 'rounds', 'round1'), round));
        await assertFails(setDoc(doc(member, 'boards', 'private', 'rounds', 'forged'), round));
        await assertSucceeds(
          setDoc(doc(guest, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest'), {
            votes: ['note1', 'note1'],
          }),
        );
        await assertSucceeds(
          getDoc(doc(guest, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest')),
        );
        await assertFails(
          getDoc(doc(host, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest')),
        );
        await assertFails(
          getDoc(doc(guest2, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest')),
        );
        await assertFails(
          getDocs(collection(member, 'boards', 'private', 'rounds', 'round1', 'ballots')),
        );
      });
      await t.test('budgets, ballot ownership and valid targets cannot be bypassed', async () => {
        const ref = doc(guest, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest');
        await assertFails(setDoc(ref, { votes: ['note1', 'note1', 'note1', 'note1'] }));
        await assertFails(setDoc(ref, { votes: ['unknown'] }));
        await assertFails(
          setDoc(doc(guest, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest2'), {
            votes: ['note1'],
          }),
        );
        await assertSucceeds(setDoc(ref, { votes: ['guest-note'] }));
        await assertFails(
          updateDoc(doc(host, 'boards', 'private', 'rounds', 'round1'), { hidden: false }),
        );
      });
      await t.test('ending the round reveals results and freezes ballots', async () => {
        await assertFails(
          updateDoc(doc(member, 'boards', 'private', 'rounds', 'round1'), { state: 'closed' }),
        );
        await assertSucceeds(
          updateDoc(doc(host, 'boards', 'private', 'rounds', 'round1'), { state: 'closed' }),
        );
        await assertSucceeds(
          getDocs(collection(guest2, 'boards', 'private', 'rounds', 'round1', 'ballots')),
        );
        await assertFails(
          setDoc(doc(guest, 'boards', 'private', 'rounds', 'round1', 'ballots', 'guest'), {
            votes: [],
          }),
        );
        await assertFails(
          updateDoc(doc(host, 'boards', 'private', 'rounds', 'round1'), { state: 'open' }),
        );
      });
      await t.test('visible rounds expose votes but enforce one per item', async () => {
        const batch = writeBatch(host);
        batch.set(doc(host, 'boards', 'private', 'rounds', 'round2'), {
          ...round,
          unique: true,
          hidden: false,
        });
        batch.update(doc(host, 'boards', 'private'), { currentRoundId: 'round2' });
        await assertSucceeds(batch.commit());
        const ref = doc(member, 'boards', 'private', 'rounds', 'round2', 'ballots', 'member');
        await assertFails(setDoc(ref, { votes: ['note1', 'note1'] }));
        await assertSucceeds(setDoc(ref, { votes: ['note1', 'guest-note'] }));
        await assertSucceeds(
          getDocs(collection(guest, 'boards', 'private', 'rounds', 'round2', 'ballots')),
        );
      });
      await t.test(
        'team membership requires a verified email and supports revocation',
        async () => {
          await assertSucceeds(
            setDoc(doc(host, 'teams', 'team1'), {
              ownerId: 'host',
              name: 'Product',
              memberEmails: ['member@example.com'],
              createdAt: Date.now(),
            }),
          );
          await assertSucceeds(
            setDoc(doc(host, 'boards', 'team-board'), {
              ...board,
              invitedEmails: [],
              teamId: 'team1',
            }),
          );
          await assertSucceeds(getDoc(doc(member, 'boards', 'team-board')));
          await assertSucceeds(
            getDocs(query(collection(member, 'boards'), where('teamId', '==', 'team1'))),
          );
          await assertFails(getDoc(doc(unverified, 'boards', 'team-board')));
          await assertFails(
            updateDoc(doc(member, 'teams', 'team1'), { memberEmails: ['outsider@example.com'] }),
          );
          await assertSucceeds(updateDoc(doc(host, 'teams', 'team1'), { memberEmails: [] }));
          await assertFails(getDoc(doc(member, 'boards', 'team-board')));
        },
      );
      await t.test('saved templates and presence are scoped to their owners', async () => {
        await assertSucceeds(
          setDoc(doc(host, 'templates', 't1'), {
            ownerId: 'host',
            name: 'My layout',
            objects: [obj],
            createdAt: Date.now(),
          }),
        );
        await assertFails(getDoc(doc(member, 'templates', 't1')));
        await assertFails(
          setDoc(doc(member, 'templates', 't1'), {
            ownerId: 'member',
            name: 'Stolen',
            objects: [],
            createdAt: Date.now(),
          }),
        );
        const p = { name: 'Guest', color: '#aabbcc', x: 10, y: 10, lastSeen: Date.now() };
        await assertSucceeds(setDoc(doc(guest, 'boards', 'private', 'presence', 'guest'), p));
        await assertSucceeds(
          setDoc(doc(guest, 'boards', 'private', 'presence', 'guest'), {
            ...p,
            serverTime: serverTimestamp(),
          }),
        );
        await assertFails(
          setDoc(doc(guest, 'boards', 'private', 'presence', 'guest'), { ...p, serverTime: 0 }),
        );
        await assertFails(setDoc(doc(guest, 'boards', 'private', 'presence', 'host'), p));
      });
    } finally {
      await env.cleanup();
    }
  },
);
