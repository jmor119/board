import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Settings2,
  Check,
  Plus,
  Minus,
  EyeOff,
  Eye,
  ArrowUpRight,
  CheckCircle2,
  Trash2,
  X,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import type { BoardStore } from './useBoard';
import type { Stage, Timer as TimerType } from './types';
import { remainingTime, clockText, countVotes } from './domain.mjs';
import { id } from './firebase';
import { Modal, download } from './ui';
import { actionsCsv } from './action-export.mjs';

export default function MeetingPanel({
  store,
  host,
  now,
  onFocus,
  onClose,
}: {
  store: BoardStore;
  host: boolean;
  now: number;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'agenda' | 'vote' | 'actions'>('agenda'),
    [configure, setConfigure] = useState(false);
  const board = store.board!;
  return (
    <aside className="meeting-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">MAKE EVERY MINUTE MATTER</span>
          <h2>Your meeting</h2>
        </div>
        <button
          className="icon-button panel-close"
          onClick={onClose}
          aria-label="Close meeting panel"
        >
          <X size={18} />
        </button>
      </div>
      <div className="panel-tabs">
        <button className={tab === 'agenda' ? 'active' : ''} onClick={() => setTab('agenda')}>
          Agenda
        </button>
        <button className={tab === 'vote' ? 'active' : ''} onClick={() => setTab('vote')}>
          Voting{store.round?.state === 'open' && <i />}
        </button>
        <button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>
          Actions{store.actions.length > 0 && <span>{store.actions.length}</span>}
        </button>
      </div>
      <div className="panel-content">
        {tab === 'agenda' ? (
          <>
            <div className="section-heading compact">
              <span className="eyebrow">CURRENT STAGE</span>
              {host && (
                <button
                  className="icon-button"
                  title="Configure agenda"
                  aria-label="Configure agenda"
                  onClick={() => setConfigure(true)}
                >
                  <Settings2 size={17} />
                </button>
              )}
            </div>
            <TimerDisplay store={store} host={host} now={now} />
            <div className="agenda-label">
              <span>THE RUN OF SHOW</span>
              <span>{Math.round(board.agenda.reduce((n, s) => n + s.seconds, 0) / 60)} min</span>
            </div>
            <div className="agenda-list">
              {board.agenda.map((s, i) => (
                <button
                  key={s.id}
                  disabled={!host}
                  className={`agenda-step ${board.timer.stage === i ? 'current' : ''} ${i < board.timer.stage ? 'past' : ''}`}
                  onClick={() =>
                    store
                      .patchBoard({
                        timer: {
                          ...board.timer,
                          stage: i,
                          remaining: s.seconds,
                          running: false,
                          startedAt: 0,
                        },
                      })
                      .catch(() => {})
                  }
                >
                  <span className="stage-number">
                    {i < board.timer.stage ? <Check size={13} /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{s.name}</span>
                  <small>{s.seconds / 60} min</small>
                  {i === board.timer.stage && <span className="stage-dot" />}
                </button>
              ))}
            </div>
            <div className="gentle-tip">
              <span>✳</span>
              <p>
                A little silence is a good thing.
                <br />
                Give everyone time to think.
              </p>
            </div>
            {!host && <p className="fine-print">Your facilitator controls the agenda and timer.</p>}
          </>
        ) : tab === 'vote' ? (
          <Voting store={store} host={host} onFocus={onFocus} />
        ) : (
          <Actions store={store} host={host} />
        )}
      </div>
      <div className="panel-footer">
        <span className="live-dot" />{' '}
        {store.connected ? 'Everyone’s on the same page.' : 'Reconnecting to your board…'}
      </div>
      {configure && <AgendaModal store={store} onClose={() => setConfigure(false)} />}
    </aside>
  );
}
export function TimerDisplay({
  store,
  host,
  now,
  compact = false,
}: {
  store: BoardStore;
  host: boolean;
  now: number;
  compact?: boolean;
}) {
  const b = store.board!,
    t = b.timer,
    stage = b.agenda[t.stage],
    remaining = remainingTime(t, now),
    ratio = Math.min(1, remaining / (stage.seconds || 1)),
    alert = remaining === 0;
  const patch = (next: Partial<TimerType>) =>
    store.patchBoard({ timer: { ...t, ...next } }).catch(() => {});
  return (
    <div
      className={`timer-widget ${compact ? 'compact-timer' : ''} ${remaining === 0 ? 'finished' : ''}`}
    >
      <h3>{stage.name}</h3>
      {t.display !== 'digital' && (
        <div
          className="time-timer"
          role="img"
          aria-label={`${clockText(remaining)} remaining in ${stage.name}`}
        >
          <span className="clock-label twelve">0</span>
          <span className="clock-label three">{stage.seconds / 240}</span>
          <span className="clock-label six">{stage.seconds / 120}</span>
          <span className="clock-label nine">{stage.seconds / 80}</span>
          <div className="clock-face">
            <div
              className="clock-disk"
              style={{
                background: `conic-gradient(from 0deg, #f4eee7 ${(1 - ratio) * 360}deg, #df6458 ${(1 - ratio) * 360}deg)`,
              }}
            />
            <span className="clock-center" />
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ transform: `rotate(${i * 30}deg)` }} />
            ))}
          </div>
        </div>
      )}
      {t.display !== 'visual' && (
        <div className="digital-timer" aria-label="Time remaining">
          {clockText(remaining)}
        </div>
      )}
      <span className="timer-status" role="status">
        {remaining === 0
          ? 'Time to wrap up'
          : t.running
            ? 'A little focus. A little progress.'
            : 'Ready when you are.'}
      </span>
      {alert && (
        <span className="sr-only" role="alert">
          Time is up for {stage.name}.
        </span>
      )}
      {host && (
        <div className="timer-controls">
          <button
            className="icon-button"
            aria-label="Reset stage timer"
            title="Reset stage"
            onClick={() => patch({ running: false, remaining: stage.seconds, startedAt: 0 })}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="primary timer-start"
            onClick={() =>
              patch(
                t.running
                  ? { running: false, remaining }
                  : {
                      running: true,
                      remaining: remaining > 0 ? remaining : stage.seconds,
                      startedAt: now,
                    },
              )
            }
          >
            {t.running ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
            {t.running ? 'Pause' : 'Start timer'}
          </button>
          <button
            className="icon-button"
            aria-label="Next stage"
            title="Next stage"
            disabled={t.stage >= b.agenda.length - 1}
            onClick={() =>
              patch({
                stage: t.stage + 1,
                running: false,
                remaining: b.agenda[t.stage + 1].seconds,
                startedAt: 0,
              })
            }
          >
            <SkipForward size={17} />
          </button>
        </div>
      )}
      {host && (
        <button
          className="add-minute text-button"
          onClick={() => patch({ remaining: Math.min(14400, remaining + 60), startedAt: now })}
        >
          <Plus size={12} /> Add a minute
        </button>
      )}
    </div>
  );
}
function AgendaModal({ store, onClose }: { store: BoardStore; onClose: () => void }) {
  const b = store.board!;
  const [stages, setStages] = useState<Stage[]>(b.agenda.map((s) => ({ ...s }))),
    [display, setDisplay] = useState(b.timer.display),
    [auto, setAuto] = useState(b.timer.autoAdvance),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Find your meeting’s rhythm."
      subtitle="Set a time box for each stage. Everyone sees the same countdown."
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await store.patchBoard({
              agenda: stages,
              timer: {
                stage: 0,
                running: false,
                remaining: stages[0].seconds,
                startedAt: 0,
                autoAdvance: auto,
                display,
              },
            });
            onClose();
          } catch {
            setBusy(false);
          }
        }}
      >
        <div className="agenda-editor">
          <div className="agenda-editor-label">
            <span>STAGE</span>
            <span>MINUTES</span>
          </div>
          {stages.map((s, i) => (
            <div className="agenda-edit-row" key={s.id}>
              <span>{i + 1}</span>
              <input
                aria-label={`Stage ${i + 1} name`}
                value={s.name}
                required
                maxLength={50}
                onChange={(e) =>
                  setStages((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <input
                aria-label={`Stage ${i + 1} minutes`}
                type="number"
                min="1"
                max="240"
                required
                value={s.seconds / 60}
                onChange={(e) =>
                  setStages((a) =>
                    a.map((x, j) => (j === i ? { ...x, seconds: Number(e.target.value) * 60 } : x)),
                  )
                }
              />
              <button
                type="button"
                className="icon-button"
                disabled={stages.length === 1}
                aria-label={`Remove stage ${i + 1}`}
                onClick={() => setStages((a) => a.filter((_, j) => i !== j))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-button"
          disabled={stages.length >= 12}
          onClick={() => setStages((a) => [...a, { id: id(), name: 'New stage', seconds: 300 }])}
        >
          <Plus size={15} />
          Add stage
        </button>
        <label>
          Timer display
          <select
            value={display}
            onChange={(e) => setDisplay(e.target.value as TimerType['display'])}
          >
            <option value="both">Visual red timer + digital clock</option>
            <option value="visual">Visual red timer</option>
            <option value="digital">Digital clock</option>
          </select>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>
            Automatically start the next stage
            <small>While the facilitator has this board open.</small>
          </span>
        </label>
        <p className="fine-print">Saving the agenda resets the timer to the first stage.</p>
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save meeting agenda'}
          <Check size={17} />
        </button>
      </form>
    </Modal>
  );
}
function Voting({
  store,
  host,
  onFocus,
}: {
  store: BoardStore;
  host: boolean;
  onFocus: (id: string) => void;
}) {
  const [budget, setBudget] = useState(3),
    [hidden, setHidden] = useState(true),
    [unique, setUnique] = useState(false),
    [busy, setBusy] = useState(false),
    [newRound, setNewRound] = useState(false);
  const r = store.round,
    counts = countVotes(store.ballots),
    sorted = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]));
  const start = async () => {
    setBusy(true);
    try {
      await store.startRound({ title: 'What should we talk about?', budget, hidden, unique });
      setNewRound(false);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  if ((!r || newRound) && host)
    return (
      <div className="voting-setup">
        <div className="panel-illustration">
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </div>
        <h3>Find what matters.</h3>
        <p className="muted">Give everyone a few votes. Find the ideas worth a conversation.</p>
        <label>
          Votes per person
          <div className="stepper">
            <button aria-label="Fewer votes" onClick={() => setBudget((b) => Math.max(1, b - 1))}>
              <Minus size={16} />
            </button>
            <b>{budget}</b>
            <button aria-label="More votes" onClick={() => setBudget((b) => Math.min(20, b + 1))}>
              <Plus size={16} />
            </button>
          </div>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>
            Keep votes hidden
            <small>Only your own votes are visible until the results are revealed.</small>
          </span>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />
          <span>
            One vote per item<small>Spread votes across different ideas.</small>
          </span>
        </label>
        <button className="primary full-width" disabled={busy} onClick={start}>
          {busy ? 'Starting…' : 'Start voting'}
          <ArrowUpRight size={17} />
        </button>
        <p className="fine-print">
          Notes, text and shapes currently on the board are included. New items wait for the next
          round.
        </p>
        {r && (
          <button className="text-button" onClick={() => setNewRound(false)}>
            Back to results
          </button>
        )}
      </div>
    );
  if (!r)
    return (
      <div className="panel-empty">
        <Eye size={32} />
        <h3>Every voice counts.</h3>
        <p>The facilitator can start a voting round when your ideas are ready.</p>
      </div>
    );
  return (
    <div className="voting-session">
      <span className={`pill ${r.state === 'open' ? 'green-pill' : ''}`}>
        {r.state === 'open' ? 'VOTING IS OPEN' : 'RESULTS ARE IN'}
      </span>
      <h3>{r.title}</h3>
      {r.state === 'open' ? (
        <>
          <div className="votes-remaining">
            <strong>{r.budget - store.mine.length}</strong>
            <span>of {r.budget} votes left</span>
          </div>
          <div className="vote-dots">
            {Array.from({ length: r.budget }, (_, i) => (
              <i key={i} className={i < store.mine.length ? 'used' : ''} />
            ))}
          </div>
          <p className="muted">
            Use the + on a note to vote. Changed your mind? Use − to take it back.
          </p>
          <div className="vote-privacy">
            {r.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            <div>
              <b>{r.hidden ? 'Your votes stay private' : 'Votes are visible'}</b>
              <small>
                {r.hidden
                  ? 'Others can’t see your choices until the reveal.'
                  : 'Everyone can see votes as they come in.'}
              </small>
            </div>
          </div>
          {store.mine.length === r.budget && (
            <p className="success">
              <CheckCircle2 size={16} />
              All votes placed. You can still change them.
            </p>
          )}
          {host && (
            <button className="primary full-width" onClick={() => store.endRound().catch(() => {})}>
              {r.hidden ? 'End & reveal results' : 'End voting'}
              <Eye size={17} />
            </button>
          )}
        </>
      ) : (
        <>
          <p className="muted">
            The most-voted ideas rise to the top. Select one to bring it into view.
          </p>
          {sorted.length ? (
            <div className="results-list">
              {sorted.map(([objectId, n], i) => (
                <button key={objectId} onClick={() => onFocus(objectId)}>
                  <span className="result-rank">{i + 1}</span>
                  <span>
                    {store.objects.find((o) => o.id === objectId)?.text ||
                      'Removed or untitled item'}
                  </span>
                  <b>{String(n)}</b>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No votes were placed in this round.</p>
          )}
          {host && (
            <button className="secondary full-width" onClick={() => setNewRound(true)}>
              <Plus size={16} />
              Start another round
            </button>
          )}
        </>
      )}
    </div>
  );
}
function Actions({ store, host }: { store: BoardStore; host: boolean }) {
  const [text, setText] = useState(''),
    [owner, setOwner] = useState(''),
    [due, setDue] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="actions-panel">
      <button
        className="secondary"
        disabled={!store.actions.length}
        onClick={() =>
          download(
            `board-${store.board?.id}-actions.csv`,
            actionsCsv(store.actions),
            'text/csv;charset=utf-8',
          )
        }
      >
        Download actions (CSV)
      </button>
      <h3>Leave with a next step.</h3>
      <p className="muted">Small, clear commitments make the difference.</p>
      <div className="action-list">
        {store.actions
          .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt)
          .map((a) => (
            <div className={`action-card ${a.done ? 'done' : ''}`} key={a.id}>
              <button
                className="action-check"
                aria-label={a.done ? 'Reopen action' : 'Complete action'}
                onClick={() => store.putAction({ ...a, done: !a.done }).catch(() => {})}
              >
                {a.done && <Check size={14} />}
              </button>
              <div>
                <p>{a.text}</p>
                <small>
                  {a.owner || 'Unassigned'}
                  {a.due && ` · ${a.due}`}
                </small>
              </div>
              {(host || a.authorId === store.uid) && (
                <button
                  className="icon-button"
                  aria-label="Delete action"
                  onClick={() => store.removeAction(a.id).catch(() => {})}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
      </div>
      <form
        className="stack action-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await store.putAction({
              id: id(),
              text: text.trim(),
              owner: owner.trim(),
              due,
              done: false,
              authorId: store.uid,
              createdAt: Date.now(),
            });
            setText('');
            setOwner('');
            setDue('');
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          What will we do?
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A small change we can try…"
            maxLength={1000}
            required
          />
        </label>
        <label>
          Who’s taking it forward?
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Name"
            maxLength={100}
          />
        </label>
        <label>
          By when? <span className="optional">(optional)</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <button className="primary full-width" disabled={busy || !text.trim()}>
          <Plus size={16} />
          Add action
        </button>
      </form>
    </div>
  );
}
