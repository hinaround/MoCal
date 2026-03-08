import { allocateDetailedByWeights, buildExpenseParticipants } from '../share';
import type { Expense } from '../types';

describe('allocateDetailedByWeights', () => {
  it('按家平分时平均拆分', () => {
    const result = allocateDetailedByWeights(36000, [
      { weight: 1, partyId: 'zhang', headcountSnapshot: 2 },
      { weight: 1, partyId: 'li', headcountSnapshot: 3 },
      { weight: 1, partyId: 'wang', headcountSnapshot: 1 },
    ]);

    expect(result.map((item) => item.shareAmountCents)).toEqual([12000, 12000, 12000]);
    expect(result.map((item) => item.tailDeltaCents)).toEqual([0, 0, 0]);
  });

  it('按固定顺序处理尾差，不用随机规则', () => {
    const result = allocateDetailedByWeights(10100, [
      { weight: 2, partyId: 'zhang', headcountSnapshot: 2 },
      { weight: 3, partyId: 'li', headcountSnapshot: 3 },
      { weight: 1, partyId: 'zhao', headcountSnapshot: 1 },
    ]);

    expect(result.map((item) => item.shareAmountCents)).toEqual([3367, 5050, 1683]);
    expect(result.reduce((sum, item) => sum + item.shareAmountCents, 0)).toBe(10100);
    expect(result.map((item) => item.tailDeltaCents)).toEqual([1, 0, 0]);
  });
});

describe('buildExpenseParticipants', () => {
  it('会把分摊快照和尾差一起写入参与记录', () => {
    const expense: Expense = {
      id: 'expense-1',
      tripId: 'trip-1',
      paidAt: '2026-03-08',
      amountCents: 10100,
      payerKind: 'party',
      payerPartyId: 'zhang',
      shareMode: 'by_headcount',
      status: 'posted',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
      auditTrail: [],
    };

    const participants = buildExpenseParticipants(expense, [
      { partyId: 'zhang', headcountSnapshot: 2 },
      { partyId: 'li', headcountSnapshot: 3 },
      { partyId: 'zhao', headcountSnapshot: 1 },
    ]);

    expect(participants).toEqual([
      {
        id: 'expense-1:zhang',
        expenseId: 'expense-1',
        partyId: 'zhang',
        headcountSnapshot: 2,
        weightSnapshot: 2,
        shareAmountCents: 3367,
        baseShareCents: 3366,
        tailDeltaCents: 1,
      },
      {
        id: 'expense-1:li',
        expenseId: 'expense-1',
        partyId: 'li',
        headcountSnapshot: 3,
        weightSnapshot: 3,
        shareAmountCents: 5050,
        baseShareCents: 5050,
        tailDeltaCents: 0,
      },
      {
        id: 'expense-1:zhao',
        expenseId: 'expense-1',
        partyId: 'zhao',
        headcountSnapshot: 1,
        weightSnapshot: 1,
        shareAmountCents: 1683,
        baseShareCents: 1683,
        tailDeltaCents: 0,
      },
    ]);
  });
});
