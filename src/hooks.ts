import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, type Query, type DocumentReference } from 'firebase/firestore';
import { auth, errorMessage } from './firebase';
export function useUser() {
  const [state, set] = useState<{ user: User | null; ready: boolean }>({
    user: null,
    ready: false,
  });
  useEffect(() => onAuthStateChanged(auth, (user) => set({ user, ready: true })), []);
  return state;
}
export function useLiveList<T>(query: Query | null, key: string) {
  const [data, set] = useState<T[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    set([]);
    setError('');
    setLoading(!!query);
    if (!query) return;
    return onSnapshot(
      query,
      (s) => {
        set(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
        setError('');
      },
      (e) => {
        setError(errorMessage(e));
        setLoading(false);
        set([]);
      },
    );
  }, [key]);
  return { data, error, loading };
}
export function useLiveDoc<T>(ref: DocumentReference | null, key: string) {
  const [data, set] = useState<T | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    set(null);
    setError('');
    if (!ref) return;
    return onSnapshot(
      ref,
      (s) => {
        set(s.exists() ? ({ id: s.id, ...s.data() } as T) : null);
        setError(s.exists() ? '' : 'This board could not be found.');
      },
      (e) => {
        set(null);
        setError(errorMessage(e));
      },
    );
  }, [key]);
  return { data, error };
}
export function useNow() {
  const [now, set] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => set(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return now;
}
