import { isPostedRecord } from './share';
import type { Deposit, Expense, ExpenseParticipant, MemberProfile, Party, SettlementStatus, Trip } from './types';
import { buildTailRuleSentence } from './validation';

export interface AccountSummary {
  memberProfileId: string;
  totalShareCents: number;
  depositCents: number;
  directPaidCents: number;
  totalPaidCents: number;
  netCents: number;
  status: SettlementStatus;
}

export interface AccountSettlement {
  summaries: AccountSummary[];
  totalExpenseCents: number;
  totalAllocatedCents: number;
  totalDepositCents: number;
  totalDirectPaidCents: number;
  poolSpentCents: number;
  poolBalanceCents: number;
}

export interface AccountLedgerShareLine {
  memberProfileId: string;
  memberName: string;
  headcountSnapshot: number;
  shareAmountCents: number;
  tailDeltaCents: number;
}

export interface AccountLedgerItem {
  id: string;
  sourceId: string;
  date: string;
  type: 'deposit' | 'expense';
  status: 'posted' | 'void';
  title: string;
  subtitle: string;
  amountCents: number;
  poolBalanceAfterCents: number;
  activityName?: string;
  explanation: string;
  note?: string;
  tailNote?: string;
  auditNote?: string;
  dialogSummary: string;
  shares: AccountLedgerShareLine[];
  recordedAt: string;
  sequenceNo: number;
}

export type MemberHistoryKind = 'deposit' | 'paid' | 'share';

export interface MemberHistoryItem {
  id: string;
  date: string;
  kind: MemberHistoryKind;
  kindLabel: string;
  title: string;
  detail: string;
  note?: string;
  signedAmountCents: number;
  afterNetCents: number;
  status: 'posted' | 'void';
  auditNote?: string;
  sourceType: 'deposit' | 'expense';
  sourceId: string;
  dialogSummary: string;
}

export interface MemberAccountLedger {
  summary: AccountSummary | null;
  history: MemberHistoryItem[];
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

function resolveStatus(netCents: number): SettlementStatus {
  if (netCents > 0) {
    return 'receive';
  }
  if (netCents < 0) {
    return 'pay';
  }
  return 'settled';
}

function formatMoney(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)}元`;
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
    return `作废记录${lastEntry.reason ? `（原因：${lastEntry.reason}）` : ''}：${lastEntry.beforeSummary || lastEntry.afterSummary}`;
  }
  if (lastEntry.action === 'updated') {
    return `调整记录${lastEntry.reason ? `（原因：${lastEntry.reason}）` : ''}：${lastEntry.beforeSummary || '旧内容'} → ${lastEntry.afterSummary}`;
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

function buildResolver(params: { memberProfiles: MemberProfile[]; parties: Party[]; trips: Trip[] }) {
  const memberById = new Map(params.memberProfiles.map((item) => [item.id, item]));
  const partyById = new Map(params.parties.map((item) => [item.id, item]));
  const tripById = new Map(params.trips.map((item) => [item.id, item]));

  function resolveMemberFromPartyId(partyId?: string): { id: string; name: string } | null {
    if (!partyId) {
      return null;
    }
    const party = partyById.get(partyId);
    if (!party) {
      return null;
    }
    const member = party.memberProfileId ? memberById.get(party.memberProfileId) : null;
    return {
      id: member?.id ?? `party:${party.id}`,
      name: member?.name ?? party.name,
    };
  }

  function resolveMemberFromDeposit(deposit: Deposit): { id: string; name: string } | null {
    if (deposit.memberProfileId) {
      const member = memberById.get(deposit.memberProfileId);
      if (member) {
        return { id: member.id, name: member.name };
      }
    }
    return resolveMemberFromPartyId(deposit.partyId);
  }

  function resolveTripName(tripId?: string): string | undefined {
    return tripId ? tripById.get(tripId)?.name : undefined;
  }

  return { memberById, partyById, tripById, resolveMemberFromPartyId, resolveMemberFromDeposit, resolveTripName };
}

export function buildAccountSettlement(params: {
  memberProfiles: MemberProfile[];
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}): AccountSettlement {
  const { resolveMemberFromPartyId, resolveMemberFromDeposit } = buildResolver({ memberProfiles: params.memberProfiles, parties: params.parties, trips: [] });
  const postedDeposits = params.deposits.filter(isPostedRecord);
  const postedExpenses = params.expenses.filter(isPostedRecord);
  const postedExpenseIds = new Set(postedExpenses.map((expense) => expense.id));
  const postedParticipants = params.expenseParticipants.filter((participant) => postedExpenseIds.has(participant.expenseId));

  const memberIds = params.memberProfiles.map((profile) => profile.id);
  const shareByMember = new Map(memberIds.map((id) => [id, 0]));
  const depositByMember = new Map(memberIds.map((id) => [id, 0]));
  const directPaidByMember = new Map(memberIds.map((id) => [id, 0]));

  for (const deposit of postedDeposits) {
    const member = resolveMemberFromDeposit(deposit);
    if (!member) {
      continue;
    }
    depositByMember.set(member.id, (depositByMember.get(member.id) ?? 0) + deposit.amountCents);
  }

  for (const expense of postedExpenses) {
    if (expense.payerKind !== 'party') {
      continue;
    }
    const member = resolveMemberFromPartyId(expense.payerPartyId);
    if (!member) {
      continue;
    }
    directPaidByMember.set(member.id, (directPaidByMember.get(member.id) ?? 0) + expense.amountCents);
  }

  for (const participant of postedParticipants) {
    const member = resolveMemberFromPartyId(participant.partyId);
    if (!member) {
      continue;
    }
    shareByMember.set(member.id, (shareByMember.get(member.id) ?? 0) + participant.shareAmountCents);
  }

  const summaries = params.memberProfiles.map((member) => {
    const totalShareCents = shareByMember.get(member.id) ?? 0;
    const depositCents = depositByMember.get(member.id) ?? 0;
    const directPaidCents = directPaidByMember.get(member.id) ?? 0;
    const totalPaidCents = depositCents + directPaidCents;
    const netCents = totalPaidCents - totalShareCents;
    return {
      memberProfileId: member.id,
      totalShareCents,
      depositCents,
      directPaidCents,
      totalPaidCents,
      netCents,
      status: resolveStatus(netCents),
    } satisfies AccountSummary;
  });

  const totalExpenseCents = postedExpenses.reduce((sum, item) => sum + item.amountCents, 0);
  const totalAllocatedCents = postedParticipants.reduce((sum, item) => sum + item.shareAmountCents, 0);
  const totalDepositCents = postedDeposits.reduce((sum, item) => sum + item.amountCents, 0);
  const totalDirectPaidCents = postedExpenses.reduce((sum, item) => sum + (item.payerKind === 'party' ? item.amountCents : 0), 0);
  const poolSpentCents = postedExpenses.reduce((sum, item) => sum + (item.payerKind === 'pool' ? item.amountCents : 0), 0);
  const poolBalanceCents = totalDepositCents - poolSpentCents;

  return {
    summaries,
    totalExpenseCents,
    totalAllocatedCents,
    totalDepositCents,
    totalDirectPaidCents,
    poolSpentCents,
    poolBalanceCents,
  };
}

export function buildAccountLedger(params: {
  memberProfiles: MemberProfile[];
  parties: Party[];
  trips: Trip[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}): AccountLedgerItem[] {
  const resolver = buildResolver(params);
  const participantsMap = buildParticipantsMap(params.expenseParticipants);
  const mixed = [
    ...params.deposits.map((record, index) => ({ type: 'deposit' as const, record, index })),
    ...params.expenses.map((record, index) => ({ type: 'expense' as const, record, index: params.deposits.length + index })),
  ].sort((left, right) => {
    const leftSequence = resolveSequenceNo(left.record, left.index);
    const rightSequence = resolveSequenceNo(right.record, right.index);
    return leftSequence - rightSequence || resolveRecordedAt(left.record).localeCompare(resolveRecordedAt(right.record)) || left.record.paidAt.localeCompare(right.record.paidAt) || left.index - right.index;
  });

  const ledger: AccountLedgerItem[] = [];
  let poolBalanceCents = 0;

  for (const item of mixed) {
    if (item.type === 'deposit') {
      const deposit = item.record;
      const posted = isPostedRecord(deposit);
      const member = resolver.resolveMemberFromDeposit(deposit);
      const activityName = resolver.resolveTripName(deposit.tripId);
      if (posted) {
        poolBalanceCents += deposit.amountCents;
      }
      ledger.push({
        id: `deposit:${deposit.id}`,
        sourceId: deposit.id,
        date: deposit.paidAt,
        type: 'deposit',
        status: deposit.status ?? 'posted',
        title: '成员交款',
        subtitle: `${member?.name ?? '未命名'}交款${activityName ? ` · 关联活动：${activityName}` : ' · 不属于任何活动'}`,
        amountCents: deposit.amountCents,
        poolBalanceAfterCents: poolBalanceCents,
        activityName,
        explanation: posted ? '这笔会进入总账公账，后面的公账支出会从这里扣。' : '这笔已作废，不再计入总账。',
        note: deposit.note?.trim(),
        auditNote: getAuditNote(deposit.auditTrail),
        dialogSummary: `${member?.name ?? '未命名'}成员交款 · ${formatMoney(deposit.amountCents)} · 日期 ${deposit.paidAt}${activityName ? ` · 活动：${activityName}` : ''}${deposit.note?.trim() ? ` · 备注：${deposit.note.trim()}` : ''}`,
        shares: [],
        recordedAt: resolveRecordedAt(deposit),
        sequenceNo: resolveSequenceNo(deposit, item.index),
      });
      continue;
    }

    const expense = item.record;
    const posted = isPostedRecord(expense);
    if (posted && expense.payerKind === 'pool') {
      poolBalanceCents -= expense.amountCents;
    }
    const activityName = resolver.resolveTripName(expense.tripId);
    const participants = (participantsMap.get(expense.id) ?? []).map((participant) => {
      const member = resolver.resolveMemberFromPartyId(participant.partyId);
      return {
        memberProfileId: member?.id ?? `party:${participant.partyId}`,
        memberName: member?.name ?? '未命名',
        headcountSnapshot: participant.headcountSnapshot,
        shareAmountCents: participant.shareAmountCents,
        tailDeltaCents: participant.tailDeltaCents ?? 0,
      } satisfies AccountLedgerShareLine;
    });
    const participantText = participants.map((participant) => `${participant.memberName}${expense.shareMode === 'by_headcount' ? `${participant.headcountSnapshot}人` : ''}`).join('、');
    const payerMember = resolver.resolveMemberFromPartyId(expense.payerPartyId);
    const payerText = expense.payerKind === 'pool' ? '从公账支出' : `先由${payerMember?.name ?? '未命名'}代付`;
    const title = getExpenseTitle(expense);

    ledger.push({
      id: `expense:${expense.id}`,
      sourceId: expense.id,
      date: expense.paidAt,
      type: 'expense',
      status: expense.status ?? 'posted',
      title,
      subtitle: `${activityName ? `活动：${activityName} · ` : ''}${payerText} · 参与成员：${participantText || '未填写'} · ${getShareModeLabel(expense)}`,
      amountCents: expense.amountCents,
      poolBalanceAfterCents: poolBalanceCents,
      activityName,
      explanation: posted ? '这笔已经正式入账，分摊直接按已保存结果展示。' : '这笔已作废，不再计入总账。',
      note: expense.note?.trim(),
      tailNote: participants.length > 0 ? buildTailRuleSentence({ parties: params.parties, participants: participants.map((participant) => ({ partyId: params.parties.find((party) => party.memberProfileId === participant.memberProfileId)?.id ?? '', tailDeltaCents: participant.tailDeltaCents })) }) : undefined,
      auditNote: getAuditNote(expense.auditTrail),
      dialogSummary: `${title} · ${formatMoney(expense.amountCents)} · ${payerText}${activityName ? ` · 活动：${activityName}` : ''} · 参与成员：${participantText || '未填写'} · ${getShareModeLabel(expense)}${expense.note?.trim() ? ` · 备注：${expense.note.trim()}` : ''}`,
      shares: participants,
      recordedAt: resolveRecordedAt(expense),
      sequenceNo: resolveSequenceNo(expense, item.index),
    });
  }

  return ledger;
}

export function buildMemberAccountLedger(params: {
  memberProfileId: string;
  memberProfiles: MemberProfile[];
  parties: Party[];
  trips: Trip[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}): MemberAccountLedger {
  const settlement = buildAccountSettlement(params);
  const summary = settlement.summaries.find((item) => item.memberProfileId === params.memberProfileId) ?? null;
  const resolver = buildResolver(params);
  const memberName = resolver.memberById.get(params.memberProfileId)?.name ?? '这家';
  const participantsMap = buildParticipantsMap(params.expenseParticipants);
  const items: Array<Omit<MemberHistoryItem, 'afterNetCents'> & { sequenceNo: number; itemOrder: number; originalIndex: number }> = [];
  let originalIndex = 0;

  for (const deposit of params.deposits) {
    const member = resolver.resolveMemberFromDeposit(deposit);
    if (!member || member.id !== params.memberProfileId) {
      continue;
    }
    const activityName = resolver.resolveTripName(deposit.tripId);
    items.push({
      id: `deposit:${deposit.id}`,
      date: deposit.paidAt,
      kind: 'deposit',
      kindLabel: '交款',
      title: '成员交款',
      detail: activityName ? `记进总账公账 · 活动：${activityName}` : '记进总账公账 · 不属于任何活动',
      note: deposit.note?.trim(),
      signedAmountCents: deposit.amountCents,
      status: deposit.status ?? 'posted',
      auditNote: getAuditNote(deposit.auditTrail),
      sourceType: 'deposit',
      sourceId: deposit.id,
      dialogSummary: `${memberName}成员交款 · ${formatMoney(deposit.amountCents)} · 日期 ${deposit.paidAt}${activityName ? ` · 活动：${activityName}` : ''}${deposit.note?.trim() ? ` · 备注：${deposit.note.trim()}` : ''}`,
      sequenceNo: resolveSequenceNo(deposit, originalIndex),
      itemOrder: 0,
      originalIndex: originalIndex += 1,
    });
  }

  for (const expense of params.expenses) {
    const payerMember = resolver.resolveMemberFromPartyId(expense.payerPartyId);
    if (!payerMember || payerMember.id !== params.memberProfileId || expense.payerKind !== 'party') {
      continue;
    }
    const relatedParticipants = participantsMap.get(expense.id) ?? [];
    const participantText = relatedParticipants.map((participant) => {
      const member = resolver.resolveMemberFromPartyId(participant.partyId);
      return `${member?.name ?? '未命名'}${expense.shareMode === 'by_headcount' ? `${participant.headcountSnapshot}人` : ''}`;
    }).join('、');
    const activityName = resolver.resolveTripName(expense.tripId);
    items.push({
      id: `paid:${expense.id}`,
      date: expense.paidAt,
      kind: 'paid',
      kindLabel: '代付',
      title: getExpenseTitle(expense),
      detail: `${activityName ? `活动：${activityName} · ` : ''}先由${memberName}代付 · 参与成员：${participantText || '未填写'} · ${getShareModeLabel(expense)}`,
      note: expense.note?.trim(),
      signedAmountCents: expense.amountCents,
      status: expense.status ?? 'posted',
      auditNote: getAuditNote(expense.auditTrail),
      sourceType: 'expense',
      sourceId: expense.id,
      dialogSummary: `${getExpenseTitle(expense)} · ${formatMoney(expense.amountCents)} · 先由${memberName}代付${activityName ? ` · 活动：${activityName}` : ''} · 参与成员：${participantText || '未填写'} · ${getShareModeLabel(expense)}${expense.note?.trim() ? ` · 备注：${expense.note.trim()}` : ''}`,
      sequenceNo: resolveSequenceNo(expense, originalIndex),
      itemOrder: 1,
      originalIndex: originalIndex += 1,
    });
  }

  for (const participant of params.expenseParticipants) {
    const member = resolver.resolveMemberFromPartyId(participant.partyId);
    if (!member || member.id !== params.memberProfileId) {
      continue;
    }
    const expense = params.expenses.find((item) => item.id === participant.expenseId);
    if (!expense) {
      continue;
    }
    const payerMember = resolver.resolveMemberFromPartyId(expense.payerPartyId);
    const relatedParticipants = participantsMap.get(expense.id) ?? [];
    const participantText = relatedParticipants.map((item) => {
      const relatedMember = resolver.resolveMemberFromPartyId(item.partyId);
      return `${relatedMember?.name ?? '未命名'}${expense.shareMode === 'by_headcount' ? `${item.headcountSnapshot}人` : ''}`;
    }).join('、');
    const activityName = resolver.resolveTripName(expense.tripId);
    const payerText = expense.payerKind === 'pool' ? '从公账支出' : `先由${payerMember?.name ?? '未命名'}代付`;
    items.push({
      id: `share:${participant.id}`,
      date: expense.paidAt,
      kind: 'share',
      kindLabel: '分摊',
      title: getExpenseTitle(expense),
      detail: `${activityName ? `活动：${activityName} · ` : ''}${payerText} · 参与成员：${participantText || '未填写'} · ${getShareModeLabel(expense)}`,
      note: expense.note?.trim(),
      signedAmountCents: -participant.shareAmountCents,
      status: expense.status ?? 'posted',
      auditNote: getAuditNote(expense.auditTrail),
      sourceType: 'expense',
      sourceId: expense.id,
      dialogSummary: `${getExpenseTitle(expense)} · ${formatMoney(expense.amountCents)} · ${payerText}${activityName ? ` · 活动：${activityName}` : ''} · 参与成员：${participantText || '未填写'} · ${getShareModeLabel(expense)}${expense.note?.trim() ? ` · 备注：${expense.note.trim()}` : ''}`,
      sequenceNo: resolveSequenceNo(expense, originalIndex),
      itemOrder: 2,
      originalIndex: originalIndex += 1,
    });
  }

  const ordered = items.sort((left, right) => left.sequenceNo - right.sequenceNo || left.itemOrder - right.itemOrder || left.originalIndex - right.originalIndex);
  let runningNetCents = 0;
  const history = ordered.map((item) => {
    if (item.status === 'posted') {
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
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      dialogSummary: item.dialogSummary,
    } satisfies MemberHistoryItem;
  });

  return { summary, history };
}
