import { buildTripSettlement } from '../settlement';
import { buildVerificationSampleCases } from './verificationSamples.fixture';

function findShares(expenseParticipants: Array<{ expenseId: string; shareAmountCents: number }>, expenseId: string): number[] {
  return expenseParticipants
    .filter((participant) => participant.expenseId === expenseId)
    .map((participant) => participant.shareAmountCents);
}

function findTailDeltas(expenseParticipants: Array<{ expenseId: string; tailDeltaCents?: number }>, expenseId: string): number[] {
  return expenseParticipants
    .filter((participant) => participant.expenseId === expenseId)
    .map((participant) => participant.tailDeltaCents ?? 0);
}

describe('docs/验算样例_v1.md 真相源', () => {
  const sampleCases = buildVerificationSampleCases();

  for (const sampleCase of sampleCases) {
    it(sampleCase.name, () => {
      for (const [expenseId, expectedShares] of Object.entries(sampleCase.expectedSharesByExpenseId)) {
        expect(findShares(sampleCase.expenseParticipants, expenseId)).toEqual(expectedShares);
      }

      for (const [expenseId, expectedTailDeltas] of Object.entries(sampleCase.expectedTailDeltasByExpenseId ?? {})) {
        expect(findTailDeltas(sampleCase.expenseParticipants, expenseId)).toEqual(expectedTailDeltas);
      }

      const settlement = buildTripSettlement({
        parties: sampleCase.parties,
        deposits: sampleCase.deposits,
        expenses: sampleCase.expenses,
        expenseParticipants: sampleCase.expenseParticipants,
      });

      expect(settlement.totalExpenseCents).toBe(sampleCase.expectedSettlement.totalExpenseCents);
      expect(settlement.totalDepositCents).toBe(sampleCase.expectedSettlement.totalDepositCents);
      expect(settlement.poolBalanceCents).toBe(sampleCase.expectedSettlement.poolBalanceCents);
      expect(settlement.summaries).toEqual(sampleCase.expectedSettlement.summaries);
    });
  }
});
