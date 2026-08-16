import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { PillButton } from '../components/PillButton';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/account');
  }

  return (
    <div className="page-enter mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Log in
      </h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          className="w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
        />
        {error ? (
          <p className="text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        ) : null}
        <PillButton type="submit" variant="solid" disabled={submitting} className="w-full text-sm">
          {submitting ? 'Logging in...' : 'Log in'}
        </PillButton>
      </form>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Don't have an account?{' '}
        <Link to="/signup" style={{ color: 'var(--green)' }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
