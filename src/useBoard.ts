import { useEffect, useRef, useState } from 'react';
import { onSnapshot, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  db,
  doc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  objectDefaults,
  withoutId,
  id,
  errorMessage,
  privateMember,
  castVote,
} from './firebase';
import type { Board, BoardObject, Presence, Round, Ballot, Action } from './types';
import { defaultAgenda, changeVote, remainingTime } from './domain.mjs';
import { builtins } from './templates';

type State = {
  board: Board | null;
  objects: BoardObject[];
  presence: Presence[];
  round: Round | null;
  ballots: Ballot[];
  mine: string[];
  actions: Action[];
};
function demoState(): State {
  const now = Date.now();
  const board: Board = {
    id: 'demo',
    title: 'A little better, together',
    meetingDate: new Date().toLocaleDateString('en-CA'),
    group: 'Team retrospectives',
    ownerId: 'demo-user',
    teamId: '',
    invitedEmails: [],
    publicEnabled: false,
    publicUntil: 0,
    createdAt: now,
    updatedAt: now,
    agenda: defaultAgenda,
    timer: {
      stage: 1,
      running: false,
      remaining: 600,
      startedAt: 0,
      autoAdvance: false,
      display: 'both',
    },
    currentRoundId: '',
    template: builtins[0].name,
  };
  const objects = builtins[0].objects.map((o) => objectDefaults(o, 'demo-user'));
  for (const o of [
    { x: 120, y: 215, color: '#fae9a4', text: 'Make more room for\nfocused work.' },
    { x: 270, y: 420, color: '#cfe9bf', text: 'Share the little wins\nas they happen ✨' },
    { x: 530, y: 235, color: '#f4c9bf', text: 'Meetings without\na clear next step.' },
    { x: 680, y: 440, color: '#fae9a4', text: 'Leaving feedback\nuntil the very end.' },
    { x: 940, y: 215, color: '#cddff2', text: 'Pairing up on\nthe tricky stuff.' },
    { x: 1080, y: 430, color: '#ded0ef', text: 'Asking “how can\nI help?”' },
  ])
    objects.push(objectDefaults(o, 'demo-user'));
  return { board, objects, presence: [], round: null, ballots: [], mine: [], actions: [] };
}
const empty: State = {
  board: null,
  objects: [],
  presence: [],
  round: null,
  ballots: [],
  mine: [],
  actions: [],
};
export function useBoard(boardId: string, demo: boolean, user: User | null) {
  const uid = demo ? 'demo-user' : user?.uid || '';
  const [state, set] = useState<State>(() => (demo ? demoState() : empty)),
    [error, setError] = useState(''),
    [pending, setPending] = useState(0),
    [connected, setConnected] = useState(navigator.onLine),
    [isMember, setIsMember] = useState(demo),
    [expired, setExpired] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const [clockOffset, setClockOffset] = useState(0);
  const clockSample = useRef(0);
  const offsetRef = useRef(0);
  offsetRef.current = clockOffset;
  const run = async (fn: () => Promise<void>) => {
    setPending((n) => n + 1);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setPending((n) => n - 1);
    }
  };
  useEffect(() => {
    const on = () => setConnected(true),
      off = () => setConnected(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (demo || !uid) return;
    setExpired(false);
    setIsMember(false);
    const fail = (e: unknown) => {
      setError(errorMessage(e));
      set(empty);
    };
    return onSnapshot(
      doc(db, 'boards', boardId),
      (snap) => {
        if (!snap.exists()) {
          setError('This board no longer exists.');
          set(empty);
          return;
        }
        const board = { id: snap.id, ...snap.data() } as Board;
        set((s) => ({ ...s, board }));
        privateMember(board)
          .then(setIsMember)
          .catch(() => setIsMember(false));
      },
      fail,
    );
  }, [boardId, demo, uid]);
  useEffect(() => {
    if (demo || !state.board || expired) return;
    const unsubs = ['objects', 'presence', 'actions'].map((name) =>
      onSnapshot(
        collection(db, 'boards', boardId, name),
        (snap) => {
          set((s) => ({
            ...s,
            [name]: snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              ...(name === 'presence' && d.data().serverTime
                ? { lastSeen: d.data().serverTime.toMillis() }
                : {}),
            })),
          }));
          if (name === 'presence') {
            const own = snap.docs.find((d) => d.id === uid);
            const server = own?.data().serverTime;
            if (
              server &&
              !own?.metadata.hasPendingWrites &&
              !own?.metadata.fromCache &&
              server.toMillis() > clockSample.current
            ) {
              clockSample.current = server.toMillis();
              setClockOffset(server.toMillis() - Date.now());
            }
          }
        },
        (e) => {
          setError(errorMessage(e));
          set((s) => ({ ...s, [name]: [] }));
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [boardId, demo, !!state.board, expired]);
  const roundId = state.board?.currentRoundId;
  useEffect(() => {
    if (demo || !roundId || expired) return;
    set((s) => ({ ...s, round: null, ballots: [], mine: [] }));
    const a = onSnapshot(
      doc(db, 'boards', boardId, 'rounds', roundId),
      (s) =>
        set((x) => ({ ...x, round: s.exists() ? ({ id: s.id, ...s.data() } as Round) : null })),
      (e) => setError(errorMessage(e)),
    );
    const b = onSnapshot(
      doc(db, 'boards', boardId, 'rounds', roundId, 'ballots', uid),
      (s) => set((x) => ({ ...x, mine: s.data()?.votes || [] })),
      (e) => setError(errorMessage(e)),
    );
    return () => {
      a();
      b();
    };
  }, [roundId, demo, boardId, uid, expired]);
  const canReadBallots = state.round && (!state.round.hidden || state.round.state === 'closed');
  useEffect(() => {
    if (demo || !roundId || !canReadBallots || expired) return;
    return onSnapshot(
      collection(db, 'boards', boardId, 'rounds', roundId, 'ballots'),
      (s) =>
        set((x) => ({ ...x, ballots: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Ballot) })),
      (e) => {
        setError(errorMessage(e));
        set((x) => ({ ...x, ballots: [] }));
      },
    );
  }, [roundId, !!canReadBallots, demo, boardId, expired]);
  useEffect(() => {
    if (demo || !state.board || isMember) return;
    const check = () => {
      const b = latest.current.board;
      if (b && (!b.publicEnabled || b.publicUntil <= Date.now() + offsetRef.current)) {
        setExpired(true);
        set(empty);
        setError(
          'This meeting link has closed. Ask the host to reopen it, or sign in with an invited account.',
        );
      }
    };
    // Allow membership lookup to resolve before checking a private board.
    const start = setTimeout(check, 1500),
      interval = setInterval(check, 1000);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [state.board?.publicEnabled, state.board?.publicUntil, isMember, demo]);
  async function patchBoard(patch: Partial<Board>) {
    return run(async () => {
      if (demo) set((s) => ({ ...s, board: { ...s.board!, ...patch, updatedAt: Date.now() } }));
      else await updateDoc(doc(db, 'boards', boardId), { ...patch, updatedAt: Date.now() });
    });
  }
  async function putObject(o: BoardObject) {
    return run(async () => {
      if (demo) set((s) => ({ ...s, objects: [...s.objects.filter((x) => x.id !== o.id), o] }));
      else await setDoc(doc(db, 'boards', boardId, 'objects', o.id), withoutId(o));
    });
  }
  async function patchObject(objectId: string, patch: Partial<BoardObject>) {
    return run(async () => {
      if (demo)
        set((s) => ({
          ...s,
          objects: s.objects.map((o) =>
            o.id === objectId ? { ...o, ...patch, updatedAt: Date.now() } : o,
          ),
        }));
      else
        await updateDoc(doc(db, 'boards', boardId, 'objects', objectId), {
          ...patch,
          updatedAt: Date.now(),
        });
    });
  }
  async function removeObject(objectId: string) {
    return run(async () => {
      if (demo) set((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== objectId) }));
      else await deleteDoc(doc(db, 'boards', boardId, 'objects', objectId));
    });
  }
  async function presence(p: Omit<Presence, 'id'>) {
    if (demo || expired) return;
    try {
      await setDoc(doc(db, 'boards', boardId, 'presence', uid), {
        ...p,
        serverTime: serverTimestamp(),
      });
    } catch {
      /* The board listener reports permission and network failures. */
    }
  }
  async function startRound(settings: Pick<Round, 'title' | 'budget' | 'hidden' | 'unique'>) {
    return run(async () => {
      const round: Round = {
        id: id(),
        ...settings,
        state: 'open',
        targetIds: latest.current.objects
          .filter((o) => o.type === 'note' || o.type === 'text' || o.type === 'shape')
          .slice(0, 400)
          .map((o) => o.id),
        createdAt: Date.now(),
      };
      if (!round.targetIds.length)
        throw new Error('Add a sticky note or text item before starting a vote.');
      if (demo)
        set((s) => ({
          ...s,
          round,
          ballots: [],
          mine: [],
          board: { ...s.board!, currentRoundId: round.id },
        }));
      else {
        const batch = writeBatch(db);
        batch.set(doc(db, 'boards', boardId, 'rounds', round.id), withoutId(round));
        batch.update(doc(db, 'boards', boardId), { currentRoundId: round.id });
        await batch.commit();
      }
    });
  }
  async function endRound() {
    return run(async () => {
      if (demo) set((s) => ({ ...s, round: { ...s.round!, state: 'closed' } }));
      else
        await updateDoc(doc(db, 'boards', boardId, 'rounds', latest.current.round!.id), {
          state: 'closed',
        });
    });
  }
  async function vote(target: string, direction = 1) {
    return run(async () => {
      const s = latest.current;
      if (!s.round || s.round.state !== 'open') return;
      if (demo) {
        const votes = changeVote(s.mine, target, direction, s.round.budget, s.round.unique);
        set((x) => ({ ...x, mine: votes, ballots: [{ id: uid, votes }] }));
      } else await castVote(boardId, s.round.id, target, direction);
    });
  }
  async function putAction(a: Action) {
    return run(async () => {
      if (demo) set((s) => ({ ...s, actions: [...s.actions.filter((x) => x.id !== a.id), a] }));
      else await setDoc(doc(db, 'boards', boardId, 'actions', a.id), withoutId(a));
    });
  }
  async function removeAction(actionId: string) {
    return run(async () => {
      if (demo) set((s) => ({ ...s, actions: s.actions.filter((a) => a.id !== actionId) }));
      else await deleteDoc(doc(db, 'boards', boardId, 'actions', actionId));
    });
  }
  async function advanceStage(expectedStartedAt: number) {
    if (demo) {
      const b = latest.current.board!;
      if (b.timer.startedAt !== expectedStartedAt || !b.timer.running) return;
      const stage = b.timer.stage + 1;
      await patchBoard({
        timer:
          b.timer.autoAdvance && stage < b.agenda.length
            ? {
                ...b.timer,
                stage,
                remaining: b.agenda[stage].seconds,
                startedAt: Date.now(),
                running: true,
              }
            : { ...b.timer, running: false, remaining: 0 },
      });
      return;
    }
    await run(async () => {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'boards', boardId);
        const snap = await tx.get(ref);
        const b = snap.data() as Board;
        if (b.timer.startedAt !== expectedStartedAt || !b.timer.running) return;
        const stage = b.timer.stage + 1;
        tx.update(ref, {
          timer:
            b.timer.autoAdvance && stage < b.agenda.length
              ? {
                  ...b.timer,
                  stage,
                  remaining: b.agenda[stage].seconds,
                  startedAt: Date.now() + offsetRef.current,
                  running: true,
                }
              : { ...b.timer, running: false, remaining: 0 },
        });
      });
    });
  }
  useEffect(() => {
    if (!state.board || state.board.ownerId !== uid) return;
    let advancing = false;
    const tick = setInterval(() => {
      const b = latest.current.board;
      if (
        b &&
        b.timer.running &&
        remainingTime(b.timer, Date.now() + offsetRef.current) === 0 &&
        !advancing
      ) {
        advancing = true;
        advanceStage(b.timer.startedAt)
          .catch(() => {})
          .finally(() => {
            advancing = false;
          });
      }
    }, 400);
    return () => clearInterval(tick);
  }, [uid, !!state.board]);
  useEffect(
    () => () => {
      if (!demo && uid) deleteDoc(doc(db, 'boards', boardId, 'presence', uid)).catch(() => {});
    },
    [boardId, demo, uid],
  );
  return {
    ...state,
    uid,
    isMember,
    error,
    setError,
    pending,
    connected,
    expired,
    clockOffset,
    patchBoard,
    putObject,
    patchObject,
    removeObject,
    presenceUpdate: presence,
    startRound,
    endRound,
    vote,
    putAction,
    removeAction,
    advanceStage,
  };
}
export type BoardStore = ReturnType<typeof useBoard>;
