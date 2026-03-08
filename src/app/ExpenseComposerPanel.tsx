import { useEffect, useMemo, useRef, useState } from 'react';
import { buildShareAllocationPreview } from '../domain/share';
import { buildExpenseConfirmationSentence, buildTailRuleSentence } from '../domain/validation';
import type { Expense, ExpenseParticipant, Party, ShareMode } from '../domain/types';
import { formatCurrency, parseAmountToCents, todayInputValue } from '../utils/format';

const CATEGORY_OPTIONS = ['餐费', '门票', '车费', '住宿', '采购', '其他'];

type ExpenseFieldName = 'title' | 'amount' | 'payer' | 'participants' | 'headcount' | 'reason';
type ExpenseFieldErrors = Partial<Record<ExpenseFieldName, string>>;

interface ExpenseComposerPanelProps {
  parties: Party[];
  saving: boolean;
  poolBalanceCents: number;
  editingExpense: Expense | null;
  editingParticipants: ExpenseParticipant[];
  lastExpense: Expense | null;
  lastExpenseParticipants: ExpenseParticipant[];
  onSave: (input: {
    expenseId?: string;
    paidAt: string;
    category?: string;
    title?: string;
    amountCents: number;
    payerKind: 'party' | 'pool';
    payerPartyId?: string;
    shareMode: ShareMode;
    note?: string;
    reason?: string;
    participants: Array<{ partyId: string; headcountSnapshot: number }>;
  }) => Promise<void>;
  onCancelEdit: () => void;
}

interface ExpenseDraftState {
  title: string;
  paidAt: string;
  category: string;
  amount: string;
  payerKind: 'party' | 'pool';
  payerPartyId: string;
  shareMode: ShareMode;
  note: string;
  reason: string;
  selectedPartyIds: string[];
  headcountByPartyId: Record<string, string>;
}

function buildBlankDraft(parties: Party[]): ExpenseDraftState {
  return {
    title: '',
    paidAt: todayInputValue(),
    category: '',
    amount: '',
    payerKind: 'party',
    payerPartyId: '',
    shareMode: 'by_party',
    note: '',
    reason: '',
    selectedPartyIds: [],
    headcountByPartyId: Object.fromEntries(parties.map((party) => [party.id, String(party.defaultHeadcount)])),
  };
}

function buildDraftFromExpense(expense: Expense, participants: ExpenseParticipant[], parties: Party[]): ExpenseDraftState {
  return {
    title: expense.title ?? '',
    paidAt: expense.paidAt,
    category: expense.category ?? '',
    amount: String(expense.amountCents / 100),
    payerKind: expense.payerKind,
    payerPartyId: expense.payerPartyId ?? '',
    shareMode: expense.shareMode,
    note: expense.note ?? '',
    reason: '',
    selectedPartyIds: participants.map((participant) => participant.partyId),
    headcountByPartyId: Object.fromEntries(
      parties.map((party) => {
        const matched = participants.find((participant) => participant.partyId === party.id);
        return [party.id, String(matched?.headcountSnapshot ?? party.defaultHeadcount)];
      }),
    ),
  };
}

function buildExpenseSummary(expense: Expense, participants: ExpenseParticipant[], parties: Party[]): string {
  const partyNames = new Map(parties.map((party) => [party.id, party.name]));
  const participantText = participants
    .map((participant) => `${partyNames.get(participant.partyId) ?? '未命名'}${expense.shareMode === 'by_headcount' ? `${participant.headcountSnapshot}人` : ''}`)
    .join('、');
  const payerText = expense.payerKind === 'pool' ? '从大家先收的钱里出' : `先由${partyNames.get(expense.payerPartyId ?? '') ?? '未命名'}垫上`;
  return `${expense.title?.trim() || '未写标题'} · ${formatCurrency(expense.amountCents)} · ${payerText} · ${participantText}${expense.note?.trim() ? ` · 备注：${expense.note.trim()}` : ''}`;
}

export function ExpenseComposerPanel(props: ExpenseComposerPanelProps) {
  const {
    parties,
    saving,
    poolBalanceCents,
    editingExpense,
    editingParticipants,
    lastExpense,
    lastExpenseParticipants,
    onSave,
    onCancelEdit,
  } = props;

  const activeParties = useMemo(() => parties.filter((party) => party.active), [parties]);
  const [draft, setDraft] = useState<ExpenseDraftState>(() => buildBlankDraft(parties));
  const [fieldErrors, setFieldErrors] = useState<ExpenseFieldErrors>({});

  const titleFieldRef = useRef<HTMLLabelElement | null>(null);
  const amountFieldRef = useRef<HTMLLabelElement | null>(null);
  const payerFieldRef = useRef<HTMLDivElement | null>(null);
  const participantsFieldRef = useRef<HTMLDivElement | null>(null);
  const headcountFieldRef = useRef<HTMLDivElement | null>(null);
  const reasonFieldRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    if (editingExpense) {
      setDraft(buildDraftFromExpense(editingExpense, editingParticipants, parties));
      setFieldErrors({});
      return;
    }

    setDraft((current) => ({
      ...buildBlankDraft(parties),
      headcountByPartyId: Object.fromEntries(parties.map((party) => [party.id, current.headcountByPartyId[party.id] ?? String(party.defaultHeadcount)])),
    }));
    setFieldErrors({});
  }, [editingExpense, editingParticipants, parties]);

  function setPatch(patch: Partial<ExpenseDraftState>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function getOrderedSelectedPartyIds(selectedIds: string[]) {
    const selectedSet = new Set(selectedIds);
    return activeParties.filter((party) => selectedSet.has(party.id)).map((party) => party.id);
  }

  function toggleParty(partyId: string) {
    setDraft((current) => {
      const exists = current.selectedPartyIds.includes(partyId);
      const nextIds = exists ? current.selectedPartyIds.filter((value) => value !== partyId) : [...current.selectedPartyIds, partyId];
      return {
        ...current,
        selectedPartyIds: getOrderedSelectedPartyIds(nextIds),
      };
    });
    setFieldErrors((current) => ({ ...current, participants: undefined, headcount: undefined }));
  }

  function fillAllParties() {
    setDraft((current) => ({
      ...current,
      selectedPartyIds: activeParties.map((party) => party.id),
    }));
    setFieldErrors((current) => ({ ...current, participants: undefined, headcount: undefined }));
  }

  function useLastExpense() {
    if (!lastExpense) {
      return;
    }

    setDraft(buildDraftFromExpense(lastExpense, lastExpenseParticipants, parties));
    setFieldErrors({});
  }

  function clearSelection() {
    setDraft((current) => ({
      ...current,
      selectedPartyIds: [],
    }));
    setFieldErrors((current) => ({ ...current, participants: undefined, headcount: undefined }));
  }

  function buildParticipantsPayload() {
    return getOrderedSelectedPartyIds(draft.selectedPartyIds).map((partyId) => {
      const party = parties.find((item) => item.id === partyId);
      const parsed = Number(draft.headcountByPartyId[partyId] ?? party?.defaultHeadcount ?? 1);
      return {
        partyId,
        headcountSnapshot: Number.isInteger(parsed) && parsed > 0 ? parsed : 0,
      };
    });
  }

  function focusField(fieldName: ExpenseFieldName) {
    const refMap: Record<ExpenseFieldName, { current: HTMLElement | null }> = {
      title: titleFieldRef,
      amount: amountFieldRef,
      payer: payerFieldRef,
      participants: participantsFieldRef,
      headcount: headcountFieldRef,
      reason: reasonFieldRef,
    };
    const target = refMap[fieldName].current;

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = target.querySelector('input, select, textarea, button') as HTMLElement | null;
    input?.focus();
  }

  function validateDraft(): { errors: ExpenseFieldErrors; amountCents: number | null } {
    const errors: ExpenseFieldErrors = {};
    const amountText = draft.amount.trim().replace(/[￥元,\s]/g, '');
    const amountCents = parseAmountToCents(draft.amount);
    const participants = buildParticipantsPayload();

    if (!draft.title.trim()) {
      errors.title = '请先写这笔花费的短标题';
    }

    if (!amountText) {
      errors.amount = '请先填写金额';
    } else if (amountCents === null) {
      errors.amount = '金额格式不对，请重新填写';
    } else if (amountCents <= 0) {
      errors.amount = '金额必须大于 0';
    }

    if (draft.payerKind === 'party' && !draft.payerPartyId) {
      errors.payer = '这笔是谁先付的，还没选';
    }

    if (draft.payerKind === 'pool' && amountCents !== null && amountCents > poolBalanceCents) {
      errors.payer = '大家先收的钱不够支付这笔，请改成某家先垫，或先记一笔收款';
    }

    if (participants.length === 0) {
      errors.participants = '这笔还没选谁参加';
    }

    if (draft.shareMode === 'by_headcount') {
      const invalidHeadcount = participants.some((participant) => !Number.isInteger(participant.headcountSnapshot) || participant.headcountSnapshot <= 0);
      if (invalidHeadcount) {
        errors.headcount = '你选了按人数分，但还没填这次来了几个人';
      }
    }

    if (editingExpense && !draft.reason.trim()) {
      errors.reason = '这次为什么要改，请写清楚';
    }

    return { errors, amountCents };
  }

  async function handleSubmit() {
    const { errors, amountCents } = validateDraft();
    const firstErrorField = (['title', 'amount', 'payer', 'participants', 'headcount', 'reason'] as ExpenseFieldName[]).find((fieldName) => errors[fieldName]);

    setFieldErrors(errors);

    if (firstErrorField || amountCents === null) {
      if (firstErrorField) {
        focusField(firstErrorField);
      }
      return;
    }

    await onSave({
      expenseId: editingExpense?.id,
      paidAt: draft.paidAt,
      category: draft.category.trim() || undefined,
      title: draft.title.trim(),
      amountCents,
      payerKind: draft.payerKind,
      payerPartyId: draft.payerKind === 'party' ? draft.payerPartyId || undefined : undefined,
      shareMode: draft.shareMode,
      note: draft.note.trim() || undefined,
      reason: draft.reason.trim() || undefined,
      participants: buildParticipantsPayload(),
    });

    if (!editingExpense) {
      setDraft(buildBlankDraft(parties));
    }

    setFieldErrors({});
  }

  const liveAmountCents = parseAmountToCents(draft.amount);
  const liveParticipants = buildParticipantsPayload();
  const partyNamesById = useMemo(() => new Map(parties.map((party) => [party.id, party.name])), [parties]);
  const liveAllocation = useMemo(() => {
    if (liveAmountCents === null || liveAmountCents <= 0 || liveParticipants.length === 0) {
      return [];
    }

    try {
      return buildShareAllocationPreview({
        expense: {
          amountCents: liveAmountCents,
          shareMode: draft.shareMode,
        },
        participants: liveParticipants,
        parties,
      });
    } catch {
      return [];
    }
  }, [draft.shareMode, liveAmountCents, liveParticipants, parties]);

  const hasLiveBlockingErrors = Boolean(validateDraft().errors.title || validateDraft().errors.amount || validateDraft().errors.payer || validateDraft().errors.participants || validateDraft().errors.headcount);
  const liveSentence = !hasLiveBlockingErrors && liveAmountCents !== null
    ? buildExpenseConfirmationSentence({
        title: draft.title,
        amountCents: liveAmountCents,
        payerKind: draft.payerKind,
        payerPartyId: draft.payerPartyId || undefined,
        shareMode: draft.shareMode,
        participants: liveParticipants,
        poolBalanceCents,
        partyNamesById,
      })
    : '先把短标题、金额、谁先付、谁参加和怎么分填完整。';

  const liveTailSentence = liveAllocation.length > 0
    ? buildTailRuleSentence({
        parties,
        participants: liveAllocation.map((line) => ({ partyId: line.partyId, tailDeltaCents: line.tailDeltaCents })),
      })
    : '';

  return (
    <section className="panel-card form-panel with-sticky-bar">
      <div className="section-heading">
        <div>
          <h2>{editingExpense ? '修改这笔花费' : '记一笔花费'}</h2>
          <p>录入尽量短，但金额和分摊必须看得明白、改得清楚。</p>
        </div>
        {editingExpense ? (
          <button type="button" className="ghost-button" onClick={onCancelEdit}>
            取消修改
          </button>
        ) : null}
      </div>

      {editingExpense ? (
        <article className="editing-info">
          <strong>正在修改</strong>
          <p>{buildExpenseSummary(editingExpense, editingParticipants, parties)}</p>
        </article>
      ) : null}

      <div className="stack-form compact-form">
        <label ref={titleFieldRef}>
          <span>短标题</span>
          <input
            value={draft.title}
            onChange={(event) => {
              setPatch({ title: event.target.value });
              setFieldErrors((current) => ({ ...current, title: undefined }));
            }}
            placeholder="例如：西山晚饭 / 景区门票 / 路上买水"
          />
          {fieldErrors.title ? <p className="field-error">{fieldErrors.title}</p> : null}
        </label>

        <div className="two-col-row">
          <label ref={amountFieldRef}>
            <span>金额</span>
            <input
              value={draft.amount}
              onChange={(event) => {
                setPatch({ amount: event.target.value });
                setFieldErrors((current) => ({ ...current, amount: undefined }));
              }}
              inputMode="decimal"
              placeholder="例如：360"
            />
            {fieldErrors.amount ? <p className="field-error">{fieldErrors.amount}</p> : null}
          </label>

          <label>
            <span>日期</span>
            <input type="date" value={draft.paidAt} onChange={(event) => setPatch({ paidAt: event.target.value })} />
          </label>
        </div>

        <div ref={payerFieldRef} className="field-block">
          <span className="field-label">这笔是谁先付的</span>
          <div className="chip-row">
            <button
              type="button"
              className={draft.payerKind === 'party' ? 'chip active' : 'chip'}
              onClick={() => {
                setPatch({ payerKind: 'party' });
                setFieldErrors((current) => ({ ...current, payer: undefined }));
              }}
            >
              先由某家垫上
            </button>
            <button
              type="button"
              className={draft.payerKind === 'pool' ? 'chip active' : 'chip'}
              onClick={() => {
                setPatch({ payerKind: 'pool' });
                setFieldErrors((current) => ({ ...current, payer: undefined }));
              }}
            >
              从大家先收的钱里出
            </button>
          </div>

          {draft.payerKind === 'party' ? (
            <label className="compact-top-gap">
              <span>是哪一家先付的</span>
              <select
                value={draft.payerPartyId}
                onChange={(event) => {
                  setPatch({ payerPartyId: event.target.value });
                  setFieldErrors((current) => ({ ...current, payer: undefined }));
                }}
              >
                <option value="">请选择</option>
                {activeParties.map((party) => (
                  <option key={party.id} value={party.id}>{party.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {fieldErrors.payer ? <p className="field-error">{fieldErrors.payer}</p> : null}
        </div>

        <div ref={participantsFieldRef} className="field-block">
          <span className="field-label">这次谁参加</span>
          <div className="quick-row">
            <button type="button" className="ghost-button small-button" onClick={fillAllParties}>全员参加</button>
            <button type="button" className="ghost-button small-button" onClick={useLastExpense} disabled={!lastExpense}>沿用上一笔</button>
            <button type="button" className="ghost-button small-button" onClick={clearSelection}>清空重选</button>
          </div>
          <div className="check-grid">
            {activeParties.map((party) => {
              const selected = draft.selectedPartyIds.includes(party.id);
              return (
                <button
                  key={party.id}
                  type="button"
                  className={selected ? 'choice-chip active' : 'choice-chip'}
                  onClick={() => toggleParty(party.id)}
                >
                  <strong>{party.name}</strong>
                  <span>默认 {party.defaultHeadcount} 人</span>
                </button>
              );
            })}
          </div>
          {fieldErrors.participants ? <p className="field-error">{fieldErrors.participants}</p> : null}
        </div>

        <div className="field-block">
          <span className="field-label">这笔按什么分</span>
          <div className="chip-row">
            <button
              type="button"
              className={draft.shareMode === 'by_party' ? 'chip active' : 'chip'}
              onClick={() => {
                setPatch({ shareMode: 'by_party' });
                setFieldErrors((current) => ({ ...current, headcount: undefined }));
              }}
            >
              按参加的家数平分
            </button>
            <button
              type="button"
              className={draft.shareMode === 'by_headcount' ? 'chip active' : 'chip'}
              onClick={() => {
                setPatch({ shareMode: 'by_headcount' });
                setFieldErrors((current) => ({ ...current, headcount: undefined }));
              }}
            >
              按实际到场人数分
            </button>
          </div>
        </div>

        {draft.shareMode === 'by_headcount' && draft.selectedPartyIds.length > 0 ? (
          <div ref={headcountFieldRef} className="stack-list compact-top-gap">
            {getOrderedSelectedPartyIds(draft.selectedPartyIds).map((partyId) => {
              const party = parties.find((item) => item.id === partyId);
              return (
                <label key={partyId} className="inline-card compact-row">
                  <span>{party?.name ?? '未命名'}这次来了几个人</span>
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={draft.headcountByPartyId[partyId] ?? '1'}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        headcountByPartyId: {
                          ...current.headcountByPartyId,
                          [partyId]: event.target.value,
                        },
                      }));
                      setFieldErrors((current) => ({ ...current, headcount: undefined }));
                    }}
                  />
                </label>
              );
            })}
            {fieldErrors.headcount ? <p className="field-error">{fieldErrors.headcount}</p> : null}
          </div>
        ) : null}

        <details className="more-fields-card">
          <summary>补充说明（可不填）</summary>
          <div className="stack-form compact-top-gap">
            <label>
              <span>分类</span>
              <select value={draft.category} onChange={(event) => setPatch({ category: event.target.value })}>
                <option value="">不选也可以</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label>
              <span>备注</span>
              <input value={draft.note} onChange={(event) => setPatch({ note: event.target.value })} placeholder="例如：湖边饭店 / 三个大人一个孩子" />
            </label>

            {editingExpense ? (
              <label ref={reasonFieldRef}>
                <span>这次为什么要改</span>
                <input
                  value={draft.reason}
                  onChange={(event) => {
                    setPatch({ reason: event.target.value });
                    setFieldErrors((current) => ({ ...current, reason: undefined }));
                  }}
                  placeholder="例如：刚才金额记错了"
                />
                {fieldErrors.reason ? <p className="field-error">{fieldErrors.reason}</p> : null}
              </label>
            ) : null}
          </div>
        </details>
      </div>

      {liveAllocation.length > 0 ? (
        <article className="preview-card compact-preview-card">
          <p className="preview-title">这笔会这样分</p>
          <div className="simple-list preview-list">
            {liveAllocation.map((line) => (
              <div key={line.partyId} className="simple-row">
                <div>
                  <strong>{partyNamesById.get(line.partyId) ?? '未命名'}</strong>
                  <span>{draft.shareMode === 'by_headcount' ? `这次来了 ${line.headcountSnapshot} 人` : '按参加的家数平分'}</span>
                </div>
                <strong>{formatCurrency(line.shareAmountCents)}</strong>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div className="sticky-submit-bar">
        <div className="sticky-submit-copy">
          <strong>{liveSentence}</strong>
          <p>{liveTailSentence || '确认前先看清楚这笔是谁先付、谁一起出、按什么分。'}</p>
        </div>
        <button type="button" className="primary-button" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? '正在入账…' : editingExpense ? '确认保存修改' : '确认正式入账'}
        </button>
      </div>
    </section>
  );
}
