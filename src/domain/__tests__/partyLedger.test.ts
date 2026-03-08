import { buildPartyLedger } from '../partyLedger';
import { buildVerificationSampleCases } from './verificationSamples.fixture';

const sampleCases = buildVerificationSampleCases();

function getSampleCase(name: string) {
  const sampleCase = sampleCases.find((candidate) => candidate.name === name);

  if (!sampleCase) {
    throw new Error(`Missing verification sample: ${name}`);
  }

  return sampleCase;
}

describe('buildPartyLedger', () => {
  it('builds a full history for the payer party', () => {
    const sampleCase = getSampleCase('样例 1：最基础按家均分');

    const ledger = buildPartyLedger({
      partyId: 'zhang',
      parties: sampleCase.parties,
      deposits: sampleCase.deposits,
      expenses: sampleCase.expenses,
      expenseParticipants: sampleCase.expenseParticipants,
    });

    expect(ledger.summary?.netCents).toBe(49000);
    expect(ledger.history.map((item) => [item.kind, item.signedAmountCents])).toEqual([
      ['deposit', 30000],
      ['paid', 36000],
      ['share', -12000],
      ['share', -5000],
    ]);
  });

  it('builds share-only history for a participant who never paid', () => {
    const sampleCase = getSampleCase('样例 2：动态参与');

    const ledger = buildPartyLedger({
      partyId: 'chen',
      parties: sampleCase.parties,
      deposits: sampleCase.deposits,
      expenses: sampleCase.expenses,
      expenseParticipants: sampleCase.expenseParticipants,
    });

    expect(ledger.summary?.netCents).toBe(-24000);
    expect(ledger.history.map((item) => [item.kind, item.signedAmountCents])).toEqual([
      ['share', -15000],
      ['share', -9000],
    ]);
  });
});
