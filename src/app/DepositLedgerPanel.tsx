import { useEffect, useMemo, useRef, useState } from 'react';
import { type FullLedgerItem } from '../domain/fullLedger';
import type { Deposit, Party } from '../domain/types';
import { formatCurrency, formatDateLabel, formatRecordStatus, parseAmountToCents, todayInputValue } from '../utils/format';
import { ReasonDialog } from './ReasonDialog';

interface DepositLedgerPanelProps {
  parties: Party[];
  deposits: Deposit[];
  saving: boolean;
  poolBalanceCents: number;
  editingDeposit?: Deposit | null;
  depositTimeline?: FullLedgerItem[];
  onSave: (input: {
    depositId?: string;
    partyId: string;
    amountCents: number;
    paidAt: string;
    note?: string;
    reason?: string;
  }) => Promise<void>;
  onVoid: (input: { depositId: string; reason: string }) => Promise<void>;
  onCancelEdit?: () => void;
  onOpenFamilies?: () => void;
}

interface DepositDraftState {
  partyId: string;
  amount: string;
  paidAt: string;
  note: string;
  reason: string;
}

type DepositFieldName = 'partyId' | 'amount' | 'reason';
type DepositFieldErrors = Partial<Record<DepositFieldName, string>>;

function buildBlankDraft(): DepositDraftState {
  return {
    partyId: '',
    amount: '',
    paidAt: todayInputValue(),
    note: '',
    reason: '',
  };
}

function buildDraftFromDeposit(deposit: Deposit): DepositDraftState {
  return {
    partyId: deposit.partyId,
    amount: String(deposit.amountCents / 100),
    paidAt: deposit.paidAt,
    note: deposit.note ?? '',
    reason: '',
  };
}

function buildDepositSummary(deposit: Deposit, parties: Party[]): string {
  const partyName = parties.find((party) => party.id === deposit.partyId)?.name ?? '未命名';
  return `${partyName}成员入金 · ${formatCurrency(deposit.amountCents)} · ${formatDateLabel(deposit.paidAt)}${deposit.note?.trim() ? ` · 备注：${deposit.note.trim()}` : ''}`;
}

export function DepositLedgerPanel(props: DepositLedgerPanelProps) {
  const { parties, deposits, saving, poolBalanceCents, editingDeposit, depositTimeline = [], onSave, onVoid, onCancelEdit, onOpenFamilies } = props;
  const [localEditingDepositId, setLocalEditingDepositId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DepositDraftState>(buildBlankDraft());
  const [fieldErrors, setFieldErrors] = useState<DepositFieldErrors>({});
  const [voidTarget, setVoidTarget] = useState<Deposit | null>(null);

  const partyFieldRef = useRef<HTMLLabelElement | null>(null);
  const amountFieldRef = useRef<HTMLLabelElement | null>(null);
  const reasonFieldRef = useRef<HTMLLabelElement | null>(null);

  const activeEditingDeposit = useMemo(
    () => editingDeposit ?? deposits.find((deposit) => deposit.id === localEditingDepositId) ?? null,
    [deposits, editingDeposit, localEditingDepositId],
  );

  const timelineByDepositId = useMemo(
    () => new Map(depositTimeline.filter((item) => item.type === 'deposit').map((item) => [item.id, item])),
    [depositTimeline],
  );

  useEffect(() => {
    if (activeEditingDeposit) {
      setDraft(buildDraftFromDeposit(activeEditingDeposit));
      setFieldErrors({});
      return;
    }

    setDraft(buildBlankDraft());
    setFieldErrors({});
  }, [activeEditingDeposit]);

  function resetForm() {
    setDraft(buildBlankDraft());
    setLocalEditingDepositId(null);
    setFieldErrors({});
    onCancelEdit?.();
  }

  function focusField(fieldName: DepositFieldName) {
    const refMap: Record<DepositFieldName, { current: HTMLElement | null }> = {
      partyId: partyFieldRef,
      amount: amountFieldRef,
      reason: reasonFieldRef,
    };
    const target = refMap[fieldName].current;

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = target.querySelector('input, select, textarea') as HTMLElement | null;
    input?.focus();
  }

  function validateDraft(): { errors: DepositFieldErrors; amountCents: number | null } {
    const errors: DepositFieldErrors = {};
    const normalizedAmount = draft.amount.trim().replace(/[￥元,\s]/g, '');
    const amountCents = parseAmountToCents(draft.amount);

    if (!draft.partyId) {
      errors.partyId = '请先选哪一家入金';
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
    const firstErrorField = (['partyId', 'amount', 'reason'] as DepositFieldName[]).find((fieldName) => errors[fieldName]);

    setFieldErrors(errors);

    if (firstErrorField || amountCents === null) {
      if (firstErrorField) {
        focusField(firstErrorField);
      }
      return;
    }

    await onSave({
      depositId: activeEditingDeposit?.id,
      partyId: draft.partyId,
      amountCents,
      paidAt: draft.paidAt,
      note: draft.note.trim() || undefined,
      reason: draft.reason.trim() || undefined,
    });

    resetForm();
  }

  const liveAmountCents = parseAmountToCents(draft.amount);
  const livePartyName = parties.find((party) => party.id === draft.partyId)?.name;
  const currentEffect = activeEditingDeposit && (activeEditingDeposit.status ?? 'posted') === 'posted' ? activeEditingDeposit.amountCents : 0;
  const projectedBalance = liveAmountCents !== null ? poolBalanceCents - currentEffect + liveAmountCents : null;
  const liveSentence = livePartyName && liveAmountCents !== null && liveAmountCents > 0
    ? `${livePartyName}本次入金 ${formatCurrency(liveAmountCents)}。这不是支出，只是把经费记进公账。正式入账后，公账可用余额会变成 ${formatCurrency(projectedBalance ?? poolBalanceCents)}。`
    : '先选成员，再填写入金金额。';

  return (
    <section className="panel-card form-panel with-sticky-bar">
      <div className="section-heading">
        <div>
          <h2>{activeEditingDeposit ? '调整这笔成员入金' : '成员入金'}</h2>
          <p>这里记的是成员先交上来的经费，不是支出。只要已经在当前账本成员名单里，就算还没参加过任何支出，也可以先入金。</p>
        </div>
        {activeEditingDeposit ? (
          <button type="button" className="ghost-button" onClick={resetForm}>
            取消调整
          </button>
        ) : null}
      </div>

      {parties.length === 0 ? (
        <article className="inline-card compact-top-gap">
          <strong>还没有成员</strong>
          <p>成员入金不需要先参加过支出，但要先把成员加进当前账本。先去成员名单加一个成员，再回来入金。</p>
          {onOpenFamilies ? (
            <div className="action-row">
              <button type="button" className="ghost-button small-button" onClick={onOpenFamilies}>
                先去加成员
              </button>
            </div>
          ) : null}
        </article>
      ) : null}

      {activeEditingDeposit ? (
        <article className="editing-info">
          <strong>正在调整</strong>
          <p>{buildDepositSummary(activeEditingDeposit, parties)}</p>
        </article>
      ) : null}

      <div className="stack-form compact-form">
        <label ref={partyFieldRef}>
          <span>哪一家入金</span>
          <select
            value={draft.partyId}
            onChange={(event) => {
              setDraft((current) => ({ ...current, partyId: event.target.value }));
              setFieldErrors((current) => ({ ...current, partyId: undefined }));
            }}
          >
            <option value="">请选择</option>
            {parties.map((party) => (
              <option key={party.id} value={party.id}>{party.name}</option>
            ))}
          </select>
          {fieldErrors.partyId ? <p className="field-error">{fieldErrors.partyId}</p> : null}
        </label>

        <label ref={amountFieldRef}>
          <span>入金金额</span>
          <input
            value={draft.amount}
            onChange={(event) => {
              setDraft((current) => ({ ...current, amount: event.target.value }));
              setFieldErrors((current) => ({ ...current, amount: undefined }));
            }}
            inputMode="decimal"
            placeholder="例如：300"
          />
          {fieldErrors.amount ? <p className="field-error">{fieldErrors.amount}</p> : null}
        </label>

        <label>
          <span>日期</span>
          <input type="date" value={draft.paidAt} onChange={(event) => setDraft((current) => ({ ...current, paidAt: event.target.value }))} />
        </label>

        <label>
          <span>备注（可不填）</span>
          <input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="例如：出发前先收 / 这次先存一部分" />
        </label>

        {activeEditingDeposit ? (
          <label ref={reasonFieldRef}>
            <span>调整原因</span>
            <input
              value={draft.reason}
              onChange={(event) => {
                setDraft((current) => ({ ...current, reason: event.target.value }));
                setFieldErrors((current) => ({ ...current, reason: undefined }));
              }}
              placeholder="例如：刚才金额写错了"
            />
            {fieldErrors.reason ? <p className="field-error">{fieldErrors.reason}</p> : null}
          </label>
        ) : null}
      </div>

      <div className="stack-list ledger-list compact-top-gap">
        {deposits.map((deposit) => {
          const partyName = parties.find((party) => party.id === deposit.partyId)?.name ?? '未命名';
          const ledgerItem = timelineByDepositId.get(deposit.id);
          return (
            <details key={deposit.id} className="ledger-card detail-disclosure">
              <summary className="detail-summary detail-summary-actions">
                <div className="ledger-main">
                  <div className="history-topline">
                    <span className={`status-pill ${(deposit.status ?? 'posted') === 'posted' ? 'posted' : 'void'}`}>{formatRecordStatus(deposit.status ?? 'posted')}</span>
                    <span className="history-date">{formatDateLabel(deposit.paidAt)}</span>
                  </div>
                  <strong>成员入金</strong>
                  <p className="secondary-meta">{partyName}入金</p>
                </div>
                <div className="ledger-side">
                  <strong>{formatCurrency(deposit.amountCents)}</strong>
                  {(deposit.status ?? 'posted') === 'posted' ? (
                    <div className="summary-actions">
                      <button type="button" className="ghost-button small-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLocalEditingDepositId(deposit.id); }}>
                        调整账目
                      </button>
                      <button type="button" className="ghost-button small-button danger-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setVoidTarget(deposit); }}>
                        作废账目
                      </button>
                    </div>
                  ) : null}
                </div>
              </summary>
              <div className="detail-body">
                <p>{deposit.note?.trim() ? `备注：${deposit.note.trim()}` : '没写备注。'}</p>
                {ledgerItem ? (
                  <p className="pool-note">
                    {(deposit.status ?? 'posted') === 'posted'
                      ? `这笔入金后，公账可用余额变成 ${formatCurrency(ledgerItem.poolBalanceAfterCents)}`
                      : '这笔已作废，不再计入公账'}
                  </p>
                ) : null}
                {deposit.auditTrail && deposit.auditTrail.length > 1 ? <p className="audit-note">{deposit.auditTrail[deposit.auditTrail.length - 1].afterSummary}</p> : null}
              </div>
            </details>
          );
        })}
      </div>

      <div className="sticky-submit-bar">
        <div className="sticky-submit-copy">
          <strong>{liveSentence}</strong>
          {activeEditingDeposit ? <p>调整原因也会一并记进调整记录里。</p> : <p>正式入账后，这笔会进入公账和总账流水。</p>}
        </div>
        <button type="button" className="primary-button" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? '正在入账…' : activeEditingDeposit ? '确认保存调整' : '确认正式入账'}
        </button>
      </div>

      <ReasonDialog
        open={Boolean(voidTarget)}
        title="作废这笔成员入金"
        summary={voidTarget ? buildDepositSummary(voidTarget, parties) : ''}
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
