import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { EnvelopeIcon, ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/api';

export default function ForgotPasswordPage() {
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/groups" replace />;
  }

  const validate = () => {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
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
      await authService.forgotPassword(email.trim());
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to request password reset. Please try again.');
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
            Reset your password
          </p>
        </div>

        {success ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-xl">
            <div className="mb-4 flex justify-center">
              <CheckCircleIcon className="h-12 w-12 text-success" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-xl font-bold text-primary">
              Check your email
            </h2>
            <p className="mt-3 text-sm text-text-muted">
              If an account with that email exists, we have sent a password reset link.
              Please check your inbox (and spam folder).
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-white p-8 shadow-xl">
              <p className="mb-6 text-sm text-text-muted">
                Enter your account email and we will send you a link to reset your password.
              </p>

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
                  <label htmlFor="fp-email" className="mb-1.5 block text-sm font-semibold text-text">
                    Email
                  </label>
                  <div className="relative">
                    <EnvelopeIcon
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                      aria-hidden="true"
                    />
                    <input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
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
                      Sending…
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>
            </div>

            {/* Back to sign in */}
            <p className="text-center text-sm text-text-muted">
              Remember your password?{' '}
              <Link
                to="/login"
                className="font-semibold text-secondary underline-offset-2 transition-colors duration-200 hover:text-secondary/80 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}