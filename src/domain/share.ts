import type {
  Expense,
  ExpenseParticipant,
  Id,
  Party,
  ShareAllocationRow,
  ShareMode,
  ShareParticipantInput,
} from './types';

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是大于 0 的整数`);
  }
}

export function isPostedRecord(record: { status?: 'posted' | 'void' }): boolean {
  return (record.status ?? 'posted') === 'posted';
}

function orderParticipants(
  participants: ShareParticipantInput[],
  parties?: Party[],
): ShareParticipantInput[] {
  if (!parties || parties.length === 0) {
    return participants;
  }

  const sortOrderById = new Map(parties.map((party) => [party.id, party.sortOrder]));
  return [...participants].sort(
    (left, right) =>
      (sortOrderById.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) -
      (sortOrderById.get(right.partyId) ?? Number.MAX_SAFE_INTEGER),
  );
}

function buildWeights(
  shareMode: ShareMode,
  participants: ShareParticipantInput[],
  parties?: Party[],
): Array<ShareParticipantInput & { weight: number; index: number }> {
  const orderedParticipants = orderParticipants(participants, parties);

  if (orderedParticipants.length === 0) {
    throw new Error('这笔还没选谁参加');
  }

  return orderedParticipants.map((participant, index) => {
    assertPositiveInteger(participant.headcountSnapshot, '人数');
    const weight = shareMode === 'by_party' ? 1 : participant.headcountSnapshot;
    assertPositiveInteger(weight, '分摊权重');

    return {
      ...participant,
      weight,
      index,
    };
  });
}

export function allocateDetailedByWeights<T extends { weight: number; partyId: Id; headcountSnapshot: number }>(
  amountCents: number,
  items: T[],
): Array<T & ShareAllocationRow> {
  assertPositiveInteger(amountCents, '金额');

  if (items.length === 0) {
    throw new Error('这笔还没选谁参加');
  }

  const totalWeight = items.reduce((sum, item) => {
    assertPositiveInteger(item.weight, '分摊权重');
    return sum + item.weight;
  }, 0);

  const baseRows = items.map((item) => {
    const numerator = amountCents * item.weight;
    const baseShareCents = Math.floor(numerator / totalWeight);
    return {
      ...item,
      shareAmountCents: baseShareCents,
      baseShareCents,
      tailDeltaCents: 0,
    };
  });

  const tailCount = amountCents - baseRows.reduce((sum, item) => sum + item.baseShareCents, 0);

  for (let index = 0; index < tailCount; index += 1) {
    const target = baseRows[index % baseRows.length];
    target.shareAmountCents += 1;
    target.tailDeltaCents += 1;
  }

  return baseRows;
}

export function buildShareAllocationPreview(params: {
  expense: Pick<Expense, 'amountCents' | 'shareMode'>;
  participants: ShareParticipantInput[];
  parties?: Party[];
}) {
  const weightedParticipants = buildWeights(params.expense.shareMode, params.participants, params.parties);
  return allocateDetailedByWeights(params.expense.amountCents, weightedParticipants).map((row) => ({
    partyId: row.partyId,
    headcountSnapshot: row.headcountSnapshot,
    weight: row.weight,
    shareAmountCents: row.shareAmountCents,
    baseShareCents: row.baseShareCents,
    tailDeltaCents: row.tailDeltaCents,
  }));
}

export function buildExpenseParticipants(
  expense: Expense,
  participants: ShareParticipantInput[],
  parties?: Party[],
): ExpenseParticipant[] {
  const allocation = buildShareAllocationPreview({
    expense,
    participants,
    parties,
  });

  return allocation.map((row) => ({
    id: `${expense.id}:${row.partyId}`,
    expenseId: expense.id,
    partyId: row.partyId,
    headcountSnapshot: row.headcountSnapshot,
    weightSnapshot: row.weight,
    shareAmountCents: row.shareAmountCents,
    baseShareCents: row.baseShareCents,
    tailDeltaCents: row.tailDeltaCents,
  }));
}
