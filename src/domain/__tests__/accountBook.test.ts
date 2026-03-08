import { buildExpenseParticipants } from '../share';
import { buildAccountLedger, buildAccountSettlement, buildMemberAccountLedger } from '../accountBook';
import type { Deposit, Expense, MemberProfile, Party, Trip } from '../types';

function makeMember(id: string, name: string, defaultHeadcount: number, sortOrder: number): MemberProfile {
  return {
    id,
    name,
    defaultHeadcount,
    sortOrder,
    active: true,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  };
}

function makeParty(id: string, tripId: string, memberProfileId: string, name: string, defaultHeadcount: number, sortOrder: number): Party {
  return {
    id,
    tripId,
    memberProfileId,
    name,
    defaultHeadcount,
    sortOrder,
    active: true,
  };
}

function makeTrip(id: string, name: string): Trip {
  return {
    id,
    name,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  };
}

describe('accountBook settlement and ledgers', () => {
  it('aggregates member-level totals and ignores voided records', () => {
    const members = [
      makeMember('m-zhang', '张家', 2, 0),
      makeMember('m-li', '李家', 1, 1),
    ];
    const parties = [
      makeParty('p-zhang', 'trip-1', 'm-zhang', '张家', 2, 0),
      makeParty('p-li', 'trip-1', 'm-li', '李家', 1, 1),
    ];

    const deposits: Deposit[] = [
      {
        id: 'd-1',
        tripId: 'trip-1',
        partyId: 'p-zhang',
        memberProfileId: 'm-zhang',
        amountCents: 10000,
        paidAt: '2026-03-01',
        status: 'posted',
        recordedAt: '2026-03-01T09:00:00.000Z',
        sequenceNo: 1,
      },
      {
        id: 'd-2',
        tripId: 'trip-1',
        partyId: 'p-li',
        memberProfileId: 'm-li',
        amountCents: 5000,
        paidAt: '2026-03-01',
        status: 'posted',
        recordedAt: '2026-03-01T09:05:00.000Z',
        sequenceNo: 2,
      },
    ];

    const expenses: Expense[] = [
      {
        id: 'e-1',
        tripId: 'trip-1',
        title: '午饭',
        amountCents: 12000,
        paidAt: '2026-03-01',
        payerKind: 'party',
        payerPartyId: 'p-zhang',
        shareMode: 'by_party',
        status: 'posted',
        recordedAt: '2026-03-01T10:00:00.000Z',
        sequenceNo: 3,
      },
      {
        id: 'e-2',
        tripId: 'trip-1',
        title: '门票',
        amountCents: 3000,
        paidAt: '2026-03-01',
        payerKind: 'pool',
        shareMode: 'by_headcount',
        status: 'posted',
        recordedAt: '2026-03-01T10:10:00.000Z',
        sequenceNo: 4,
      },
      {
        id: 'e-3',
        tripId: 'trip-1',
        title: '作废车费',
        amountCents: 9999,
        paidAt: '2026-03-01',
        payerKind: 'pool',
        shareMode: 'by_party',
        status: 'void',
        recordedAt: '2026-03-01T10:20:00.000Z',
        sequenceNo: 5,
      },
    ];

    const expenseParticipants = [
      ...buildExpenseParticipants(expenses[0], [
        { partyId: 'p-zhang', headcountSnapshot: 2 },
        { partyId: 'p-li', headcountSnapshot: 1 },
      ], parties),
      ...buildExpenseParticipants(expenses[1], [
        { partyId: 'p-zhang', headcountSnapshot: 2 },
        { partyId: 'p-li', headcountSnapshot: 1 },
      ], parties),
      ...buildExpenseParticipants(expenses[2], [
        { partyId: 'p-zhang', headcountSnapshot: 2 },
        { partyId: 'p-li', headcountSnapshot: 1 },
      ], parties),
    ];

    const settlement = buildAccountSettlement({
      memberProfiles: members,
      parties,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(settlement.totalExpenseCents).toBe(15000);
    expect(settlement.totalAllocatedCents).toBe(15000);
    expect(settlement.poolBalanceCents).toBe(12000);
    expect(settlement.summaries).toEqual([
      {
        memberProfileId: 'm-zhang',
        totalShareCents: 8000,
        depositCents: 10000,
        directPaidCents: 12000,
        totalPaidCents: 22000,
        netCents: 14000,
        status: 'receive',
      },
      {
        memberProfileId: 'm-li',
        totalShareCents: 7000,
        depositCents: 5000,
        directPaidCents: 0,
        totalPaidCents: 5000,
        netCents: -2000,
        status: 'pay',
      },
    ]);
  });

  it('builds member ledger running balances in stable order', () => {
    const members = [
      makeMember('m-zhang', '张家', 2, 0),
      makeMember('m-li', '李家', 1, 1),
    ];
    const trips = [makeTrip('trip-1', '清明活动')];
    const parties = [
      makeParty('p-zhang', 'trip-1', 'm-zhang', '张家', 2, 0),
      makeParty('p-li', 'trip-1', 'm-li', '李家', 1, 1),
    ];
    const deposits: Deposit[] = [
      {
        id: 'd-1',
        tripId: 'trip-1',
        partyId: 'p-li',
        memberProfileId: 'm-li',
        amountCents: 5000,
        paidAt: '2026-03-01',
        status: 'posted',
        recordedAt: '2026-03-01T09:05:00.000Z',
        sequenceNo: 2,
      },
    ];
    const expenses: Expense[] = [
      {
        id: 'e-1',
        tripId: 'trip-1',
        title: '午饭',
        amountCents: 12000,
        paidAt: '2026-03-01',
        payerKind: 'party',
        payerPartyId: 'p-zhang',
        shareMode: 'by_party',
        status: 'posted',
        recordedAt: '2026-03-01T10:00:00.000Z',
        sequenceNo: 3,
      },
      {
        id: 'e-2',
        tripId: 'trip-1',
        title: '门票',
        amountCents: 3000,
        paidAt: '2026-03-01',
        payerKind: 'pool',
        shareMode: 'by_headcount',
        status: 'posted',
        recordedAt: '2026-03-01T10:10:00.000Z',
        sequenceNo: 4,
      },
    ];

    const expenseParticipants = [
      ...buildExpenseParticipants(expenses[0], [
        { partyId: 'p-zhang', headcountSnapshot: 2 },
        { partyId: 'p-li', headcountSnapshot: 1 },
      ], parties),
      ...buildExpenseParticipants(expenses[1], [
        { partyId: 'p-zhang', headcountSnapshot: 2 },
        { partyId: 'p-li', headcountSnapshot: 1 },
      ], parties),
    ];

    const memberLedger = buildMemberAccountLedger({
      memberProfileId: 'm-li',
      memberProfiles: members,
      parties,
      trips,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(memberLedger.summary?.netCents).toBe(-2000);
    expect(memberLedger.history.map((item) => [item.kind, item.signedAmountCents, item.afterNetCents])).toEqual([
      ['deposit', 5000, 5000],
      ['share', -6000, -1000],
      ['share', -1000, -2000],
    ]);

    const accountLedger = buildAccountLedger({
      memberProfiles: members,
      parties,
      trips,
      deposits,
      expenses,
      expenseParticipants,
    });

    expect(accountLedger.map((item) => [item.type, item.amountCents, item.poolBalanceAfterCents])).toEqual([
      ['deposit', 5000, 5000],
      ['expense', 12000, 5000],
      ['expense', 3000, 2000],
    ]);
    expect(accountLedger[2].tailNote).toBe('这笔刚好能整分，不需要补尾差。');
  });
});
