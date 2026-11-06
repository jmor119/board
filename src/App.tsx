import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  MousePointer2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useUser } from './hooks';
import { googleLogin, emailLogin, errorMessage, guestLogin, resetPassword } from './firebase';
import { Logo, Modal } from './ui';
import Dashboard from './Dashboard';
import BoardPage from './BoardPage';

export default function App() {
  const { user, ready } = useUser();
  const [path, setPath] = useState(location.pathname),
    [login, setLogin] = useState(false);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  const navigate = (to: string) => {
    history.pushState({}, '', to);
    setPath(to);
  };
  const boardId = path.startsWith('/b/') ? path.slice(3).split('/')[0] : null;
  const demo = path === '/demo';
  if (!ready)
    return (
      <div className="loading-screen">
        <Logo />
        <span className="spinner" />
        <p>Making a little space…</p>
      </div>
    );
  return (
    <>
      {demo ? (
        <BoardPage
          key="demo"
          boardId="demo"
          demo
          user={user}
          navigate={navigate}
          onLogin={() => setLogin(true)}
        />
      ) : boardId ? (
        <>
          {user ? (
            <BoardPage
              key={`${boardId}:${user.uid}`}
              boardId={boardId}
              demo={false}
              user={user}
              navigate={navigate}
              onLogin={() => setLogin(true)}
            />
          ) : (
            <GuestGate onLogin={() => setLogin(true)} />
          )}
        </>
      ) : user && !user.isAnonymous ? (
        <Dashboard user={user} navigate={navigate} />
      ) : (
        <Landing navigate={navigate} onLogin={() => setLogin(true)} />
      )}
      {login && <LoginModal onClose={() => setLogin(false)} />}
    </>
  );
}
function GuestGate({ onLogin }: { onLogin: () => void }) {
  const [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="guest-gate">
      <Logo />
      <div className="guest-card">
        <span className="eyebrow">YOU’RE INVITED</span>
        <h1>
          Pull up a<br />
          <em>sticky note.</em>
        </h1>
        <p>Join the conversation. A public meeting link lets you participate without an account.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              sessionStorage.setItem('board-guest-name', name.trim());
              await guestLogin();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              maxLength={60}
              required
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Joining…' : 'Join the board'}
            <ArrowRight size={18} />
          </button>
        </form>
        <button className="text-button" onClick={onLogin}>
          Private board? Sign in to your account <ArrowUpRight size={15} />
        </button>
      </div>
      <p className="fine-print">Your host controls when the meeting link is open.</p>
    </main>
  );
}
function LoginModal({ onClose }: { onClose: () => void }) {
  const [create, setCreate] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={create ? 'Make room for your team.' : 'Welcome back.'}
      subtitle="Good conversations start here."
      onClose={onClose}
    >
      <button className="google-button" disabled={busy} onClick={() => run(googleLogin)}>
        <span className="google-g">G</span>Continue with Google
      </button>
      <div className="divider">
        <span>or use your email</span>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => emailLogin(email, password, create, name));
        }}
      >
        {create && (
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={create ? 'new-password' : 'current-password'}
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="success" role="status">
            {message}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'One moment…' : create ? 'Create account' : 'Sign in'}
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="login-foot">
        <button className="text-button" onClick={() => setCreate(!create)}>
          {create ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
        {!create && (
          <button
            className="text-button"
            onClick={async () => {
              if (!email) {
                setError('Enter your email first.');
                return;
              }
              try {
                await resetPassword(email);
                setMessage('If an account exists, a reset email is on its way.');
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Forgot password?
          </button>
        )}
      </div>
    </Modal>
  );
}
function Landing({ navigate, onLogin }: { navigate: (p: string) => void; onLogin: () => void }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <span className="nav-caption">A little space for better teamwork.</span>
        <button className="secondary" onClick={onLogin}>
          Sign in <ArrowUpRight size={16} />
        </button>
      </header>
      <main>
        <div className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> GOOD TEAMS KEEP GETTING BETTER
            </span>
            <h1>
              Big ideas.
              <br />
              Honest conversations.
              <br />
              <em>A better next time.</em>
            </h1>
            <p>
              Your team’s shared space to reflect, connect, and move forward. Less meeting admin.
              More of the good stuff.
            </p>
            <div className="hero-buttons">
              <button className="primary" onClick={onLogin}>
                Start a retrospective <ArrowRight size={19} />
              </button>
              <button className="text-button" onClick={() => navigate('/demo')}>
                Explore the board <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="hero-proof">
              <span>
                <Check size={15} /> Built for real-time teamwork
              </span>
              <span>
                <Check size={15} /> Guests welcome
              </span>
            </div>
          </div>
          <div className="hero-board" aria-label="Example retrospective board">
            <div className="preview-top">
              <span className="preview-dot" /> Friday team retro{' '}
              <span className="preview-badge">A little better, together</span>
            </div>
            <div className="preview-columns">
              <div>
                <b>Keep the good</b>
                <div className="paper green rotate-left">
                  More little wins,
                  <br />
                  celebrated together.<span>✦</span>
                </div>
                <div className="paper yellow">Pairing up made the tricky stuff easier.</div>
              </div>
              <div>
                <b>Try something new</b>
                <div className="paper peach rotate-right">
                  A little more focus.
                  <br />A few less meetings.
                </div>
                <div className="preview-cursor">
                  <MousePointer2 fill="currentColor" size={22} />
                  <span>Your next idea</span>
                </div>
              </div>
            </div>
            <div className="preview-timer">
              <span className="mini-timer" />
              <div>
                <b>05:00</b>
                <small>Time to reflect</small>
              </div>
              <span className="timer-bars">Ⅱ</span>
            </div>
            <div className="handwritten">Every voice belongs here. ↗</div>
          </div>
        </div>
        <div className="value-strip">
          <span>MADE FOR YOUR NEXT RETRO</span>
          <div>
            <MousePointer2 size={19} /> Think together
          </div>
          <div>
            <Clock3 size={19} /> Make time count
          </div>
          <div>
            <Sparkles size={19} /> Turn ideas into action
          </div>
          <div>
            <ShieldCheck size={19} /> Share on your terms
          </div>
        </div>
        <section className="landing-bottom">
          <span className="eyebrow">FROM “HOW DID IT GO?” TO “LET’S TRY THIS.”</span>
          <h2>A good meeting has a rhythm.</h2>
          <div className="rhythm">
            <div>
              <span>01</span>
              <h3>Make space.</h3>
              <p>Pick a template, invite your people, and give everyone a sticky note.</p>
            </div>
            <div>
              <span>02</span>
              <h3>Hear every voice.</h3>
              <p>Reflect together, vote without influence, and find what matters.</p>
            </div>
            <div>
              <span>03</span>
              <h3>Take it forward.</h3>
              <p>Time your discussion and leave with clear next steps and owners.</p>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <Logo />
        <span>Better together. One board at a time.</span>
        <button className="text-button" onClick={() => navigate('/demo')}>
          Take a look around <ArrowUpRight size={15} />
        </button>
      </footer>
    </div>
  );
}
