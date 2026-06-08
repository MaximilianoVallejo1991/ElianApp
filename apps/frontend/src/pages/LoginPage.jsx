import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { inviteService } from '../services/api';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Invite group name state
  const [inviteGroupName, setInviteGroupName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;

    async function validateToken() {
      setInviteLoading(true);
      try {
        const response = await inviteService.validateToken(inviteToken);
        setInviteGroupName(response.data.groupName);
      } catch {
        // Token invalid — show generic error
        setInviteGroupName('');
      } finally {
        setInviteLoading(false);
      }
    }

    validateToken();
  }, [inviteToken]);

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/groups" replace />;
  }

  const validate = () => {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (!password) return 'Password is required.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await login(email, password);

      // If there's an invite token, auto-join the group after login
      if (inviteToken) {
        await inviteService.acceptInvite(inviteToken);
      }

      navigate('/groups', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-10">
        {/* Header */}
        <div className="text-center">
          <h1
            className="font-heading text-[clamp(2.5rem,8vw,4.5rem)] font-black leading-none tracking-[-0.05em] text-primary"
          >
            ElianApp
          </h1>
          <p className="mt-3 text-lg text-text-muted">
            Welcome back. Sign in to your account.
          </p>
        </div>

        {/* Invite banner */}
        {inviteLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 py-4">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
              role="status"
              aria-label="Validating invite link"
            />
            <span className="text-sm text-text-muted">Validating invite link…</span>
          </div>
        )}

        {inviteGroupName && (
          <div className="rounded-xl border border-cta/30 bg-cta/5 px-5 py-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-cta" aria-hidden="true" />
              <span className="text-sm font-semibold text-cta">You're joining</span>
            </div>
            <p className="font-heading text-lg font-bold text-primary">{inviteGroupName}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Error banner */}
          {error && (
            <div
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-text">
              Email
            </label>
            <div className="relative">
              <EnvelopeIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-4 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-text">
              Password
            </label>
            <div className="relative">
              <LockClosedIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-4 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-text-muted">
          Don&apos;t have an account?{' '}
          <Link
            to={inviteToken ? `/register?invite=${inviteToken}` : '/register'}
            className="font-semibold text-secondary underline-offset-2 transition-colors duration-200 hover:text-secondary/80 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
