export type Id = string;

export type ShareMode = 'by_party' | 'by_headcount';
export type ExpensePayerKind = 'party' | 'pool';
export type SettlementStatus = 'receive' | 'pay' | 'settled';
export type LedgerRecordStatus = 'posted' | 'void';
export type AuditAction = 'created' | 'updated' | 'voided';

export interface AuditTrailEntry {
  id: Id;
  at: string;
  action: AuditAction;
  reason?: string;
  beforeSummary?: string;
  afterSummary: string;
}

export interface Trip {
  id: Id;
  name: string;
  startDate?: string;
  endDate?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Party {
  id: Id;
  tripId: Id;
  name: string;
  defaultHeadcount: number;
  note?: string;
  sortOrder: number;
  active: boolean;
}

export interface Deposit {
  id: Id;
  tripId: Id;
  partyId: Id;
  amountCents: number;
  paidAt: string;
  note?: string;
  status?: LedgerRecordStatus;
  recordedAt?: string;
  sequenceNo?: number;
  createdAt?: string;
  updatedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  auditTrail?: AuditTrailEntry[];
}

export interface Expense {
  id: Id;
  tripId: Id;
  paidAt: string;
  category?: string;
  title?: string;
  amountCents: number;
  payerKind: ExpensePayerKind;
  payerPartyId?: Id;
  shareMode: ShareMode;
  note?: string;
  status?: LedgerRecordStatus;
  recordedAt?: string;
  sequenceNo?: number;
  createdAt?: string;
  updatedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  auditTrail?: AuditTrailEntry[];
}

export interface ExpenseParticipant {
  id: Id;
  expenseId: Id;
  partyId: Id;
  headcountSnapshot: number;
  weightSnapshot: number;
  shareAmountCents: number;
  baseShareCents?: number;
  tailDeltaCents?: number;
}

export interface SettlementSummary {
  partyId: Id;
  totalShareCents: number;
  depositCents: number;
  directPaidCents: number;
  totalPaidCents: number;
  netCents: number;
  status: SettlementStatus;
}

export interface TripSettlement {
  summaries: SettlementSummary[];
  totalExpenseCents: number;
  totalAllocatedCents: number;
  totalDepositCents: number;
  totalDirectPaidCents: number;
  poolSpentCents: number;
  poolBalanceCents: number;
}

export interface ShareParticipantInput {
  partyId: Id;
  headcountSnapshot: number;
}

export interface ShareAllocationRow {
  partyId: Id;
  headcountSnapshot: number;
  weight: number;
  shareAmountCents: number;
  baseShareCents: number;
  tailDeltaCents: number;
}

export interface SettlementTransfer {
  fromPartyId: Id;
  toPartyId: Id;
  amountCents: number;
}
