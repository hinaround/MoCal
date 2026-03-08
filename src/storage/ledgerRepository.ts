import { buildExpenseParticipants } from '../domain/share';
import type {
  AuditTrailEntry,
  Deposit,
  Expense,
  ExpenseParticipant,
  Party,
  ShareParticipantInput,
  Trip,
} from '../domain/types';
import {
  STORE_NAMES,
  addExpenseBundle,
  addRecord,
  deleteRecord,
  getAll,
  getAllByIndex,
  getById,
  putRecord,
  replaceExpenseBundle,
} from './db';

export interface TripBundle {
  trip: Trip;
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}

let sequenceSeed = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nextSequenceNo(): number {
  const candidate = Date.now() * 1000;
  sequenceSeed = candidate <= sequenceSeed ? sequenceSeed + 1 : candidate;
  return sequenceSeed;
}

function syncSequenceSeed(records: Array<{ sequenceNo?: number }>): void {
  const maxValue = records.reduce((currentMax, record) => Math.max(currentMax, record.sequenceNo ?? 0), 0);
  sequenceSeed = Math.max(sequenceSeed, maxValue);
}

function formatMoney(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)}元`;
}

function getShareModeLabel(shareMode: Expense['shareMode']): string {
  return shareMode === 'by_party' ? '按参加的家数平分' : '按实际到场人数分';
}

function sortParticipantsByPartyOrder(participants: ShareParticipantInput[] | ExpenseParticipant[], parties: Party[]): Array<ShareParticipantInput | ExpenseParticipant> {
  const sortOrderById = new Map(parties.map((party) => [party.id, party.sortOrder]));
  return [...participants].sort(
    (left, right) =>
      (sortOrderById.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) -
      (sortOrderById.get(right.partyId) ?? Number.MAX_SAFE_INTEGER),
  );
}

function buildParticipantSummary(participants: Array<{ partyId: string; headcountSnapshot: number }>, parties: Party[]): string {
  const partyNamesById = new Map(parties.map((party) => [party.id, party.name]));
  return sortParticipantsByPartyOrder(participants, parties)
    .map((participant) => `${partyNamesById.get(participant.partyId) ?? '未命名'} ${participant.headcountSnapshot}人`)
    .join('、');
}

function buildPayerSummary(expense: Pick<Expense, 'payerKind' | 'payerPartyId'>, parties: Party[]): string {
  if (expense.payerKind === 'pool') {
    return '从大家先收的钱里出';
  }

  const partyName = parties.find((party) => party.id === expense.payerPartyId)?.name ?? '未命名';
  return `先由${partyName}垫上`;
}

function resolveRecordedAt(record: { paidAt: string; createdAt?: string; recordedAt?: string }): string {
  return record.recordedAt ?? record.createdAt ?? `${record.paidAt}T12:00:00.000Z`;
}

function resolveSequenceNo(record: { paidAt: string; createdAt?: string; recordedAt?: string; sequenceNo?: number }, fallbackIndex: number): number {
  if (typeof record.sequenceNo === 'number' && Number.isFinite(record.sequenceNo)) {
    return record.sequenceNo;
  }

  const parsed = Date.parse(resolveRecordedAt(record));
  return Number.isNaN(parsed) ? fallbackIndex : parsed * 1000 + fallbackIndex;
}

function sortByStableOrderDesc<T extends { paidAt: string; createdAt?: string; recordedAt?: string; sequenceNo?: number }>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftSequence = resolveSequenceNo(left.item, left.index);
      const rightSequence = resolveSequenceNo(right.item, right.index);
      return (
        rightSequence - leftSequence ||
        resolveRecordedAt(right.item).localeCompare(resolveRecordedAt(left.item)) ||
        right.item.paidAt.localeCompare(left.item.paidAt) ||
        right.index - left.index
      );
    })
    .map((entry) => entry.item);
}

function buildDepositSummary(input: {
  partyName: string;
  amountCents: number;
  paidAt: string;
  note?: string;
}): string {
  return `哪一家：${input.partyName}；金额：${formatMoney(input.amountCents)}；日期：${input.paidAt}${input.note?.trim() ? `；备注：${input.note.trim()}` : ''}`;
}

function buildExpenseSummary(input: {
  expense: Pick<Expense, 'title' | 'category' | 'amountCents' | 'paidAt' | 'payerKind' | 'payerPartyId' | 'shareMode' | 'note'>;
  participants: Array<{ partyId: string; headcountSnapshot: number }>;
  parties: Party[];
}): string {
  const title = input.expense.title?.trim() || input.expense.category?.trim() || '未写标题';
  const categoryText = input.expense.category?.trim() ? `；分类：${input.expense.category.trim()}` : '';
  return `标题：${title}；金额：${formatMoney(input.expense.amountCents)}；日期：${input.expense.paidAt}；谁先付：${buildPayerSummary(input.expense, input.parties)}；这次谁参加：${buildParticipantSummary(input.participants, input.parties) || '未填写'}；这笔按什么分：${getShareModeLabel(input.expense.shareMode)}${input.expense.note?.trim() ? `；备注：${input.expense.note.trim()}` : ''}${categoryText}`;
}

function buildAuditEntry(input: {
  action: AuditTrailEntry['action'];
  reason?: string;
  beforeSummary?: string;
  afterSummary: string;
}): AuditTrailEntry {
  return {
    id: makeId(),
    at: nowIso(),
    action: input.action,
    reason: input.reason,
    beforeSummary: input.beforeSummary,
    afterSummary: input.afterSummary,
  };
}

async function normalizeLedgerRecords(params: { deposits: Deposit[]; expenses: Expense[] }): Promise<{ deposits: Deposit[]; expenses: Expense[] }> {
  const mixed = [
    ...params.deposits.map((record, index) => ({ type: 'deposit' as const, record, index })),
    ...params.expenses.map((record, index) => ({ type: 'expense' as const, record, index: params.deposits.length + index })),
  ].sort((left, right) => {
    const leftRecordedAt = resolveRecordedAt(left.record);
    const rightRecordedAt = resolveRecordedAt(right.record);
    return leftRecordedAt.localeCompare(rightRecordedAt) || left.record.paidAt.localeCompare(right.record.paidAt) || left.index - right.index;
  });

  const depositMap = new Map(params.deposits.map((record) => [record.id, record]));
  const expenseMap = new Map(params.expenses.map((record) => [record.id, record]));
  const updates: Promise<Deposit | Expense>[] = [];

  mixed.forEach((item, index) => {
    const recordedAt = resolveRecordedAt(item.record);
    const sequenceNo = resolveSequenceNo(item.record, index);

    if (item.record.recordedAt === recordedAt && item.record.sequenceNo === sequenceNo) {
      return;
    }

    const normalizedRecord = {
      ...item.record,
      recordedAt,
      sequenceNo,
    };

    if (item.type === 'deposit') {
      depositMap.set(item.record.id, normalizedRecord as Deposit);
      updates.push(putRecord(STORE_NAMES.deposits, normalizedRecord));
      return;
    }

    expenseMap.set(item.record.id, normalizedRecord as Expense);
    updates.push(putRecord(STORE_NAMES.expenses, normalizedRecord));
  });

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  const deposits = [...depositMap.values()];
  const expenses = [...expenseMap.values()];
  syncSequenceSeed([...deposits, ...expenses]);
  return { deposits, expenses };
}

export async function listTrips(): Promise<Trip[]> {
  const trips = await getAll<Trip>(STORE_NAMES.trips);
  return trips.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createTrip(input: {
  name: string;
  startDate?: string;
  endDate?: string;
  note?: string;
}): Promise<Trip> {
  const timestamp = nowIso();
  const trip: Trip = {
    id: makeId(),
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    note: input.note?.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return addRecord(STORE_NAMES.trips, trip);
}

export async function getTripBundle(tripId: string): Promise<TripBundle | null> {
  const trip = await getById<Trip>(STORE_NAMES.trips, tripId);

  if (!trip) {
    return null;
  }

  const [parties, rawDeposits, rawExpenses, allParticipants] = await Promise.all([
    getAllByIndex<Party>(STORE_NAMES.parties, 'tripId', tripId),
    getAllByIndex<Deposit>(STORE_NAMES.deposits, 'tripId', tripId),
    getAllByIndex<Expense>(STORE_NAMES.expenses, 'tripId', tripId),
    getAll<ExpenseParticipant>(STORE_NAMES.expenseParticipants),
  ]);

  const { deposits, expenses } = await normalizeLedgerRecords({
    deposits: rawDeposits,
    expenses: rawExpenses,
  });

  const expenseIds = new Set(expenses.map((expense) => expense.id));
  const expenseParticipants = allParticipants.filter((participant) => expenseIds.has(participant.expenseId));

  return {
    trip,
    parties: parties.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
    deposits: sortByStableOrderDesc(deposits),
    expenses: sortByStableOrderDesc(expenses),
    expenseParticipants,
  };
}

export async function createParty(input: {
  tripId: string;
  name: string;
  defaultHeadcount: number;
  note?: string;
  sortOrder: number;
}): Promise<Party> {
  const party: Party = {
    id: makeId(),
    tripId: input.tripId,
    name: input.name.trim(),
    defaultHeadcount: input.defaultHeadcount,
    note: input.note?.trim(),
    sortOrder: input.sortOrder,
    active: true,
  };

  return addRecord(STORE_NAMES.parties, party);
}

export async function updateParty(party: Party): Promise<Party> {
  return putRecord(STORE_NAMES.parties, party);
}

export async function createDeposit(input: {
  tripId: string;
  partyId: string;
  amountCents: number;
  paidAt: string;
  note?: string;
}): Promise<Deposit> {
  const timestamp = nowIso();
  const party = await getById<Party>(STORE_NAMES.parties, input.partyId);
  const deposit: Deposit = {
    id: makeId(),
    tripId: input.tripId,
    partyId: input.partyId,
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    note: input.note?.trim(),
    status: 'posted',
    recordedAt: timestamp,
    sequenceNo: nextSequenceNo(),
    createdAt: timestamp,
    updatedAt: timestamp,
    auditTrail: [
      buildAuditEntry({
        action: 'created',
        afterSummary: buildDepositSummary({
          partyName: party?.name ?? '未命名',
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
        }),
      }),
    ],
  };

  return addRecord(STORE_NAMES.deposits, deposit);
}

export async function updateDeposit(input: {
  depositId: string;
  amountCents: number;
  paidAt: string;
  partyId: string;
  note?: string;
  reason?: string;
}): Promise<Deposit> {
  const existing = await getById<Deposit>(STORE_NAMES.deposits, input.depositId);

  if (!existing) {
    throw new Error('没找到这笔先收的钱');
  }

  const [beforeParty, afterParty] = await Promise.all([
    getById<Party>(STORE_NAMES.parties, existing.partyId),
    getById<Party>(STORE_NAMES.parties, input.partyId),
  ]);

  const updated: Deposit = {
    ...existing,
    partyId: input.partyId,
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    note: input.note?.trim(),
    recordedAt: existing.recordedAt ?? existing.createdAt ?? nowIso(),
    sequenceNo: existing.sequenceNo ?? nextSequenceNo(),
    updatedAt: nowIso(),
    auditTrail: [
      ...(existing.auditTrail ?? []),
      buildAuditEntry({
        action: 'updated',
        reason: input.reason,
        beforeSummary: buildDepositSummary({
          partyName: beforeParty?.name ?? '未命名',
          amountCents: existing.amountCents,
          paidAt: existing.paidAt,
          note: existing.note,
        }),
        afterSummary: buildDepositSummary({
          partyName: afterParty?.name ?? '未命名',
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
        }),
      }),
    ],
  };

  return putRecord(STORE_NAMES.deposits, updated);
}

export async function voidDeposit(input: { depositId: string; reason: string }): Promise<Deposit> {
  const existing = await getById<Deposit>(STORE_NAMES.deposits, input.depositId);

  if (!existing) {
    throw new Error('没找到这笔先收的钱');
  }

  const party = await getById<Party>(STORE_NAMES.parties, existing.partyId);
  const beforeSummary = buildDepositSummary({
    partyName: party?.name ?? '未命名',
    amountCents: existing.amountCents,
    paidAt: existing.paidAt,
    note: existing.note,
  });

  const updated: Deposit = {
    ...existing,
    recordedAt: existing.recordedAt ?? existing.createdAt ?? nowIso(),
    sequenceNo: existing.sequenceNo ?? nextSequenceNo(),
    status: 'void',
    voidReason: input.reason,
    voidedAt: nowIso(),
    updatedAt: nowIso(),
    auditTrail: [
      ...(existing.auditTrail ?? []),
      buildAuditEntry({
        action: 'voided',
        reason: input.reason,
        beforeSummary,
        afterSummary: `这笔先收的钱已作废，不再计入总账。原记录：${beforeSummary}`,
      }),
    ],
  };

  return putRecord(STORE_NAMES.deposits, updated);
}

export async function removeVoidDeposit(depositId: string): Promise<void> {
  await deleteRecord(STORE_NAMES.deposits, depositId);
}

export async function createExpenseWithParticipants(input: {
  expense: Omit<Expense, 'id' | 'status' | 'recordedAt' | 'sequenceNo' | 'createdAt' | 'updatedAt' | 'auditTrail'>;
  participants: ShareParticipantInput[];
  parties: Party[];
}): Promise<{ expense: Expense; participants: ExpenseParticipant[] }> {
  const timestamp = nowIso();
  const expense: Expense = {
    ...input.expense,
    id: makeId(),
    status: 'posted',
    recordedAt: timestamp,
    sequenceNo: nextSequenceNo(),
    createdAt: timestamp,
    updatedAt: timestamp,
    auditTrail: [],
  };

  const participants = buildExpenseParticipants(expense, input.participants, input.parties);
  expense.auditTrail = [
    buildAuditEntry({
      action: 'created',
      afterSummary: buildExpenseSummary({
        expense,
        participants,
        parties: input.parties,
      }),
    }),
  ];

  await addExpenseBundle({ expense, participants });
  return { expense, participants };
}

export async function updateExpenseWithParticipants(input: {
  expenseId: string;
  expense: Omit<Expense, 'id' | 'status' | 'recordedAt' | 'sequenceNo' | 'createdAt' | 'updatedAt' | 'auditTrail'>;
  participants: ShareParticipantInput[];
  parties: Party[];
  reason?: string;
}): Promise<{ expense: Expense; participants: ExpenseParticipant[] }> {
  const existing = await getById<Expense>(STORE_NAMES.expenses, input.expenseId);

  if (!existing) {
    throw new Error('没找到这笔花费');
  }

  const existingParticipants = await getAllByIndex<ExpenseParticipant>(STORE_NAMES.expenseParticipants, 'expenseId', input.expenseId);
  const updated: Expense = {
    ...existing,
    ...input.expense,
    recordedAt: existing.recordedAt ?? existing.createdAt ?? nowIso(),
    sequenceNo: existing.sequenceNo ?? nextSequenceNo(),
    updatedAt: nowIso(),
    auditTrail: [],
  };

  const participants = buildExpenseParticipants(updated, input.participants, input.parties);
  updated.auditTrail = [
    ...(existing.auditTrail ?? []),
    buildAuditEntry({
      action: 'updated',
      reason: input.reason,
      beforeSummary: buildExpenseSummary({
        expense: existing,
        participants: existingParticipants,
        parties: input.parties,
      }),
      afterSummary: buildExpenseSummary({
        expense: updated,
        participants,
        parties: input.parties,
      }),
    }),
  ];

  await replaceExpenseBundle({ expense: updated, participants });
  return { expense: updated, participants };
}

export async function voidExpense(input: { expenseId: string; reason: string }): Promise<Expense> {
  const existing = await getById<Expense>(STORE_NAMES.expenses, input.expenseId);

  if (!existing) {
    throw new Error('没找到这笔花费');
  }

  const existingParticipants = await getAllByIndex<ExpenseParticipant>(STORE_NAMES.expenseParticipants, 'expenseId', input.expenseId);
  const parties = await getAllByIndex<Party>(STORE_NAMES.parties, 'tripId', existing.tripId);
  const beforeSummary = buildExpenseSummary({
    expense: existing,
    participants: existingParticipants,
    parties,
  });

  const updated: Expense = {
    ...existing,
    recordedAt: existing.recordedAt ?? existing.createdAt ?? nowIso(),
    sequenceNo: existing.sequenceNo ?? nextSequenceNo(),
    status: 'void',
    voidReason: input.reason,
    voidedAt: nowIso(),
    updatedAt: nowIso(),
    auditTrail: [
      ...(existing.auditTrail ?? []),
      buildAuditEntry({
        action: 'voided',
        reason: input.reason,
        beforeSummary,
        afterSummary: `这笔花费已作废，不再计入总账。原记录：${beforeSummary}`,
      }),
    ],
  };

  return putRecord(STORE_NAMES.expenses, updated);
}
