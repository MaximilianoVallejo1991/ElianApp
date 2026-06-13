import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { EnvelopeIcon, UserIcon, LockClosedIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { inviteService } from '../services/api';

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [nickName, setNickName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Invite token state
  const [inviteGroupName, setInviteGroupName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);
  const [autoJoining, setAutoJoining] = useState(false);

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;

    async function validateToken() {
      setInviteLoading(true);
      setInviteError('');
      try {
        const response = await inviteService.validateToken(inviteToken);
        setInviteGroupName(response.data.groupName);

        // If user is already logged in, auto-join the group
        if (user) {
          setAutoJoining(true);
          await inviteService.acceptInvite(inviteToken);
          navigate('/groups', { replace: true });
        }
      } catch (err) {
        setInviteError(
          err.code === 'TOKEN_EXPIRED'
            ? 'This invite link has expired.'
            : 'Invalid or expired invite link.',
        );
      } finally {
        setInviteLoading(false);
        setAutoJoining(false);
      }
    }

    validateToken();
  }, [inviteToken, user]);

  // Redirect if already logged in and not processing an invite
  if (user && !inviteToken) {
    return <Navigate to="/groups" replace />;
  }

  const validate = () => {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (!nickName.trim()) return 'Display name is required.';
    if (nickName.trim().length < 2) return 'Display name must be at least 2 characters.';
    if (!password) return 'Password is required.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // If invite token exists but is invalid, block submission
    if (inviteToken && inviteError) {
      setError(inviteError);
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await register(email, nickName.trim(), password, inviteToken);
      navigate('/groups', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
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
            Create your account and start splitting expenses.
          </p>
        </div>

        {/* Invite banner */}
        {inviteLoading && !autoJoining && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 py-4">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
              role="status"
              aria-label="Validating invite link"
            />
            <span className="text-sm text-text-muted">Validating invite link…</span>
          </div>
        )}

        {autoJoining && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 py-4">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
              role="status"
              aria-label="Joining group"
            />
            <span className="text-sm text-text-muted">Joining {inviteGroupName}…</span>
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

        {inviteError && (
          <div
            className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-center text-sm text-error"
            role="alert"
          >
            {inviteError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
            <label htmlFor="register-email" className="mb-1.5 block text-sm font-semibold text-text">
              {t('auth.email')}
            </label>
            <div className="relative">
              <EnvelopeIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="register-email"
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

          {/* Display Name */}
          <div>
            <label htmlFor="register-nickname" className="mb-1.5 block text-sm font-semibold text-text">
              {t('auth.nickname')}
            </label>
            <div className="relative">
              <UserIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="register-nickname"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                value={nickName}
                onChange={(e) => setNickName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-4 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-sm font-semibold text-text">
              {t('auth.password')}
            </label>
            <div className="relative">
              <LockClosedIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
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
                {t('auth.register')}…
              </>
            ) : (
              t('auth.register')
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-text-muted">
          {t('auth.haveAccount')}{' '}
          <Link
            to={inviteToken ? `/login?invite=${inviteToken}` : '/login'}
            className="font-semibold text-secondary underline-offset-2 transition-colors duration-200 hover:text-secondary/80 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
