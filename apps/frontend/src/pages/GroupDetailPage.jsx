import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  UserIcon,
  ClockIcon,
  PlusIcon,
  ArrowPathIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  LockClosedIcon,
  LockOpenIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import {
  groupService,
  balanceService,
  expenseService,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';
import ExpenseForm from '../components/ExpenseForm';
import PaymentForm from '../components/PaymentForm';
import InviteModal from '../components/InviteModal';
import ItemReportForm from '../components/ItemReportForm';

const BALANCE_MODE_LABELS = {
  DYNAMIC: 'Dynamic',
  STATIC: 'Static',
};

const CATEGORY_STYLES = {
  FOOD: 'bg-orange-100 text-orange-800',
  TRANSPORT: 'bg-blue-100 text-blue-800',
  HOUSING: 'bg-purple-100 text-purple-800',
  ENTERTAINMENT: 'bg-pink-100 text-pink-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

function formatCurrency(amount, currency = 'USD') {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num || 0);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function memberName(m) {
  if (m.user) return m.user.nickName || m.user.email || 'Unknown';
  return m.nickName || m.email || m.userId || 'Unknown';
}

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Item reporting modal state for COLLECTIVE expenses
  const [showItemModalFor, setShowItemModalFor] = useState(null);

  const loadGroup = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [groupResponse, balanceResponse] = await Promise.all([
        groupService.getById(id),
        balanceService.getBalances(id),
      ]);
      setGroup(groupResponse.data);
      setBalances(balanceResponse.data);
    } catch (err) {
      if (err.status === 404) {
        setError('Group not found.');
      } else {
        setError(err.message || 'Failed to load group details.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadGroup();
  }, [loadGroup]);

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Error
  // ------------------------------------------------------------------

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

  const members = group.members || [];
  const expenses = group.expenses || [];
  const payments = group.payments || [];
  const currency = group.currency || 'USD';
  const currentUserId = currentUser?.id;

  // Build a userId → balance map for quick lookup
  const balanceByUser = {};
  balances.forEach((b) => {
    balanceByUser[b.userId] = b.netBalance;
  });

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Look up a user's display name by userId from group members. */
  function memberNameByUserId(userId) {
    const m = members.find((mb) => mb.userId === userId);
    if (m) return memberName(m);
    return userId || 'Unknown';
  }

  /** Render a status badge for an expense. */
  function renderStatusBadge(expense) {
    const status = expense.status;

    if (status === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-cta/10 px-2.5 py-0.5 text-xs font-semibold text-cta">
          <ClockIcon className="h-3 w-3" aria-hidden="true" />
          Pending
        </span>
      );
    }

    if (status === 'MISMATCH') {
      const itemsSum = (expense.items || []).reduce(
        (s, i) => s + Number(i.amount),
        0
      );
      const discrepancy = Math.abs(
        itemsSum + Number(expense.sharedCosts) - Number(expense.total)
      );
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2.5 py-0.5 text-xs font-semibold text-error">
          <ExclamationTriangleIcon className="h-3 w-3" aria-hidden="true" />
          Mismatch ({formatCurrency(discrepancy, currency)})
        </span>
      );
    }

    if (status === 'MATCH') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
          <CheckCircleIcon className="h-3 w-3" aria-hidden="true" />
          Match
        </span>
      );
    }

    if (status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
          <CheckCircleIcon className="h-3 w-3" aria-hidden="true" />
          Completed
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-border/30 px-2.5 py-0.5 text-xs font-semibold text-text-muted">
        {status}
      </span>
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-[clamp(2rem,6vw,3.5rem)] font-black leading-none tracking-[-0.05em] text-primary break-words">
                {group.name}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
                  <CurrencyDollarIcon className="h-4 w-4" aria-hidden="true" />
                  {currency}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
                  <ClockIcon className="h-4 w-4" aria-hidden="true" />
                  {BALANCE_MODE_LABELS[group.balanceMode] || group.balanceMode || 'Dynamic'}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
                  <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-shrink-0 flex-col gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => setShowExpenseForm(true)}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:w-auto"
              >
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
                Add expense
              </button>
              <button
                type="button"
                onClick={() => setShowPaymentForm(true)}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-cta bg-white px-5 py-3 font-heading text-sm font-semibold text-cta transition-all duration-200 hover:bg-cta/5 focus:outline-none focus:ring-2 focus:ring-cta focus:ring-offset-2 sm:w-auto"
              >
                <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
                Record payment
              </button>
              {group.ownerId === currentUserId && (
                <button
                  type="button"
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-secondary bg-white px-5 py-3 font-heading text-sm font-semibold text-secondary transition-all duration-200 hover:bg-secondary/5 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 sm:w-auto"
                >
                  <UserGroupIcon className="h-5 w-5" aria-hidden="true" />
                  Invite
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ---- Members section ---- */}
        <section>
          <h2 className="font-heading text-xl font-bold text-primary">Members</h2>

          {members.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">No members yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-white">
              {members.map((member) => {
                const netBalance = balanceByUser[member.userId];
                return (
                  <li
                    key={member.userId}
                    className="flex items-center gap-4 px-5 py-4 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                      <UserIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">
                        {memberName(member)}
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

                    {netBalance !== undefined && (
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          netBalance > 0
                            ? 'bg-success/10 text-success'
                            : netBalance < 0
                              ? 'bg-error/10 text-error'
                              : 'bg-border/30 text-text-muted'
                        }`}
                      >
                        {netBalance > 0 && '+'}
                        {formatCurrency(netBalance, currency)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- Balances section ---- */}
        <section className="mt-12">
          <h2 className="font-heading text-xl font-bold text-primary">Balances</h2>

          {balances.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-white px-5 py-6 text-center">
              <BanknotesIcon className="mx-auto h-8 w-8 text-text-muted/40" aria-hidden="true" />
              <p className="mt-2 text-sm text-text-muted">
                Everyone is settled up. No balances to show.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-white">
              <ul className="divide-y divide-border">
                {balances.map((b) => (
                  <li
                    key={b.userId}
                    className="flex items-center justify-between px-5 py-4 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/5">
                        <UserIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-semibold text-text">
                        {b.user?.nickName || b.user?.email || b.userId}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        b.netBalance > 0
                          ? 'text-success'
                          : b.netBalance < 0
                            ? 'text-error'
                            : 'text-text-muted'
                      }`}
                    >
                      {b.netBalance > 0 ? '+' : ''}
                      {formatCurrency(b.netBalance, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ---- Expenses section ---- */}
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl font-bold text-primary">Expenses</h2>
            <button
              type="button"
              onClick={() => setShowExpenseForm(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-secondary transition-colors duration-200 hover:text-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded-lg px-2 py-1"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-white px-5 py-6 text-center">
              <ShoppingCartIcon className="mx-auto h-8 w-8 text-text-muted/40" aria-hidden="true" />
              <p className="mt-2 text-sm text-text-muted">
                No expenses yet. Add your first expense to start splitting.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {expenses.map((expense) => {
                const isCollective = expense.splitType === 'COLLECTIVE';
                const expenseItems = expense.items || [];
                const userItem = expenseItems.find((it) => it.userId === currentUserId);
                const hasReported = !!userItem;
                const isParticipant = (expense.participantIds || []).includes(currentUserId);
                const isCreator = expense.payerId === currentUserId || expense.createdById === currentUserId;
                const isPending = expense.status === 'PENDING';
                const isMismatch = expense.status === 'MISMATCH';
                const isLocked = expense.isLocked === true;

                // Which participants haven't reported yet
                const unreportedIds = (expense.participantIds || []).filter(
                  (pid) => !expenseItems.some((it) => it.userId === pid)
                );

                return (
                  <div
                    key={expense.id}
                    className="rounded-xl border border-border bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
                  >
                    {/* Top row: description + amount + status badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-base font-semibold text-text truncate">
                            {expense.description || 'Untitled expense'}
                          </h3>
                          {isCollective && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
                              <UserGroupIcon className="h-3 w-3" aria-hidden="true" />
                              Collective
                            </span>
                          )}
                          {renderStatusBadge(expense)}
                          {isLocked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-border/50 px-2 py-0.5 text-xs text-text-muted">
                              <LockClosedIcon className="h-3 w-3" aria-hidden="true" />
                              Locked
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 font-medium ${CATEGORY_STYLES[expense.category] || CATEGORY_STYLES.OTHER}`}
                          >
                            {expense.category
                              ? expense.category.charAt(0) + expense.category.slice(1).toLowerCase()
                              : 'Other'}
                          </span>
                          <span className="text-text-muted">
                            paid by{' '}
                            <span className="font-semibold text-text">
                              {expense.payer?.nickName || expense.payer?.email || 'Unknown'}
                            </span>
                          </span>
                          <span className="text-text-muted">·</span>
                          <span className="text-text-muted">{formatDate(expense.date || expense.createdAt)}</span>
                        </div>
                      </div>
                      <span className="flex-shrink-0 font-heading text-lg font-bold text-primary">
                        {formatCurrency(expense.amount, currency)}
                      </span>
                    </div>

                    {/* COLLECTIVE: Meta info */}
                    {isCollective && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>
                          Shared costs:{' '}
                          <span className="font-semibold text-text">
                            {formatCurrency(expense.sharedCosts, currency)}
                          </span>
                        </span>
                        <span>
                          {expenseItems.length}/{expense.participantIds?.length || 0}{' '}
                          reported
                        </span>
                      </div>
                    )}

                    {/* COLLECTIVE: Unlock button for creator */}
                    {isCollective && isCreator && isLocked && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await expenseService.unlockExpense(id, expense.id);
                              loadGroup();
                            } catch {
                              // Silently ignore
                            }
                          }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cta bg-cta/5 px-3 py-1.5 text-xs font-semibold text-cta transition-all duration-200 hover:bg-cta/10 focus:outline-none focus:ring-2 focus:ring-cta/30"
                        >
                          <LockOpenIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          Unlock for editing
                        </button>
                      </div>
                    )}

                    {/* COLLECTIVE: PENDING status - show unreported + add item form */}
                    {isCollective && isPending && !isLocked && (
                      <div className="mt-3">
                        {unreportedIds.length > 0 && (
                          <p className="mb-2 text-xs text-text-muted">
                            Waiting for:{' '}
                            {unreportedIds
                              .map((uid) => memberNameByUserId(uid))
                              .join(', ')}
                          </p>
                        )}

                        {/* Show add item form if user is participant and hasn't reported */}
                        {isParticipant && !hasReported && showItemModalFor !== expense.id && (
                          <button
                            type="button"
                            onClick={() => setShowItemModalFor(expense.id)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3.5 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-1"
                          >
                            <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Report my item
                          </button>
                        )}
                      </div>
                    )}

                    {/* COLLECTIVE: Item reporting inline form */}
                    {isCollective && showItemModalFor === expense.id && (
                      <div className="mt-3 rounded-lg border border-border bg-background p-4">
                        <p className="mb-3 text-xs font-semibold text-text">
                          {userItem ? 'Edit your item' : 'Report your item'}
                        </p>
                        <ItemReportForm
                          groupId={id}
                          expenseId={expense.id}
                          existingItem={userItem}
                          currency={currency}
                          onSuccess={() => {
                            setShowItemModalFor(null);
                            loadGroup();
                          }}
                          onCancel={() => setShowItemModalFor(null)}
                          onDelete={() => {
                            setShowItemModalFor(null);
                            loadGroup();
                          }}
                        />
                      </div>
                    )}

                    {/* COLLECTIVE: Locked notice for PENDING participants without item */}
                    {isCollective && isPending && isLocked && isParticipant && !hasReported && (
                      <div className="mt-3 rounded-md bg-cta/5 px-3 py-2 text-xs text-cta">
                        This expense is locked. The creator must unlock it before you can report.
                      </div>
                    )}

                    {/* COLLECTIVE: Reported items list */}
                    {isCollective && expenseItems.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                          Reported items
                        </p>
                        <ul className="space-y-2">
                          {expenseItems.map((item) => (
                            <li key={item.id}>
                              <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <span className="text-sm font-medium text-text">
                                    {memberNameByUserId(item.userId)}
                                  </span>
                                  {item.description && item.description !== 'mi gasto' && (
                                    <span className="ml-2 text-xs text-text-muted">
                                      — {item.description}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="font-heading text-sm font-bold text-primary">
                                    {formatCurrency(item.amount, currency)}
                                  </span>
                                  {item.userId === currentUserId && !isLocked && showItemModalFor !== expense.id && (
                                    <button
                                      type="button"
                                      onClick={() => setShowItemModalFor(expense.id)}
                                      className="cursor-pointer text-xs text-secondary transition-colors duration-200 hover:text-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded px-1 py-0.5"
                                    >
                                      Edit
                                    </button>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Non-COLLECTIVE: Split breakdown */}
                    {!isCollective && expense.splits && expense.splits.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="mb-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                          Split {expense.splitType === 'EQUAL' ? 'equally' : expense.splitType === 'PERCENTAGE' ? 'by percentage' : 'by exact amount'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {expense.splits.map((split) => (
                            <span
                              key={split.id || split.userId}
                              className="inline-flex items-center gap-1 rounded-md bg-secondary/5 px-2.5 py-1 text-xs text-text"
                            >
                              <span className="font-medium">
                                {split.user?.nickName || split.user?.email || split.userId}
                              </span>
                              <span className="font-semibold text-secondary">
                                {formatCurrency(split.amount, currency)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- Payments section ---- */}
        <section className="mt-12 mb-12">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl font-bold text-primary">Payments</h2>
            <button
              type="button"
              onClick={() => setShowPaymentForm(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-cta transition-colors duration-200 hover:text-cta/80 focus:outline-none focus:ring-2 focus:ring-cta/30 rounded-lg px-2 py-1"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Record
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-white px-5 py-6 text-center">
              <CreditCardIcon className="mx-auto h-8 w-8 text-text-muted/40" aria-hidden="true" />
              <p className="mt-2 text-sm text-text-muted">
                No payments recorded yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-white">
              <ul className="divide-y divide-border">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between px-5 py-4 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cta/10">
                        <ArrowPathIcon className="h-4 w-4 text-cta" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text">
                          <span className="font-semibold">
                            {payment.fromUser?.nickName || payment.fromUser?.email || 'Unknown'}
                          </span>
                          {' → '}
                          <span className="font-semibold">
                            {payment.toUser?.nickName || payment.toUser?.email || 'Unknown'}
                          </span>
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatDate(payment.paidAt)}
                          {payment.method ? ` · ${payment.method}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 font-heading text-sm font-bold text-cta">
                      {formatCurrency(payment.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* ---- Modals ---- */}

      {showExpenseForm && (
        <ExpenseForm
          groupId={id}
          members={members}
          currency={currency}
          currentUserId={currentUserId}
          onSuccess={loadGroup}
          onClose={() => setShowExpenseForm(false)}
        />
      )}

      {showPaymentForm && (
        <PaymentForm
          groupId={id}
          members={members}
          currency={currency}
          currentUserId={currentUserId}
          onSuccess={loadGroup}
          onClose={() => setShowPaymentForm(false)}
        />
      )}

      {showInviteModal && (
        <InviteModal
          groupId={id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}

      
