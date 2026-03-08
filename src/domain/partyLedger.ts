import { isPostedRecord } from './share';
import { buildTripSettlement } from './settlement';
import type { Deposit, Expense, ExpenseParticipant, Party, SettlementSummary } from './types';

export type PartyHistoryKind = 'deposit' | 'paid' | 'share';

export interface PartyHistoryItem {
  id: string;
  date: string;
  kind: PartyHistoryKind;
  kindLabel: string;
  title: string;
  detail: string;
  note?: string;
  signedAmountCents: number;
  afterNetCents: number;
  status: 'posted' | 'void';
  auditNote?: string;
}

export interface PartyLedger {
  summary: SettlementSummary | null;
  history: PartyHistoryItem[];
}

interface StableLedgerRecord {
  paidAt: string;
  recordedAt?: string;
  createdAt?: string;
  sequenceNo?: number;
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

function getExpenseTitle(expense: Expense): string {
  return expense.title?.trim() || expense.category?.trim() || '未写标题';
}

function getShareModeLabel(expense: Expense): string {
  return expense.shareMode === 'by_party' ? '按参加的家数平分' : '按实际到场人数分';
}

function getAuditNote(auditTrail?: Array<{ action: string; reason?: string; beforeSummary?: string; afterSummary: string }>): string | undefined {
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

function buildParticipantsMap(expenseParticipants: ExpenseParticipant[]): Map<string, ExpenseParticipant[]> {
  const map = new Map<string, ExpenseParticipant[]>();

  for (const participant of expenseParticipants) {
    const group = map.get(participant.expenseId) ?? [];
    group.push(participant);
    map.set(participant.expenseId, group);
  }

  return map;
}

export function buildPartyLedger(params: {
  partyId: string;
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}): PartyLedger {
  const { partyId, parties, deposits, expenses, expenseParticipants } = params;
  const settlement = buildTripSettlement({ parties, deposits, expenses, expenseParticipants });
  const summary = settlement.summaries.find((item) => item.partyId === partyId) ?? null;
  const partyName = parties.find((item) => item.id === partyId)?.name ?? '这家';
  const partyNames = new Map(parties.map((party) => [party.id, party.name]));
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));
  const participantsMap = buildParticipantsMap(expenseParticipants);
  const sortOrderById = new Map(parties.map((party) => [party.id, party.sortOrder]));

  const items: Array<Omit<PartyHistoryItem, 'afterNetCents'> & { sequenceNo: number; itemOrder: number; originalIndex: number }> = [];
  let originalIndex = 0;

  for (const deposit of deposits.filter((item) => item.partyId === partyId)) {
    items.push({
      id: `deposit:${deposit.id}`,
      date: deposit.paidAt,
      kind: 'deposit',
      kindLabel: '收款',
      title: '先收的钱',
      detail: `${partyName}交来，记进公账，不是花费。`,
      note: deposit.note?.trim(),
      signedAmountCents: deposit.amountCents,
      status: deposit.status ?? 'posted',
      auditNote: getAuditNote(deposit.auditTrail),
      sequenceNo: resolveSequenceNo(deposit, originalIndex),
      itemOrder: 0,
      originalIndex: originalIndex += 1,
    });
  }

  for (const expense of expenses.filter((item) => item.payerKind === 'party' && item.payerPartyId === partyId)) {
    const participants = [...(participantsMap.get(expense.id) ?? [])].sort(
      (left, right) =>
        (sortOrderById.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) -
        (sortOrderById.get(right.partyId) ?? Number.MAX_SAFE_INTEGER),
    );

    const participantNames = participants.map((participant) => `${partyNames.get(participant.partyId) ?? '未命名'}${expense.shareMode === 'by_headcount' ? `${participant.headcountSnapshot}人` : ''}`);

    items.push({
      id: `paid:${expense.id}`,
      date: expense.paidAt,
      kind: 'paid',
      kindLabel: '代付',
      title: getExpenseTitle(expense),
      detail: `先由${partyName}垫上 · 这次谁参加：${participantNames.join('、') || '未填写'} · ${getShareModeLabel(expense)}`,
      note: expense.note?.trim(),
      signedAmountCents: expense.amountCents,
      status: expense.status ?? 'posted',
      auditNote: getAuditNote(expense.auditTrail),
      sequenceNo: resolveSequenceNo(expense, originalIndex),
      itemOrder: 1,
      originalIndex: originalIndex += 1,
    });
  }

  for (const participant of expenseParticipants.filter((item) => item.partyId === partyId)) {
    const expense = expenseById.get(participant.expenseId);

    if (!expense) {
      continue;
    }

    const participants = [...(participantsMap.get(expense.id) ?? [])].sort(
      (left, right) =>
        (sortOrderById.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) -
        (sortOrderById.get(right.partyId) ?? Number.MAX_SAFE_INTEGER),
    );
    const participantNames = participants.map((item) => `${partyNames.get(item.partyId) ?? '未命名'}${expense.shareMode === 'by_headcount' ? `${item.headcountSnapshot}人` : ''}`);
    const payerLabel = expense.payerKind === 'pool' ? '从大家先收的钱里出' : `先由${partyNames.get(expense.payerPartyId ?? '') ?? '未命名'}垫上`;

    items.push({
      id: `share:${participant.id}`,
      date: expense.paidAt,
      kind: 'share',
      kindLabel: '分摊',
      title: getExpenseTitle(expense),
      detail: `${payerLabel} · 这次谁参加：${participantNames.join('、')} · ${getShareModeLabel(expense)}`,
      note: expense.note?.trim(),
      signedAmountCents: -participant.shareAmountCents,
      status: expense.status ?? 'posted',
      auditNote: getAuditNote(expense.auditTrail),
      sequenceNo: resolveSequenceNo(expense, originalIndex),
      itemOrder: 2,
      originalIndex: originalIndex += 1,
    });
  }

  const ordered = items.sort(
    (left, right) => left.sequenceNo - right.sequenceNo || left.itemOrder - right.itemOrder || left.originalIndex - right.originalIndex,
  );

  let runningNetCents = 0;
  const history = ordered.map((item) => {
    if (item.status === 'posted' && isPostedRecord({ status: item.status })) {
      runningNetCents += item.signedAmountCents;
    }

    return {
      id: item.id,
      date: item.date,
      kind: item.kind,
      kindLabel: item.kindLabel,
      title: item.title,
      detail: item.detail,
      note: item.note,
      signedAmountCents: item.signedAmountCents,
      afterNetCents: runningNetCents,
      status: item.status,
      auditNote: item.auditNote,
    } satisfies PartyHistoryItem;
  });

  return {
    summary,
    history,
  };
}
