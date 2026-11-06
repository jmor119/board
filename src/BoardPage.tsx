import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ChevronDown,
  Check,
  Share2,
  LockKeyhole,
  Globe2,
  Link,
  X,
  Plus,
  Download,
  BookOpen,
  HelpCircle,
  PanelRight,
  Clock3,
  LogIn,
  WifiOff,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import { useBoard } from './useBoard';
import { useNow } from './hooks';
import { countVotes, clockText, remainingTime } from './domain.mjs';
import { cursorColors } from './templates';
import { errorMessage, saveTemplate } from './firebase';
import { Logo, Modal, download } from './ui';
import Canvas, { type CanvasHandle } from './Canvas';
import MeetingPanel from './MeetingPanel';

export default function BoardPage({
  boardId,
  demo,
  user,
  navigate,
  onLogin,
}: {
  boardId: string;
  demo: boolean;
  user: User | null;
  navigate: (p: string) => void;
  onLogin: () => void;
}) {
  const store = useBoard(boardId, demo, user),
    now = useNow() + store.clockOffset,
    canvas = useRef<CanvasHandle>(null);
  const [panel, setPanel] = useState(() => window.innerWidth >= 800),
    [modal, setModal] = useState(''),
    [menu, setMenu] = useState(false),
    [name, setName] = useState(() =>
      demo
        ? 'You'
        : user?.displayName ||
          sessionStorage.getItem('board-guest-name') ||
          user?.email?.split('@')[0] ||
          'Guest',
    ),
    [toast, setToast] = useState('');
  const [rename, setRename] = useState(false),
    [title, setTitle] = useState('');
  const cursorPosition = useRef({ x: 0, y: 0 }),
    lastPresence = useRef(0),
    board = store.board,
    host = demo || board?.ownerId === user?.uid;
  const color =
    cursorColors[
      store.uid.split('').reduce((n, c) => n + c.charCodeAt(0), 0) % cursorColors.length
    ];
  const updatePresence = () => {
    if (!board) return;
    lastPresence.current = Date.now();
    store.presenceUpdate({
      name: name.slice(0, 60),
      color,
      ...cursorPosition.current,
      lastSeen: Date.now(),
    });
  };
  useEffect(() => {
    if (!board) return;
    updatePresence();
    const interval = setInterval(updatePresence, 15000);
    return () => clearInterval(interval);
  }, [!!board, name, boardId]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const people = store.presence.filter((p) => p.lastSeen > now - 45000);
  const totals = countVotes(
    store.round?.hidden && store.round.state === 'open' ? [] : store.ballots,
  );
  const exportBoard = () => {
    if (!board) return;
    download(
      board.title.replace(/[^\w -]/g, '') + '.json',
      JSON.stringify(
        {
          format: 'board-export-v1',
          board,
          objects: store.objects,
          actions: store.actions,
          results: totals,
        },
        null,
        2,
      ),
    );
    setMenu(false);
  };
  const exportNotes = () => {
    if (!board) return;
    const text = [
      board.title,
      '='.repeat(board.title.length),
      '',
      ...board.agenda.map((s) => `${s.name}: ${s.seconds / 60} minutes`),
      '',
      'IDEAS',
      ...store.objects
        .filter((o) => o.type === 'note' || o.type === 'text')
        .map((o) => `- ${o.text}${totals[o.id] ? ` (${totals[o.id]} votes)` : ''}`),
      '',
      'ACTIONS',
      ...store.actions.map(
        (a) =>
          `[${a.done ? 'x' : ' '}] ${a.text} — ${a.owner || 'Unassigned'}${a.due ? ` — due ${a.due}` : ''}`,
      ),
    ].join('\n');
    download(board.title.replace(/[^\w -]/g, '') + ' - meeting notes.txt', text, 'text/plain');
    setMenu(false);
  };
  if (!board)
    return (
      <div className="board-unavailable">
        <Logo />
        {store.error ? (
          <>
            <h1>
              {store.expired ? 'This meeting link has closed.' : 'This board isn’t available yet.'}
            </h1>
            <p>{store.error}</p>
            <div className="hero-buttons">
              <button className="primary" onClick={onLogin}>
                <LogIn size={17} />
                Sign in
              </button>
              <button className="secondary" onClick={() => navigate('/')}>
                Back to your boards
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="spinner" />
            <p>Opening your board…</p>
          </>
        )}
      </div>
    );
  return (
    <div className="board-app">
      {demo && (
        <div className="demo-banner">
          <span>
            <strong>Practice board</strong> · Try everything. Changes stay in this browser.
          </span>
          <button onClick={onLogin}>
            Create your team’s space <LogIn size={13} />
          </button>
        </div>
      )}
      <header className="board-header">
        <button
          className="board-home"
          title="Back to your boards"
          aria-label="Back to your boards"
          onClick={() => navigate('/')}
        >
          <Logo small />
          <ArrowLeft size={14} />
        </button>
        <div className="board-title-block">
          {rename ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await store.patchBoard({ title: title.trim() });
                  setRename(false);
                } catch {}
              }}
            >
              <input
                autoFocus
                aria-label="Board name"
                value={title}
                maxLength={140}
                required
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim())
                    store
                      .patchBoard({ title: title.trim() })
                      .then(() => setRename(false))
                      .catch(() => {});
                }}
              />
            </form>
          ) : (
            <button
              className="board-title"
              onClick={() => {
                if (host) {
                  setTitle(board.title);
                  setRename(true);
                }
              }}
              title={host ? 'Rename board' : board.title}
            >
              {board.title}
              {host && <ChevronDown size={13} />}
            </button>
          )}
          <div className="save-state">
            {!store.connected ? (
              <>
                <WifiOff size={11} />
                Offline · reconnecting
              </>
            ) : store.pending ? (
              <>
                <span className="tiny-spinner" />
                Saving changes…
              </>
            ) : (
              <>
                <Check size={11} />
                {demo ? 'Saved in this browser' : 'All changes saved'}
              </>
            )}
          </div>
        </div>
        <button
          className="icon-button board-more"
          aria-label="Board options"
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal size={21} />
        </button>
        {menu && (
          <>
            <div className="menu-dismiss" onClick={() => setMenu(false)} />
            <div className="board-menu">
              <button
                onClick={() => {
                  setMenu(false);
                  setModal('template');
                }}
              >
                <BookOpen size={16} />
                Save as template
              </button>
              <button onClick={exportBoard}>
                <Download size={16} />
                Export board JSON
              </button>
              <button onClick={exportNotes}>
                <Download size={16} />
                Export meeting notes
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setModal('help');
                }}
              >
                <HelpCircle size={16} />
                Help & shortcuts
              </button>
            </div>
          </>
        )}
        <div className="header-spacer" />
        <div
          className="participant-stack"
          aria-label={`${Math.max(1, people.length)} participants`}
        >
          {people
            .filter((p) => p.id !== store.uid)
            .slice(0, 4)
            .map((p) => (
              <span
                key={p.id}
                className="avatar"
                style={{ background: p.color, color: 'white' }}
                title={p.name}
              >
                {p.name[0]?.toUpperCase()}
              </span>
            ))}
          <button
            className="avatar self-avatar"
            onClick={() => setModal('name')}
            title="Change your display name"
            style={{ background: color, color: 'white' }}
          >
            {name[0]?.toUpperCase()}
          </button>
        </div>
        <span className="participant-count">{Math.max(1, people.length)} here</span>
        <button
          className={`secondary meeting-toggle ${panel ? 'on' : ''}`}
          onClick={() => setPanel(!panel)}
        >
          <Clock3 size={17} />
          <span>{clockText(remainingTime(board.timer, now))}</span>
          <PanelRight size={15} />
        </button>
        <button className="primary share-button" onClick={() => setModal('share')}>
          <Share2 size={16} />
          Share
        </button>
      </header>
      <div className="board-content">
        <Canvas
          ref={canvas}
          objects={store.objects}
          presence={people}
          uid={store.uid}
          host={host}
          round={store.round}
          mine={store.mine}
          totals={totals}
          put={store.putObject}
          patch={store.patchObject}
          remove={store.removeObject}
          vote={store.vote}
          onHelp={() => setModal('help')}
          cursor={(x, y) => {
            cursorPosition.current = { x, y };
            if (Date.now() - lastPresence.current > 220) updatePresence();
          }}
        />
        {panel && (
          <MeetingPanel
            store={store}
            host={host}
            now={now}
            onFocus={(id) => canvas.current?.focus(id)}
            onClose={() => setPanel(false)}
          />
        )}
      </div>
      {store.error && (
        <div className="board-error" role="alert">
          {store.error}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => store.setError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal === 'share' && (
        <ShareModal
          store={store}
          host={host}
          demo={demo}
          onClose={() => setModal('')}
          onToast={setToast}
        />
      )}
      {modal === 'template' && (
        <TemplateModal
          store={store}
          demo={demo}
          onClose={() => setModal('')}
          onToast={setToast}
          onLogin={onLogin}
        />
      )}
      {modal === 'name' && (
        <Modal
          title="What should we call you?"
          subtitle="Your name appears beside your cursor."
          onClose={() => setModal('')}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem('board-guest-name', name);
              setModal('');
            }}
          >
            <label>
              Display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
              />
            </label>
            <button className="primary">
              Save name <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="A little help, a lot of possibility." onClose={() => setModal('')}>
          <div className="help-content">
            <p>
              Choose a tool on the left, then click the board. Double-click a note to write. Drag
              notes to move them; drag the corner to resize. Use the scroll wheel to pan and Ctrl +
              wheel to zoom.
            </p>
            <div className="shortcut-grid">
              {[
                ['V', 'Select'],
                ['H / Space', 'Pan the board'],
                ['N', 'Sticky note'],
                ['T', 'Text'],
                ['P / M', 'Pen / marker'],
                ['S', 'Rectangle'],
                ['Ctrl + Z', 'Undo your edit'],
                ['Ctrl + Shift + Z', 'Redo'],
                ['Ctrl + D', 'Duplicate selected'],
                ['Delete', 'Remove selected'],
                ['Enter', 'Edit selected text'],
                ['Arrow keys', 'Move selected object'],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="fine-print">
              Locked frames keep the template in place. Only the facilitator can unlock them. Each
              person’s undo history covers their own edits in this tab.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ShareModal({
  store,
  host,
  demo,
  onClose,
  onToast,
}: {
  store: ReturnType<typeof useBoard>;
  host: boolean;
  demo: boolean;
  onClose: () => void;
  onToast: (s: string) => void;
}) {
  const b = store.board!;
  const [hours, setHours] = useState(3),
    [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const publicOpen = b.publicEnabled && b.publicUntil > Date.now() + store.clockOffset;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + '/b/' + b.id);
      onToast('Board link copied.');
    } catch {
      setError('Couldn’t copy automatically. Select and copy the link below.');
    }
  };
  const update = async (p: Parameters<typeof store.patchBoard>[0]) => {
    setBusy(true);
    try {
      await store.patchBoard(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Good conversations need good company."
      subtitle="Invite your people. You decide who can join and for how long."
      onClose={onClose}
    >
      <div className="sharing-options">
        <div className="share-section">
          <div className="share-section-heading">
            <span className="share-symbol">
              <LockKeyhole size={21} />
            </span>
            <div>
              <h3>Private access</h3>
              <p>
                {b.teamId ? 'Your team and invited people.' : 'Only you and the people you invite.'}
              </p>
            </div>
            <span className="pill">Always protected</span>
          </div>
          {host && !demo && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                update({
                  invitedEmails: [...new Set([...b.invitedEmails, email.trim().toLowerCase()])],
                });
                setEmail('');
              }}
            >
              <input
                aria-label="Invite email"
                type="email"
                placeholder="teammate@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="secondary" disabled={busy}>
                Add <Plus size={16} />
              </button>
            </form>
          )}
          {b.invitedEmails.map((e) => (
            <div className="member-row" key={e}>
              <span>{e}</span>
              {host && (
                <button
                  className="icon-button"
                  aria-label={'Remove ' + e}
                  onClick={() => update({ invitedEmails: b.invitedEmails.filter((x) => x !== e) })}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <p className="fine-print">
            Invitees sign in with their verified email. Share the link directly; no invitation email
            is sent.
          </p>
        </div>
        <div className="share-section public-section">
          <div className="share-section-heading">
            <span className="share-symbol">
              <Globe2 size={21} />
            </span>
            <div>
              <h3>Open for a meeting</h3>
              <p>No account needed. Everyone with the link can edit.</p>
            </div>
          </div>
          {publicOpen ? (
            <div className="share-open">
              <span className="live-dot" />
              <span>
                Open until{' '}
                {new Date(b.publicUntil).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              {host && (
                <button
                  className="text-button danger"
                  onClick={() => update({ publicEnabled: false, publicUntil: 0 })}
                  disabled={busy}
                >
                  Close now
                </button>
              )}
            </div>
          ) : (
            <p className="muted">Public access is closed.</p>
          )}
          {host && !demo && (
            <div className="inline-form">
              <label>
                Open for
                <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                  {[1, 2, 3, 4, 8, 24].map((n) => (
                    <option key={n} value={n}>
                      {n} hour{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  update({
                    publicEnabled: true,
                    publicUntil: Date.now() + store.clockOffset + hours * 3600000 - 5000,
                  })
                }
              >
                {publicOpen ? 'Extend meeting' : 'Open meeting link'}
                <Globe2 size={16} />
              </button>
            </div>
          )}
          <p className="fine-print">
            Access closes automatically. Guests already on the board lose access too. Anyone can
            retain content they have already seen.
          </p>
        </div>
        {demo ? (
          <div className="notice">
            This is a practice board. Create a real board to invite your team.
          </div>
        ) : (
          <div className="copy-link">
            <input aria-label="Board link" readOnly value={location.origin + '/b/' + b.id} />
            <button className="primary" onClick={copy}>
              <Link size={16} />
              Copy link
            </button>
          </div>
        )}
        {!host && <p className="fine-print">Only the board creator can change sharing settings.</p>}
        {error && <div className="error">{error}</div>}
      </div>
    </Modal>
  );
}
function TemplateModal({
  store,
  demo,
  onClose,
  onToast,
  onLogin,
}: {
  store: ReturnType<typeof useBoard>;
  demo: boolean;
  onClose: () => void;
  onToast: (s: string) => void;
  onLogin: () => void;
}) {
  const [name, setName] = useState(store.board!.title + ' layout'),
    [layoutOnly, setLayoutOnly] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title="Keep the structure. Start fresh."
      subtitle="Save this layout for your next retrospective."
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (demo) {
            onLogin();
            onClose();
            return;
          }
          setBusy(true);
          try {
            await saveTemplate(name, store.objects, layoutOnly);
            onToast('Template saved to your workspace.');
            onClose();
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        <label>
          Template name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={layoutOnly}
            onChange={(e) => setLayoutOnly(e.target.checked)}
          />
          <span>
            Save the layout only
            <small>Keep frames, shapes and headings. Leave sticky notes and drawings behind.</small>
          </span>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          {demo ? 'Sign in to save templates' : busy ? 'Saving…' : 'Save template'}
          <BookOpen size={17} />
        </button>
      </form>
    </Modal>
  );
}
