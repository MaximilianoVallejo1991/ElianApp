import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  PencilIcon,
  TrashIcon,
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
  ArchiveBoxIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import {
  groupService,
  balanceService,
  expenseService,
  paymentService,
  membershipService,
  closureService,
  periodService,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { computeSettlements } from '../utils/settlements';
import ExpenseForm from '../components/ExpenseForm';
import PaymentForm from '../components/PaymentForm';
import InviteModal from '../components/InviteModal';
import ItemReportForm from '../components/ItemReportForm';
import ConfirmDialog from '../components/ConfirmDialog';
import EditGroupModal from '../components/EditGroupModal';
import MemberManagementPanel from '../components/MemberManagementPanel';
import LanguageSwitcher from '../components/LanguageSwitcher';

const BALANCE_MODE_LABELS = {
  DYNAMIC: 'group.dynamic',
  STATIC: 'group.static',
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
  const { t } = useTranslation();

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

  // Edit/Delete modal state
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false);
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [showStartClosureConfirm, setShowStartClosureConfirm] = useState(false);

  // Actions dropdown state
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  // Pagination state for expenses
  const [expenses, setExpenses] = useState([]);
  const [hasMoreExpenses, setHasMoreExpenses] = useState(false);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseLimit] = useState(20);
  const [expensesLoading, setExpensesLoading] = useState(false);

  // Pagination state for payments
  const [payments, setPayments] = useState([]);
  const [hasMorePayments, setHasMorePayments] = useState(false);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentLimit] = useState(20);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Closure/Period state (STATIC groups only)
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [periodHistory, setPeriodHistory] = useState([]);
  const [showClosureHistory, setShowClosureHistory] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(null);
  const [periodExpenses, setPeriodExpenses] = useState({});
  const [periodPayments, setPeriodPayments] = useState({});
  const [periodBalances, setPeriodBalances] = useState({});
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureError, setClosureError] = useState('');
  const [showClosureCompleteDialog, setShowClosureCompleteDialog] = useState(false);
  const [rejectingPaymentId, setRejectingPaymentId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadGroup = useCallback(async () => {
    setLoading(true);
    setError('');
    let groupData;
    try {
      const [groupResponse, balanceResponse] = await Promise.all([
        groupService.getById(id),
        balanceService.getBalances(id),
      ]);
      groupData = groupResponse.data;
      setGroup(groupData);
      setBalances(balanceResponse.data);
    } catch (err) {
      if (err.status === 404) {
        setError('Group not found.');
      } else {
        setError(err.message || 'Failed to load group details.');
      }
      setLoading(false);
      return;
    }

    setLoading(false);

    // Load paginated expenses and payments (first page)
    try {
      const [expenseRes, paymentRes] = await Promise.all([
        expenseService.getAll(id, { limit: expenseLimit, offset: 0 }),
        paymentService.getAll(id, { limit: paymentLimit, offset: 0 }),
      ]);
      setExpenses(expenseRes.data.data || []);
      setHasMoreExpenses(expenseRes.data.hasMore || false);
      setExpensePage(1);
      setPayments(paymentRes.data.data || []);
      setHasMorePayments(paymentRes.data.hasMore || false);
      setPaymentPage(1);
    } catch {
      // Silently ignore pagination load failures
    }

    // Load period info for STATIC groups
    if (groupData?.balanceMode === 'STATIC') {
      try {
        const periodsRes = await periodService.list(id);
        const periods = periodsRes.data || [];
        const current = periods.find((p) => p.isCurrent);
        setCurrentPeriod(current || null);
        setPeriodHistory(periods.filter((p) => p.settlementComplete).reverse());
      } catch {
        // Silently ignore period load failures
      }
    }
  }, [id, expenseLimit, paymentLimit]);

  const handleLoadMoreExpenses = useCallback(async () => {
    setExpensesLoading(true);
    const nextPage = expensePage + 1;
    const offset = (nextPage - 1) * expenseLimit;
    try {
      const response = await expenseService.getAll(id, { limit: expenseLimit, offset });
      const { data, hasMore } = response.data;
      setExpenses((prev) => [...prev, ...data]);
      setHasMoreExpenses(hasMore);
      setExpensePage(nextPage);
    } catch {
      // Silently ignore load failures
    } finally {
      setExpensesLoading(false);
    }
  }, [id, expensePage, expenseLimit]);

  // ---- Expense edit/delete handlers ----

  const handleEditExpense = (expense) => {
    setEditingExpense(expense);
    setShowExpenseForm(true);
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpenseId) return;
    try {
      await expenseService.delete(id, deletingExpenseId);
      setExpenses((prev) => prev.filter((e) => e.id !== deletingExpenseId));
    } catch (err) {
      alert(err.message || 'Failed to delete expense.');
    } finally {
      setDeletingExpenseId(null);
    }
  };

  // ---- Payment delete handlers ----

  const handleDeletePayment = async () => {
    if (!deletingPaymentId) return;
    try {
      await paymentService.delete(id, deletingPaymentId);
      setPayments((prev) => prev.filter((p) => p.id !== deletingPaymentId));
    } catch (err) {
      alert(err.message || 'Failed to delete payment.');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // ---- Member management handlers ----

  const handleRemoveMember = async (userId) => {
    await membershipService.remove(id, userId);
    loadGroup();
  };

  const handleFreezeMember = async (userId) => {
    await membershipService.freeze(id, userId);
    loadGroup();
  };

  const handleUnfreezeMember = async (userId) => {
    await membershipService.unfreeze(id, userId);
    loadGroup();
  };

  // ---- Leave group handlers ----

  const handleLeaveGroup = async () => {
    try {
      await membershipService.leave(id);
      navigate('/groups', { replace: true });
    } catch (err) {
      alert(err.message || 'Failed to leave group.');
    } finally {
      setShowLeaveGroupConfirm(false);
    }
  };

  // ---- Closure handlers (STATIC groups) ----

  const handleStartClosure = async () => {
    setClosureLoading(true);
    setClosureError('');
    try {
      await closureService.start(id);
      await loadGroup();
    } catch (err) {
      setClosureError(err.message || 'Failed to start closure.');
    } finally {
      setClosureLoading(false);
    }
  };

  const handleCompleteClosure = async (type) => {
    setClosureLoading(true);
    setClosureError('');
    try {
      if (type === 'partial') {
        await closureService.partial(id);
      } else {
        await closureService.final(id);
      }
      setShowClosureCompleteDialog(false);
      await loadGroup();
    } catch (err) {
      setClosureError(err.message || 'Failed to complete closure.');
    } finally {
      setClosureLoading(false);
    }
  };

  const handleAcceptPayment = async (paymentId) => {
    try {
      await paymentService.accept(id, paymentId);
      await loadGroup();
    } catch (err) {
      alert(err.message || 'Failed to accept payment.');
    }
  };

  const handleRejectPayment = async () => {
    if (!rejectingPaymentId) return;
    try {
      await paymentService.reject(id, rejectingPaymentId, rejectReason);
      setRejectingPaymentId(null);
      setRejectReason('');
      await loadGroup();
    } catch (err) {
      alert(err.message || 'Failed to reject payment.');
    }
  };

  // ---- Period history handlers ----

  const handleExpandPeriod = async (periodId) => {
    if (expandedPeriod === periodId) {
      setExpandedPeriod(null);
      return;
    }
    setExpandedPeriod(periodId);

    // Fetch expenses, payments, and balances for this period if not already loaded
    if (!periodExpenses[periodId]) {
      try {
        const [expRes, payRes, balRes] = await Promise.all([
          periodService.getExpenses(id, periodId),
          periodService.getPayments(id, periodId),
          periodService.getBalances(id, periodId),
        ]);
        setPeriodExpenses((prev) => ({ ...prev, [periodId]: expRes.data || [] }));
        setPeriodPayments((prev) => ({ ...prev, [periodId]: payRes.data || [] }));
        setPeriodBalances((prev) => ({ ...prev, [periodId]: balRes.data?.balances || [] }));
      } catch {
        // Silently ignore
      }
    }
  };

  // ---- Delete group handlers ----

  const handleDeleteGroup = async () => {
    try {
      await groupService.delete(id);
      navigate('/groups', { replace: true });
    } catch (err) {
      alert(err.message || 'Failed to delete group.');
    } finally {
      setShowDeleteGroupConfirm(false);
    }
  };

  const handleLoadMorePayments = useCallback(async () => {
    setPaymentsLoading(true);
    const nextPage = paymentPage + 1;
    const offset = (nextPage - 1) * paymentLimit;
    try {
      const response = await paymentService.getAll(id, { limit: paymentLimit, offset });
      const { data, hasMore } = response.data;
      setPayments((prev) => [...prev, ...data]);
      setHasMorePayments(hasMore);
      setPaymentPage(nextPage);
    } catch {
      // Silently ignore load failures
    } finally {
      setPaymentsLoading(false);
    }
  }, [id, paymentPage, paymentLimit]);

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
          {t('nav.backToGroups')}
        </Link>
      </div>
    );
  }

  const members = group.members || [];
  const currency = group.currency || 'USD';
  const currentUserId = currentUser?.id;

  // Build a userId → balance map for quick lookup
  const balanceByUser = {};
  balances.forEach((b) => {
    balanceByUser[b.userId] = b.netBalance;
  });

  // Build a userId → total spent map (sum of their split shares across all expenses)
  const totalSpentByUser = {};
  expenses.forEach((exp) => {
    exp.splits?.forEach((split) => {
      if (split.userId) {
        totalSpentByUser[split.userId] = (totalSpentByUser[split.userId] || 0) + Number(split.amount);
      }
    });
  });

  // Check if all payments in CLOSING period are settled and balances are zero (for STATIC groups)
  const isClosing = currentPeriod?.status === 'CLOSING';
  const pendingPayments = isClosing ? payments.filter((p) => p.status === 'PENDING') : [];
  const rejectedPayments = isClosing ? payments.filter((p) => p.status === 'REJECTED') : [];
  const acceptedPayments = isClosing ? payments.filter((p) => p.status === 'ACCEPTED') : [];
  const allBalancesZero = balances.every((b) => Math.abs(b.netBalance) < 0.01);
  const readyForClosure = isClosing
    && pendingPayments.length === 0
    && acceptedPayments.length > 0
    && allBalancesZero;

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
          {t('expense.pending')}
        </span>
      );
    }

    if (status === 'MISMATCH') {
      const itemsSum = (expense.items || []).reduce(
        (s, i) => s + Number(i.amount),
        0
      );
      const discrepancy = Math.abs(
        itemsSum + Number(expense.sharedCosts) - Number(expense.amount)
      );
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-error/10 px-2.5 py-0.5 text-xs font-semibold text-error">
          <ExclamationTriangleIcon className="h-3 w-3" aria-hidden="true" />
          {t('expense.mismatchWithAmount', { amount: formatCurrency(discrepancy, currency) })}
        </span>
      );
    }

    if (status === 'MATCH') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
          <CheckCircleIcon className="h-3 w-3" aria-hidden="true" />
          {t('expense.completed')}
        </span>
      );
    }

    if (status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
          <CheckCircleIcon className="h-3 w-3" aria-hidden="true" />
          {t('expense.completed')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-border/30 px-2.5 py-0.5 text-xs font-semibold text-text-muted">
        {status}
      </span>
    );
  }

  /**
   * Render the payments section — reused in two positions:
   * elevated (after Settlement Period during CLOSING) and normal (for DYNAMIC groups).
   */
  const renderPayments = (sectionClasses) => (
    <section className={sectionClasses}>
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-primary">{t('group.payments')}</h2>
        {(group.balanceMode !== 'STATIC' || currentPeriod?.status === 'CLOSING') && (
          <button
            type="button"
            onClick={() => setShowPaymentForm(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-cta transition-colors duration-200 hover:text-cta/80 focus:outline-none focus:ring-2 focus:ring-cta/30 rounded-lg px-2 py-1"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {t('payment.record')}
          </button>
        )}
      </div>

      {payments.length === 0 && (
        <div className="mt-4 rounded-xl border border-border bg-white px-5 py-6 text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 text-text-muted/40" aria-hidden="true" />
          <p className="mt-2 text-sm text-text-muted">
            {group.balanceMode === 'STATIC' && currentPeriod?.status !== 'CLOSING' && (
              currentPeriod?.status === 'OPEN' ? t('group.noPaymentsOpen')
                : currentPeriod?.status === 'CLOSED' ? t('group.noPaymentsClosed')
                  : t('group.noPaymentsFinal')
            )}
            {(group.balanceMode !== 'STATIC' || currentPeriod?.status === 'CLOSING') && (
              t('group.noPaymentsClosing')
            )}
          </p>
        </div>
      )}

      {payments.length > 0 && (<>
        <div className="mt-4 rounded-xl border border-border bg-white">
          <ul className="divide-y divide-border">
            {payments.map((payment) => {
              const isSender = payment.fromUserId === currentUserId;
              const isReceiver = payment.toUserId === currentUserId;
              const isGroupOwner = group.ownerId === currentUserId;
              const canDeletePayment = isSender || isGroupOwner;
              const isPending = payment.status === 'PENDING';
              const isAccepted = payment.status === 'ACCEPTED';
              const isRejected = payment.status === 'REJECTED';

              return (
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
                        {isClosing && (
                          <span className="ml-2">
                            {isPending && <span className="text-warning">· {t('payment.pending')}</span>}
                            {isAccepted && <span className="text-success">· {t('payment.accepted')}</span>}
                            {isRejected && <span className="text-error">· {t('payment.rejected')}</span>}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="font-heading text-sm font-bold text-cta">
                      {formatCurrency(payment.amount, currency)}
                    </span>
                    {isClosing && isReceiver && isPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAcceptPayment(payment.id)}
                          className="cursor-pointer rounded p-1 text-success transition-colors duration-200 hover:bg-success/10 focus:outline-none focus:ring-2 focus:ring-success/30"
                          aria-label="Accept payment"
                        >
                          <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingPaymentId(payment.id);
                            setRejectReason('');
                          }}
                          className="cursor-pointer rounded p-1 text-error transition-colors duration-200 hover:bg-error/10 focus:outline-none focus:ring-2 focus:ring-error/30"
                          aria-label="Reject payment"
                        >
                          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                    {canDeletePayment && !isClosing && (
                      <button
                        type="button"
                        onClick={() => setDeletingPaymentId(payment.id)}
                        className="cursor-pointer rounded p-1 text-text-muted transition-colors duration-200 hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/30"
                        aria-label="Delete payment"
                      >
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {hasMorePayments && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleLoadMorePayments}
              disabled={paymentsLoading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-cta transition-all duration-200 hover:bg-cta/5 focus:outline-none focus:ring-2 focus:ring-cta/30 disabled:opacity-50"
            >
              {paymentsLoading ? t('common.loading') : t('payment.loadMore')}
            </button>
          </div>
        )}
      </>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Top bar: back link + language switcher */}
        <div className="mb-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-text-muted transition-colors duration-200 hover:text-primary focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded-lg px-2 py-1 -ml-2"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            {t('nav.backToGroups')}
          </button>
          <LanguageSwitcher />
        </div>

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
                  {t(BALANCE_MODE_LABELS[group.balanceMode] || 'group.dynamic')}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/5 px-3 py-1.5 text-sm font-medium text-secondary">
                  <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
                  {t('group.members', { count: members.length })}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-shrink-0 flex-col gap-2 sm:items-end">
              {/* Hide Add expense during CLOSING for STATIC groups */}
              {(group.balanceMode !== 'STATIC' || currentPeriod?.status !== 'CLOSING') && (
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(true)}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:w-auto"
                >
                  <PlusIcon className="h-5 w-5" aria-hidden="true" />
                  {t('group.addExpense')}
                </button>
              )}
              {/* Show Record payment for DYNAMIC groups, or STATIC groups during CLOSING */}
              {(group.balanceMode !== 'STATIC' || currentPeriod?.status === 'CLOSING') && (
                <button
                  type="button"
                  onClick={() => setShowPaymentForm(true)}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-cta bg-white px-5 py-3 font-heading text-sm font-semibold text-cta transition-all duration-200 hover:bg-cta/5 focus:outline-none focus:ring-2 focus:ring-cta focus:ring-offset-2 sm:w-auto"
                >
                  <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
                  {t('group.recordPayment')}
                </button>
              )}
              {group.ownerId === currentUserId && (
                <>
                  {/* Actions dropdown — all admin actions in one place */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowActionsMenu((prev) => !prev)}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-3 font-heading text-sm font-semibold text-text-muted transition-all duration-200 hover:bg-border/50 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 sm:w-auto"
                    >
                      <Cog6ToothIcon className="h-5 w-5" aria-hidden="true" />
                      {t('group.actions')}
                      <ChevronDownIcon
                        className={`h-4 w-4 transition-transform duration-200 ${showActionsMenu ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>

                    {showActionsMenu && (
                      <>
                        {/* Invisible backdrop */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowActionsMenu(false)}
                        />
                        <div
                          className="absolute right-0 top-full z-50 mt-1.5 w-52 origin-top-right rounded-xl border border-border bg-white py-1.5 shadow-xl transition-all duration-200"
                          role="menu"
                        >
                          {/* Manage members */}
                          <button
                            type="button"
                            onClick={() => { setShowMemberManagement(true); setShowActionsMenu(false); }}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-text transition-colors duration-150 hover:bg-border/30"
                            role="menuitem"
                          >
                            <UserGroupIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                            {t('group.manageMembers')}
                          </button>

                          {/* Invite members */}
                          <button
                            type="button"
                            onClick={() => { setShowInviteModal(true); setShowActionsMenu(false); }}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-text transition-colors duration-150 hover:bg-border/30"
                            role="menuitem"
                          >
                            <UserGroupIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                            {t('group.inviteMembers')}
                          </button>

                          {/* Start Closure — only when period is OPEN */}
                          {group.balanceMode === 'STATIC' && currentPeriod?.status === 'OPEN' && (
                            <button
                              type="button"
                              onClick={() => { setShowStartClosureConfirm(true); setShowActionsMenu(false); }}
                              className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-text transition-colors duration-150 hover:bg-border/30"
                              role="menuitem"
                            >
                              <LockClosedIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                              {t('group.startClosure')}
                            </button>
                          )}

                          <hr className="mx-3 my-1.5 border-border" />

                          {/* Edit group */}
                          <button
                            type="button"
                            onClick={() => { setShowEditGroup(true); setShowActionsMenu(false); }}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-text transition-colors duration-150 hover:bg-border/30"
                            role="menuitem"
                          >
                            <PencilIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                            {t('group.editGroup')}
                          </button>

                          {/* Delete group */}
                          <button
                            type="button"
                            onClick={() => { setShowDeleteGroupConfirm(true); setShowActionsMenu(false); }}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-error transition-colors duration-150 hover:bg-error/5"
                            role="menuitem"
                          >
                            <TrashIcon className="h-4 w-4" aria-hidden="true" />
                            {t('group.deleteGroup')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
              {group.ownerId !== currentUserId && (
                <button
                  type="button"
                  onClick={() => setShowLeaveGroupConfirm(true)}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-cta bg-white px-5 py-3 font-heading text-sm font-semibold text-cta transition-all duration-200 hover:bg-cta/5 focus:outline-none focus:ring-2 focus:ring-cta focus:ring-offset-2 sm:w-auto"
                >
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
                  {t('group.leaveGroup')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ---- Closure section (STATIC groups only) — compact ---- */}
        {group.balanceMode === 'STATIC' && currentPeriod && (
          <div className="mt-6 mb-4 rounded-lg border border-border bg-white px-4 py-3">
            {/* Row 1: Title + status badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <LockClosedIcon className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-text">{t('settlement.period')}</span>
              </div>
              <span
                className={`inline-block flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${currentPeriod.status === 'OPEN'
                  ? 'bg-success/10 text-success'
                  : currentPeriod.status === 'CLOSING'
                    ? 'bg-warning/10 text-warning'
                    : currentPeriod.status === 'CLOSED'
                      ? 'bg-border/30 text-text-muted'
                      : 'bg-error/10 text-error'
                  }`}
              >
                {t(`settlement.status${currentPeriod.status}`)}
              </span>
            </div>

            {/* Row 2: Status description */}
            <p className="mt-1 text-xs text-text-muted">
              {currentPeriod.status === 'OPEN' && t('settlement.open')}
              {currentPeriod.status === 'CLOSING' && t('settlement.closing')}
              {currentPeriod.status === 'CLOSED' && t('settlement.closed')}
              {currentPeriod.status === 'FINAL' && t('settlement.final')}
            </p>

            {/* Row 3: Partial / Final buttons (CLOSING + owner + ready) */}
            {currentPeriod.status === 'CLOSING' && readyForClosure && group.ownerId === currentUserId && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCompleteClosure('partial')}
                  disabled={closureLoading}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-secondary bg-white px-3 py-1.5 text-xs font-semibold text-secondary transition-all duration-200 hover:bg-secondary/5 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50"
                >
                  <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {closureLoading ? '...' : t('group.partialClosure')}
                </button>
                <button
                  type="button"
                  onClick={() => handleCompleteClosure('final')}
                  disabled={closureLoading}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-error bg-white px-3 py-1.5 text-xs font-semibold text-error transition-all duration-200 hover:bg-error/5 focus:outline-none focus:ring-2 focus:ring-error/30 disabled:opacity-50"
                >
                  <ArchiveBoxIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {closureLoading ? '...' : t('group.finalClosure')}
                </button>
              </div>
            )}

            {/* Status messages for CLOSING period (shown to all) */}
            {currentPeriod.status === 'CLOSING' && (
              <div className="mt-2 text-xs">
                {payments.length === 0 && (
                  <p className="text-text-muted">{t('group.noPayments')}</p>
                )}
                {pendingPayments.length > 0 && (
                  <p className="text-warning">
                    {t('payment.paymentsWaiting', { count: pendingPayments.length })}
                  </p>
                )}
                {pendingPayments.length === 0 && !allBalancesZero && (
                  <p className="text-error">{t('payment.balancesNotSettled')}</p>
                )}
                {pendingPayments.length === 0 && allBalancesZero && acceptedPayments.length === 0 && (
                  <p className="text-text-muted">{t('payment.noPaymentsNeeded')}</p>
                )}
              </div>
            )}

            {/* Closure error */}
            {closureError && (
              <div className="mt-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error" role="alert">
                {closureError}
              </div>
            )}
          </div>
        )}

        {/* ---- Payments section (elevated during CLOSING) ---- */}
        {group.balanceMode === 'STATIC' && currentPeriod?.status === 'CLOSING' && renderPayments('mt-12 mb-12')}

        {/* ---- Members section ---- */}
        <section className="mb-4">
          <h2 className="font-heading text-xl font-bold text-primary">{t('group.members')}</h2>

          {members.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">{t('group.noMembers')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-white">
              {members.map((member) => {
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
                            {t('member.owner')}
                          </span>
                        )}
                        {member.isFrozen && (
                          <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                            {t('member.frozen')}
                          </span>
                        )}
                      </p>
                      {member.user?.email && member.user.nickName && (
                        <p className="truncate text-xs text-text-muted">{member.user.email}</p>
                      )}
                    </div>

                    {totalSpentByUser[member.userId] !== undefined && (
                      <span
                        className="inline-block rounded-full bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-text-muted"
                      >
                        {t('group.spent')} {formatCurrency(totalSpentByUser[member.userId], currency)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- Balances / Settlement section ---- */}
        <section className="mb-4">
          <h2 className="font-heading text-xl font-bold text-primary">{t('group.balances')}</h2>

          {balances.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-white px-5 py-6 text-center">
              <BanknotesIcon className="mx-auto h-8 w-8 text-text-muted/40" aria-hidden="true" />
              <p className="mt-2 text-sm text-text-muted">
                {t('group.noBalances')}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {(() => {
                const settlements = computeSettlements(balances);
                const allSettled = settlements.length === 0;

                if (allSettled) {
                  return (
                    <div className="rounded-xl border border-success/20 bg-success/5 px-5 py-6 text-center">
                      <CheckCircleIcon className="mx-auto h-8 w-8 text-success" aria-hidden="true" />
                      <p className="mt-2 text-sm font-semibold text-success">
                        {t('balance.allSettled')}
                      </p>
                    </div>
                  );
                }

                return (
                  <>
                    {/* Settlement transactions */}
                    <div className="rounded-xl border border-border bg-white">
                      <ul className="divide-y divide-border">
                        {settlements.map((s, idx) => (
                          <li key={idx} className="flex items-center justify-between px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-error/10">
                                <ArrowTrendingUpIcon className="h-4 w-4 text-error rotate-90" aria-hidden="true" />
                              </div>
                              <div className="text-sm">
                                <span className="font-semibold text-error">
                                  {s.from.nickName || s.from.email}
                                </span>
                                <span className="mx-2 text-text-muted">paga</span>
                                <span className="font-semibold text-success">
                                  {s.to.nickName || s.to.email}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-text">
                              {formatCurrency(s.amount, currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Summary: who receives what */}
                    <div className="rounded-xl border border-border bg-white px-5 py-3">
                      <p className="text-xs text-text-muted mb-2">Saldos netos</p>
                      <ul className="space-y-1">
                        {balances.map((b) => {
                          const isPositive = b.netBalance > 0;
                          const isNegative = b.netBalance < 0;
                          return (
                            <li key={b.userId} className="flex items-center justify-between text-sm">
                              <span className="font-medium text-text">
                                {b.user?.nickName || b.user?.email || b.userId}
                              </span>
                              <span className={`font-semibold ${isPositive ? 'text-success' : isNegative ? 'text-error' : 'text-text-muted'
                                }`}>
                                {isPositive ? '+' : ''}{formatCurrency(b.netBalance, currency)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </section>

        {/* ---- Expenses section ---- */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl font-bold text-primary">{t('group.expenses')}</h2>
            <button
              type="button"
              onClick={() => setShowExpenseForm(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-secondary transition-colors duration-200 hover:text-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded-lg px-2 py-1"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              {t('expense.add')}
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-white px-5 py-6 text-center">
              <ShoppingCartIcon className="mx-auto h-8 w-8 text-text-muted/40" aria-hidden="true" />
              <p className="mt-2 text-sm text-text-muted">
                {t('group.noExpenses')}
              </p>
            </div>
          ) : (<>
            <div className="mt-4 space-y-3">
              {expenses.map((expense) => {
                const isCollective = expense.splitType === 'COLLECTIVE';
                const expenseItems = expense.items || [];
                const userItem = expenseItems.find((it) => it.userId === currentUserId);
                const hasReported = !!userItem;
                const isParticipant = (expense.participantIds || []).includes(currentUserId);
                const isCreator = expense.payerId === currentUserId || expense.createdById === currentUserId;
                const isGroupOwner = group.ownerId === currentUserId;
                const canEditExpense = isCreator;
                const canDeleteExpense = isCreator || isGroupOwner;
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
                            {expense.description || t('expense.untitled')}
                          </h3>
                          {isCollective && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
                              <UserGroupIcon className="h-3 w-3" aria-hidden="true" />
                              {t('expense.collective')}
                            </span>
                          )}
                          {renderStatusBadge(expense)}
                          {isLocked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-border/50 px-2 py-0.5 text-xs text-text-muted">
                              <LockClosedIcon className="h-3 w-3" aria-hidden="true" />
                              {t('expense.locked')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 font-medium ${CATEGORY_STYLES[expense.category] || CATEGORY_STYLES.OTHER}`}
                          >
                            {t(`expense.categories.${expense.category}`)}
                          </span>
                          <span className="text-text-muted">
                            {t('expense.paidBy')}{' '}
                            <span className="font-semibold text-text">
                              {expense.payer?.nickName || expense.payer?.email || 'Unknown'}
                            </span>
                          </span>
                          <span className="text-text-muted">·</span>
                          <span className="text-text-muted">{formatDate(expense.date || expense.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className="font-heading text-lg font-bold text-primary">
                          {formatCurrency(expense.amount, currency)}
                        </span>
                        <div className="flex items-center gap-1">
                          {canEditExpense && (
                            <button
                              type="button"
                              onClick={() => handleEditExpense(expense)}
                              className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-secondary transition-colors duration-200 hover:bg-secondary/10 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                              aria-label="Edit expense"
                            >
                              <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {canDeleteExpense && (
                            <button
                              type="button"
                              onClick={() => setDeletingExpenseId(expense.id)}
                              className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-error transition-colors duration-200 hover:bg-error/10 focus:outline-none focus:ring-2 focus:ring-error/30"
                              aria-label="Delete expense"
                            >
                              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* COLLECTIVE: Meta info */}
                    {isCollective && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>
                          {t("expense.sharedCosts")}:{' '}
                          <span className="font-semibold text-text">
                            {formatCurrency(expense.sharedCosts, currency)}
                          </span>
                        </span>
                        <span>
                          {expenseItems.length}/{expense.participantIds?.length || 0}{' '}
                          {t("expense.reported")}
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
                          {t("expense.unlockString")}
                        </button>
                      </div>
                    )}

                    {/* COLLECTIVE: PENDING/MISMATCH status - show unreported + add item form */}
                    {isCollective && (isPending || isMismatch) && !isLocked && (
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
                            {t('expense.reportItem')}
                          </button>
                        )}
                      </div>
                    )}

                    {/* COLLECTIVE: Item reporting inline form */}
                    {isCollective && showItemModalFor === expense.id && (
                      <div className="mt-3 rounded-lg border border-border bg-background p-4">
                        <p className="mb-3 text-xs font-semibold text-text">
                          {userItem ? t('expense.editItem') : t('expense.reportItem')}
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

                    {/* COLLECTIVE: Locked notice for participants without item */}
                    {isCollective && (isPending || isMismatch) && isLocked && isParticipant && !hasReported && (
                      <div className="mt-3 rounded-md bg-cta/5 px-3 py-2 text-xs text-cta">
                        This expense is locked. The creator must unlock it before you can report.
                      </div>
                    )}

                    {/* COLLECTIVE: Reported items list */}
                    {isCollective && expenseItems.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                          {t("expense.reportedItems")}
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
                                      {t('expense.edit')}
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
                          {expense.splitType === 'EQUAL' ? t('expense.splitByEqual') : t('expense.splitByPercentage')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {expense.splits.map((split) => {
                            const pct = split.percentage
                              ? Number(split.percentage).toFixed(0)
                              : null;
                            return (
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
                                {pct && (
                                  <span className="text-text-muted">({pct}%)</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {hasMoreExpenses && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={handleLoadMoreExpenses}
                  disabled={expensesLoading}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-secondary transition-all duration-200 hover:bg-secondary/5 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50"
                >
                  {expensesLoading ? t('common.loading') : t('expense.loadMore')}
                </button>
              </div>
            )}
          </>
          )}
        </section>

        {group.balanceMode !== 'STATIC' && renderPayments('mt-12 mb-12')}
      </div>

      {/* ---- Modals ---- */}

      {showExpenseForm && (
        <ExpenseForm
          groupId={id}
          members={members}
          currency={currency}
          currentUserId={currentUserId}
          editMode={!!editingExpense}
          initialData={editingExpense}
          onSuccess={loadGroup}
          onClose={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
        />
      )}

      {showPaymentForm && (() => {
        const settlements = computeSettlements(balances);
        const mySettlement = settlements.find((s) => s.from.userId === currentUserId);
        const hasDebts = !!mySettlement;
        const suggestedPayment = hasDebts
          ? { toUserId: mySettlement.to.userId, amount: mySettlement.amount.toString() }
          : {};

        return (
          <PaymentForm
            groupId={id}
            members={members}
            currency={currency}
            currentUserId={currentUserId}
            initialToUserId={suggestedPayment.toUserId || ''}
            initialAmount={suggestedPayment.amount || ''}
            hasNoDebts={!hasDebts}
            onSuccess={loadGroup}
            onClose={() => setShowPaymentForm(false)}
          />
        );
      })()}

      {showInviteModal && (
        <InviteModal
          groupId={id}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {showEditGroup && (
        <EditGroupModal
          group={group}
          onSuccess={() => {
            loadGroup();
            setShowEditGroup(false);
          }}
          onClose={() => setShowEditGroup(false)}
        />
      )}

      {showMemberManagement && (
        <MemberManagementPanel
          groupId={id}
          members={members}
          ownerId={group.ownerId}
          currentUserId={currentUserId}
          onRemoveMember={handleRemoveMember}
          onFreezeMember={handleFreezeMember}
          onUnfreezeMember={handleUnfreezeMember}
          onClose={() => setShowMemberManagement(false)}
        />
      )}

      {/* Delete expense confirmation */}
      {deletingExpenseId && (
        <ConfirmDialog
          title={t('expense.delete')}
          message={t('expense.deleteConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={handleDeleteExpense}
          onClose={() => setDeletingExpenseId(null)}
        />
      )}

      {/* Delete payment confirmation */}
      {deletingPaymentId && (
        <ConfirmDialog
          title={t('payment.delete')}
          message={t('payment.deleteConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={handleDeletePayment}
          onClose={() => setDeletingPaymentId(null)}
        />
      )}

      {/* Start Closure confirmation */}
      {showStartClosureConfirm && (
        <ConfirmDialog
          title={t('group.startClosure')}
          message={t('settlement.startConfirm')}
          confirmLabel={t('group.startClosure')}
          variant="warning"
          onConfirm={async () => {
            await handleStartClosure();
            setShowStartClosureConfirm(false);
          }}
          onClose={() => setShowStartClosureConfirm(false)}
        />
      )}

      {/* Leave group confirmation */}
      {showLeaveGroupConfirm && (
        <ConfirmDialog
          title={t('member.leave')}
          message={t('member.leaveConfirm')}
          confirmLabel={t('member.leave')}
          variant="warning"
          onConfirm={handleLeaveGroup}
          onClose={() => setShowLeaveGroupConfirm(false)}
        />
      )}

      {/* Delete group confirmation */}
      {showDeleteGroupConfirm && (
        <ConfirmDialog
          title={t('group.deleteGroup')}
          message={expenses.length > 0
            ? t('group.deleteConfirmWithExpenses', { count: expenses.length })
            : t('group.deleteConfirmMessage')}
          warning={expenses.length > 0 ? t('group.deleteExpenseWarning') : undefined}
          confirmLabel={t('group.deleteGroup')}
          variant="danger"
          onConfirm={handleDeleteGroup}
          onClose={() => setShowDeleteGroupConfirm(false)}
        />
      )}

      {/* Reject payment dialog */}
      {rejectingPaymentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRejectingPaymentId(null);
              setRejectReason('');
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Reject payment"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10">
                <XMarkIcon className="h-5 w-5 text-error" aria-hidden="true" />
              </div>
              <h3 className="font-heading text-lg font-bold text-error">{t('payment.reject')}</h3>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              Provide a reason for rejecting this payment. The sender will be notified.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              className="mt-4 w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-error focus:outline-none focus:ring-2 focus:ring-error/20"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingPaymentId(null);
                  setRejectReason('');
                }}
                className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleRejectPayment}
                className="flex-1 cursor-pointer rounded-lg bg-error px-4 py-3 font-heading text-sm font-semibold text-white transition-colors duration-200 hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2"
              >
                {t('payment.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Period history (STATIC groups) */}
      {group.balanceMode === 'STATIC' && periodHistory.length > 0 && (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mt-8 rounded-xl border border-border bg-white">
          <button
            type="button"
            onClick={() => setShowClosureHistory(!showClosureHistory)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <ArchiveBoxIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
              <span className="font-heading text-sm font-semibold text-text">
                {t('settlement.history', { count: periodHistory.length })}
              </span>
            </div>
            {showClosureHistory ? (
              <ChevronUpIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
            )}
          </button>

          {showClosureHistory && (
            <div className="border-t border-border px-6 py-4">
              <ul className="space-y-4">
                {periodHistory.map((period) => {
                  const isExpanded = expandedPeriod === period.id;
                  const pExpenses = periodExpenses[period.id] || [];
                  const pPayments = periodPayments[period.id] || [];
                  const pBalances = periodBalances[period.id] || [];

                  return (
                    <li key={period.id} className="rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => handleExpandPeriod(period.id)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <div>
                          <span className="text-sm font-medium text-text">
                            {t('settlement.periodStarted', { date: formatDate(period.startedAt) })}
                          </span>
                          <span
                            className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${period.status === 'CLOSED'
                              ? 'bg-border/30 text-text-muted'
                              : 'bg-error/10 text-error'
                              }`}
                          >
                            {period.status === 'CLOSED' ? t('settlement.partial') : t('settlement.finalBadge')}
                          </span>
                          <span className="ml-3 text-xs text-text-muted">
                            {t('settlement.expenseCount', { count: period._count?.expenses || 0 })} · {t('settlement.paymentCount', { count: period._count?.payments || 0 })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {period.closedAt && (
                            <span className="text-xs text-text-muted">
                              {t('settlement.closedDate', { date: formatDate(period.closedAt) })}
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUpIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                          ) : (
                            <ChevronDownIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                          )}
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-border bg-background/50 px-4 py-4">
                          {/* Expenses */}
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t('group.expenses')}</h4>
                            {pExpenses.length === 0 ? (
                              <div className="mt-2 flex items-center gap-2 text-sm text-text-muted">
                                <ShoppingCartIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                <span>{t('settlement.noExpenses')}</span>
                              </div>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {pExpenses.map((exp) => (
                                  <li key={exp.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm">
                                    <div>
                                      <span className="font-medium text-text">{exp.description || t('expense.untitled')}</span>
                                      <span className="ml-2 text-xs text-text-muted">
                                        {t('expense.paidBy')} {exp.payer?.nickName || exp.payer?.email || 'Unknown'}
                                      </span>
                                    </div>
                                    <span className="font-semibold text-text">
                                      {formatCurrency(exp.amount, currency)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Payments */}
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t('group.payments')}</h4>
                            {pPayments.length === 0 ? (
                              <div className="mt-2 flex items-center gap-2 text-sm text-text-muted">
                                <BanknotesIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                <span>{t('settlement.noPayments')}</span>
                              </div>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {pPayments.map((pay) => (
                                  <li key={pay.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm">
                                    <div>
                                      <span className="font-medium text-text">
                                        {pay.fromUser?.nickName || pay.fromUser?.email || t('common.unknown')}
                                        {' → '}
                                        {pay.toUser?.nickName || pay.toUser?.email || t('common.unknown')}
                                      </span>
                                      <span className="ml-2 text-xs text-text-muted">
                                        {pay.status === 'ACCEPTED' ? t('payment.accepted') : pay.status === 'PENDING' ? t('payment.pending') : t('payment.rejected')}
                                      </span>
                                    </div>
                                    <span className="font-semibold text-cta">
                                      {formatCurrency(pay.amount, currency)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Settlement summary */}
                          {pBalances.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t('settlement.summary')}</h4>
                              <ul className="mt-2 space-y-3">
                                {pBalances.map((b) => {
                                  const isSettled = b.finalBalance === 0;
                                  return (
                                    <li key={b.userId} className="rounded-lg border border-border bg-white px-3 py-3">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-text">{b.user?.nickName || b.userId}</span>
                                        <span className="text-xs text-text-muted">
                                          <CurrencyDollarIcon className="inline h-3.5 w-3.5 mr-1 text-text-muted" aria-hidden="true" />
                                          {t('settlement.totalSpent')} <span className="font-semibold text-text">{formatCurrency(b.totalSpent, currency)}</span>
                                        </span>
                                      </div>

                                      {/* Owed at closure */}
                                      <div className="mt-2 border-t border-border pt-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                        <BanknotesIcon className="inline h-3 w-3 mr-1" aria-hidden="true" />
                                        {t('settlement.owedAtClosure')}
                                      </span>
                                        {b.owedTo.length > 0 && (
                                          <div className="mt-1">
                                            {b.owedTo.map((debt) => (
                                              <p key={debt.userId} className="text-xs text-error">
                                                {t('balance.owes')} <span className="font-medium">{debt.nickName}</span> {formatCurrency(debt.amount, currency)}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                        {b.owedBy.length > 0 && (
                                          <div className="mt-1">
                                            {b.owedBy.map((debt) => (
                                              <p key={debt.userId} className="text-xs text-success">
                                                {t('balance.isOwed')} <span className="font-medium">{debt.nickName}</span> {formatCurrency(debt.amount, currency)}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                        {b.owedTo.length === 0 && b.owedBy.length === 0 && (
                                          <p className="text-xs text-text-muted">{t('settlement.noDebts')}</p>
                                        )}
                                      </div>

                                      {/* After payments */}
                                      <div className="mt-2 border-t border-border pt-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                        <CheckCircleIcon className="inline h-3 w-3 mr-1" aria-hidden="true" />
                                        {t('settlement.afterPayments')}
                                      </span>
                                        {isSettled ? (
                                          <p className="mt-1 text-xs font-semibold text-success">
                                            <CheckCircleIcon className="inline h-3 w-3" aria-hidden="true" />
                                            {' '}{t('settlement.allSettled')}
                                          </p>
                                        ) : (
                                          <p className="mt-1 text-xs text-error">
                                            {t('settlement.remaining')} {b.finalBalance > 0 ? '+' : ''}{formatCurrency(b.finalBalance, currency)}
                                          </p>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
        </div>
      )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}


