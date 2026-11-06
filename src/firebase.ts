import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  getDoc,
} from 'firebase/firestore';
import config from './firebase-config.json';
import type { Board, BoardObject, Template, Team } from './types';
import { defaultAgenda, changeVote } from './domain.mjs';

const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { collection, doc, setDoc, updateDoc, deleteDoc };
export const id = () => doc(collection(db, '_ids')).id;
export const googleLogin = () => signInWithPopup(auth, new GoogleAuthProvider());
export const guestLogin = () => signInAnonymously(auth);
export const logout = () => signOut(auth);
export async function emailLogin(email: string, password: string, create: boolean, name: string) {
  if (!create) return signInWithEmailAndPassword(auth, email, password);
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, {
    displayName: name.trim().slice(0, 60) || email.split('@')[0],
  });
  await requestAccountEmail('verify-email');
  return result;
}
async function requestAccountEmail(kind: 'verify-email' | 'password-reset', email?: string) {
  const token = kind === 'verify-email' ? await auth.currentUser?.getIdToken() : undefined;
  const response = await fetch(
    'https://australia-southeast1-chronological-9f536.cloudfunctions.net/boardAccountEmail',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind, ...(email ? { email } : {}) }),
    },
  );
  if (!response.ok) throw new Error('Could not request the email. Please try again shortly.');
}
export const resetPassword = (email: string) => requestAccountEmail('password-reset', email);
export const verifyEmail = () => requestAccountEmail('verify-email');
export function objectDefaults(part: Partial<BoardObject>, uid: string): BoardObject {
  const now = Date.now();
  return {
    id: id(),
    type: 'note',
    x: 200,
    y: 250,
    w: 190,
    h: 170,
    text: '',
    color: '#fae9a4',
    locked: false,
    authorId: uid,
    points: [],
    strokeWidth: 3,
    createdAt: now,
    updatedAt: now,
    ...part,
  };
}
export const withoutId = <T extends { id: string }>(o: T) => {
  const { id: _id, ...rest } = o;
  return rest;
};
export async function createBoard(
  title: string,
  template: Template,
  teamId = '',
  meetingDate = '',
  group = '',
) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to create a private board.');
  const boardId = id(),
    now = Date.now();
  const board: Board = {
    id: boardId,
    ownerId: user.uid,
    title: title.trim() || 'Untitled retrospective',
    teamId,
    meetingDate,
    group: group.trim(),
    invitedEmails: [],
    publicEnabled: false,
    publicUntil: 0,
    createdAt: now,
    updatedAt: now,
    agenda: defaultAgenda,
    timer: {
      stage: 0,
      running: false,
      remaining: 300,
      startedAt: 0,
      autoAdvance: false,
      display: 'both',
    },
    currentRoundId: '',
    template: template.name,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'boards', boardId), withoutId(board));
  // Create the parent first so object permissions can read it.
  await batch.commit();
  try {
    const objects = writeBatch(db);
    for (const partial of template.objects) {
      const o = objectDefaults({ ...partial, id: id(), authorId: user.uid }, user.uid);
      objects.set(doc(db, 'boards', boardId, 'objects', o.id), withoutId(o));
    }
    if (template.objects.length) await objects.commit();
  } catch (e) {
    // Leave the new board accessible if a network failure interrupts its template.
    throw new Error(
      `Board created but template could not be applied. Open it from your boards and retry. ${errorMessage(e)}`,
    );
  }
  return boardId;
}
export async function saveTemplate(name: string, objects: BoardObject[], layoutOnly: boolean) {
  if (!auth.currentUser || auth.currentUser.isAnonymous)
    throw new Error('Sign in to save a template.');
  const selected = objects.filter(
    (o) => !layoutOnly || o.type === 'frame' || o.type === 'shape' || o.type === 'text',
  );
  await setDoc(doc(db, 'templates', id()), {
    name: name.trim(),
    ownerId: auth.currentUser.uid,
    objects: selected.map((o) => withoutId(o)),
    createdAt: Date.now(),
  });
}
export async function castVote(
  boardId: string,
  roundId: string,
  target: string,
  direction: number,
) {
  const user = auth.currentUser;
  if (!user) return;
  await runTransaction(db, async (tx) => {
    const roundRef = doc(db, 'boards', boardId, 'rounds', roundId);
    const ballotRef = doc(db, 'boards', boardId, 'rounds', roundId, 'ballots', user.uid);
    const [r, b] = await Promise.all([tx.get(roundRef), tx.get(ballotRef)]);
    const round = r.data();
    if (!round || round.state !== 'open') throw new Error('This voting round has ended.');
    if (!round.targetIds.includes(target))
      throw new Error('This note is not included in this round.');
    tx.set(ballotRef, {
      votes: changeVote(b.data()?.votes || [], target, direction, round.budget, round.unique),
    });
  });
}
export async function privateMember(board: Board) {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return false;
  if (
    board.ownerId === u.uid ||
    (u.emailVerified && board.invitedEmails.includes(u.email?.toLowerCase() || ''))
  )
    return true;
  if (board.teamId) {
    try {
      const t = await getDoc(doc(db, 'teams', board.teamId));
      return t.exists();
    } catch {
      return false;
    }
  }
  return false;
}
export async function createTeam(name: string) {
  const team: Team = {
    id: id(),
    name: name.trim(),
    ownerId: auth.currentUser!.uid,
    memberEmails: [],
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'teams', team.id), withoutId(team));
  return team;
}
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'permission-denied')
    return 'Access is unavailable. The link may have expired, or your account may not have permission.';
  if (code === 'auth/popup-closed-by-user')
    return 'Sign-in was closed. You can try again when you’re ready.';
  if (code === 'auth/popup-blocked')
    return 'Allow the Google sign-in popup in your browser, then try again.';
  if (code === 'auth/operation-not-allowed')
    return 'This sign-in method is not enabled yet. Try email sign-in.';
  if (code === 'auth/invalid-credential')
    return 'The email or password doesn’t match. Please try again.';
  if (code === 'auth/email-already-in-use')
    return 'That email already has an account. Choose Sign in.';
  if (code === 'auth/too-many-requests')
    return 'Too many attempts. Please wait a little before trying again.';
  if (code === 'unavailable')
    return 'Connection interrupted. Your changes will sync when the connection returns.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
