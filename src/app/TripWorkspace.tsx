import { useEffect, useMemo, useState } from 'react';
import { DepositLedgerPanel } from './DepositLedgerPanel';
import { ExpenseComposerPanel } from './ExpenseComposerPanel';
import { FamilyRosterPanel } from './FamilyRosterPanel';
import { FullLedgerPanel } from './FullLedgerPanel';
import { PartyLedgerPanel } from './PartyLedgerPanel';
import { buildFullLedger } from '../domain/fullLedger';
import { buildTripSettlement } from '../domain/settlement';
import { buildSettlementTransfers } from '../domain/transfers';
import type { Party, ShareMode } from '../domain/types';
import type { TripBundle } from '../storage/ledgerRepository';
import { formatBalanceLabel, formatCurrency, formatDateLabel, formatDateRange } from '../utils/format';

const MAIN_TABS = [
  { value: 'home', label: '总览', hint: '先看这次活动现在记到哪了' },
  { value: 'expense', label: '支出', hint: '记一笔花出去的钱' },
  { value: 'deposit', label: '入金', hint: '记成员先交上来的经费' },
  { value: 'ledger', label: '查账', hint: '看总账、流水、单家明细和截图' },
] as const;

export type WorkspaceSection = 'home' | 'expense' | 'deposit' | 'ledger' | 'party' | 'families' | 'screenshot';

type MainTab = (typeof MAIN_TABS)[number]['value'];

interface TripWorkspaceProps {
  bundle: TripBundle;
  saving: boolean;
  initialSection?: WorkspaceSection;
  securityEnabled?: boolean;
  onLockNow?: () => void;
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

function resolveMainTab(section: WorkspaceSection): MainTab {
  if (section === 'party' || section === 'screenshot') {
    return 'ledger';
  }

  if (section === 'families') {
    return 'home';
  }

  return section;
}

export function TripWorkspace(props: TripWorkspaceProps) {
  const {
    bundle,
    saving,
    initialSection = 'home',
    securityEnabled = false,
    onLockNow,
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
    setEditingDepositId(null);
    setEditingExpenseId(null);
  }, [bundle.trip.id, initialSection]);

  useEffect(() => {
    setSelectedPartyId((current) => {
      if (current && bundle.parties.some((party) => party.id === current)) {
        return current;
      }
      return bundle.parties[0]?.id ?? '';
    });
  }, [bundle.parties]);

  const partySortOrder = useMemo(() => new Map(bundle.parties.map((party) => [party.id, party.sortOrder])), [bundle.parties]);

  const settlement = useMemo(
    () => buildTripSettlement({ parties: bundle.parties, deposits: bundle.deposits, expenses: bundle.expenses, expenseParticipants: bundle.expenseParticipants }),
    [bundle.deposits, bundle.expenseParticipants, bundle.expenses, bundle.parties],
  );

  const fullLedger = useMemo(
    () => buildFullLedger({ parties: bundle.parties, deposits: bundle.deposits, expenses: bundle.expenses, expenseParticipants: bundle.expenseParticipants }),
    [bundle.deposits, bundle.expenseParticipants, bundle.expenses, bundle.parties],
  );

  const transfers = useMemo(
    () => buildSettlementTransfers({ parties: bundle.parties, summaries: settlement.summaries }),
    [bundle.parties, settlement.summaries],
  );

  const recentRecords = useMemo(() => [...fullLedger].slice(-3).reverse(), [fullLedger]);
  const activeParties = useMemo(() => bundle.parties.filter((party) => party.active), [bundle.parties]);
  const balanceSummaries = useMemo(
    () => [...settlement.summaries].sort((left, right) => (partySortOrder.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) - (partySortOrder.get(right.partyId) ?? Number.MAX_SAFE_INTEGER)),
    [partySortOrder, settlement.summaries],
  );

  const editingDeposit = editingDepositId ? bundle.deposits.find((item) => item.id === editingDepositId) ?? null : null;
  const editingExpense = editingExpenseId ? bundle.expenses.find((item) => item.id === editingExpenseId) ?? null : null;
  const editingExpenseParticipants = editingExpenseId ? bundle.expenseParticipants.filter((item) => item.expenseId === editingExpenseId) : [];

  const lastPostedExpenseId = useMemo(
    () => [...fullLedger].reverse().find((item) => item.type === 'expense' && item.status === 'posted')?.id ?? null,
    [fullLedger],
  );
  const lastPostedExpense = useMemo(
    () => (lastPostedExpenseId ? bundle.expenses.find((expense) => expense.id === lastPostedExpenseId) ?? null : null),
    [bundle.expenses, lastPostedExpenseId],
  );
  const lastPostedExpenseParticipants = useMemo(
    () => (lastPostedExpense ? bundle.expenseParticipants.filter((participant) => participant.expenseId === lastPostedExpense.id) : []),
    [bundle.expenseParticipants, lastPostedExpense],
  );

  function openDepositEditor(depositId: string) {
    setEditingExpenseId(null);
    setEditingDepositId(depositId);
    setSection('deposit');
    setShowMore(false);
  }

  function openExpenseEditor(expenseId: string) {
    setEditingDepositId(null);
    setEditingExpenseId(expenseId);
    setSection('expense');
    setShowMore(false);
  }

  function openPartyDetail(partyId?: string) {
    const resolvedPartyId = partyId || bundle.parties[0]?.id;
    if (!resolvedPartyId) {
      return;
    }
    setSelectedPartyId(resolvedPartyId);
    setSection('party');
    setShowMore(false);
  }

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

  function renderMoreActions() {
    if (!showMore) {
      return null;
    }

    return (
      <section className="panel-card compact-top-gap">
        <div className="section-heading compact-gap">
          <div>
            <h2>更多功能</h2>
            <p>这些入口不常用，但遇到对账、改名单或锁屏时能马上找到。</p>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="ghost-button" onClick={() => setSection('families')}>
            成员名单
          </button>
          <button type="button" className="ghost-button" onClick={() => openPartyDetail()} disabled={bundle.parties.length === 0}>
            单家明细
          </button>
          <button type="button" className="ghost-button" onClick={() => setSection('screenshot')}>
            对账截图
          </button>
          {securityEnabled && onLockNow ? (
            <button type="button" className="ghost-button" onClick={onLockNow}>
              立即上锁
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  function renderOverview() {
    return (
      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>活动总览</h2>
            <p>先看总交款、总支出、公账余额和各家当前余额，再决定要不要继续记账或查账。</p>
          </div>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span>已收经费</span>
            <strong>{formatCurrency(settlement.totalDepositCents)}</strong>
          </article>
          <article className="stat-card">
            <span>已支出</span>
            <strong>{formatCurrency(settlement.totalExpenseCents)}</strong>
          </article>
          <article className={`stat-card ${settlement.poolBalanceCents >= 0 ? 'good' : 'warn'}`}>
            <span>公账余额</span>
            <strong>{formatCurrency(settlement.poolBalanceCents)}</strong>
          </article>
          <article className="stat-card">
            <span>成员数</span>
            <strong>{bundle.parties.length} 家</strong>
          </article>
        </div>

        <article className="inline-card compact-top-gap">
          <strong>固定入口</strong>
          <div className="action-row home-shortcuts">
            <button type="button" className="ghost-button small-button" onClick={() => setSection('expense')}>
              记一笔花费
            </button>
            <button type="button" className="ghost-button small-button" onClick={() => setSection('deposit')}>
              记成员交款
            </button>
            <button type="button" className="ghost-button small-button" onClick={() => setSection('ledger')}>
              看整本流水
            </button>
            <button type="button" className="ghost-button small-button" onClick={() => setSection('families')}>
              成员名单
            </button>
          </div>
        </article>

        <article className="inline-card compact-top-gap">
          <strong>各家当前余额</strong>
          {balanceSummaries.length === 0 ? (
            <p className="storage-note">还没有成员。先去“成员名单”加成员，再来记交款和支出。</p>
          ) : (
            <div className="simple-list compact-top-gap">
              {balanceSummaries.map((summary) => {
                const party = bundle.parties.find((item) => item.id === summary.partyId);
                return (
                  <button key={summary.partyId} type="button" className="simple-row balance-row summary-row-button" onClick={() => openPartyDetail(summary.partyId)}>
                    <div>
                      <strong>{party?.name ?? '未命名'}</strong>
                      <span>累计交款 {formatCurrency(summary.depositCents)} · 代付 {formatCurrency(summary.directPaidCents)} · 已分摊 {formatCurrency(summary.totalShareCents)}</span>
                    </div>
                    <strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(summary.netCents)}</strong>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className="inline-card compact-top-gap">
          <strong>最近几笔</strong>
          {recentRecords.length === 0 ? (
            <p className="storage-note">现在还没有正式入账的记录。建议先加成员，再记第一笔交款或支出。</p>
          ) : (
            <div className="simple-list compact-top-gap">
              {recentRecords.map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  className="simple-row balance-row summary-row-button"
                  onClick={() => setSection('ledger')}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <span>{formatDateLabel(item.date)} · {item.note ? `备注：${item.note}` : item.subtitle}</span>
                  </div>
                  <strong>{formatCurrency(item.amountCents)}</strong>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="inline-card compact-top-gap">
          <strong>现在如果清一遍账</strong>
          {transfers.length > 0 ? (
            <div className="simple-list compact-top-gap">
              {transfers.slice(0, 4).map((transfer) => (
                <p key={`${transfer.fromPartyId}-${transfer.toPartyId}`} className="storage-note">{transfer.sentence}</p>
              ))}
            </div>
          ) : (
            <p className="storage-note">当前大家正好持平，不需要再转账。</p>
          )}
        </article>
      </section>
    );
  }

  function renderQueryHeader() {
    return (
      <section className="panel-card compact-top-gap">
        <div className="section-heading compact-gap">
          <div>
            <h2>查账</h2>
            <p>这里集中看总账、整本流水、单家明细和对账截图，不用猜该去哪一页。</p>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className={section === 'ledger' ? 'primary-button small-button' : 'ghost-button small-button'} onClick={() => setSection('ledger')}>
            整本流水
          </button>
          <button type="button" className={section === 'party' ? 'primary-button small-button' : 'ghost-button small-button'} onClick={() => openPartyDetail()} disabled={bundle.parties.length === 0}>
            单家明细
          </button>
          <button type="button" className={section === 'screenshot' ? 'primary-button small-button' : 'ghost-button small-button'} onClick={() => setSection('screenshot')}>
            对账截图
          </button>
          <button type="button" className="ghost-button small-button" onClick={() => setSection('families')}>
            成员名单
          </button>
        </div>
      </section>
    );
  }

  function renderLedgerOverview() {
    return (
      <article className="panel-card compact-top-gap">
        <div className="stats-grid">
          <div className="stat-card">
            <span>总交款</span>
            <strong>{formatCurrency(settlement.totalDepositCents)}</strong>
          </div>
          <div className="stat-card">
            <span>总支出</span>
            <strong>{formatCurrency(settlement.totalExpenseCents)}</strong>
          </div>
          <div className={`stat-card ${settlement.poolBalanceCents >= 0 ? 'good' : 'warn'}`}>
            <span>公账余额</span>
            <strong>{formatCurrency(settlement.poolBalanceCents)}</strong>
          </div>
        </div>

        {balanceSummaries.length > 0 ? (
          <div className="simple-list compact-top-gap">
            {balanceSummaries.map((summary) => {
              const party = bundle.parties.find((item) => item.id === summary.partyId);
              return (
                <button key={summary.partyId} type="button" className="simple-row balance-row summary-row-button" onClick={() => openPartyDetail(summary.partyId)}>
                  <div>
                    <strong>{party?.name ?? '未命名'}</strong>
                    <span>交款 {formatCurrency(summary.depositCents)} · 代付 {formatCurrency(summary.directPaidCents)} · 分摊 {formatCurrency(summary.totalShareCents)}</span>
                  </div>
                  <strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(summary.netCents)}</strong>
                </button>
              );
            })}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <main className="page-shell workspace-shell">
      <section className="panel-card workspace-topbar-card">
        <div className="workspace-topbar-row">
          <button className="ghost-button small-button" type="button" onClick={onBack}>
            返回活动列表
          </button>
          <button className="ghost-button small-button" type="button" onClick={() => setShowMore((current) => !current)}>
            {showMore ? '收起更多' : '更多'}
          </button>
        </div>
        <div className="workspace-title-block">
          <p className="eyebrow">当前活动</p>
          <h2>{bundle.trip.name}</h2>
          <p className="storage-note">
            {formatDateRange(bundle.trip.startDate, bundle.trip.endDate)}
            {bundle.trip.note?.trim() ? ` · ${bundle.trip.note.trim()}` : ''}
          </p>
        </div>
      </section>

      {renderMoreActions()}

      {section === 'home' ? renderOverview() : null}

      {section === 'families' ? (
        <div className="compact-top-gap">
          <section className="panel-card compact-top-gap">
            <div className="section-heading compact-gap">
              <div>
                <h2>成员名单</h2>
                <p>名单只录一次，后面记支出和记交款都从这里点选，不用反复手打人名。</p>
              </div>
            </div>
          </section>
          <FamilyRosterPanel parties={bundle.parties} saving={saving} onCreateParty={onCreateParty} onUpdateParty={onUpdateParty} />
        </div>
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
          historyLimit={3}
          onSave={handleSaveDeposit}
          onVoid={onVoidDeposit}
          onCancelEdit={() => setEditingDepositId(null)}
          onOpenFamilies={() => setSection('families')}
          onOpenFullHistory={() => setSection('ledger')}
        />
      ) : null}

      {section === 'ledger' ? (
        <>
          {renderQueryHeader()}
          {renderLedgerOverview()}
          <FullLedgerPanel
            trip={bundle.trip}
            parties={bundle.parties}
            deposits={bundle.deposits}
            expenses={bundle.expenses}
            expenseParticipants={bundle.expenseParticipants}
            settlement={settlement}
            saving={saving}
            showHeader={false}
            onEditDeposit={openDepositEditor}
            onVoidDeposit={onVoidDeposit}
            onEditExpense={openExpenseEditor}
            onVoidExpense={onVoidExpense}
          />
        </>
      ) : null}

      {section === 'party' ? (
        <>
          {renderQueryHeader()}
          <PartyLedgerPanel
            bundle={bundle}
            saving={saving}
            selectedPartyId={selectedPartyId}
            showHeader={false}
            title="单家明细"
            description="有人质疑时，直接打开这一页：这家交了多少、代付多少、分摊多少、现在余额多少，都能一路解释清楚。"
            onChangeSelectedPartyId={setSelectedPartyId}
            onEditDeposit={openDepositEditor}
            onVoidDeposit={onVoidDeposit}
            onEditExpense={openExpenseEditor}
            onVoidExpense={onVoidExpense}
          />
        </>
      ) : null}

      {section === 'screenshot' ? (
        <>
          {renderQueryHeader()}
          <FullLedgerPanel
            trip={bundle.trip}
            parties={bundle.parties}
            deposits={bundle.deposits}
            expenses={bundle.expenses}
            expenseParticipants={bundle.expenseParticipants}
            settlement={settlement}
            saving={saving}
            variant="screenshot"
            showHeader={false}
            onEditDeposit={openDepositEditor}
            onVoidDeposit={onVoidDeposit}
            onEditExpense={openExpenseEditor}
            onVoidExpense={onVoidExpense}
          />
        </>
      ) : null}

      <nav className="workspace-tabbar" aria-label="活动主导航">
        {MAIN_TABS.map((tab) => {
          const active = resolveMainTab(section) === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              className={active ? 'workspace-tab active' : 'workspace-tab'}
              onClick={() => {
                setSection(tab.value);
                setShowMore(false);
              }}
            >
              <strong>{tab.label}</strong>
              <span>{tab.hint}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
