import { useState, useMemo, useEffect } from 'react';
import {
  XMarkIcon,
  CurrencyDollarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { NumericFormat } from 'react-number-format';
import { expenseService } from '../services/api';

const CATEGORIES = ['FOOD', 'TRANSPORT', 'HOUSING', 'ENTERTAINMENT', 'OTHER'];

const SPLIT_TYPES = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'PERCENTAGE', label: 'Percentages' },
  { value: 'COLLECTIVE', label: 'Collective' },
];

/**
 * ExpenseForm — modal form to create or edit an expense in a group.
 *
 * Unified wizard:
 *   Step 1 (all types): description, amount, date, category, payer, split type.
 *   Step 2 (type-specific):
 *     - EQUAL: computed equal shares (read-only), Create/Update button.
 *     - PERCENTAGE: percentage inputs per member with sum=100 % validation.
 *     - COLLECTIVE: 2a) shared costs + participant selection,
 *                   2b) confirmation summary, Create/Update button.
 *
 * Props:
 *   groupId      — the group ID (string)
 *   members      — array of ACTIVE group members (each with userId + user object)
 *   currency     — group currency (e.g. "USD")
 *   currentUserId — authenticated user ID, pre-selected as payer
 *   onSuccess    — callback after successful creation/update
 *   onClose      — close the modal
 *   editMode     — (optional) boolean, true for edit mode
 *   initialData  — (optional) expense object to pre-fill in edit mode
 */
export default function ExpenseForm({
  groupId,
  members,
  currency = 'USD',
  currentUserId,
  onSuccess,
  onClose,
  editMode = false,
  initialData = null,
}) {
  // ------------------------------------------------------------------
  // Base form state (Step 1)
  // ------------------------------------------------------------------
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('FOOD');
  const [payerId, setPayerId] = useState(currentUserId || '');
  const [splitType, setSplitType] = useState('EQUAL');
  const [splits, setSplits] = useState([]);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ------------------------------------------------------------------
  // Wizard navigation
  // ------------------------------------------------------------------
  const [wizardStep, setWizardStep] = useState(1);

  // COLLECTIVE sub-step within wizardStep 2
  const [collSubStep, setCollSubStep] = useState('configure'); // 'configure' | 'confirm'

  // COLLECTIVE-specific state
  const [sharedCosts, setSharedCosts] = useState('');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState(
    members.map((m) => m.userId),
  );

  // ------------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------------

  const parsedAmount = parseFloat(amount) || 0;

  const equalShare = useMemo(() => {
    if (selectedParticipantIds.length === 0) return 0;
    return Math.round((parsedAmount / selectedParticipantIds.length) * 100) / 100;
  }, [parsedAmount, selectedParticipantIds.length]);

  /** Sum of split percentages (client-side preview only). */
  const percentageSum = useMemo(() => {
    return splits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);
  }, [splits]);

  // Initialize / reset splits when splitType or members change
  useEffect(() => {
    if (splitType === 'EQUAL') {
      setSplits([]);
      return;
    }
    // PERCENTAGE: only initialize splits for selected participants
    setSplits(
      members
        .filter((m) => selectedParticipantIds.includes(m.userId))
        .map((m) => ({
          userId: m.userId,
          amount: '',
          percentage: '',
        })),
    );
  }, [splitType, members, selectedParticipantIds]);

  // Reset wizard + COLLECTIVE state when splitType changes
  useEffect(() => {
    setWizardStep(1);
    setError('');
    if (splitType === 'COLLECTIVE') {
      setSharedCosts('');
      setSelectedParticipantIds(members.map((m) => m.userId));
      setCollSubStep('configure');
    } else {
      // EQUAL and PERCENTAGE: initialize participants to all members
      setSelectedParticipantIds(members.map((m) => m.userId));
    }
  }, [splitType, members]);

  // Pre-fill form fields when in edit mode
  useEffect(() => {
    if (!editMode || !initialData) return;

    setDescription(initialData.description || '');
    setAmount(String(initialData.amount || ''));
    setCategory(initialData.category || 'FOOD');
    setPayerId(initialData.payerId || currentUserId || '');
    setSplitType(initialData.splitType || 'EQUAL');
    setDate(
      initialData.date
        ? new Date(initialData.date).toLocaleDateString('en-CA')
        : new Date().toLocaleDateString('en-CA'),
    );

    if (initialData.splitType === 'COLLECTIVE') {
      setSharedCosts(String(initialData.sharedCosts || ''));
      setSelectedParticipantIds(initialData.participantIds || members.map((m) => m.userId));
      setCollSubStep('configure');
    } else {
      setSelectedParticipantIds(initialData.participantIds || members.map((m) => m.userId));
    }
  }, [editMode, initialData, members, currentUserId]);

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
  // COLLECTIVE participant handlers
  // ------------------------------------------------------------------

  const toggleCollectiveParticipant = (userId) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const toggleAllCollectiveParticipants = () => {
    if (selectedParticipantIds.length === members.length) {
      setSelectedParticipantIds([]);
    } else {
      setSelectedParticipantIds(members.map((m) => m.userId));
    }
  };

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const validateStep1 = () => {
    if (!description.trim()) return 'Description is required.';
    if (!amount || parsedAmount <= 0) return 'Amount must be a positive number.';
    if (!payerId) return 'Please select a payer.';
    return null;
  };

const validateStep2 = () => {
    if (splitType === 'EQUAL') {
      if (selectedParticipantIds.length === 0) return 'Select at least one participant.';
      return null;
    }

    if (splitType === 'PERCENTAGE') {
      if (selectedParticipantIds.length === 0) return 'Select at least one participant.';
      if (Math.abs(percentageSum - 100) > 0.009) {
        return 'Split percentages must sum to 100%.';
      }
      if (splits.some((s) => !s.percentage || parseFloat(s.percentage) <= 0)) {
        return 'Each participant must have a positive percentage.';
      }
    }

    if (splitType === 'COLLECTIVE' && collSubStep === 'configure') {
      const shared = parseFloat(sharedCosts) || 0;
      if (shared < 0) return 'Shared costs cannot be negative.';
      if (shared > parsedAmount) return 'Shared costs cannot exceed the total.';
      if (selectedParticipantIds.length === 0) return 'Select at least one participant.';
      return null;
    }

    return null;
  };

  // ------------------------------------------------------------------
  // Step navigation
  // ------------------------------------------------------------------

  const handleNext = () => {
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setWizardStep(2);
    if (splitType === 'COLLECTIVE') {
      setCollSubStep('configure');
    }
  };

  const handleBack = () => {
    if (splitType === 'COLLECTIVE' && collSubStep === 'confirm') {
      setCollSubStep('configure');
      return;
    }
    setWizardStep(1);
    setError('');
  };

  const handleCollectiveNext = () => {
    const validationError = validateStep2();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setCollSubStep('confirm');
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    // For EQUAL, step 2 has no extra validation beyond step 1 (already passed)
    // For PERCENTAGE + COLLECTIVE, validate step 2
    const step2Error = validateStep2();
    if (step2Error && splitType !== 'EQUAL') {
      setError(step2Error);
      return;
    }

    setLoading(true);
    try {
      if (splitType === 'COLLECTIVE') {
        const payload = {
          amount: parsedAmount,
          description: description.trim(),
          category,
          payerId,
          splitType: 'COLLECTIVE',
          sharedCosts: parseFloat(sharedCosts) || 0,
          participantIds: selectedParticipantIds,
          ...(date && { date: new Date(date).toISOString() }),
        };

        if (editMode && initialData?.id) {
          await expenseService.update(groupId, initialData.id, payload);
        } else {
          await expenseService.create(groupId, payload);
        }
      } else {
        const payload = {
          amount: parsedAmount,
          description: description.trim(),
          category,
          payerId,
          splitType,
          participantIds: selectedParticipantIds,
          ...(date && { date: new Date(date).toISOString() }),
          splits:
            splitType === 'EQUAL'
              ? selectedParticipantIds.map((uid) => ({ userId: uid }))
              : splits.map((s) => ({
                  userId: s.userId,
                  percentage: parseFloat(s.percentage),
                })),
        };

        if (editMode && initialData?.id) {
          await expenseService.update(groupId, initialData.id, payload);
        } else {
          await expenseService.create(groupId, payload);
        }
      }

      setLoading(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || (editMode ? 'Failed to update expense.' : 'Failed to create expense.'));
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
  // Render helpers
  // ------------------------------------------------------------------

  /** Whether the step 2 action (Create) is available. */
  const canCreate = () => {
    if (splitType === 'EQUAL') return selectedParticipantIds.length > 0;
    if (splitType === 'PERCENTAGE') {
      return Math.abs(percentageSum - 100) <= 0.009
        && !splits.some((s) => !s.percentage || parseFloat(s.percentage) <= 0);
    }
    if (splitType === 'COLLECTIVE') {
      return selectedParticipantIds.length > 0 && collSubStep === 'confirm';
    }
    return false;
  };

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
            {editMode ? 'Edit expense' : 'Add expense'}
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

          {/* ================================================================ */}
          {/* STEP 1 — Base fields (all split types)                           */}
          {/* ================================================================ */}
          {wizardStep === 1 && (
            <>
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
                  <NumericFormat
                    id="expense-amount"
                    required
                    value={amount}
                    onValueChange={(values) => setAmount(values.floatValue ?? '')}
                    thousandSeparator=","
                    decimalScale={2}
                    fixedDecimalScale
                    allowNegative={false}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-16 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 [!&::-webkit-outer-spin-button]:appearance-none [&_input[type=number]]:-moz-appearance:textfield [&_input[type=number]]::outer-spin-button:appearance-none [&_input[type=number]]::inner-spin-button:appearance-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                    {currency}
                  </span>
                </div>
              </div>

              {/* Date */}
              <div>
                <label htmlFor="expense-date" className="mb-1.5 block text-sm font-semibold text-text">
                  Date
                </label>
                <input
                  id="expense-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
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

              {/* Step 1 nav */}
              <div className="flex gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 cursor-pointer rounded-lg bg-secondary px-4 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* ================================================================ */}
          {/* STEP 2 — Type-specific                                              */}
          {/* ================================================================ */}
          {wizardStep === 2 && (
            <>
              {/* Participants — shown for EQUAL and PERCENTAGE */}
              {(splitType === 'EQUAL' || splitType === 'PERCENTAGE') && (
                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text">Participants</p>
                    <button
                      type="button"
                      onClick={toggleAllCollectiveParticipants}
                      className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-secondary transition-colors duration-200 hover:text-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary/30"
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

              {/* --- EQUAL: computed equal shares --- */}
              {splitType === 'EQUAL' && parsedAmount > 0 && selectedParticipantIds.length > 0 && (
                <div className="rounded-lg bg-secondary/5 px-4 py-3">
                  <p className="text-sm text-text">
                    Split equally among{' '}
                    <span className="font-semibold text-secondary">{selectedParticipantIds.length}</span>{' '}
                    participant{selectedParticipantIds.length !== 1 ? 's' : ''}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary">
                    {formatCurrency(equalShare)} each
                  </p>
                </div>
              )}

              {/* --- PERCENTAGE: percentage inputs --- */}
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
                  {members
                    .filter((m) => selectedParticipantIds.includes(m.userId))
                    .map((m, i) => (
                      <div key={m.userId} className="flex items-center gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <UserIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                          <span className="truncate text-sm text-text">
                            {memberName(m)}
                          </span>
                        </div>
                        <div className="relative w-28 flex-shrink-0">
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0"
                            value={splits[i]?.percentage || ''}
                            onChange={(e) => handleSplitChange(i, 'percentage', e.target.value)}
                            className="w-full rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-right text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 [!&::-webkit-outer-spin-button]:appearance-none [&_input[type=number]]:-moz-appearance:textfield [&_input[type=number]]::outer-spin-button:appearance-none [&_input[type=number]]::inner-spin-button:appearance-none"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                            %
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* --- COLLECTIVE: two sub-steps --- */}
              {splitType === 'COLLECTIVE' && (
                <div className="space-y-4">
                  {/* Step indicator */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-white">
                      1
                    </div>
                    <div className="h-1 w-8 rounded bg-secondary" />
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        collSubStep === 'confirm'
                          ? 'bg-secondary text-white'
                          : 'bg-secondary text-white'
                      }`}
                    >
                      2
                    </div>
                  </div>

                  {/* ---- COLLECTIVE Step 2a: Configure ---- */}
                  {collSubStep === 'configure' && (
                    <>
                      {/* Shared costs */}
                      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                        <p className="text-sm font-semibold text-text">Shared costs</p>
                        <p className="text-xs text-text-muted">
                          Costs shared equally among all participants (delivery, tips, taxes, etc.). Can be 0.
                        </p>
                        <div className="relative">
                          <CurrencyDollarIcon
                            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                            aria-hidden="true"
                          />
                          <NumericFormat
                            value={sharedCosts}
                            onValueChange={(values) => setSharedCosts(values.floatValue ?? '')}
                            thousandSeparator=","
                            decimalScale={2}
                            fixedDecimalScale
                            allowNegative={false}
                            placeholder="0.00"
                            className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-16 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 [!&::-webkit-outer-spin-button]:appearance-none [&_input[type=number]]:-moz-appearance:textfield [&_input[type=number]]::outer-spin-button:appearance-none [&_input[type=number]]::inner-spin-button:appearance-none"
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

                      {/* Participants */}
                      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-text">Participants</p>
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

                      {/* Nav */}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleBack}
                          className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handleCollectiveNext}
                          disabled={selectedParticipantIds.length === 0}
                          className="flex-1 cursor-pointer rounded-lg bg-secondary px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}

                  {/* ---- COLLECTIVE Step 2b: Confirm ---- */}
                  {collSubStep === 'confirm' && (
                    <>
                      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                        <p className="text-sm font-semibold text-text">Confirm expense</p>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-text-muted">Description</span>
                            <span className="font-medium text-text">{description.trim() || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">Total amount</span>
                            <span className="font-semibold text-primary">{formatCurrency(parsedAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">Shared costs</span>
                            <span className="font-medium text-text">{formatCurrency(parseFloat(sharedCosts) || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">Category</span>
                            <span className="font-medium text-text">
                              {category.charAt(0) + category.slice(1).toLowerCase()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">Paid by</span>
                            <span className="font-medium text-text">
                              {memberName(members.find((m) => m.userId === payerId))}
                            </span>
                          </div>
                          <div className="border-t border-border pt-2 mt-2">
                            <p className="text-xs text-text-muted mb-1">
                              Participants ({selectedParticipantIds.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedParticipantIds.map((uid) => (
                                <span
                                  key={uid}
                                  className="inline-flex items-center gap-1 rounded-md bg-secondary/5 px-2.5 py-1 text-xs text-text"
                                >
                                  <UserIcon className="h-3 w-3 text-text-muted" aria-hidden="true" />
                                  {memberName(members.find((m) => m.userId === uid))}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-md bg-cta/10 px-3 py-2 text-xs text-cta">
                          Each participant will report their own item amount after creation.
                        </div>
                      </div>

                      {/* Nav */}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleBack}
                          className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loading ? (
                            <>
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              {editMode ? 'Saving…' : 'Creating…'}
                            </>
                          ) : (
                            editMode ? 'Save changes' : 'Create expense'
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* --- EQUAL / PERCENTAGE nav --- */}
              {splitType !== 'COLLECTIVE' && (
                <div className="flex gap-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={loading}
                    className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !canCreate()}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {editMode ? 'Saving…' : 'Creating…'}
                      </>
                    ) : (
                      editMode ? 'Save changes' : 'Add expense'
                    )}
                  </button>
                </div>
              )}

              {/* COLLECTIVE global cancel (outside the wizard nav, visible in both sub-steps) */}
              {splitType === 'COLLECTIVE' && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="w-full cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
