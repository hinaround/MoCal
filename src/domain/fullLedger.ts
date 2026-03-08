import { isPostedRecord } from './share';
import { buildTailRuleSentence } from './validation';
import type { Deposit, Expense, ExpenseParticipant, Party } from './types';

export interface LedgerShareLine {
  partyId: string;
  partyName: string;
  headcountSnapshot: number;
  shareAmountCents: number;
  tailDeltaCents: number;
}

export interface FullLedgerItem {
  id: string;
  date: string;
  type: 'deposit' | 'expense';
  status: 'posted' | 'void';
  title: string;
  subtitle: string;
  amountCents: number;
  poolDeltaCents: number;
  poolBalanceAfterCents: number;
  explanation: string;
  note?: string;
  tailNote?: string;
  dialogSummary: string;
  shares: LedgerShareLine[];
  auditNote?: string;
  recordedAt: string;
  sequenceNo: number;
}

interface StableLedgerRecord {
  paidAt: string;
  recordedAt?: string;
  createdAt?: string;
  sequenceNo?: number;
}

function formatMoney(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)}元`;
}

function resolveRecordedAt(record: StableLedgerRecord): string {
  return record.recordedAt ?? record.createdAt ?? `${record.paidAt}T12:00:00.000Z`;
}

function resolveSequenceNo(record: StableLedgerRecord, fallbackIndex: number): number {
  if (typeof record.sequenceNo === 'number' && Number.isFinite(record.sequenceNo)) {
    return record.sequenceNo;
  }

  const parsed = Date.parse(resolveRecordedAt(record));
  return Number.isNaN(parsed) ? fallbackIndex : parsed * 1000 + fallbackIndex;
}

function buildAuditNote(auditTrail?: Array<{ action: string; reason?: string; beforeSummary?: string; afterSummary: string }>): string | undefined {
  if (!auditTrail || auditTrail.length <= 1) {
    return undefined;
  }

  const lastEntry = auditTrail[auditTrail.length - 1];

  if (lastEntry.action === 'voided') {
    return `已作废${lastEntry.reason ? `（原因：${lastEntry.reason}）` : ''}：${lastEntry.beforeSummary || lastEntry.afterSummary}`;
  }

  if (lastEntry.action === 'updated') {
    return `后来改过${lastEntry.reason ? `（原因：${lastEntry.reason}）` : ''}：${lastEntry.beforeSummary || '旧内容'} → ${lastEntry.afterSummary}`;
  }

  return undefined;
}

function buildPayerLabel(expense: Expense, partyNames: Map<string, string>): string {
  return expense.payerKind === 'pool'
    ? '从大家先收的钱里出'
    : `先由${partyNames.get(expense.payerPartyId ?? '') ?? '未命名'}垫上`;
}

function buildShareModeLabel(expense: Expense): string {
  return expense.shareMode === 'by_party' ? '按参加的家数平分' : '按实际到场人数分';
}

function sortSharesByPartyOrder(shares: ExpenseParticipant[], parties: Party[]): ExpenseParticipant[] {
  const sortOrderById = new Map(parties.map((party) => [party.id, party.sortOrder]));
  return [...shares].sort(
    (left, right) =>
      (sortOrderById.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) -
      (sortOrderById.get(right.partyId) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function buildFullLedger(params: {
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}) {
  const partyNames = new Map(params.parties.map((party) => [party.id, party.name]));
  const participantsByExpenseId = new Map<string, ExpenseParticipant[]>();

  for (const participant of params.expenseParticipants) {
    const group = participantsByExpenseId.get(participant.expenseId) ?? [];
    group.push(participant);
    participantsByExpenseId.set(participant.expenseId, group);
  }

  const mixedRecords = [
    ...params.deposits.map((deposit, index) => ({ type: 'deposit' as const, record: deposit, index })),
    ...params.expenses.map((expense, index) => ({ type: 'expense' as const, record: expense, index: params.deposits.length + index })),
  ].sort((left, right) => {
    const leftSequence = resolveSequenceNo(left.record, left.index);
    const rightSequence = resolveSequenceNo(right.record, right.index);
    return (
      leftSequence - rightSequence ||
      resolveRecordedAt(left.record).localeCompare(resolveRecordedAt(right.record)) ||
      left.record.paidAt.localeCompare(right.record.paidAt) ||
      left.index - right.index
    );
  });

  const timeline: FullLedgerItem[] = [];
  let poolBalanceCents = 0;

  for (const item of mixedRecords) {
    if (item.type === 'deposit') {
      const deposit = item.record;
      const posted = isPostedRecord(deposit);
      const partyName = partyNames.get(deposit.partyId) ?? '未命名';

      if (posted) {
        poolBalanceCents += deposit.amountCents;
      }

      timeline.push({
        id: deposit.id,
        date: deposit.paidAt,
        type: 'deposit',
        status: deposit.status ?? 'posted',
        title: '先收的钱',
        subtitle: `${partyName}交来 · 这不是花费`,
        amountCents: deposit.amountCents,
        poolDeltaCents: posted ? deposit.amountCents : 0,
        poolBalanceAfterCents: poolBalanceCents,
        explanation: posted ? '这笔会进公账，后面花费才能从这里出。' : '这笔已作废，不再计入公账。',
        note: deposit.note?.trim(),
        dialogSummary: `${partyName}先交的钱 · ${formatMoney(deposit.amountCents)} · 日期 ${deposit.paidAt}${deposit.note?.trim() ? ` · 备注：${deposit.note.trim()}` : ''}`,
        shares: [],
        auditNote: buildAuditNote(deposit.auditTrail),
        recordedAt: resolveRecordedAt(deposit),
        sequenceNo: resolveSequenceNo(deposit, item.index),
      });

      continue;
    }

    const expense = item.record;
    const posted = isPostedRecord(expense);
    const storedParticipants = sortSharesByPartyOrder(participantsByExpenseId.get(expense.id) ?? [], params.parties);

    if (posted && expense.payerKind === 'pool') {
      poolBalanceCents -= expense.amountCents;
    }

    const shares = storedParticipants.map((participant) => ({
      partyId: participant.partyId,
      partyName: partyNames.get(participant.partyId) ?? '未命名',
      headcountSnapshot: participant.headcountSnapshot,
      shareAmountCents: participant.shareAmountCents,
      tailDeltaCents: participant.tailDeltaCents ?? 0,
    }));

    const participantLabel = shares
      .map((share) => `${share.partyName}${expense.shareMode === 'by_headcount' ? `${share.headcountSnapshot}人` : ''}`)
      .join('、');
    const payerLabel = buildPayerLabel(expense, partyNames);
    const shareLabel = buildShareModeLabel(expense);
    const title = expense.title?.trim() || expense.category?.trim() || '未写标题';

    timeline.push({
      id: expense.id,
      date: expense.paidAt,
      type: 'expense',
      status: expense.status ?? 'posted',
      title,
      subtitle: `${payerLabel} · 这次谁参加：${participantLabel || '未填写'} · ${shareLabel}`,
      amountCents: expense.amountCents,
      poolDeltaCents: posted && expense.payerKind === 'pool' ? -expense.amountCents : 0,
      poolBalanceAfterCents: poolBalanceCents,
      explanation: posted ? '这笔已经正式入账，分摊直接按已保存结果展示。' : '这笔已作废，不再计入总账。',
      note: expense.note?.trim(),
      tailNote: shares.length > 0
        ? buildTailRuleSentence({
            parties: params.parties,
            participants: shares.map((share) => ({ partyId: share.partyId, tailDeltaCents: share.tailDeltaCents })),
          })
        : undefined,
      dialogSummary: `${title} · ${formatMoney(expense.amountCents)} · ${payerLabel} · 这次谁参加：${participantLabel || '未填写'} · ${shareLabel}${expense.note?.trim() ? ` · 备注：${expense.note.trim()}` : ''}`,
      shares,
      auditNote: buildAuditNote(expense.auditTrail),
      recordedAt: resolveRecordedAt(expense),
      sequenceNo: resolveSequenceNo(expense, item.index),
    });
  }

  return timeline;
}
