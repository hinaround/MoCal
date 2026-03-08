import { describe, expect, it } from 'vitest';
import { validateBackupPayload } from '../backupRepository';

describe('validateBackupPayload', () => {
  it('accepts a complete backup payload', () => {
    const result = validateBackupPayload({
      appName: '活动经费管理',
      schemaVersion: 1,
      exportedAt: '2026-03-09T10:00:00.000Z',
      source: 'manual-export',
      stores: {
        trips: [{ id: 'trip-1', name: '清明活动', createdAt: '2026-03-09T10:00:00.000Z', updatedAt: '2026-03-09T10:00:00.000Z' }],
        memberProfiles: [],
        parties: [{ id: 'party-1', tripId: 'trip-1', name: '张家', defaultHeadcount: 2, sortOrder: 0, active: true }],
        deposits: [{ id: 'deposit-1', tripId: 'trip-1', partyId: 'party-1', amountCents: 5000, paidAt: '2026-03-09' }],
        expenses: [{ id: 'expense-1', tripId: 'trip-1', paidAt: '2026-03-09', amountCents: 3000, payerKind: 'party', payerPartyId: 'party-1', shareMode: 'by_party' }],
        expenseParticipants: [{ id: 'ep-1', expenseId: 'expense-1', partyId: 'party-1', headcountSnapshot: 2, weightSnapshot: 1, shareAmountCents: 3000 }],
      },
    });

    expect(result.ok).toBe(true);
  });

  it('rejects payloads with broken relations', () => {
    const result = validateBackupPayload({
      stores: {
        trips: [{ id: 'trip-1', name: '清明活动', createdAt: '2026-03-09T10:00:00.000Z', updatedAt: '2026-03-09T10:00:00.000Z' }],
        memberProfiles: [],
        parties: [{ id: 'party-1', tripId: 'trip-missing', name: '张家', defaultHeadcount: 2, sortOrder: 0, active: true }],
        deposits: [],
        expenses: [],
        expenseParticipants: [],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('有成员挂在不存在的活动下');
    }
  });
});
