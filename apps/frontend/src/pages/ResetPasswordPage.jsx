import { useState } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import {
  LockClosedIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/api';

export default function ResetPasswordPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/groups" replace />;
  }

  const validate = () => {
    if (!password) return 'Password is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
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
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  // No token in URL
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="rounded-2xl border border-border bg-white p-8 shadow-xl">
            <div className="mb-4 flex justify-center">
              <ExclamationTriangleIcon className="h-12 w-12 text-warning" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-xl font-bold text-primary">Invalid reset link</h2>
            <p className="mt-3 text-sm text-text-muted">
              This reset link is missing the required token. Please request a new password reset.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              Request new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-[clamp(2.5rem,8vw,4.5rem)] font-black leading-none tracking-[-0.05em] text-primary">
            ElianApp
          </h1>
          <p className="mt-3 text-lg text-text-muted">Choose a new password</p>
        </div>

        {success ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-xl">
            <div className="mb-4 flex justify-center">
              <CheckCircleIcon className="h-12 w-12 text-success" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-xl font-bold text-primary">Password updated</h2>
            <p className="mt-3 text-sm text-text-muted">
              {t('auth.resetSuccess')}
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-cta px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-cta/90 focus:outline-none focus:ring-2 focus:ring-cta focus:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              {t('auth.signIn')}
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-white p-8 shadow-xl">
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

              {/* New password */}
              <div>
                <label
                  htmlFor="rp-password"
                  className="mb-1.5 block text-sm font-semibold text-text"
                >
                  {t('auth.newPassword')}
                </label>
                <div className="relative">
                  <LockClosedIcon
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="rp-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-4 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label
                  htmlFor="rp-confirm"
                  className="mb-1.5 block text-sm font-semibold text-text"
                >
                  {t('auth.confirmPassword')}
                </label>
                <input
                  id="rp-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full rounded-lg border border-border bg-white py-3 px-4 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
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
                    Resetting…
                  </>
                ) : (
                  t('auth.resetPassword')
                )}
              </button>
            </form>
          </div>
        )}

        {/* Back to sign in */}
        <p className="text-center text-sm text-text-muted">
          {t('auth.rememberPassword')}{' '}
          <Link
            to="/login"
            className="font-semibold text-secondary underline-offset-2 transition-colors duration-200 hover:text-secondary/80 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
