import { buildTripSettlement } from '../settlement';
import { buildVerificationSampleCases } from './verificationSamples.fixture';

describe('buildTripSettlement', () => {
  const sampleCases = buildVerificationSampleCases();

  for (const sampleCase of sampleCases) {
    it(`matches ${sampleCase.name}`, () => {
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
