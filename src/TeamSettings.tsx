import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Mail, RefreshCw, Users, X } from 'lucide-react';
import { db, doc, updateDoc, errorMessage, teamInvitation } from './firebase';
import type { TeamInviteStatus } from './firebase';
import type { Team } from './types';

function deliveryText(status: TeamInviteStatus) {
  const labels = {
    never_sent: 'No invitation email sent',
    queued: 'Email queued',
    sending: 'Sending email',
    sent: 'Invitation email sent',
    failed: 'Email could not be sent',
    skipped: 'Email not sent',
    unknown: 'Delivery status unavailable',
  };
  const when = status.sentAt || status.requestedAt;
  return labels[status.delivery] + (when ? ` · ${new Date(when).toLocaleString()}` : '');
}

export default function TeamSettings({
  team,
  user,
  onError,
}: {
  team: Team;
  user: User;
  onError: (message: string) => void;
}) {
  const owner = team.ownerId === user.uid;
  const [email, setEmail] = useState(''),
    [busy, setBusy] = useState(''),
    [members, setMembers] = useState<TeamInviteStatus[]>([]),
    [loading, setLoading] = useState(owner),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [now, setNow] = useState(Date.now());
  const membershipKey = team.memberEmails.join('\n');
  async function refresh() {
    setLoading(true);
    try {
      const result = await teamInvitation('status', team.id);
      setMembers(result.members || []);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!owner) return;
    let active = true;
    async function load() {
      try {
        const result = await teamInvitation('status', team.id);
        if (active) {
          setMembers(result.members || []);
          setError('');
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [owner, team.id, membershipKey]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  async function send(address: string) {
    setBusy(address);
    setNotice('');
    setError('');
    try {
      await teamInvitation('send', team.id, address);
      setNotice(`Invitation email queued for ${address}.`);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  async function remove(address: string) {
    setBusy(address);
    try {
      await updateDoc(doc(db, 'teams', team.id), {
        memberEmails: team.memberEmails.filter((e) => e !== address),
      });
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="settings-card">
      <h2>{team.name}</h2>
      <p className="muted">
        Members sign in with the verified email below to access this team's boards.
      </p>
      {owner && (
        <>
          <p className="fine-print">
            Connected means they have a verified Board account and can access this team. It does not
            indicate whether they are online. Email sent means accepted by the email service, not
            read by the recipient.
          </p>
          <button
            className="text-button"
            onClick={() => void refresh()}
            disabled={loading || !!busy}
          >
            <RefreshCw size={15} />
            {loading ? 'Checking status…' : 'Refresh status'}
          </button>
        </>
      )}
      <div className="member-row">
        <span className="avatar">
          <Users size={17} />
        </span>
        <b>Team creator</b>
        <span className="pill">Owner</span>
      </div>
      {team.memberEmails.map((address) => {
        const status = members.find((m) => m.email === address.toLowerCase());
        const seconds = Math.max(0, Math.ceil(((status?.nextSendAt || 0) - now) / 1000));
        return (
          <div className="member-row team-member" key={address}>
            <span className="avatar">{address[0].toUpperCase()}</span>
            <div className="team-member-details">
              <span>{address}</span>
              {owner && (
                <>
                  <span
                    className={`pill ${status?.connection === 'connected' ? 'member-connected' : ''}`}
                  >
                    {!status
                      ? 'Status unavailable'
                      : status.connection === 'connected'
                        ? 'Connected'
                        : status.connection === 'unverified'
                          ? 'Email not verified'
                          : 'Not connected'}
                  </span>
                  <small>
                    {status
                      ? deliveryText(status)
                      : loading
                        ? 'Checking invitation status…'
                        : 'Use Refresh status to try again.'}
                  </small>
                </>
              )}
            </div>
            {owner && (
              <div className="team-member-actions">
                <button
                  className="secondary"
                  disabled={!!busy || loading || !user.emailVerified || seconds > 0}
                  aria-label={`${status?.requestedAt ? 'Resend invite to' : 'Send invite to'} ${address}`}
                  onClick={() => void send(address)}
                >
                  <Mail size={15} />
                  {busy === address
                    ? 'Working…'
                    : seconds
                      ? `Resend in ${seconds}s`
                      : status?.requestedAt
                        ? 'Resend invite'
                        : 'Send invite'}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${address}`}
                  disabled={!!busy}
                  onClick={() => void remove(address)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {owner && (
        <>
          {!user.emailVerified && (
            <p className="notice">Verify your email before sending team invitations.</p>
          )}
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const address = email.trim().toLowerCase();
              setBusy(address);
              setNotice('');
              setError('');
              let added = false;
              try {
                await updateDoc(doc(db, 'teams', team.id), {
                  memberEmails: [...new Set([...team.memberEmails, address])],
                });
                added = true;
                setEmail('');
                await teamInvitation('send', team.id, address);
                setNotice(`Teammate added. Invitation email queued for ${address}.`);
                await refresh();
              } catch (failure) {
                setError(
                  `${added ? 'Teammate added, but the email was not queued. Use Send invite to retry. ' : ''}${errorMessage(failure)}`,
                );
              } finally {
                setBusy('');
              }
            }}
          >
            <label className="sr-only" htmlFor="team-email">
              Teammate email
            </label>
            <input
              id="team-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!!busy}
            />
            <button className="primary" disabled={!!busy || !user.emailVerified}>
              <Mail size={16} />
              Add and send invite
            </button>
          </form>
          <p className="fine-print">
            People added before invitation emails were available will show “No invitation email
            sent”. Use Send invite for each person you want to notify.
          </p>
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
        </>
      )}
    </section>
  );
}
