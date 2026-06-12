import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  UserGroupIcon,
  ChevronRightIcon,
  CurrencyDollarIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { groupService } from '../services/api';

export default function GroupsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create-group modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState('ARS');
  const [newBalanceMode, setNewBalanceMode] = useState('STATIC');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await groupService.getAll();
      setGroups(response.data);
    } catch (err) {
      setError(err.message || 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadGroups();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!newName.trim()) {
      setCreateError('Group name is required.');
      return;
    }

    setCreateLoading(true);
    try {
      const response = await groupService.create({
        name: newName.trim(),
        currency: newCurrency,
        balanceMode: newBalanceMode,
      });
      setGroups((prev) => [...prev, response.data]);
      setShowCreate(false);
      setNewName('');
      setNewCurrency('ARS');
      setNewBalanceMode('STATIC');
      navigate(`/groups/${response.data.id}`);
    } catch (err) {
      setCreateError(err.message || 'Failed to create group.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">ElianApp</p>
            <h1
              className="font-heading text-[clamp(2rem,6vw,3.5rem)] font-black leading-none tracking-[-0.05em] text-primary"
            >
              My Groups
            </h1>
            {user && (
              <p className="mt-2 text-text-muted">
                Signed in as <span className="font-semibold text-text">{user.nickName || user.email}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              New group
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
              title="Sign out"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
              role="status"
              aria-label="Loading groups"
            />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-lg border border-error/30 bg-error/5 px-5 py-4 text-sm text-error" role="alert">
            {error}
            <button
              type="button"
              onClick={loadGroups}
              className="ml-3 font-semibold underline underline-offset-2 hover:text-error/80"
            >
              Retry
            </button>
          </div>
        )}

        {/* Group list */}
        {!loading && !error && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <UserGroupIcon className="mb-4 h-16 w-16 text-border" aria-hidden="true" />
            <p className="text-lg font-medium text-text-muted">No groups yet</p>
            <p className="mt-1 text-sm text-text-muted/70">
              Create your first group to start splitting expenses with friends.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cta px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-cta/90 focus:outline-none focus:ring-2 focus:ring-cta focus:ring-offset-2"
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              Create your first group
            </button>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => navigate(`/groups/${group.id}`)}
                className="group flex cursor-pointer flex-col rounded-xl border border-border bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-secondary/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-heading text-lg font-semibold text-text transition-colors group-hover:text-secondary">
                    {group.name}
                  </h3>
                  <ChevronRightIcon
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-text-muted/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-secondary"
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-4 flex items-center gap-4 text-sm text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CurrencyDollarIcon className="h-4 w-4" aria-hidden="true" />
                    {group.currency || 'USD'}
                  </span>
                  {group._count?.members !== undefined && (
                    <span className="inline-flex items-center gap-1.5">
                      <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
                      {group._count.members}
                    </span>
                  )}
                </div>

                {group.balanceMode && (
                  <span className="mt-3 inline-block self-start rounded-full bg-secondary/10 px-3 py-0.5 font-heading text-xs font-medium text-secondary">
                    {group.balanceMode === 'DYNAMIC' ? 'Dynamic' : 'Static'}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        </div>

        {/* Footer */}
        <footer className="pb-6 text-center">
          <p className="text-xs text-text-muted">
            &copy; {new Date().getFullYear()} SalvathorProyects. All rights reserved.
          </p>
        </footer>

      {/* Create Group Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Create new group"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <h2 className="font-heading text-2xl font-bold text-primary">New group</h2>
            <p className="mt-1 text-sm text-text-muted">
              Create a group to start tracking shared expenses.
            </p>

            <form onSubmit={handleCreate} className="mt-6 space-y-5">
              {createError && (
                <div
                  className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
                  role="alert"
                >
                  {createError}
                </div>
              )}

              <div>
                <label htmlFor="group-name" className="mb-1.5 block text-sm font-semibold text-text">
                  Group name
                </label>
                <input
                  id="group-name"
                  type="text"
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Trip to Cancun"
                  className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>

              <div>
                <label htmlFor="group-currency" className="mb-1.5 block text-sm font-semibold text-text">
                  Currency
                </label>
                <select
                  id="group-currency"
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="MXN">MXN — Mexican Peso</option>
                  <option value="COP">COP — Colombian Peso</option>
                  <option value="ARS">ARS — Argentine Peso</option>
                  <option value="CLP">CLP — Chilean Peso</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-text">
                  Balance mode
                </label>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors duration-200 hover:bg-border/20 has-[:checked]:border-secondary has-[:checked]:bg-secondary/5">
                    <input
                      type="radio"
                      name="balance-mode"
                      value="DYNAMIC"
                      checked={newBalanceMode === 'DYNAMIC'}
                      onChange={(e) => setNewBalanceMode(e.target.value)}
                      className="mt-1 h-4 w-4 text-secondary focus:ring-secondary"
                    />
                    <div>
                      <span className="text-sm font-medium text-text">Dynamic</span>
                      <p className="text-xs text-text-muted">
                        Balances update continuously. Good for casual groups and friends.
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors duration-200 hover:bg-border/20 has-[:checked]:border-secondary has-[:checked]:bg-secondary/5">
                    <input
                      type="radio"
                      name="balance-mode"
                      value="STATIC"
                      checked={newBalanceMode === 'STATIC'}
                      onChange={(e) => setNewBalanceMode(e.target.value)}
                      className="mt-1 h-4 w-4 text-secondary focus:ring-secondary"
                    />
                    <div>
                      <span className="text-sm font-medium text-text">Static</span>
                      <p className="text-xs text-text-muted">
                        Settlement periods with freeze and payment acceptance. Good for roommates and formal arrangements.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateError('');
                  }}
                  className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createLoading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Creating…
                    </>
                  ) : (
                    'Create group'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
