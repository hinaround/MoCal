import { buildExpenseParticipants } from '../domain/share';
import type {
  AuditTrailEntry,
  Deposit,
  Expense,
  ExpenseParticipant,
  MemberProfile,
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


export interface HomeBundle {
  trips: Trip[];
  memberProfiles: MemberProfile[];
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
    return '从公账支出';
  }

  const partyName = parties.find((party) => party.id === expense.payerPartyId)?.name ?? '未命名';
  return `先由${partyName}代付`;
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
  return `成员：${input.partyName}；入金金额：${formatMoney(input.amountCents)}；日期：${input.paidAt}${input.note?.trim() ? `；备注：${input.note.trim()}` : ''}`;
}

function buildExpenseSummary(input: {
  expense: Pick<Expense, 'title' | 'category' | 'amountCents' | 'paidAt' | 'payerKind' | 'payerPartyId' | 'shareMode' | 'note'>;
  participants: Array<{ partyId: string; headcountSnapshot: number }>;
  parties: Party[];
}): string {
  const title = input.expense.title?.trim() || input.expense.category?.trim() || '未写标题';
  const categoryText = input.expense.category?.trim() ? `；分类：${input.expense.category.trim()}` : '';
  return `标题：${title}；支出金额：${formatMoney(input.expense.amountCents)}；日期：${input.expense.paidAt}；付款方式：${buildPayerSummary(input.expense, input.parties)}；参与成员：${buildParticipantSummary(input.participants, input.parties) || '未填写'}；分摊规则：${getShareModeLabel(input.expense.shareMode)}${input.expense.note?.trim() ? `；备注：${input.expense.note.trim()}` : ''}${categoryText}`;
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

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function sortMemberProfiles(profiles: MemberProfile[]): MemberProfile[] {
  return [...profiles].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

async function ensureMemberProfilesLinked(): Promise<{ memberProfiles: MemberProfile[]; parties: Party[] }> {
  const [memberProfiles, parties] = await Promise.all([
    getAll<MemberProfile>(STORE_NAMES.memberProfiles),
    getAll<Party>(STORE_NAMES.parties),
  ]);

  const profilesById = new Map(memberProfiles.map((profile) => [profile.id, profile]));
  const profilesByName = new Map(memberProfiles.map((profile) => [normalizeName(profile.name), profile]));
  let nextSortOrder = memberProfiles.reduce((maxValue, profile) => Math.max(maxValue, profile.sortOrder), -1) + 1;
  const createdProfiles: MemberProfile[] = [];
  const updatedParties: Party[] = [];

  for (const party of [...parties].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))) {
    let profile = party.memberProfileId ? profilesById.get(party.memberProfileId) : undefined;

    if (!profile) {
      profile = profilesByName.get(normalizeName(party.name));
    }

    if (!profile) {
      const timestamp = nowIso();
      profile = {
        id: makeId(),
        name: party.name.trim(),
        defaultHeadcount: party.defaultHeadcount,
        note: party.note?.trim(),
        sortOrder: nextSortOrder++,
        active: party.active,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      createdProfiles.push(profile);
      profilesById.set(profile.id, profile);
      profilesByName.set(normalizeName(profile.name), profile);
    }

    if (party.memberProfileId !== profile.id) {
      updatedParties.push({ ...party, memberProfileId: profile.id });
    }
  }

  await Promise.all([
    ...createdProfiles.map((profile) => addRecord(STORE_NAMES.memberProfiles, profile)),
    ...updatedParties.map((party) => putRecord(STORE_NAMES.parties, party)),
  ]);

  const finalParties = parties.map((party) => updatedParties.find((item) => item.id === party.id) ?? party);
  const finalProfiles = sortMemberProfiles([...memberProfiles, ...createdProfiles]);
  return { memberProfiles: finalProfiles, parties: finalParties };
}

function resolveMemberProfileIdFromDeposit(deposit: Deposit, partyById: Map<string, Party>): string | undefined {
  return deposit.memberProfileId ?? (deposit.partyId ? partyById.get(deposit.partyId)?.memberProfileId : undefined);
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

export async function listMemberProfiles(): Promise<MemberProfile[]> {
  const { memberProfiles } = await ensureMemberProfilesLinked();
  return memberProfiles;
}

export async function createMemberProfile(input: {
  name: string;
  defaultHeadcount: number;
  note?: string;
}): Promise<MemberProfile> {
  const existingProfiles = await listMemberProfiles();
  const timestamp = nowIso();
  const profile: MemberProfile = {
    id: makeId(),
    name: input.name.trim(),
    defaultHeadcount: input.defaultHeadcount,
    note: input.note?.trim(),
    sortOrder: existingProfiles.length,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return addRecord(STORE_NAMES.memberProfiles, profile);
}

export async function updateMemberProfile(profile: MemberProfile): Promise<MemberProfile> {
  return putRecord(STORE_NAMES.memberProfiles, {
    ...profile,
    name: profile.name.trim(),
    note: profile.note?.trim(),
    updatedAt: nowIso(),
  });
}

export async function getHomeBundle(): Promise<HomeBundle> {
  const [{ memberProfiles, parties }, trips, rawDeposits, rawExpenses, expenseParticipants] = await Promise.all([
    ensureMemberProfilesLinked(),
    listTrips(),
    getAll<Deposit>(STORE_NAMES.deposits),
    getAll<Expense>(STORE_NAMES.expenses),
    getAll<ExpenseParticipant>(STORE_NAMES.expenseParticipants),
  ]);

  const { deposits, expenses } = await normalizeLedgerRecords({
    deposits: rawDeposits,
    expenses: rawExpenses,
  });

  return {
    trips,
    memberProfiles,
    parties: [...parties].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
    deposits: sortByStableOrderDesc(deposits),
    expenses: sortByStableOrderDesc(expenses),
    expenseParticipants,
  };
}

async function seedTripPartiesFromMembers(tripId: string, members?: MemberProfile[]): Promise<Party[]> {
  const sourceMembers = members ?? await listMemberProfiles();
  const activeMembers = sortMemberProfiles(sourceMembers.filter((member) => member.active));

  if (activeMembers.length === 0) {
    return [];
  }

  const createdParties: Party[] = activeMembers.map((member, index) => ({
    id: makeId(),
    tripId,
    memberProfileId: member.id,
    name: member.name.trim(),
    defaultHeadcount: member.defaultHeadcount,
    note: member.note?.trim(),
    sortOrder: index,
    active: true,
  }));

  await Promise.all(createdParties.map((party) => addRecord(STORE_NAMES.parties, party)));
  return createdParties;
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

  await addRecord(STORE_NAMES.trips, trip);
  await seedTripPartiesFromMembers(trip.id);
  return trip;
}

export async function getTripBundle(tripId: string): Promise<TripBundle | null> {
  const trip = await getById<Trip>(STORE_NAMES.trips, tripId);

  if (!trip) {
    return null;
  }

  const [loadedParties, rawDeposits, rawExpenses, allParticipants, members] = await Promise.all([
    getAllByIndex<Party>(STORE_NAMES.parties, 'tripId', tripId),
    getAllByIndex<Deposit>(STORE_NAMES.deposits, 'tripId', tripId),
    getAllByIndex<Expense>(STORE_NAMES.expenses, 'tripId', tripId),
    getAll<ExpenseParticipant>(STORE_NAMES.expenseParticipants),
    listMemberProfiles(),
  ]);

  const parties = loadedParties.length > 0 ? loadedParties : await seedTripPartiesFromMembers(tripId, members);

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
  memberProfileId?: string;
}): Promise<Party> {
  const normalizedName = input.name.trim();
  let memberProfileId = input.memberProfileId;

  if (!memberProfileId) {
    const profiles = await listMemberProfiles();
    const matchedProfile = profiles.find((profile) => normalizeName(profile.name) === normalizeName(normalizedName));

    if (matchedProfile) {
      memberProfileId = matchedProfile.id;
    } else {
      const timestamp = nowIso();
      const profile: MemberProfile = {
        id: makeId(),
        name: normalizedName,
        defaultHeadcount: input.defaultHeadcount,
        note: input.note?.trim(),
        sortOrder: profiles.length,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await addRecord(STORE_NAMES.memberProfiles, profile);
      memberProfileId = profile.id;
    }
  }

  const party: Party = {
    id: makeId(),
    tripId: input.tripId,
    memberProfileId,
    name: normalizedName,
    defaultHeadcount: input.defaultHeadcount,
    note: input.note?.trim(),
    sortOrder: input.sortOrder,
    active: true,
  };

  return addRecord(STORE_NAMES.parties, party);
}

export async function updateParty(party: Party): Promise<Party> {
  if (party.memberProfileId) {
    return putRecord(STORE_NAMES.parties, party);
  }

  const profiles = await listMemberProfiles();
  const matchedProfile = profiles.find((profile) => normalizeName(profile.name) === normalizeName(party.name));
  return putRecord(STORE_NAMES.parties, {
    ...party,
    memberProfileId: matchedProfile?.id,
  });
}

export async function createDeposit(input: {
  tripId?: string;
  partyId?: string;
  memberProfileId?: string;
  amountCents: number;
  paidAt: string;
  note?: string;
}): Promise<Deposit> {
  const timestamp = nowIso();
  const party = input.partyId ? await getById<Party>(STORE_NAMES.parties, input.partyId) : undefined;
  const memberProfileId = input.memberProfileId ?? party?.memberProfileId;
  const memberProfile = memberProfileId ? await getById<MemberProfile>(STORE_NAMES.memberProfiles, memberProfileId) : undefined;
  const displayName = memberProfile?.name ?? party?.name ?? '未命名';
  const deposit: Deposit = {
    id: makeId(),
    tripId: input.tripId,
    partyId: input.partyId,
    memberProfileId,
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
          partyName: displayName,
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
  partyId?: string;
  memberProfileId?: string;
  note?: string;
  reason?: string;
}): Promise<Deposit> {
  const existing = await getById<Deposit>(STORE_NAMES.deposits, input.depositId);

  if (!existing) {
    throw new Error('没找到这笔成员交款');
  }

  const [beforeParty, nextParty] = await Promise.all([
    existing.partyId ? getById<Party>(STORE_NAMES.parties, existing.partyId) : Promise.resolve(undefined),
    input.partyId ? getById<Party>(STORE_NAMES.parties, input.partyId) : Promise.resolve(undefined),
  ]);
  const beforeMemberProfileId = existing.memberProfileId ?? beforeParty?.memberProfileId;
  const afterMemberProfileId = input.memberProfileId ?? nextParty?.memberProfileId ?? beforeMemberProfileId;
  const [beforeMember, afterMember] = await Promise.all([
    beforeMemberProfileId ? getById<MemberProfile>(STORE_NAMES.memberProfiles, beforeMemberProfileId) : Promise.resolve(undefined),
    afterMemberProfileId ? getById<MemberProfile>(STORE_NAMES.memberProfiles, afterMemberProfileId) : Promise.resolve(undefined),
  ]);

  const updated: Deposit = {
    ...existing,
    tripId: input.partyId ? existing.tripId : existing.tripId,
    partyId: input.partyId,
    memberProfileId: afterMemberProfileId,
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
          partyName: beforeMember?.name ?? beforeParty?.name ?? '未命名',
          amountCents: existing.amountCents,
          paidAt: existing.paidAt,
          note: existing.note,
        }),
        afterSummary: buildDepositSummary({
          partyName: afterMember?.name ?? nextParty?.name ?? '未命名',
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
    throw new Error('没找到这笔成员交款');
  }

  const party = existing.partyId ? await getById<Party>(STORE_NAMES.parties, existing.partyId) : undefined;
  const memberProfileId = existing.memberProfileId ?? party?.memberProfileId;
  const memberProfile = memberProfileId ? await getById<MemberProfile>(STORE_NAMES.memberProfiles, memberProfileId) : undefined;
  const beforeSummary = buildDepositSummary({
    partyName: memberProfile?.name ?? party?.name ?? '未命名',
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
        afterSummary: `这笔成员交款已作废，不再计入总账。原记录：${beforeSummary}`,
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
    throw new Error('没找到这笔支出');
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
    throw new Error('没找到这笔支出');
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
        afterSummary: `这笔支出已作废，不再计入总账。原记录：${beforeSummary}`,
      }),
    ],
  };

  return putRecord(STORE_NAMES.expenses, updated);
}
