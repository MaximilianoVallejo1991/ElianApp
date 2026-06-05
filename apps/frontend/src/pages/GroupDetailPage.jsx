import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  UserIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { groupService } from '../services/api';

const BALANCE_MODE_LABELS = {
  DYNAMIC: 'Dynamic',
  STATIC: 'Static',
};

const STATUS_STYLES = {
  ACTIVE: 'bg-success/10 text-success',
  PENDING: 'bg-cta/10 text-cta',
  REMOVED: 'bg-text-muted/10 text-text-muted',
};

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGroup();
  }, [id]);

  const loadGroup = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await groupService.getById(id);
      setGroup(response.data);
    } catch (err) {
      if (err.status === 404) {
        setError('Group not found.');
      } else {
        setError(err.message || 'Failed to load group details.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
          role="status"
          aria-label="Loading group"
        />
      </div>
    );
  }

  // Error
  if (error || !group) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <p className="text-lg text-text-muted">{error || 'Group not found.'}</p>
        <Link
          to="/groups"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-secondary transition-colors duration-200 hover:text-secondary/80 hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back to groups
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate('/groups')}
          className="mb-8 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-text-muted transition-colors duration-200 hover:text-primary focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded-lg px-2 py-1 -ml-2"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back to groups
        </button>

        {/* Group header */}
        <div className="mb-10">
          <h1
            className="font-heading text-[clamp(2rem,6vw,3.5rem)] font-black leading-none tracking-[-0.05em] text-primary"
          >
            {group.name}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            {/* Currency */}
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
              <CurrencyDollarIcon className="h-4 w-4" aria-hidden="true" />
              {group.currency || 'USD'}
            </span>

            {/* Balance mode */}
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
              <ClockIcon className="h-4 w-4" aria-hidden="true" />
              {BALANCE_MODE_LABELS[group.balanceMode] || group.balanceMode || 'Dynamic'}
            </span>

            {/* Member count */}
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
              <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
              {group.members?.length || 0} member{(group.members?.length || 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Members section */}
        <section>
          <h2 className="font-heading text-xl font-bold text-primary">Members</h2>

          {(!group.members || group.members.length === 0) ? (
            <p className="mt-4 text-sm text-text-muted">No members yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-white">
              {group.members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-4 px-5 py-4 first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                    <UserIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {member.user?.nickName || member.user?.email || 'Unknown'}
                      {group.ownerId === member.userId && (
                        <span className="ml-2 inline-block rounded-full bg-cta/10 px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wider text-cta">
                          Owner
                        </span>
                      )}
                    </p>
                    {member.user?.email && member.user.nickName && (
                      <p className="truncate text-xs text-text-muted">{member.user.email}</p>
                    )}
                  </div>

                  {member.status && (
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[member.status] || 'bg-border/30 text-text-muted'
                      }`}
                    >
                      {member.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Expenses placeholder */}
        <section className="mt-12">
          <h2 className="font-heading text-xl font-bold text-primary">Expenses</h2>
          <div className="mt-4 rounded-xl border border-dashed border-border bg-white p-8 text-center">
            <p className="text-text-muted">Expenses will be available in a future update.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
