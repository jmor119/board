import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  MousePointer2,
  Hand,
  StickyNote,
  Type,
  Pencil,
  Highlighter,
  Square,
  Undo2,
  Redo2,
  Minus,
  Plus,
  Scan,
  Trash2,
  Copy,
  LockKeyhole,
  UnlockKeyhole,
  HelpCircle,
} from 'lucide-react';
import { objectDefaults } from './firebase';
import type { BoardObject, Presence, Round } from './types';
import { noteColors } from './templates';
import { worldPoint, zoomAt, clamp } from './domain.mjs';

type Props = {
  objects: BoardObject[];
  presence: Presence[];
  uid: string;
  host: boolean;
  round: Round | null;
  mine: string[];
  totals: Record<string, number>;
  put: (o: BoardObject) => Promise<void>;
  patch: (id: string, p: Partial<BoardObject>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  vote: (id: string, d?: number) => Promise<void>;
  cursor: (x: number, y: number) => void;
  onHelp: () => void;
};
type HistoryEntry = {
  id: string;
  before: BoardObject | null;
  after: BoardObject | null;
  fields?: Partial<BoardObject>;
};
export type CanvasHandle = { focus: (id: string) => void; fit: () => void };
type Gesture = {
  kind: 'pan' | 'move' | 'draw' | 'resize';
  sx: number;
  sy: number;
  x: number;
  y: number;
  object?: BoardObject;
  points?: number[];
  lastSent?: number;
};
const tools = [
  { id: 'select', name: 'Select (V)', Icon: MousePointer2 },
  { id: 'hand', name: 'Pan (H)', Icon: Hand },
  { id: 'note', name: 'Sticky note (N)', Icon: StickyNote },
  { id: 'text', name: 'Text (T)', Icon: Type },
  { id: 'pen', name: 'Pen (P)', Icon: Pencil },
  { id: 'marker', name: 'Marker (M)', Icon: Highlighter },
  { id: 'shape', name: 'Shape (S)', Icon: Square },
];

export default forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
  const {
    objects,
    presence,
    uid,
    host,
    round,
    mine,
    totals,
    put,
    patch,
    remove,
    vote,
    cursor,
    onHelp,
  } = props;
  const root = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    space = useRef(false),
    history = useRef<HistoryEntry[]>([]),
    future = useRef<HistoryEntry[]>([]),
    historyBusy = useRef(false);
  const [tool, setTool] = useState('select'),
    [color, setColor] = useState(noteColors[0]),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(''),
    [view, setView] = useState({ x: 0, y: 0, zoom: 0.8 }),
    [preview, setPreview] = useState<(Partial<BoardObject> & { id: string }) | null>(null),
    [historyVersion, bumpHistory] = useState(0);
  const [help, setHelp] = useState('');
  const viewRef = useRef(view);
  viewRef.current = view;
  const obj = objects.find((o) => o.id === selected),
    editable = !!obj && (!obj.locked || host);
  const fit = () => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const minX = Math.min(0, ...objects.map((o) => o.x)),
      minY = Math.min(0, ...objects.map((o) => o.y));
    const maxX = Math.max(1300, ...objects.map((o) => o.x + o.w)),
      maxY = Math.max(820, ...objects.map((o) => o.y + o.h));
    const zoom = Math.min(
      1,
      (rect.width - 100) / (maxX - minX),
      (rect.height - 80) / (maxY - minY),
    );
    setView({
      zoom,
      x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom,
    });
  };
  useImperativeHandle(ref, () => ({
    fit,
    focus(id) {
      const o = objects.find((o) => o.id === id),
        rect = root.current?.getBoundingClientRect();
      if (o && rect) {
        setSelected(id);
        setView({ zoom: 1, x: rect.width / 2 - o.x - o.w / 2, y: rect.height / 2 - o.y - o.h / 2 });
      }
    },
  }));
  const initialized = useRef(false);
  useEffect(() => {
    if (objects.length && !initialized.current) {
      initialized.current = true;
      fit();
    }
  }, [objects.length]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        setView((v) =>
          zoomAt(v, Math.exp(-e.deltaY * 0.005), e.clientX - rect.left, e.clientY - rect.top),
        );
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  function remember(entry: HistoryEntry) {
    history.current.push(entry);
    if (history.current.length > 60) history.current.shift();
    future.current = [];
    bumpHistory((v) => v + 1);
  }
  async function undo(redo = false) {
    if (historyBusy.current) return;
    const source = redo ? future.current : history.current,
      target = redo ? history.current : future.current,
      entry = source.at(-1);
    if (!entry) return;
    historyBusy.current = true;
    try {
      const desired = redo ? entry.after : entry.before;
      const current = objects.find((o) => o.id === entry.id);
      if (desired && current && entry.fields) {
        const changes: Partial<BoardObject> = {};
        for (const key of Object.keys(entry.fields) as (keyof BoardObject)[])
          (changes as Record<string, unknown>)[key] = desired[key];
        await patch(entry.id, changes);
      } else if (desired) await put({ ...desired, authorId: current?.authorId ?? uid });
      else await remove(entry.id);
      source.pop();
      target.push(entry);
      bumpHistory((v) => v + 1);
    } catch {
    } finally {
      historyBusy.current = false;
    }
  }
  async function change(p: Partial<BoardObject>) {
    if (!obj || !editable) return;
    try {
      await patch(obj.id, p);
      remember({ id: obj.id, before: obj, after: { ...obj, ...p }, fields: p });
    } catch {}
  }
  async function deleteSelected() {
    if (!obj || !editable) return;
    try {
      await remove(obj.id);
      remember({ id: obj.id, before: obj, after: null });
      setSelected(null);
      setEditing(null);
    } catch {}
  }
  async function duplicate() {
    if (!obj) return;
    const copy = objectDefaults(
      { ...obj, id: undefined, x: obj.x + 35, y: obj.y + 35, locked: false, authorId: uid },
      uid,
    );
    copy.id = crypto.randomUUID();
    try {
      await put(copy);
      remember({ id: copy.id, before: null, after: copy });
      setSelected(copy.id);
    } catch {}
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable=true],[role=dialog]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        space.current = true;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo(e.shiftKey);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        setSelected(null);
        setEditing(null);
        setTool('select');
        return;
      }
      if (e.key === 'Enter' && obj && editable && obj.type !== 'draw') {
        setDraft(obj.text);
        setEditing(obj.id);
        return;
      }
      const map: Record<string, string> = {
        v: 'select',
        h: 'hand',
        n: 'note',
        t: 'text',
        p: 'pen',
        m: 'marker',
        s: 'shape',
      };
      if (map[e.key.toLowerCase()] && !e.metaKey && !e.ctrlKey) setTool(map[e.key.toLowerCase()]);
      if (obj && editable && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const delta = e.shiftKey ? 20 : 5;
        change({
          x: obj.x + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0),
          y: obj.y + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0),
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, [obj, objects, editable, historyVersion]);
  function point(e: { clientX: number; clientY: number }) {
    return worldPoint(e.clientX, e.clientY, root.current!.getBoundingClientRect(), viewRef.current);
  }
  async function add(type: 'note' | 'text' | 'shape', x: number, y: number) {
    if (objects.length >= 400) {
      setHelp('This board is full (400 objects). Start another board or remove unused items.');
      return;
    }
    const o = objectDefaults(
      {
        type,
        x,
        y,
        color: type === 'text' ? '#2f3c35' : color,
        w: type === 'text' ? 270 : 190,
        h: type === 'text' ? 80 : 170,
        text: '',
      },
      uid,
    );
    try {
      await put(o);
      remember({ id: o.id, before: null, after: o });
      setSelected(o.id);
      if (type !== 'shape') {
        setEditing(o.id);
        setDraft('');
      }
      setTool('select');
    } catch {}
  }
  function start(e: ReactPointerEvent, object?: BoardObject, resize = false) {
    if ((e.target as HTMLElement).closest('textarea,button')) return;
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    // Keep clicks on the object: capturing on the canvas retargets dblclick
    // to the background and creates a new note instead of editing this one.
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === 'hand' || space.current || e.button === 1) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
      return;
    }
    if (tool === 'pen' || tool === 'marker') {
      const stroke = objectDefaults(
        {
          type: 'draw',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          color: color === noteColors[0] ? '#314e43' : color,
          strokeWidth: tool === 'marker' ? 16 : 3,
          points: [p.x, p.y],
        },
        uid,
      );
      gesture.current = {
        kind: 'draw',
        sx: p.x,
        sy: p.y,
        x: 0,
        y: 0,
        object: stroke,
        points: [p.x, p.y],
      };
      setPreview(stroke);
      return;
    }
    if (tool === 'note' || tool === 'text' || tool === 'shape') {
      void add(tool, p.x - 95, p.y - 60);
      return;
    }
    if (object) {
      setSelected(object.id);
      if (object.locked && !host) return;
      gesture.current = {
        kind: resize ? 'resize' : 'move',
        sx: p.x,
        sy: p.y,
        x: object.x,
        y: object.y,
        object,
        lastSent: 0,
      };
    } else {
      setSelected(null);
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
    }
  }
  function move(e: ReactPointerEvent) {
    const p = point(e);
    cursor(p.x, p.y);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      setView((v) => ({ ...v, x: g.x + e.clientX - g.sx, y: g.y + e.clientY - g.sy }));
      return;
    }
    if (g.kind === 'draw') {
      if (g.points!.length < 3900) {
        g.points!.push(p.x, p.y);
        setPreview({ ...g.object!, points: [...g.points!] });
      }
      return;
    }
    const o = g.object!;
    const changes =
      g.kind === 'resize'
        ? { w: clamp(o.w + p.x - g.sx, 80, 2000), h: clamp(o.h + p.y - g.sy, 50, 2000) }
        : {
            x: clamp(g.x + p.x - g.sx, -100000, 100000),
            y: clamp(g.y + p.y - g.sy, -100000, 100000),
          };
    setPreview({ id: o.id, ...changes });
    if (Date.now() - (g.lastSent || 0) > 120) {
      g.lastSent = Date.now();
      patch(o.id, changes).catch(() => {});
    }
  }
  async function end(e: ReactPointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    const captureTarget = e.target as Element;
    if (captureTarget.hasPointerCapture(e.pointerId))
      captureTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === 'draw') {
      const points = g.points!;
      if (points.length < 4) {
        setPreview(null);
        return;
      }
      const xs = points.filter((_, i) => i % 2 === 0),
        ys = points.filter((_, i) => i % 2 === 1),
        x = Math.min(...xs),
        y = Math.min(...ys);
      const o = {
        ...g.object!,
        x,
        y,
        w: Math.max(1, Math.max(...xs) - x),
        h: Math.max(1, Math.max(...ys) - y),
        points: points.map((n, i) => n - (i % 2 ? y : x)),
      };
      try {
        await put(o);
        remember({ id: o.id, before: null, after: o });
      } catch {}
      setPreview(null);
      return;
    }
    if (g.object && preview) {
      const { id: _id, ...changes } = preview;
      try {
        await patch(g.object.id, changes);
        remember({
          id: g.object.id,
          before: g.object,
          after: { ...g.object, ...changes },
          fields: changes,
        });
      } catch {}
      setPreview(null);
    }
  }
  const shown = [...objects].sort(
    (a, b) => Number(b.type === 'frame') - Number(a.type === 'frame') || a.createdAt - b.createdAt,
  );
  if (preview?.type === 'draw' && !objects.some((o) => o.id === preview.id))
    shown.push(preview as BoardObject);
  return (
    <div className="canvas-shell">
      <div
        ref={root}
        className={`canvas tool-${tool}`}
        onPointerDown={(e) => start(e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) void add('note', point(e).x, point(e).y);
        }}
        style={{
          backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        aria-label="Collaborative whiteboard"
      >
        <div
          className="canvas-world"
          style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})` }}
        >
          {shown.map((original) => {
            const o = preview?.id === original.id ? { ...original, ...preview } : original;
            const isSelected = selected === o.id;
            const canVote = round?.state === 'open' && round.targetIds.includes(o.id);
            return (
              <div
                key={o.id}
                data-object-id={o.id}
                className={`canvas-object object-${o.type} ${isSelected ? 'selected' : ''} ${o.locked ? 'locked' : ''}`}
                style={{
                  left: o.x,
                  top: o.y,
                  width: o.w,
                  height: o.h,
                  background: o.type === 'text' || o.type === 'draw' ? 'transparent' : o.color,
                  color: o.type === 'text' ? o.color : undefined,
                }}
                onPointerDown={(e) => start(e, o)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if ((e.target as Element).closest('textarea')) return;
                  if ((!o.locked || host) && o.type !== 'draw') {
                    setSelected(o.id);
                    setEditing(o.id);
                    setDraft(o.text);
                  }
                }}
              >
                {o.type === 'draw' ? (
                  <svg
                    width={o.w}
                    height={o.h}
                    style={{ overflow: 'visible', opacity: o.strokeWidth > 10 ? 0.5 : 1 }}
                  >
                    <polyline
                      points={o.points.reduce((s, n, i) => s + (i % 2 ? ',' : ' ') + n, '')}
                      fill="none"
                      stroke={o.color}
                      strokeWidth={o.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : editing === o.id ? (
                  <textarea
                    aria-label="Edit board text"
                    autoFocus
                    value={draft}
                    maxLength={5000}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      if (draft !== o.text) {
                        const p = { text: draft };
                        patch(o.id, p)
                          .then(() =>
                            remember({ id: o.id, before: o, after: { ...o, ...p }, fields: p }),
                          )
                          .catch(() => {});
                      }
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter'))
                        e.currentTarget.blur();
                    }}
                  />
                ) : (
                  <>
                    <div className="object-text">
                      {o.text || <span className="note-placeholder">Double-click to write</span>}
                    </div>
                    {o.type === 'frame' && (
                      <>
                        <span className="frame-subtitle">
                          {o.text === 'Start doing'
                            ? 'What could make us better?'
                            : o.text === 'Stop doing'
                              ? 'What’s getting in our way?'
                              : o.text === 'Keep doing'
                                ? 'What’s working for us?'
                                : 'Add your thoughts below'}
                        </span>
                        {o.locked && <LockKeyhole className="frame-lock" size={15} />}
                      </>
                    )}
                  </>
                )}
                {isSelected && !o.locked && o.type !== 'draw' && (
                  <span
                    className="resize-handle"
                    onPointerDown={(e) => start(e, o, true)}
                    title="Drag to resize"
                  />
                )}
                {canVote && (
                  <div className="note-vote" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                      aria-label={'Remove vote from ' + (o.text || 'note')}
                      disabled={!mine.includes(o.id)}
                      onClick={() => vote(o.id, -1).catch(() => {})}
                    >
                      <Minus size={13} />
                    </button>
                    <button
                      aria-label={'Vote for ' + (o.text || 'note')}
                      onClick={() => vote(o.id, 1).catch(() => {})}
                    >
                      <span>
                        {round.hidden ? mine.filter((v) => v === o.id).length : totals[o.id] || 0}
                      </span>
                      <Plus size={13} />
                    </button>
                  </div>
                )}
                {round &&
                  (!round.hidden || round.state === 'closed') &&
                  !!totals[o.id] &&
                  !canVote && (
                    <span className="vote-total">
                      {totals[o.id]} vote{totals[o.id] === 1 ? '' : 's'}
                    </span>
                  )}
              </div>
            );
          })}
          {presence
            .filter((p) => p.id !== uid && p.lastSeen > Date.now() - 45000)
            .map((p) => (
              <div
                key={p.id}
                className="remote-cursor"
                style={{ left: p.x, top: p.y, color: p.color }}
              >
                <MousePointer2 fill="currentColor" size={22} />
                <span style={{ background: p.color }}>{p.name}</span>
              </div>
            ))}
        </div>
      </div>
      <div className="canvas-toolbar" role="toolbar" aria-label="Whiteboard tools">
        {tools.map(({ id, name, Icon }) => (
          <button
            key={id}
            className={tool === id ? 'active' : ''}
            title={name}
            aria-label={name}
            aria-pressed={tool === id}
            onClick={() => {
              setTool(id);
              setEditing(null);
            }}
          >
            <Icon size={21} />
            {id === 'note' && <span className="tool-note-dot" />}
          </button>
        ))}
        <span className="toolbar-rule" />
        <button
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={!history.current.length}
          onClick={() => undo()}
        >
          <Undo2 size={20} />
        </button>
        <button
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          disabled={!future.current.length}
          onClick={() => undo(true)}
        >
          <Redo2 size={20} />
        </button>
      </div>
      {(tool === 'note' || tool === 'pen' || tool === 'marker' || tool === 'shape' || obj) && (
        <div className="object-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          {noteColors.map((c) => (
            <button
              key={c}
              aria-label={'Use color ' + c}
              title={c}
              className={`color-swatch ${(obj?.color || color) === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                if (obj) change({ color: c });
              }}
            />
          ))}
          {obj && (
            <>
              <span className="toolbar-rule vertical" />
              <button
                className="icon-button"
                title="Duplicate"
                aria-label="Duplicate object"
                onClick={duplicate}
              >
                <Copy size={17} />
              </button>
              {host && (
                <button
                  className="icon-button"
                  title={obj.locked ? 'Unlock' : 'Lock'}
                  aria-label={obj.locked ? 'Unlock object' : 'Lock object'}
                  onClick={() => change({ locked: !obj.locked })}
                >
                  {obj.locked ? <UnlockKeyhole size={17} /> : <LockKeyhole size={17} />}
                </button>
              )}
              <button
                className="icon-button"
                disabled={!editable}
                title="Delete"
                aria-label="Delete object"
                onClick={deleteSelected}
              >
                <Trash2 size={17} />
              </button>
            </>
          )}
        </div>
      )}
      <div className="canvas-hint">
        {tool === 'select'
          ? 'Double-click to add a note · Space + drag to pan'
          : tool === 'hand'
            ? 'Drag to explore the board'
            : tool === 'pen' || tool === 'marker'
              ? 'Draw anywhere on the board'
              : 'Click anywhere to place ' + (tool === 'note' ? 'a sticky note' : tool)}
        {help && (
          <button className="error" onClick={() => setHelp('')}>
            {help}
          </button>
        )}
      </div>
      <div className="zoom-controls">
        <button
          aria-label="Zoom out"
          onClick={() =>
            setView((v) =>
              zoomAt(v, 0.8, root.current!.clientWidth / 2, root.current!.clientHeight / 2),
            )
          }
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(view.zoom * 100)}%</span>
        <button
          aria-label="Zoom in"
          onClick={() =>
            setView((v) =>
              zoomAt(v, 1.25, root.current!.clientWidth / 2, root.current!.clientHeight / 2),
            )
          }
        >
          <Plus size={16} />
        </button>
        <span className="toolbar-rule vertical" />
        <button aria-label="Fit board to screen" title="Fit to screen" onClick={fit}>
          <Scan size={18} />
        </button>
        <button aria-label="Keyboard shortcuts" title="Help & shortcuts" onClick={onHelp}>
          <HelpCircle size={18} />
        </button>
      </div>
    </div>
  );
});
