import { buildFullLedger } from '../fullLedger';
import type { Deposit, Expense, ExpenseParticipant, Party } from '../types';

function makeParty(id: string, name: string, sortOrder: number): Party {
  return {
    id,
    tripId: 'trip-1',
    name,
    defaultHeadcount: 2,
    sortOrder,
    active: true,
  };
}

describe('buildFullLedger', () => {
  it('按已落库的 shareAmountCents 和 tailDeltaCents 展示，不重算分摊', () => {
    const parties = [makeParty('zhang', '张家', 0), makeParty('li', '李家', 1)];

    const deposits: Deposit[] = [
      {
        id: 'd1',
        tripId: 'trip-1',
        partyId: 'zhang',
        amountCents: 10000,
        paidAt: '2026-03-01',
        recordedAt: '2026-03-01T08:00:00.000Z',
        sequenceNo: 1,
      },
    ];

    const expenses: Expense[] = [
      {
        id: 'e-later',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        title: '景区门票',
        amountCents: 2000,
        payerKind: 'pool',
        shareMode: 'by_party',
        recordedAt: '2026-03-01T09:30:00.000Z',
        sequenceNo: 3,
      },
      {
        id: 'e-early',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        title: '西山晚饭',
        amountCents: 10000,
        payerKind: 'party',
        payerPartyId: 'zhang',
        shareMode: 'by_party',
        note: '包间点菜',
        recordedAt: '2026-03-01T09:00:00.000Z',
        sequenceNo: 2,
      },
    ];

    const expenseParticipants: ExpenseParticipant[] = [
      {
        id: 'e-early:zhang',
        expenseId: 'e-early',
        partyId: 'zhang',
        headcountSnapshot: 2,
        weightSnapshot: 1,
        shareAmountCents: 4999,
        baseShareCents: 4999,
        tailDeltaCents: 0,
      },
      {
        id: 'e-early:li',
        expenseId: 'e-early',
        partyId: 'li',
        headcountSnapshot: 2,
        weightSnapshot: 1,
        shareAmountCents: 5001,
        baseShareCents: 5000,
        tailDeltaCents: 1,
      },
      {
        id: 'e-later:zhang',
        expenseId: 'e-later',
        partyId: 'zhang',
        headcountSnapshot: 2,
        weightSnapshot: 1,
        shareAmountCents: 1000,
        baseShareCents: 1000,
        tailDeltaCents: 0,
      },
      {
        id: 'e-later:li',
        expenseId: 'e-later',
        partyId: 'li',
        headcountSnapshot: 2,
        weightSnapshot: 1,
        shareAmountCents: 1000,
        baseShareCents: 1000,
        tailDeltaCents: 0,
      },
    ];

    const ledger = buildFullLedger({ parties, deposits, expenses, expenseParticipants });

    expect(ledger.map((item) => item.id)).toEqual(['d1', 'e-early', 'e-later']);
    expect(ledger[1].shares.map((item) => item.shareAmountCents)).toEqual([4999, 5001]);
    expect(ledger[1].shares.map((item) => item.tailDeltaCents)).toEqual([0, 1]);
    expect(ledger[1].tailNote).toBe('这笔不能整分，按固定名单顺序补尾差：李家 +0.01元。');
  });
});
