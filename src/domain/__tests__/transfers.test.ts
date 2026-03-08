import { buildSettlementTransfers } from '../transfers';

describe('buildSettlementTransfers', () => {
  it('会生成最直接的补退建议', () => {
    const transfers = buildSettlementTransfers({
      parties: [
        { id: 'zhang', tripId: 'trip-1', name: '张家', defaultHeadcount: 2, sortOrder: 0, active: true },
        { id: 'li', tripId: 'trip-1', name: '李家', defaultHeadcount: 3, sortOrder: 1, active: true },
        { id: 'wang', tripId: 'trip-1', name: '王阿姨', defaultHeadcount: 1, sortOrder: 2, active: true },
      ],
      summaries: [
        { partyId: 'zhang', totalShareCents: 12000, depositCents: 0, directPaidCents: 25000, totalPaidCents: 25000, netCents: 13000, status: 'receive' },
        { partyId: 'li', totalShareCents: 12000, depositCents: 0, directPaidCents: 17000, totalPaidCents: 17000, netCents: 5000, status: 'receive' },
        { partyId: 'wang', totalShareCents: 30000, depositCents: 0, directPaidCents: 0, totalPaidCents: 0, netCents: -18000, status: 'pay' },
      ],
    });

    expect(transfers.map((item) => item.sentence)).toEqual([
      '王阿姨补给张家 130.00 元',
      '王阿姨补给李家 50.00 元',
    ]);
  });
});
