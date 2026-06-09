import { useState, useMemo, useEffect } from 'react';
import {
  XMarkIcon,
  CurrencyDollarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { expenseService } from '../services/api';

const CATEGORIES = ['FOOD', 'TRANSPORT', 'HOUSING', 'ENTERTAINMENT', 'OTHER'];

const SPLIT_TYPES = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'EXACT', label: 'Exact amounts' },
  { value: 'PERCENTAGE', label: 'Percentages' },
  { value: 'COLLECTIVE', label: 'Collective' },
];

const INITIAL_SPLIT = { userId: '', amount: '', percentage: '' };

/**
 * ExpenseForm — modal form to create a new expense in a group.
 *
 * Props:
 *   groupId      — the group ID (string)
 *   members      — array of ACTIVE group members (each with userId + user object)
 *   currency     — group currency (e.g. "USD")
 *   currentUserId — authenticated user ID, pre-selected as payer
 *   onSuccess    — callback after successful creation
 *   onClose      — close the modal
 */
export default function ExpenseForm({
  groupId,
  members,
  currency = 'USD',
  currentUserId,
  onSuccess,
  onClose,
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('FOOD');
  const [payerId, setPayerId] = useState(currentUserId || '');
  const [splitType, setSplitType] = useState('EQUAL');
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ------------------------------------------------------------------
  // COLLECTIVE wizard state
  // ------------------------------------------------------------------
  const [collectiveStep, setCollectiveStep] = useState(1);
  const [sharedCosts, setSharedCosts] = useState('');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState(
    members.map((m) => m.userId)
  );
  const [collectiveItems, setCollectiveItems] = useState({}); // { userId: { amount, description } }
  const [collectiveLoading, setCollectiveLoading] = useState(false);
  const [collectiveError, setCollectiveError] = useState('');

  // ------------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------------

  const parsedAmount = parseFloat(amount) || 0;

  const equalShare = useMemo(() => {
    if (members.length === 0) return 0;
    return Math.round((parsedAmount / members.length) * 100) / 100;
  }, [parsedAmount, members.length]);

  // Initialize / reset splits when splitType or members change
  useEffect(() => {
    if (splitType === 'EQUAL') {
      setSplits([]);
      return;
    }
    setSplits(
      members.map((m) => ({
        userId: m.userId,
        amount: '',
        percentage: '',
      })),
    );
  }, [splitType, members]);

  // Reset collective wizard when switching to COLLECTIVE or changing members
  useEffect(() => {
    if (splitType === 'COLLECTIVE') {
      setCollectiveStep(1);
      setSharedCosts('');
      setSelectedParticipantIds(members.map((m) => m.userId));
      setCollectiveItems({});
      setCollectiveError('');
    }
  }, [splitType, members]);

  // Initialize items for step 4 when entering that step
  useEffect(() => {
    if (collectiveStep === 4 && splitType === 'COLLECTIVE') {
      // Pre-populate items with existing values or defaults
      const initialized = {};
      selectedParticipantIds.forEach((uid) => {
        if (collectiveItems[uid]) {
          initialized[uid] = collectiveItems[uid];
        } else {
          initialized[uid] = { amount: '', description: '' };
        }
      });
      setCollectiveItems(initialized);
    }
  }, [collectiveStep, splitType]);

  // ------------------------------------------------------------------
  // Split input handlers
  // ------------------------------------------------------------------

  const handleSplitChange = (index, field, value) => {
    setSplits((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // ------------------------------------------------------------------
  // Collective wizard handlers
  // ------------------------------------------------------------------

  const toggleCollectiveParticipant = (userId) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllCollectiveParticipants = () => {
    if (selectedParticipantIds.length === members.length) {
      setSelectedParticipantIds([]);
    } else {
      setSelectedParticipantIds(members.map((m) => m.userId));
    }
  };

  const updateCollectiveItem = (userId, field, value) => {
    setCollectiveItems((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  };

  // Compute collective status for real-time display
  const collectiveStatus = useMemo(() => {
    const total = parseFloat(amount) || 0;
    const shared = parseFloat(sharedCosts) || 0;
    const itemsSum = Object.values(collectiveItems).reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0
    );
    const discrepancy = Math.abs(itemsSum + shared - total);
    const isMatch = discrepancy <= 0.01;
    return {
      itemsSum,
      shared,
      total,
      discrepancy,
      isMatch,
      hasAllItems: selectedParticipantIds.every(
        (uid) => collectiveItems[uid]?.amount && parseFloat(collectiveItems[uid].amount) > 0
      ),
    };
  }, [amount, sharedCosts, collectiveItems, selectedParticipantIds]);

  const validateCollectiveStep = () => {
    const total = parseFloat(amount) || 0;
    const shared = parseFloat(sharedCosts) || 0;

    if (collectiveStep === 1) {
      if (!description.trim()) return 'Description is required.';
      if (!amount || total <= 0) return 'Total must be a positive number.';
      return null;
    }

    if (collectiveStep === 2) {
      if (shared < 0) return 'Shared costs cannot be negative.';
      if (shared > total) return 'Shared costs cannot exceed the total.';
      return null;
    }

    if (collectiveStep === 3) {
      if (selectedParticipantIds.length === 0) return 'Select at least one participant.';
      return null;
    }

    if (collectiveStep === 4) {
      if (!collectiveStatus.hasAllItems) return 'All participants must report their item amount.';
      if (!collectiveStatus.isMatch) return 'Items sum + shared costs must equal the total.';
      return null;
    }

    return null;
  };

  const handleCollectiveNext = () => {
    const validationError = validateCollectiveStep();
    if (validationError) {
      setCollectiveError(validationError);
      return;
    }
    setCollectiveError('');
    setCollectiveStep((prev) => Math.min(prev + 1, 4));
  };

  const handleCollectiveBack = () => {
    setCollectiveError('');
    setCollectiveStep((prev) => Math.max(prev - 1, 1));
  };

  const handleCollectiveSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateCollectiveStep();
    if (validationError) {
      setCollectiveError(validationError);
      return;
    }

    setCollectiveLoading(true);
    setCollectiveError('');

    try {
      const payload = {
        amount: parseFloat(amount),
        description: description.trim(),
        category,
        payerId: currentUserId,
        splitType: 'COLLECTIVE',
        sharedCosts: parseFloat(sharedCosts) || 0,
        participantIds: selectedParticipantIds,
      };

      const result = await expenseService.create(groupId, payload);
      const expenseId = result.data?.id;

      // Report items for each participant
      await Promise.all(
        selectedParticipantIds.map((uid) => {
          const item = collectiveItems[uid];
          if (item && item.amount) {
            return expenseService.reportItem(groupId, expenseId, {
              userId: uid,
              amount: parseFloat(item.amount),
              description: item.description || 'mi gasto',
            });
          }
          return Promise.resolve();
        })
      );

      setCollectiveLoading(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setCollectiveError(err.message || 'Failed to create expense.');
      setCollectiveLoading(false);
    }
  };

  /** Sum of exact split amounts (client-side preview only). */
  const exactSum = useMemo(() => {
    return splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  }, [splits]);

  /** Sum of split percentages (client-side preview only). */
  const percentageSum = useMemo(() => {
    return splits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);
  }, [splits]);

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const validate = () => {
    if (!description.trim()) return 'Description is required.';
    if (!amount || parsedAmount <= 0) return 'Amount must be a positive number.';
    if (!payerId) return 'Please select a payer.';

    if (splitType === 'EXACT') {
      if (Math.abs(exactSum - parsedAmount) > 0.009) {
        return 'Split amounts must sum to the expense total.';
      }
      if (splits.some((s) => !s.amount || parseFloat(s.amount) <= 0)) {
        return 'Each member must have a positive amount.';
      }
    }

    if (splitType === 'PERCENTAGE') {
      if (Math.abs(percentageSum - 100) > 0.009) {
        return 'Split percentages must sum to 100%.';
      }
      if (splits.some((s) => !s.percentage || parseFloat(s.percentage) <= 0)) {
        return 'Each member must have a positive percentage.';
      }
    }

    return null;
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

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
      const payload = {
        amount: parsedAmount,
        description: description.trim(),
        category,
        payerId,
        splitType,
        splits:
          splitType === 'EQUAL'
            ? [{ userId: members[0]?.userId || '' }] // dummy — backend computes equal split from members
            : splits.map((s) => ({
                userId: s.userId,
                ...(splitType === 'EXACT'
                  ? { amount: parseFloat(s.amount) }
                  : { percentage: parseFloat(s.percentage) }),
              })),
      };

      await expenseService.create(groupId, payload);
      setLoading(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to create expense.');
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const memberName = (m) =>
    m.user?.nickName || m.user?.email || m.userId;

  const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-primary/40 p-4 pt-[10vh] backdrop-blur-sm sm:pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add expense"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-primary">
            Add expense
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-border/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5" noValidate>
          {/* Error */}
          {error && (
            <div
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="expense-description" className="mb-1.5 block text-sm font-semibold text-text">
              Description
            </label>
            <input
              id="expense-description"
              type="text"
              required
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner at Mario's"
              className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          {/* Amount + Currency */}
          <div>
            <label htmlFor="expense-amount" className="mb-1.5 block text-sm font-semibold text-text">
              Amount
            </label>
            <div className="relative">
              <CurrencyDollarIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="expense-amount"
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-16 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                {currency}
              </span>
            </div>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="expense-category" className="mb-1.5 block text-sm font-semibold text-text">
              Category
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Payer */}
          <div>
            <label htmlFor="expense-payer" className="mb-1.5 block text-sm font-semibold text-text">
              Paid by
            </label>
            <select
              id="expense-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {memberName(m)}
                  {m.userId === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Split type */}
          <div>
            <label htmlFor="expense-split-type" className="mb-1.5 block text-sm font-semibold text-text">
              Split type
            </label>
            <select
              id="expense-split-type"
              value={splitType}
              onChange={(e) => {
                setSplitType(e.target.value);
                // Reset splits on next render via the initialiseSplits effect
              }}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {SPLIT_TYPES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          {/* --- Splits UI --- */}

          {splitType === 'EQUAL' && parsedAmount > 0 && (
            <div className="rounded-lg bg-secondary/5 px-4 py-3">
              <p className="text-sm text-text">
                Split equally among{' '}
                <span className="font-semibold text-secondary">{members.length}</span>{' '}
                member{members.length !== 1 ? 's' : ''}
              </p>
              <p className="mt-1 text-sm font-semibold text-primary">
                {formatCurrency(equalShare)} each
              </p>
            </div>
          )}

          {splitType === 'EXACT' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text">Amount per member</p>
                <p
                  className={`text-xs font-medium ${
                    Math.abs(exactSum - parsedAmount) <= 0.009
                      ? 'text-success'
                      : 'text-error'
                  }`}
                >
                  Sum: {formatCurrency(exactSum)} / {formatCurrency(parsedAmount)}
                </p>
              </div>
              {members.map((m, i) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <UserIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    <span className="truncate text-sm text-text">
                      {memberName(m)}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={splits[i]?.amount || ''}
                    onChange={(e) => handleSplitChange(i, 'amount', e.target.value)}
                    className="w-28 flex-shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-right text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                </div>
              ))}
            </div>
          )}

          {splitType === 'PERCENTAGE' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text">Percentage per member</p>
                <p
                  className={`text-xs font-medium ${
                    Math.abs(percentageSum - 100) <= 0.009
                      ? 'text-success'
                      : 'text-error'
                  }`}
                >
                  Total: {percentageSum}%
                </p>
              </div>
              {members.map((m, i) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <UserIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    <span className="truncate text-sm text-text">
                      {memberName(m)}
                    </span>
                  </div>
                  <div className="relative w-28 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={splits[i]?.percentage || ''}
                      onChange={(e) => handleSplitChange(i, 'percentage', e.target.value)}
                      className="w-full rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-right text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* --- COLLECTIVE WIZARD --- */}
          {splitType === 'COLLECTIVE' && (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        collectiveStep >= step
                          ? 'bg-secondary text-white'
                          : 'bg-border text-text-muted'
                      }`}
                    >
                      {step}
                    </div>
                    {step < 4 && (
                      <div
                        className={`h-1 w-8 rounded ${
                          collectiveStep > step ? 'bg-secondary' : 'bg-border'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Step 1: Basic info */}
              {collectiveStep === 1 && (
                <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                  <p className="text-sm font-semibold text-text">Step 1: Basic info</p>
                  <div>
                    <label htmlFor="collective-description" className="mb-1.5 block text-xs font-semibold text-text">
                      Description <span className="font-normal text-text-muted">(optional)</span>
                    </label>
                    <input
                      id="collective-description"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Team dinner, office supplies, etc."
                      className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="collective-amount" className="mb-1.5 block text-xs font-semibold text-text">
                      Total amount
                    </label>
                    <div className="relative">
                      <CurrencyDollarIcon
                        className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                        aria-hidden="true"
                      />
                      <input
                        id="collective-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-16 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">
                        {currency}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Shared costs */}
              {collectiveStep === 2 && (
                <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                  <p className="text-sm font-semibold text-text">Step 2: Shared costs</p>
                  <p className="text-xs text-text-muted">
                    Costs shared equally among all participants (delivery, tips, taxes, etc.). Can be 0.
                  </p>
                  <div className="relative">
                    <CurrencyDollarIcon
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                      aria-hidden="true"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sharedCosts}
                      onChange={(e) => setSharedCosts(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-16 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">
                      {currency}
                    </span>
                  </div>
                  {parseFloat(sharedCosts) > 0 && selectedParticipantIds.length > 0 && (
                    <div className="rounded-md bg-secondary/5 px-3 py-2">
                      <p className="text-xs text-text">
                        <span className="font-semibold text-secondary">
                          {formatCurrency(Math.round((parseFloat(sharedCosts) / selectedParticipantIds.length) * 100) / 100)}
                        </span>{' '}
                        per person
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Participants */}
              {collectiveStep === 3 && (
                <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text">Step 3: Participants</p>
                    <button
                      type="button"
                      onClick={toggleAllCollectiveParticipants}
                      className="cursor-pointer text-xs font-medium text-secondary transition-colors duration-200 hover:text-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded px-1.5 py-0.5"
                    >
                      {selectedParticipantIds.length === members.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {members.map((m) => {
                      const checked = selectedParticipantIds.includes(m.userId);
                      return (
                        <label
                          key={m.userId}
                          className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 ${
                            checked ? 'bg-secondary/5' : 'hover:bg-border/30'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCollectiveParticipant(m.userId)}
                            className="h-4 w-4 cursor-pointer rounded border-border text-secondary focus:ring-2 focus:ring-secondary/20"
                          />
                          <span className="truncate text-sm font-medium text-text">
                            {memberName(m)}
                            {m.userId === currentUserId ? ' (you)' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedParticipantIds.length > 0 && (
                    <p className="text-xs text-text-muted">
                      {selectedParticipantIds.length} participant{selectedParticipantIds.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {/* Step 4: Item reporting */}
              {collectiveStep === 4 && (
                <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text">Step 4: Report items</p>
                    {/* Status indicator */}
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                        collectiveStatus.isMatch
                          ? 'bg-success/10 text-success'
                          : 'bg-error/10 text-error'
                      }`}
                    >
                      {collectiveStatus.isMatch ? (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Match
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Mismatch
                        </>
                      )}
                    </div>
                  </div>

                  {/* Running totals */}
                  <div className="flex flex-wrap items-center gap-3 rounded-md bg-white px-3 py-2 text-xs">
                    <span className="text-text-muted">
                      Items sum: <span className="font-semibold text-text">{formatCurrency(collectiveStatus.itemsSum)}</span>
                    </span>
                    <span className="text-text-muted">+</span>
                    <span className="text-text-muted">
                      Shared: <span className="font-semibold text-text">{formatCurrency(collectiveStatus.shared)}</span>
                    </span>
                    <span className="text-text-muted">=</span>
                    <span className="font-semibold text-text">{formatCurrency(collectiveStatus.itemsSum + collectiveStatus.shared)}</span>
                    <span className="text-text-muted">/</span>
                    <span className="font-semibold text-primary">{formatCurrency(collectiveStatus.total)}</span>
                    {collectiveStatus.discrepancy > 0.01 && (
                      <span className="text-error">
                        (Δ {formatCurrency(collectiveStatus.discrepancy)})
                      </span>
                    )}
                  </div>

                  {/* Items table */}
                  <div className="space-y-2">
                    {selectedParticipantIds.map((uid) => {
                      const member = members.find((m) => m.userId === uid);
                      const item = collectiveItems[uid] || { amount: '', description: '' };
                      return (
                        <div key={uid} className="flex items-center gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <UserIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                            <span className="truncate text-sm text-text">
                              {memberName(member)}
                              {uid === currentUserId ? ' (you)' : ''}
                            </span>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.amount}
                            onChange={(e) => updateCollectiveItem(uid, 'amount', e.target.value)}
                            className="w-24 flex-shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-right text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                          />
                          <input
                            type="text"
                            placeholder="mi gasto"
                            value={item.description}
                            onChange={(e) => updateCollectiveItem(uid, 'description', e.target.value)}
                            className="w-28 flex-shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error for collective wizard */}
              {collectiveError && (
                <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error" role="alert">
                  {collectiveError}
                </div>
              )}

              {/* Wizard navigation */}
              <div className="flex gap-3">
                {collectiveStep > 1 && (
                  <button
                    type="button"
                    onClick={handleCollectiveBack}
                    disabled={collectiveLoading}
                    className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Back
                  </button>
                )}
                {collectiveStep < 4 ? (
                  <button
                    type="button"
                    onClick={handleCollectiveNext}
                    disabled={collectiveLoading}
                    className="flex-1 cursor-pointer rounded-lg bg-secondary px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCollectiveSubmit}
                    disabled={collectiveLoading || !collectiveStatus.isMatch}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {collectiveLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Creating…
                      </>
                    ) : (
                      'Create expense'
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Buttons — only for non-COLLECTIVE split types */}
          {splitType !== 'COLLECTIVE' && (
            <div className="flex gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving…
                  </>
                ) : (
                  'Add expense'
                )}
              </button>
            </div>
          )}

          {/* Cancel button for COLLECTIVE */}
          {splitType === 'COLLECTIVE' && (
            <button
              type="button"
              onClick={onClose}
              disabled={collectiveLoading}
              className="w-full cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
