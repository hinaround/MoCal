import { useEffect, useMemo, useState } from 'react';
import { DepositLedgerPanel } from './DepositLedgerPanel';
import { ExpenseComposerPanel } from './ExpenseComposerPanel';
import { FamilyRosterPanel } from './FamilyRosterPanel';
import { FullLedgerPanel } from './FullLedgerPanel';
import { PartyLedgerPanel } from './PartyLedgerPanel';
import { SettlementPanel } from './SettlementPanel';
import { buildFullLedger } from '../domain/fullLedger';
import { buildTripSettlement } from '../domain/settlement';
import type { Party, ShareMode } from '../domain/types';
import type { TripBundle } from '../storage/ledgerRepository';
import { formatCurrency, formatDateLabel, formatDateRange, formatNetLabel } from '../utils/format';

const PRIMARY_ACTIONS = [
  { value: 'home', label: '先看总账', hint: '先看现在谁该补谁该退' },
  { value: 'expense', label: '记一笔花费', hint: '已经花了钱，就从这里记' },
  { value: 'deposit', label: '先收的钱', hint: '还没花也能先把钱收上来' },
  { value: 'ledger', label: '看整本流水', hint: '适合截图发给别人对账' },
] as const;

const SECONDARY_ACTIONS = [
  { value: 'settlement', label: '最后怎么结' },
  { value: 'party', label: '看这家的流水' },
  { value: 'families', label: '账里有哪些家' },
] as const;

export type WorkspaceSection = 'home' | 'expense' | 'deposit' | 'ledger' | 'settlement' | 'party' | 'families';

interface TripWorkspaceProps {
  bundle: TripBundle;
  saving: boolean;
  initialSection?: WorkspaceSection;
  onBack: () => void;
  onCreateParty: (input: { name: string; defaultHeadcount: number; note?: string }) => Promise<void>;
  onUpdateParty: (party: Party) => Promise<void>;
  onSaveDeposit: (input: {
    depositId?: string;
    partyId: string;
    amountCents: number;
    paidAt: string;
    note?: string;
    reason?: string;
  }) => Promise<void>;
  onVoidDeposit: (input: { depositId: string; reason: string }) => Promise<void>;
  onSaveExpense: (input: {
    expenseId?: string;
    paidAt: string;
    category?: string;
    title?: string;
    amountCents: number;
    payerKind: 'party' | 'pool';
    payerPartyId?: string;
    shareMode: ShareMode;
    note?: string;
    reason?: string;
    participants: Array<{ partyId: string; headcountSnapshot: number }>;
  }) => Promise<void>;
  onVoidExpense: (input: { expenseId: string; reason: string }) => Promise<void>;
}

export function TripWorkspace(props: TripWorkspaceProps) {
  const {
    bundle,
    saving,
    initialSection = 'home',
    onBack,
    onCreateParty,
    onUpdateParty,
    onSaveDeposit,
    onVoidDeposit,
    onSaveExpense,
    onVoidExpense,
  } = props;

  const [section, setSection] = useState<WorkspaceSection>(initialSection);
  const [showMore, setShowMore] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState(bundle.parties[0]?.id ?? '');
  const [editingDepositId, setEditingDepositId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    setSection(initialSection);
    setShowMore(false);
  }, [bundle.trip.id, initialSection]);

  useEffect(() => {
    setSelectedPartyId((current) => {
      if (current && bundle.parties.some((party) => party.id === current)) {
        return current;
      }
      return bundle.parties[0]?.id ?? '';
    });
  }, [bundle.parties]);

  const settlement = useMemo(
    () => buildTripSettlement({ parties: bundle.parties, deposits: bundle.deposits, expenses: bundle.expenses, expenseParticipants: bundle.expenseParticipants }),
    [bundle.deposits, bundle.expenseParticipants, bundle.expenses, bundle.parties],
  );

  const fullLedger = useMemo(
    () => buildFullLedger({ parties: bundle.parties, deposits: bundle.deposits, expenses: bundle.expenses, expenseParticipants: bundle.expenseParticipants }),
    [bundle.deposits, bundle.expenseParticipants, bundle.expenses, bundle.parties],
  );

  const recentRecords = useMemo(() => [...fullLedger].reverse().slice(0, 4), [fullLedger]);
  const activeParties = useMemo(() => bundle.parties.filter((party) => party.active), [bundle.parties]);
  const keyResults = useMemo(() => settlement.summaries.filter((summary) => summary.netCents !== 0), [settlement.summaries]);

  const editingDeposit = editingDepositId ? bundle.deposits.find((item) => item.id === editingDepositId) ?? null : null;
  const editingExpense = editingExpenseId ? bundle.expenses.find((item) => item.id === editingExpenseId) ?? null : null;
  const editingExpenseParticipants = editingExpenseId ? bundle.expenseParticipants.filter((item) => item.expenseId === editingExpenseId) : [];

  const lastPostedExpense = useMemo(() => bundle.expenses.find((expense) => (expense.status ?? 'posted') === 'posted') ?? null, [bundle.expenses]);
  const lastPostedExpenseParticipants = useMemo(
    () => (lastPostedExpense ? bundle.expenseParticipants.filter((participant) => participant.expenseId === lastPostedExpense.id) : []),
    [bundle.expenseParticipants, lastPostedExpense],
  );

  async function handleSaveDeposit(input: {
    depositId?: string;
    partyId: string;
    amountCents: number;
    paidAt: string;
    note?: string;
    reason?: string;
  }) {
    const isEditing = Boolean(input.depositId);
    await onSaveDeposit(input);
    setEditingDepositId(null);
    setSection(isEditing ? 'ledger' : 'deposit');
  }

  async function handleSaveExpense(input: {
    expenseId?: string;
    paidAt: string;
    category?: string;
    title?: string;
    amountCents: number;
    payerKind: 'party' | 'pool';
    payerPartyId?: string;
    shareMode: ShareMode;
    note?: string;
    reason?: string;
    participants: Array<{ partyId: string; headcountSnapshot: number }>;
  }) {
    const isEditing = Boolean(input.expenseId);
    await onSaveExpense(input);
    setEditingExpenseId(null);
    setSection(isEditing ? 'ledger' : 'expense');
  }

  return (
    <main className="page-shell">
      <section className="hero-card compact">
        <div className="hero-actions">
          <button className="ghost-button" type="button" onClick={onBack}>
            返回账本列表
          </button>
        </div>
        <p className="eyebrow">这本账</p>
        <h1>{bundle.trip.name}</h1>
        <p className="lead">{formatDateRange(bundle.trip.startDate, bundle.trip.endDate)} · 先点入口做事，再往下看总账和最近记录。</p>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>固定主入口</h2>
            <p>主流程只放 4 个入口，不用横向滑着找。</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => setShowMore((current) => !current)}>
            {showMore ? '收起更多' : '更多功能'}
          </button>
        </div>

        <div className="action-grid action-grid-home">
          {PRIMARY_ACTIONS.map((action) => (
            <button
              key={action.value}
              type="button"
              className={section === action.value ? 'primary-action-card active' : 'secondary-action-card'}
              onClick={() => setSection(action.value)}
            >
              <strong>{action.label}</strong>
              <span>{action.hint}</span>
            </button>
          ))}
        </div>

        {showMore ? (
          <div className="more-actions-card">
            {SECONDARY_ACTIONS.map((action) => (
              <button key={action.value} type="button" className="ghost-button" onClick={() => setSection(action.value)}>
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {section === 'home' ? (
        <section className="panel-card compact-top-gap">
          <div className="section-heading">
            <div>
              <h2>先看总账</h2>
              <p>先看总共收了多少、花了多少、谁该补谁该退。</p>
            </div>
          </div>

          <div className="stats-grid">
            <article className="stat-card">
              <span>总花费</span>
              <strong>{formatCurrency(settlement.totalExpenseCents)}</strong>
            </article>
            <article className="stat-card">
              <span>先收总额</span>
              <strong>{formatCurrency(settlement.totalDepositCents)}</strong>
            </article>
            <article className={`stat-card ${settlement.poolBalanceCents >= 0 ? 'good' : 'warn'}`}>
              <span>公账余额</span>
              <strong>{formatCurrency(settlement.poolBalanceCents)}</strong>
            </article>
            <article className="stat-card">
              <span>账里有哪些家</span>
              <strong>{activeParties.length} 家</strong>
            </article>
          </div>

          <article className="inline-card compact-top-gap">
            <strong>现在最关键</strong>
            {keyResults.length === 0 ? (
              <p>目前已经平账，没有人需要补或退。</p>
            ) : (
              <div className="simple-list compact-top-gap">
                {keyResults.map((summary) => {
                  const party = bundle.parties.find((item) => item.id === summary.partyId);
                  return (
                    <div key={summary.partyId} className="simple-row">
                      <div>
                        <strong>{party?.name ?? '未命名'}</strong>
                        <span>{summary.netCents > 0 ? '这家已经多拿出来了' : '这家还没出够'}</span>
                      </div>
                      <strong className={summary.netCents > 0 ? 'good-text' : 'warn-text'}>{formatNetLabel(summary.netCents)}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="inline-card recent-card compact-top-gap">
            <strong>最近几笔记录</strong>
            {recentRecords.length === 0 ? (
              <p>还没有记录，先记一笔花费或先收的钱。</p>
            ) : (
              <div className="simple-list compact-top-gap">
                {recentRecords.map((item) => (
                  <div key={`${item.type}:${item.id}`} className="simple-row">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{formatDateLabel(item.date)} · {item.note ? `备注：${item.note}` : item.subtitle}</span>
                    </div>
                    <strong>{formatCurrency(item.amountCents)}</strong>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      ) : null}

      {section === 'families' ? (
        <FamilyRosterPanel parties={bundle.parties} saving={saving} onCreateParty={onCreateParty} onUpdateParty={onUpdateParty} />
      ) : null}

      {section === 'expense' ? (
        <ExpenseComposerPanel
          parties={bundle.parties}
          saving={saving}
          poolBalanceCents={settlement.poolBalanceCents}
          editingExpense={editingExpense}
          editingParticipants={editingExpenseParticipants}
          lastExpense={lastPostedExpense}
          lastExpenseParticipants={lastPostedExpenseParticipants}
          onSave={handleSaveExpense}
          onCancelEdit={() => setEditingExpenseId(null)}
        />
      ) : null}

      {section === 'deposit' ? (
        <DepositLedgerPanel
          parties={bundle.parties}
          deposits={bundle.deposits}
          saving={saving}
          poolBalanceCents={settlement.poolBalanceCents}
          editingDeposit={editingDeposit}
          depositTimeline={fullLedger}
          onSave={handleSaveDeposit}
          onVoid={onVoidDeposit}
          onCancelEdit={() => setEditingDepositId(null)}
        />
      ) : null}

      {section === 'ledger' ? (
        <FullLedgerPanel
          trip={bundle.trip}
          parties={bundle.parties}
          deposits={bundle.deposits}
          expenses={bundle.expenses}
          expenseParticipants={bundle.expenseParticipants}
          settlement={settlement}
          saving={saving}
          onEditDeposit={(depositId) => {
            setEditingDepositId(depositId);
            setSection('deposit');
          }}
          onVoidDeposit={onVoidDeposit}
          onEditExpense={(expenseId) => {
            setEditingExpenseId(expenseId);
            setSection('expense');
          }}
          onVoidExpense={onVoidExpense}
        />
      ) : null}

      {section === 'settlement' ? (
        <SettlementPanel
          trip={bundle.trip}
          parties={bundle.parties}
          summaries={settlement.summaries}
          totalExpenseCents={settlement.totalExpenseCents}
          totalDepositCents={settlement.totalDepositCents}
          poolBalanceCents={settlement.poolBalanceCents}
          onOpenParty={(partyId) => {
            setSelectedPartyId(partyId);
            setSection('party');
          }}
        />
      ) : null}

      {section === 'party' ? (
        <PartyLedgerPanel bundle={bundle} selectedPartyId={selectedPartyId} onChangeSelectedPartyId={setSelectedPartyId} />
      ) : null}
    </main>
  );
}
