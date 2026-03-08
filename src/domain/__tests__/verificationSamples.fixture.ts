import { buildExpenseParticipants } from '../share';
import type { Deposit, Expense, ExpenseParticipant, Party, SettlementSummary } from '../types';

export interface VerificationSampleCase {
  name: string;
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
  expectedSharesByExpenseId: Record<string, number[]>;
  expectedTailDeltasByExpenseId?: Record<string, number[]>;
  expectedSettlement: {
    totalExpenseCents: number;
    totalDepositCents: number;
    poolBalanceCents: number;
    summaries: SettlementSummary[];
  };
}

function makeParty(id: string, name: string, defaultHeadcount: number, sortOrder: number): Party {
  return {
    id,
    tripId: 'trip-doc-samples',
    name,
    defaultHeadcount,
    sortOrder,
    active: true,
  };
}

export function buildVerificationSampleCases(): VerificationSampleCase[] {
  const sample1Parties = [
    makeParty('zhang', '张家', 2, 0),
    makeParty('li', '李家', 3, 1),
    makeParty('wang', '王阿姨', 1, 2),
  ];

  const sample1Deposits: Deposit[] = [
    { id: 'd1', tripId: 'trip-doc-samples', partyId: 'zhang', amountCents: 30000, paidAt: '2026-03-01' },
    { id: 'd2', tripId: 'trip-doc-samples', partyId: 'li', amountCents: 30000, paidAt: '2026-03-01' },
  ];

  const sample1Expenses: Expense[] = [
    {
      id: 'e1',
      tripId: 'trip-doc-samples',
      paidAt: '2026-03-01',
      title: '午饭',
      amountCents: 36000,
      payerKind: 'party',
      payerPartyId: 'zhang',
      shareMode: 'by_party',
    },
    {
      id: 'e2',
      tripId: 'trip-doc-samples',
      paidAt: '2026-03-01',
      title: '门票',
      amountCents: 15000,
      payerKind: 'pool',
      shareMode: 'by_party',
    },
  ];

  const sample1ExpenseParticipants = [
    ...buildExpenseParticipants(sample1Expenses[0], [
      { partyId: 'zhang', headcountSnapshot: 2 },
      { partyId: 'li', headcountSnapshot: 3 },
      { partyId: 'wang', headcountSnapshot: 1 },
    ], sample1Parties),
    ...buildExpenseParticipants(sample1Expenses[1], [
      { partyId: 'zhang', headcountSnapshot: 2 },
      { partyId: 'li', headcountSnapshot: 3 },
      { partyId: 'wang', headcountSnapshot: 1 },
    ], sample1Parties),
  ];

  const sample2Parties = [
    makeParty('zhang', '张家', 2, 0),
    makeParty('li', '李家', 4, 1),
    makeParty('chen', '陈家', 3, 2),
  ];

  const sample2Deposits: Deposit[] = [
    { id: 'd1', tripId: 'trip-doc-samples', partyId: 'zhang', amountCents: 20000, paidAt: '2026-03-01' },
    { id: 'd2', tripId: 'trip-doc-samples', partyId: 'li', amountCents: 20000, paidAt: '2026-03-01' },
  ];

  const sample2Expenses: Expense[] = [
    {
      id: 'e1',
      tripId: 'trip-doc-samples',
      paidAt: '2026-03-01',
      title: '晚饭',
      amountCents: 30000,
      payerKind: 'party',
      payerPartyId: 'zhang',
      shareMode: 'by_party',
    },
    {
      id: 'e2',
      tripId: 'trip-doc-samples',
      paidAt: '2026-03-01',
      title: '烧烤',
      amountCents: 45000,
      payerKind: 'party',
      payerPartyId: 'li',
      shareMode: 'by_party',
    },
    {
      id: 'e3',
      tripId: 'trip-doc-samples',
      paidAt: '2026-03-02',
      title: '早餐',
      amountCents: 9000,
      payerKind: 'pool',
      shareMode: 'by_party',
    },
  ];

  const sample2ExpenseParticipants = [
    ...buildExpenseParticipants(sample2Expenses[0], [
      { partyId: 'zhang', headcountSnapshot: 2 },
      { partyId: 'li', headcountSnapshot: 4 },
    ], sample2Parties),
    ...buildExpenseParticipants(sample2Expenses[1], [
      { partyId: 'zhang', headcountSnapshot: 2 },
      { partyId: 'li', headcountSnapshot: 4 },
      { partyId: 'chen', headcountSnapshot: 3 },
    ], sample2Parties),
    ...buildExpenseParticipants(sample2Expenses[2], [
      { partyId: 'chen', headcountSnapshot: 3 },
    ], sample2Parties),
  ];

  const sample3Parties = [
    makeParty('zhang', '张家', 2, 0),
    makeParty('li', '李家', 3, 1),
    makeParty('zhao', '赵家', 1, 2),
  ];

  const sample3Deposits: Deposit[] = [
    { id: 'd1', tripId: 'trip-doc-samples', partyId: 'zhang', amountCents: 10000, paidAt: '2026-03-01' },
    { id: 'd2', tripId: 'trip-doc-samples', partyId: 'li', amountCents: 10000, paidAt: '2026-03-01' },
  ];

  const sample3Expenses: Expense[] = [
    {
      id: 'e1',
      tripId: 'trip-doc-samples',
      paidAt: '2026-03-01',
      title: '午饭',
      amountCents: 10100,
      payerKind: 'party',
      payerPartyId: 'zhang',
      shareMode: 'by_headcount',
    },
  ];

  const sample3ExpenseParticipants = buildExpenseParticipants(sample3Expenses[0], [
    { partyId: 'zhang', headcountSnapshot: 2 },
    { partyId: 'li', headcountSnapshot: 3 },
    { partyId: 'zhao', headcountSnapshot: 1 },
  ], sample3Parties);

  return [
    {
      name: '样例 1：最基础按家均分',
      parties: sample1Parties,
      deposits: sample1Deposits,
      expenses: sample1Expenses,
      expenseParticipants: sample1ExpenseParticipants,
      expectedSharesByExpenseId: {
        e1: [12000, 12000, 12000],
        e2: [5000, 5000, 5000],
      },
      expectedSettlement: {
        totalExpenseCents: 51000,
        totalDepositCents: 60000,
        poolBalanceCents: 45000,
        summaries: [
          { partyId: 'zhang', totalShareCents: 17000, depositCents: 30000, directPaidCents: 36000, totalPaidCents: 66000, netCents: 49000, status: 'receive' },
          { partyId: 'li', totalShareCents: 17000, depositCents: 30000, directPaidCents: 0, totalPaidCents: 30000, netCents: 13000, status: 'receive' },
          { partyId: 'wang', totalShareCents: 17000, depositCents: 0, directPaidCents: 0, totalPaidCents: 0, netCents: -17000, status: 'pay' },
        ],
      },
    },
    {
      name: '样例 2：动态参与',
      parties: sample2Parties,
      deposits: sample2Deposits,
      expenses: sample2Expenses,
      expenseParticipants: sample2ExpenseParticipants,
      expectedSharesByExpenseId: {
        e1: [15000, 15000],
        e2: [15000, 15000, 15000],
        e3: [9000],
      },
      expectedSettlement: {
        totalExpenseCents: 84000,
        totalDepositCents: 40000,
        poolBalanceCents: 31000,
        summaries: [
          { partyId: 'zhang', totalShareCents: 30000, depositCents: 20000, directPaidCents: 30000, totalPaidCents: 50000, netCents: 20000, status: 'receive' },
          { partyId: 'li', totalShareCents: 30000, depositCents: 20000, directPaidCents: 45000, totalPaidCents: 65000, netCents: 35000, status: 'receive' },
          { partyId: 'chen', totalShareCents: 24000, depositCents: 0, directPaidCents: 0, totalPaidCents: 0, netCents: -24000, status: 'pay' },
        ],
      },
    },
    {
      name: '样例 3：按人数分摊与取整',
      parties: sample3Parties,
      deposits: sample3Deposits,
      expenses: sample3Expenses,
      expenseParticipants: sample3ExpenseParticipants,
      expectedSharesByExpenseId: {
        e1: [3367, 5050, 1683],
      },
      expectedTailDeltasByExpenseId: {
        e1: [1, 0, 0],
      },
      expectedSettlement: {
        totalExpenseCents: 10100,
        totalDepositCents: 20000,
        poolBalanceCents: 20000,
        summaries: [
          { partyId: 'zhang', totalShareCents: 3367, depositCents: 10000, directPaidCents: 10100, totalPaidCents: 20100, netCents: 16733, status: 'receive' },
          { partyId: 'li', totalShareCents: 5050, depositCents: 10000, directPaidCents: 0, totalPaidCents: 10000, netCents: 4950, status: 'receive' },
          { partyId: 'zhao', totalShareCents: 1683, depositCents: 0, directPaidCents: 0, totalPaidCents: 0, netCents: -1683, status: 'pay' },
        ],
      },
    },
  ];
}
