import { buildPartyLedger } from '../partyLedger';
import { buildExpenseParticipants } from '../share';
import type { Deposit, Expense, Party } from '../types';

function makeParty(id: string, name: string, defaultHeadcount: number): Party {
  return {
    id,
    tripId: 'trip-1',
    name,
    defaultHeadcount,
    sortOrder: 0,
    active: true,
  };
}

describe('buildPartyLedger', () => {
  it('builds a full history for the payer party', () => {
    const parties = [
      makeParty('zhang', '张家', 2),
      makeParty('li', '李家', 3),
      makeParty('wang', '王阿姨', 1),
    ];

    const deposits: Deposit[] = [
      { id: 'd1', tripId: 'trip-1', partyId: 'zhang', amountCents: 30000, paidAt: '2026-03-01' },
      { id: 'd2', tripId: 'trip-1', partyId: 'li', amountCents: 30000, paidAt: '2026-03-01' },
    ];

    const expenses: Expense[] = [
      {
        id: 'e1',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        category: '餐费',
        amountCents: 36000,
        payerKind: 'party',
        payerPartyId: 'zhang',
        shareMode: 'by_party',
      },
      {
        id: 'e2',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        category: '门票',
        amountCents: 15000,
        payerKind: 'pool',
        shareMode: 'by_party',
      },
    ];

    const expenseParticipants = [
      ...buildExpenseParticipants(expenses[0], [
        { partyId: 'zhang', headcountSnapshot: 2 },
        { partyId: 'li', headcountSnapshot: 3 },
        { partyId: 'wang', headcountSnapshot: 1 },
      ]),
      ...buildExpenseParticipants(expenses[1], [
        { partyId: 'zhang', headcountSnapshot: 2 },
        { partyId: 'li', headcountSnapshot: 3 },
        { partyId: 'wang', headcountSnapshot: 1 },
      ]),
    ];

    const ledger = buildPartyLedger({
      partyId: 'zhang',
      parties,
      deposits,
      expenses,
      expenseParticipants,
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
    const parties = [
      makeParty('zhang', '张家', 2),
      makeParty('li', '李家', 4),
      makeParty('chen', '陈家', 3),
    ];

    const deposits: Deposit[] = [
      { id: 'd1', tripId: 'trip-1', partyId: 'zhang', amountCents: 20000, paidAt: '2026-03-01' },
      { id: 'd2', tripId: 'trip-1', partyId: 'li', amountCents: 20000, paidAt: '2026-03-01' },
    ];

    const expenses: Expense[] = [
      {
        id: 'e1',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        category: '餐费',
        amountCents: 30000,
        payerKind: 'party',
        payerPartyId: 'zhang',
        shareMode: 'by_party',
      },
      {
        id: 'e2',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        category: '烧烤',
        amountCents: 45000,
        payerKind: 'party',
        payerPartyId: 'li',
        shareMode: 'by_party',
      },
      {
        id: 'e3',
        tripId: 'trip-1',
        paidAt: '2026-03-02',
        category: '早餐',
        amountCents: 9000,
        payerKind: 'pool',
        shareMode: 'by_party',
      },
    ];

    const expenseParticipants = [
      ...buildExpenseParticipants(expenses[0], [
        { partyId: 'zhang', headcountSnapshot: 2 },
        { partyId: 'li', headcountSnapshot: 4 },
      ]),
      ...buildExpenseParticipants(expenses[1], [
        { partyId: 'zhang', headcountSnapshot: 2 },
        { partyId: 'li', headcountSnapshot: 4 },
        { partyId: 'chen', headcountSnapshot: 3 },
      ]),
      ...buildExpenseParticipants(expenses[2], [{ partyId: 'chen', headcountSnapshot: 3 }]),
    ];

    const ledger = buildPartyLedger({
      partyId: 'chen',
      parties,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(ledger.summary?.netCents).toBe(-24000);
    expect(ledger.history.map((item) => [item.kind, item.signedAmountCents])).toEqual([
      ['share', -15000],
      ['share', -9000],
    ]);
  });
});
