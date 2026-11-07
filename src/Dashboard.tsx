import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { query, where } from 'firebase/firestore';
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Search,
  LayoutGrid,
  Users,
  LogOut,
  LockKeyhole,
  Clock3,
  X,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import {
  auth,
  db,
  collection,
  createBoard,
  createTeam,
  logout,
  errorMessage,
  verifyEmail,
} from './firebase';
import { useLiveList } from './hooks';
import { builtins } from './templates';
import type { Board, Team, Template } from './types';
import { Empty, Logo, Modal } from './ui';
import TeamSettings from './TeamSettings';

export default function Dashboard({
  user,
  navigate,
}: {
  user: User;
  navigate: (p: string) => void;
}) {
  const [section, setSection] = useState<'boards' | 'templates' | 'team'>('boards'),
    [teamId, setTeamId] = useState(''),
    [search, setSearch] = useState(''),
    [groupFilter, setGroupFilter] = useState('*'),
    [newBoard, setNewBoard] = useState<Template | null>(null),
    [teamModal, setTeamModal] = useState(false),
    [error, setError] = useState('');
  const owned = useLiveList<Board>(
    query(collection(db, 'boards'), where('ownerId', '==', user.uid)),
    user.uid + 'owned',
  );
  const invited = useLiveList<Board>(
    user.emailVerified
      ? query(
          collection(db, 'boards'),
          where('invitedEmails', 'array-contains', user.email?.toLowerCase()),
        )
      : null,
    user.uid + 'invited' + user.emailVerified,
  );
  const ownedTeams = useLiveList<Team>(
    query(collection(db, 'teams'), where('ownerId', '==', user.uid)),
    user.uid + 'teams',
  );
  const invitedTeams = useLiveList<Team>(
    user.emailVerified
      ? query(
          collection(db, 'teams'),
          where('memberEmails', 'array-contains', user.email?.toLowerCase()),
        )
      : null,
    user.uid + 'invitedTeams' + user.emailVerified,
  );
  const teams = useMemo(
    () => [...new Map([...ownedTeams.data, ...invitedTeams.data].map((t) => [t.id, t])).values()],
    [ownedTeams.data, invitedTeams.data],
  );
  useEffect(() => {
    const invitedTeam = new URLSearchParams(location.search).get('team');
    if (invitedTeam && teams.some((t) => t.id === invitedTeam)) {
      setTeamId(invitedTeam);
      history.replaceState({}, '', location.pathname);
    }
  }, [teams]);
  const teamBoards = useLiveList<Board>(
    teamId ? query(collection(db, 'boards'), where('teamId', '==', teamId)) : null,
    'teamBoards' + teamId,
  );
  const saved = useLiveList<Template>(
    query(collection(db, 'templates'), where('ownerId', '==', user.uid)),
    user.uid + 'templates',
  );
  const boards = [
    ...new Map([...owned.data, ...invited.data, ...teamBoards.data].map((b) => [b.id, b])).values(),
  ]
    .filter(
      (b) =>
        (teamId ? b.teamId === teamId : !b.teamId) &&
        b.title.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = [...new Set(boards.map((b) => b.group || '').filter(Boolean))].sort();
  const visibleBoards = boards.filter(
    (b) => groupFilter === '*' || (b.group || '') === groupFilter,
  );
  const selectedTeam = teams.find((t) => t.id === teamId);
  const templates = [...builtins, ...saved.data];
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-select">
          <span className="workspace-icon">
            {selectedTeam?.name[0] || user.displayName?.[0] || 'Y'}
          </span>
          <div>
            <small>WORKSPACE</small>
            <select
              aria-label="Workspace"
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setGroupFilter('*');
              }}
            >
              <option value="">Personal workspace</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={13} />
        </div>
        <nav>
          <button
            className={section === 'boards' ? 'active' : ''}
            onClick={() => setSection('boards')}
          >
            <LayoutGrid size={19} />
            Your boards<span>{boards.length}</span>
          </button>
          <button
            className={section === 'templates' ? 'active' : ''}
            onClick={() => setSection('templates')}
          >
            <BookOpen size={19} />
            Templates
          </button>
          <button className={section === 'team' ? 'active' : ''} onClick={() => setSection('team')}>
            <Users size={19} />
            Your team
          </button>
          <button onClick={() => navigate('/integrations')}>
            <ArrowUpRight size={19} />
            Connect AI client
          </button>
        </nav>
        <div className="sidebar-note">
          <span>✳</span>
          <h3>
            A little better,
            <br />
            every time.
          </h3>
          <p>Make space for the conversations that move your team forward.</p>
          <button className="text-button" onClick={() => navigate('/demo')}>
            Explore a practice board <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="user-line">
          <span className="avatar">
            {(user.displayName || user.email || 'Y').slice(0, 1).toUpperCase()}
          </span>
          <div>
            <b>{user.displayName || 'Your account'}</b>
            <small>{user.email}</small>
          </div>
          <button
            className="icon-button"
            onClick={() => logout().catch((e) => setError(errorMessage(e)))}
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-top">
          <span>
            {selectedTeam?.name || 'Personal workspace'} <span className="slash">/</span>{' '}
            {section === 'boards' ? 'Your boards' : section === 'team' ? 'Your team' : 'Templates'}
          </span>
          <span className="private-label">
            <LockKeyhole size={13} />
            Private by default
          </span>
        </header>
        {!user.emailVerified && (
          <div className="notice">
            Verify your email to join private boards and teams.{' '}
            <button
              className="text-button"
              onClick={async () => {
                await verifyEmail();
                setError('Verification email sent. Open it, then refresh this page.');
              }}
            >
              Send verification email
            </button>
            <button
              className="text-button"
              onClick={async () => {
                await auth.currentUser?.reload();
                location.reload();
              }}
            >
              I’ve verified
            </button>
          </div>
        )}
        {(error || owned.error || teamBoards.error) && (
          <div className="error" role="alert">
            {error || owned.error || teamBoards.error}
            <button className="icon-button" onClick={() => setError('')} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}
        {section === 'boards' ? (
          <>
            <section className="dashboard-heading">
              <div>
                <span className="eyebrow">YOUR NEXT GOOD CONVERSATION</span>
                <h1>
                  Room to think.
                  <br />
                  <em>Space to grow.</em>
                </h1>
                <p>Bring your team together. Leave a little better.</p>
              </div>
              <button className="primary" onClick={() => setNewBoard(builtins[0])}>
                <Plus size={18} />
                New board
              </button>
            </section>
            <div className="section-heading">
              <h2>Start with a little structure</h2>
              <button className="text-button" onClick={() => setSection('templates')}>
                All templates <ArrowRight size={15} />
              </button>
            </div>
            <div className="template-grid">
              {builtins.slice(0, 3).map((t) => (
                <TemplateCard key={t.id} template={t} onClick={() => setNewBoard(t)} />
              ))}
            </div>
            <div className="section-heading boards-heading">
              <h2>
                Your boards <span className="count">{visibleBoards.length}</span>
              </h2>
              <select
                aria-label="Board group"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="*">All groups</option>
                <option value="">Ungrouped</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <div className="search">
                <Search size={17} />
                <input
                  aria-label="Search boards"
                  placeholder="Find a board…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {owned.loading ? (
              <p className="muted">Loading your boards…</p>
            ) : visibleBoards.length ? (
              <div className="board-grid">
                {visibleBoards.map((b) => (
                  <button className="board-card" key={b.id} onClick={() => navigate('/b/' + b.id)}>
                    <BoardThumbnail
                      template={templates.find((t) => t.name === b.template) || builtins[0]}
                    />
                    <div className="board-card-info">
                      <h3>{b.title}</h3>
                      {b.group && <small className="muted">{b.group}</small>}
                      <span>
                        <Clock3 size={13} />
                        {new Date(
                          b.meetingDate ? b.meetingDate + 'T12:00:00' : b.createdAt,
                        ).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                        <span className="board-access">
                          {b.publicEnabled && b.publicUntil > Date.now()
                            ? 'Meeting link open'
                            : 'Private'}
                        </span>
                      </span>
                    </div>
                    <ArrowUpRight size={17} className="card-arrow" />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title={search ? 'No matching boards.' : 'Your next retro starts here.'}
                action={
                  !search && (
                    <button className="secondary" onClick={() => setNewBoard(builtins[0])}>
                      Create your first board <Plus size={16} />
                    </button>
                  )
                }
              >
                {search
                  ? 'Try a different name.'
                  : 'Pick a template, invite your team, and make a little progress together.'}
              </Empty>
            )}
          </>
        ) : section === 'templates' ? (
          <>
            <section className="dashboard-heading">
              <div>
                <span className="eyebrow">A STARTING POINT, NOT A SCRIPT</span>
                <h1>
                  A little <em>structure.</em>
                </h1>
                <p>Make it your own. Save any board layout as a reusable template.</p>
              </div>
            </section>
            <div className="template-grid full">
              {templates.map((t) => (
                <TemplateCard key={t.id} template={t} onClick={() => setNewBoard(t)} />
              ))}
            </div>
          </>
        ) : (
          <>
            <section className="dashboard-heading">
              <div>
                <span className="eyebrow">BETTER WITH YOUR PEOPLE</span>
                <h1>
                  Your <em>team.</em>
                </h1>
                <p>A private space for the people you work with.</p>
              </div>
              <button className="primary" onClick={() => setTeamModal(true)}>
                <Plus size={17} />
                Create team
              </button>
            </section>
            {selectedTeam ? (
              <TeamSettings
                key={selectedTeam.id}
                team={selectedTeam}
                user={user}
                onError={setError}
              />
            ) : (
              <>
                <div className="team-grid">
                  {teams.map((t) => (
                    <button className="team-card" key={t.id} onClick={() => setTeamId(t.id)}>
                      <Users size={26} />
                      <h3>{t.name}</h3>
                      <p>
                        {t.memberEmails.length + 1} member{t.memberEmails.length ? 's' : ''}
                      </p>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </div>
                {!teams.length && (
                  <Empty
                    title="Good work is a team sport."
                    action={
                      <button className="secondary" onClick={() => setTeamModal(true)}>
                        Create a team <Plus size={16} />
                      </button>
                    }
                  >
                    Create a workspace and invite teammates by email. Share a board link directly.
                  </Empty>
                )}
              </>
            )}
          </>
        )}
      </main>
      {newBoard && (
        <NewBoardModal
          template={newBoard}
          templates={templates}
          teamId={teamId}
          teams={teams}
          groups={groups}
          onClose={() => setNewBoard(null)}
          navigate={navigate}
        />
      )}
      {teamModal && (
        <CreateTeamModal
          onClose={() => setTeamModal(false)}
          onCreated={(t) => {
            setTeamId(t.id);
            setTeamModal(false);
          }}
        />
      )}
    </div>
  );
}
export function BoardThumbnail({ template }: { template: Template }) {
  return (
    <div className={`board-thumbnail ${template.id === 'blank' ? 'blank' : ''}`}>
      {template.objects
        .filter((o) => o.type === 'frame')
        .slice(0, 4)
        .map((o, i) => (
          <div key={i} style={{ background: o.color }}>
            <span>{o.text}</span>
            <i />
            <i />
          </div>
        ))}
      {!template.objects.length && <Plus size={28} />}
    </div>
  );
}
function TemplateCard({ template, onClick }: { template: Template; onClick: () => void }) {
  return (
    <button className="template-card" onClick={onClick}>
      <BoardThumbnail template={template} />
      <div>
        <h3>{template.name}</h3>
        <p>{template.description || 'Your saved layout, ready for a fresh conversation.'}</p>
        <ArrowUpRight size={18} />
      </div>
    </button>
  );
}
function NewBoardModal({
  template,
  templates,
  teamId,
  teams,
  groups,
  onClose,
  navigate,
}: {
  template: Template;
  templates: Template[];
  teamId: string;
  teams: Team[];
  groups: string[];
  onClose: () => void;
  navigate: (p: string) => void;
}) {
  const [title, setTitle] = useState('Team retrospective'),
    [assignedTeam, setAssignedTeam] = useState(teamId),
    [meetingDate, setMeetingDate] = useState(new Date().toLocaleDateString('en-CA')),
    [group, setGroup] = useState(''),
    [chosen, setChosen] = useState(template.id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="A fresh board. A fresh perspective." onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const boardId = await createBoard(
              title,
              templates.find((t) => t.id === chosen)!,
              assignedTeam,
              meetingDate,
              group,
            );
            navigate('/b/' + boardId);
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        <label>
          Board name
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={140}
          />
        </label>
        <label>
          Meeting date
          <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
        </label>
        <label>
          Group
          <input
            value={group}
            maxLength={80}
            list="new-board-groups"
            placeholder="e.g. Product team or Sprint retros"
            onChange={(e) => setGroup(e.target.value)}
          />
        </label>
        <datalist id="new-board-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <label>
          Team access
          <select value={assignedTeam} onChange={(e) => setAssignedTeam(e.target.value)}>
            <option value="">Only me and invited people</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} - whole team
              </option>
            ))}
          </select>
        </label>
        <label>
          Start from
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <BoardThumbnail template={templates.find((t) => t.id === chosen)!} />
        <p className="fine-print">
          <LockKeyhole size={13} />{' '}
          {assignedTeam
            ? 'Visible to your team. Public sharing starts off.'
            : 'Private to you until you invite someone.'}
        </p>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? 'Making space…' : 'Create board'}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
function CreateTeamModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Team) => void;
}) {
  const [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Bring your people together."
      subtitle="Create a team workspace, then add members by email."
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onCreated(await createTeam(name));
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        <label>
          Team name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Product & Design"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          Create team <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
