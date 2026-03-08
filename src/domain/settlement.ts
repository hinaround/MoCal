import type {
  Deposit,
  Expense,
  ExpenseParticipant,
  Id,
  Party,
  SettlementStatus,
  SettlementSummary,
  TripSettlement,
} from './types';
import { isPostedRecord } from './share';

function buildZeroMap(parties: Party[]): Map<Id, number> {
  return new Map(parties.map((party) => [party.id, 0]));
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

export function buildTripSettlement(params: {
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}): TripSettlement {
  const postedDeposits = params.deposits.filter(isPostedRecord);
  const postedExpenses = params.expenses.filter(isPostedRecord);
  const postedExpenseIds = new Set(postedExpenses.map((expense) => expense.id));
  const postedParticipants = params.expenseParticipants.filter((participant) => postedExpenseIds.has(participant.expenseId));

  const shareByParty = buildZeroMap(params.parties);
  const depositByParty = buildZeroMap(params.parties);
  const directPaidByParty = buildZeroMap(params.parties);

  for (const participant of postedParticipants) {
    shareByParty.set(
      participant.partyId,
      (shareByParty.get(participant.partyId) ?? 0) + participant.shareAmountCents,
    );
  }

  for (const deposit of postedDeposits) {
    if (!deposit.partyId) {
      continue;
    }
    depositByParty.set(deposit.partyId, (depositByParty.get(deposit.partyId) ?? 0) + deposit.amountCents);
  }

  for (const expense of postedExpenses) {
    if (expense.payerKind === 'party' && expense.payerPartyId) {
      directPaidByParty.set(
        expense.payerPartyId,
        (directPaidByParty.get(expense.payerPartyId) ?? 0) + expense.amountCents,
      );
    }
  }

  const summaries: SettlementSummary[] = params.parties.map((party) => {
    const totalShareCents = shareByParty.get(party.id) ?? 0;
    const depositCents = depositByParty.get(party.id) ?? 0;
    const directPaidCents = directPaidByParty.get(party.id) ?? 0;
    const totalPaidCents = depositCents + directPaidCents;
    const netCents = totalPaidCents - totalShareCents;

    return {
      partyId: party.id,
      totalShareCents,
      depositCents,
      directPaidCents,
      totalPaidCents,
      netCents,
      status: resolveStatus(netCents),
    };
  });

  const totalExpenseCents = postedExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const totalAllocatedCents = postedParticipants.reduce(
    (sum, participant) => sum + participant.shareAmountCents,
    0,
  );
  const totalDepositCents = postedDeposits.reduce((sum, deposit) => sum + deposit.amountCents, 0);
  const totalDirectPaidCents = postedExpenses.reduce(
    (sum, expense) => sum + (expense.payerKind === 'party' ? expense.amountCents : 0),
    0,
  );
  const poolSpentCents = postedExpenses.reduce(
    (sum, expense) => sum + (expense.payerKind === 'pool' ? expense.amountCents : 0),
    0,
  );
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
