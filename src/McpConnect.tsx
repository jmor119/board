import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, Copy, Link2, ShieldCheck, X } from 'lucide-react';
import { errorMessage, verifyEmail } from './firebase';
import { Logo } from './ui';

export const MCP_BASE =
  'https://australia-southeast1-chronological-9f536.cloudfunctions.net/boardMcp';
type Connection = { id: string; name: string; expiresAt: number };
export default function McpConnect({
  user,
  onLogin,
  navigate,
}: {
  user: User | null;
  onLogin: () => void;
  navigate: (path: string) => void;
}) {
  const requestId = new URLSearchParams(location.search).get('request');
  const [client, setClient] = useState(''),
    [connections, setConnections] = useState<Connection[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function api(action: string, body: Record<string, unknown> = {}) {
    const token = await user?.getIdToken();
    const response = await fetch(`${MCP_BASE}/connection/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not connect. Please try again.');
    return result;
  }
  useEffect(() => {
    if (!user?.emailVerified) return;
    let active = true;
    (requestId
      ? api('details', { requestId }).then((r) => {
          if (active) setClient(r.clientName);
        })
      : api('list').then((r) => {
          if (active) setConnections(r.connections);
        })
    ).catch((e) => {
      if (active) setError(errorMessage(e));
    });
    return () => {
      active = false;
    };
  }, [user?.uid, user?.emailVerified, requestId]);
  async function decide(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await api(approve ? 'approve' : 'decline', { requestId });
      const url = new URL(result.redirectUri);
      url.searchParams.set('state', result.state);
      url.searchParams.set(approve ? 'code' : 'error', approve ? result.code : 'access_denied');
      location.assign(url.toString());
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className="connections-page">
      <header>
        <Logo />
        <button className="text-button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Your boards
        </button>
      </header>
      <section className="connections-card">
        <span className="eyebrow">YOUR BOARD, YOUR TOOLS</span>
        <h1>{requestId ? 'Connect your AI client' : 'Connect with MCP'}</h1>
        <p className="muted">
          Use Board from a compatible AI client. Ask it to prepare a retrospective, add ideas,
          organise the board or download your actions.
        </p>
        {!user || user.isAnonymous ? (
          <button className="primary" onClick={onLogin}>
            Sign in to continue
          </button>
        ) : !user.emailVerified ? (
          <div className="stack">
            <p>Verify your email before connecting a client.</p>
            <button
              className="primary"
              onClick={() =>
                void verifyEmail()
                  .then(() =>
                    setNotice('Verification email requested. Open it, then refresh this page.'),
                  )
                  .catch((e) => setError(errorMessage(e)))
              }
            >
              Send verification email
            </button>
          </div>
        ) : requestId ? (
          <>
            <h2>{client || 'Loading connection request...'}</h2>
            <div className="connection-permissions">
              <ShieldCheck size={24} />
              <div>
                <p>This client will be able to:</p>
                <ul>
                  <li>
                    Read and edit boards you can access, including their notes, drawings and
                    actions.
                  </li>
                  <li>Create boards and use your templates.</li>
                  <li>Manage sharing, timers and voting on boards you own.</li>
                  <li>Read and download actions as CSV or JSON.</li>
                </ul>
                <p>
                  Hidden votes remain private until voting closes. You can disconnect the client
                  from this page at any time.
                </p>
              </div>
            </div>
            <p className="fine-print">
              Connected as {user.email}. Only connect clients you trust with your team’s content.
            </p>
            <div className="row">
              <button
                className="secondary"
                disabled={busy || !client}
                onClick={() => void decide(false)}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || !client}
                onClick={() => void decide(true)}
              >
                <Link2 size={17} />
                Allow connection
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Add Board to your client</h2>
            <ol>
              <li>Open your client’s remote MCP or custom connector settings.</li>
              <li>Add the server URL below and choose OAuth sign-in.</li>
              <li>Sign in to Board and review the connection request.</li>
            </ol>
            <label>
              Server URL
              <input readOnly value={`${MCP_BASE}/mcp`} onFocus={(e) => e.target.select()} />
            </label>
            <button
              className="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(`${MCP_BASE}/mcp`)
                  .then(() => setNotice('Server URL copied.'))
                  .catch(() => setNotice('Select the URL above to copy it.'))
              }
            >
              <Copy size={16} />
              Copy server URL
            </button>
            <p className="fine-print">
              Supports remote MCP over Streamable HTTP with OAuth and PKCE. Available connector
              options depend on your client.
            </p>
            <h2>Connected clients</h2>
            {connections.length ? (
              connections.map((c) => (
                <div className="member-row" key={c.id}>
                  <span>{c.name}</span>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api('revoke', { id: c.id });
                        setConnections((list) => list.filter((x) => x.id !== c.id));
                        setNotice('Client disconnected.');
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <X size={15} />
                    Disconnect
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No connected clients yet.</p>
            )}
          </>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
