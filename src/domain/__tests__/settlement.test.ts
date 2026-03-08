import { buildExpenseParticipants } from '../share';
import { buildTripSettlement } from '../settlement';
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

describe('buildTripSettlement', () => {
  it('matches sample 1 from the frozen rules', () => {
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
        title: '午饭',
        amountCents: 36000,
        payerKind: 'party',
        payerPartyId: 'zhang',
        shareMode: 'by_party',
      },
      {
        id: 'e2',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        title: '门票',
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

    const settlement = buildTripSettlement({
      parties,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(settlement.poolBalanceCents).toBe(45000);
    expect(settlement.summaries).toEqual([
      {
        partyId: 'zhang',
        totalShareCents: 17000,
        depositCents: 30000,
        directPaidCents: 36000,
        totalPaidCents: 66000,
        netCents: 49000,
        status: 'receive',
      },
      {
        partyId: 'li',
        totalShareCents: 17000,
        depositCents: 30000,
        directPaidCents: 0,
        totalPaidCents: 30000,
        netCents: 13000,
        status: 'receive',
      },
      {
        partyId: 'wang',
        totalShareCents: 17000,
        depositCents: 0,
        directPaidCents: 0,
        totalPaidCents: 0,
        netCents: -17000,
        status: 'pay',
      },
    ]);
  });

  it('matches sample 2 with dynamic participation', () => {
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
        amountCents: 30000,
        title: '晚饭',
        payerKind: 'party',
        payerPartyId: 'zhang',
        shareMode: 'by_party',
      },
      {
        id: 'e2',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        amountCents: 45000,
        title: '烧烤',
        payerKind: 'party',
        payerPartyId: 'li',
        shareMode: 'by_party',
      },
      {
        id: 'e3',
        tripId: 'trip-1',
        paidAt: '2026-03-02',
        amountCents: 9000,
        title: '早餐',
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

    const settlement = buildTripSettlement({
      parties,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(settlement.poolBalanceCents).toBe(31000);
    expect(settlement.summaries).toEqual([
      {
        partyId: 'zhang',
        totalShareCents: 30000,
        depositCents: 20000,
        directPaidCents: 30000,
        totalPaidCents: 50000,
        netCents: 20000,
        status: 'receive',
      },
      {
        partyId: 'li',
        totalShareCents: 30000,
        depositCents: 20000,
        directPaidCents: 45000,
        totalPaidCents: 65000,
        netCents: 35000,
        status: 'receive',
      },
      {
        partyId: 'chen',
        totalShareCents: 24000,
        depositCents: 0,
        directPaidCents: 0,
        totalPaidCents: 0,
        netCents: -24000,
        status: 'pay',
      },
    ]);
  });

  it('matches sample 3 with headcount split and remainder', () => {
    const parties = [
      makeParty('zhang', '张家', 2),
      makeParty('li', '李家', 3),
      makeParty('zhao', '赵家', 1),
    ];

    const deposits: Deposit[] = [
      { id: 'd1', tripId: 'trip-1', partyId: 'zhang', amountCents: 10000, paidAt: '2026-03-01' },
      { id: 'd2', tripId: 'trip-1', partyId: 'li', amountCents: 10000, paidAt: '2026-03-01' },
    ];

    const expenses: Expense[] = [
      {
        id: 'e1',
        tripId: 'trip-1',
        paidAt: '2026-03-01',
        amountCents: 10100,
        title: '午饭',
        payerKind: 'party',
        payerPartyId: 'zhang',
        shareMode: 'by_headcount',
      },
    ];

    const expenseParticipants = buildExpenseParticipants(expenses[0], [
      { partyId: 'zhang', headcountSnapshot: 2 },
      { partyId: 'li', headcountSnapshot: 3 },
      { partyId: 'zhao', headcountSnapshot: 1 },
    ]);

    const settlement = buildTripSettlement({
      parties,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(settlement.poolBalanceCents).toBe(20000);
    expect(settlement.summaries).toEqual([
      {
        partyId: 'zhang',
        totalShareCents: 3367,
        depositCents: 10000,
        directPaidCents: 10100,
        totalPaidCents: 20100,
        netCents: 16733,
        status: 'receive',
      },
      {
        partyId: 'li',
        totalShareCents: 5050,
        depositCents: 10000,
        directPaidCents: 0,
        totalPaidCents: 10000,
        netCents: 4950,
        status: 'receive',
      },
      {
        partyId: 'zhao',
        totalShareCents: 1683,
        depositCents: 0,
        directPaidCents: 0,
        totalPaidCents: 0,
        netCents: -1683,
        status: 'pay',
      },
    ]);
  });
});
