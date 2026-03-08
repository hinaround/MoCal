import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deposit, MemberProfile, Trip } from '../domain/types';
import { formatCurrency, formatDateLabel, formatRecordStatus, parseAmountToCents, todayInputValue } from '../utils/format';
import { ReasonDialog } from './ReasonDialog';

interface MemberDepositPanelProps {
  members: MemberProfile[];
  trips: Trip[];
  deposits: Deposit[];
  saving: boolean;
  poolBalanceCents: number;
  editingDeposit?: Deposit | null;
  onSave: (input: {
    depositId?: string;
    memberProfileId: string;
    amountCents: number;
    paidAt: string;
    note?: string;
    reason?: string;
  }) => Promise<void>;
  onVoid: (input: { depositId: string; reason: string }) => Promise<void>;
  onCancelEdit?: () => void;
}

interface DepositDraftState {
  memberProfileId: string;
  amount: string;
  paidAt: string;
  note: string;
  reason: string;
}

type DepositFieldName = 'memberProfileId' | 'amount' | 'reason';
type DepositFieldErrors = Partial<Record<DepositFieldName, string>>;

function buildBlankDraft(): DepositDraftState {
  return {
    memberProfileId: '',
    amount: '',
    paidAt: todayInputValue(),
    note: '',
    reason: '',
  };
}

function buildDraftFromDeposit(deposit: Deposit): DepositDraftState {
  return {
    memberProfileId: deposit.memberProfileId ?? '',
    amount: String(deposit.amountCents / 100),
    paidAt: deposit.paidAt,
    note: deposit.note ?? '',
    reason: '',
  };
}

export function MemberDepositPanel(props: MemberDepositPanelProps) {
  const { members, trips, deposits, saving, poolBalanceCents, editingDeposit, onSave, onVoid, onCancelEdit } = props;
  const [localEditingDepositId, setLocalEditingDepositId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DepositDraftState>(buildBlankDraft());
  const [fieldErrors, setFieldErrors] = useState<DepositFieldErrors>({});
  const [voidTarget, setVoidTarget] = useState<Deposit | null>(null);

  const memberFieldRef = useRef<HTMLLabelElement | null>(null);
  const amountFieldRef = useRef<HTMLLabelElement | null>(null);
  const reasonFieldRef = useRef<HTMLLabelElement | null>(null);

  const activeEditingDeposit = useMemo(
    () => editingDeposit ?? deposits.find((deposit) => deposit.id === localEditingDepositId) ?? null,
    [deposits, editingDeposit, localEditingDepositId],
  );

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);

  useEffect(() => {
    if (activeEditingDeposit) {
      setDraft(buildDraftFromDeposit(activeEditingDeposit));
      setFieldErrors({});
      return;
    }
    setDraft(buildBlankDraft());
    setFieldErrors({});
  }, [activeEditingDeposit]);

  function focusField(fieldName: DepositFieldName) {
    const refMap: Record<DepositFieldName, { current: HTMLElement | null }> = {
      memberProfileId: memberFieldRef,
      amount: amountFieldRef,
      reason: reasonFieldRef,
    };
    const target = refMap[fieldName].current;
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = target.querySelector('input, select') as HTMLElement | null;
    input?.focus();
  }

  function validateDraft(): { errors: DepositFieldErrors; amountCents: number | null } {
    const errors: DepositFieldErrors = {};
    const normalizedAmount = draft.amount.trim().replace(/[￥元,\s]/g, '');
    const amountCents = parseAmountToCents(draft.amount);
    if (!draft.memberProfileId) {
      errors.memberProfileId = '请先选哪一位成员交款';
    }
    if (!normalizedAmount) {
      errors.amount = '请先填写金额';
    } else if (amountCents === null) {
      errors.amount = '金额格式不对，请重新填写';
    } else if (amountCents <= 0) {
      errors.amount = '金额必须大于 0';
    }
    if (activeEditingDeposit && !draft.reason.trim()) {
      errors.reason = '请填写调整原因';
    }
    return { errors, amountCents };
  }

  async function handleSubmit() {
    const { errors, amountCents } = validateDraft();
    const firstErrorField = (['memberProfileId', 'amount', 'reason'] as DepositFieldName[]).find((fieldName) => errors[fieldName]);
    setFieldErrors(errors);
    if (firstErrorField || amountCents === null) {
      if (firstErrorField) {
        focusField(firstErrorField);
      }
      return;
    }
    await onSave({
      depositId: activeEditingDeposit?.id,
      memberProfileId: draft.memberProfileId,
      amountCents,
      paidAt: draft.paidAt,
      note: draft.note.trim() || undefined,
      reason: draft.reason.trim() || undefined,
    });
    setLocalEditingDepositId(null);
    setDraft(buildBlankDraft());
    setFieldErrors({});
  }

  const liveAmountCents = parseAmountToCents(draft.amount);
  const liveMemberName = memberById.get(draft.memberProfileId)?.name;
  const currentEffect = activeEditingDeposit && (activeEditingDeposit.status ?? 'posted') === 'posted' ? activeEditingDeposit.amountCents : 0;
  const projectedBalance = liveAmountCents !== null ? poolBalanceCents - currentEffect + liveAmountCents : null;
  const liveSentence = liveMemberName && liveAmountCents !== null && liveAmountCents > 0
    ? `${liveMemberName}本次交款 ${formatCurrency(liveAmountCents)}。这不是支出，只是先把钱记进总账公账。正式入账后，公账余额会变成 ${formatCurrency(projectedBalance ?? poolBalanceCents)}。`
    : '先选成员，再填写交款金额。';

  return (
    <section className="panel-card form-panel with-sticky-bar compact-top-gap">
      <div className="section-heading">
        <div>
          <h2>{activeEditingDeposit ? '调整这笔成员交款' : '成员交款'}</h2>
          <p>这里记的是全局成员交款，不要求先进入某个活动。以后开始活动时，这笔钱也已经在总账里了。</p>
        </div>
        {activeEditingDeposit ? (
          <button type="button" className="ghost-button" onClick={() => { setLocalEditingDepositId(null); setDraft(buildBlankDraft()); onCancelEdit?.(); }}>
            取消调整
          </button>
        ) : null}
      </div>

      <div className="stack-form compact-form">
        <label ref={memberFieldRef}>
          <span>哪一位成员交款</span>
          <select value={draft.memberProfileId} onChange={(event) => { setDraft((current) => ({ ...current, memberProfileId: event.target.value })); setFieldErrors((current) => ({ ...current, memberProfileId: undefined })); }}>
            <option value="">请选择</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          {fieldErrors.memberProfileId ? <p className="field-error">{fieldErrors.memberProfileId}</p> : null}
        </label>

        <label ref={amountFieldRef}>
          <span>交款金额</span>
          <input value={draft.amount} onChange={(event) => { setDraft((current) => ({ ...current, amount: event.target.value })); setFieldErrors((current) => ({ ...current, amount: undefined })); }} inputMode="decimal" placeholder="例如：300" />
          {fieldErrors.amount ? <p className="field-error">{fieldErrors.amount}</p> : null}
        </label>

        <label>
          <span>日期</span>
          <input type="date" value={draft.paidAt} onChange={(event) => setDraft((current) => ({ ...current, paidAt: event.target.value }))} />
        </label>

        <label>
          <span>备注（可不填）</span>
          <input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="例如：出发前先收 / 暂时不归任何活动" />
        </label>

        {activeEditingDeposit ? (
          <label ref={reasonFieldRef}>
            <span>调整原因</span>
            <input value={draft.reason} onChange={(event) => { setDraft((current) => ({ ...current, reason: event.target.value })); setFieldErrors((current) => ({ ...current, reason: undefined })); }} placeholder="例如：刚才金额写错了" />
            {fieldErrors.reason ? <p className="field-error">{fieldErrors.reason}</p> : null}
          </label>
        ) : null}
      </div>

      <div className="section-heading compact-gap compact-top-gap">
        <div>
          <h3>最近交款</h3>
          <p>这里看的是全局交款记录；不管有没有活动，都能先收钱。</p>
        </div>
      </div>
      <div className="stack-list ledger-list">
        {deposits.length === 0 ? (
          <article className="inline-card">
            <strong>还没有交款记录</strong>
            <p className="storage-note">先记第一笔成员交款，总账和成员余额就会开始累计。</p>
          </article>
        ) : deposits.slice(0, 6).map((deposit) => {
          const memberName = memberById.get(deposit.memberProfileId ?? '')?.name ?? '未命名';
          const tripName = deposit.tripId ? tripById.get(deposit.tripId)?.name : undefined;
          return (
            <details key={deposit.id} className="ledger-card detail-disclosure">
              <summary className="detail-summary detail-summary-actions">
                <div className="ledger-main">
                  <div className="history-topline">
                    <span className={`status-pill ${(deposit.status ?? 'posted') === 'posted' ? 'posted' : 'void'}`}>{formatRecordStatus(deposit.status ?? 'posted')}</span>
                    <span className="history-date">{formatDateLabel(deposit.paidAt)}</span>
                  </div>
                  <strong>成员交款</strong>
                  <p className="secondary-meta">{memberName}交款{tripName ? ` · 关联活动：${tripName}` : ' · 不属于任何活动'}</p>
                </div>
                <div className="ledger-side">
                  <strong>{formatCurrency(deposit.amountCents)}</strong>
                  {(deposit.status ?? 'posted') === 'posted' ? (
                    <div className="summary-actions">
                      <button type="button" className="ghost-button small-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLocalEditingDepositId(deposit.id); }}>
                        改这笔
                      </button>
                      <button type="button" className="ghost-button small-button danger-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setVoidTarget(deposit); }}>
                        作废这笔
                      </button>
                    </div>
                  ) : null}
                </div>
              </summary>
              <div className="detail-body">
                <p>{deposit.note?.trim() ? `备注：${deposit.note.trim()}` : '没写备注。'}</p>
              </div>
            </details>
          );
        })}
      </div>

      <div className="sticky-submit-bar">
        <div className="sticky-submit-copy">
          <strong>{liveSentence}</strong>
          {activeEditingDeposit ? <p>调整原因也会一并记进调整记录里。</p> : <p>正式入账后，这笔会进入总账，也会进入成员历史。</p>}
        </div>
        <button type="button" className="primary-button" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? '正在入账…' : activeEditingDeposit ? '确认保存调整' : '确认正式入账'}
        </button>
      </div>

      <ReasonDialog
        open={Boolean(voidTarget)}
        title="作废这笔成员交款"
        summary={voidTarget ? `${memberById.get(voidTarget.memberProfileId ?? '')?.name ?? '未命名'}成员交款 · ${formatCurrency(voidTarget.amountCents)} · ${formatDateLabel(voidTarget.paidAt)}` : ''}
        reasonLabel="作废原因"
        confirmText="确认作废"
        saving={saving}
        onCancel={() => setVoidTarget(null)}
        onConfirm={async (reason) => {
          if (!voidTarget) {
            return;
          }
          await onVoid({ depositId: voidTarget.id, reason });
          setVoidTarget(null);
        }}
      />
    </section>
  );
}
