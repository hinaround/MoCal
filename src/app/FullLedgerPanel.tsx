import { useMemo, useState } from 'react';
import { buildFullLedger } from '../domain/fullLedger';
import type { Deposit, Expense, ExpenseParticipant, Party, Trip, TripSettlement } from '../domain/types';
import { buildSettlementTransfers } from '../domain/transfers';
import { formatCurrency, formatDateLabel, formatDateRange, formatRecordStatus } from '../utils/format';
import { ReasonDialog } from './ReasonDialog';

interface FullLedgerPanelProps {
  trip: Trip;
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
  settlement: TripSettlement;
  saving: boolean;
  onEditDeposit: (depositId: string) => void;
  onVoidDeposit: (input: { depositId: string; reason: string }) => Promise<void>;
  onEditExpense: (expenseId: string) => void;
  onVoidExpense: (input: { expenseId: string; reason: string }) => Promise<void>;
}

type LedgerMode = 'screenshot' | 'detail';
type VoidTarget = { kind: 'deposit' | 'expense'; id: string; summary: string; title: string } | null;

export function FullLedgerPanel(props: FullLedgerPanelProps) {
  const { trip, parties, deposits, expenses, expenseParticipants, settlement, saving, onEditDeposit, onVoidDeposit, onEditExpense, onVoidExpense } = props;
  const ledger = useMemo(() => buildFullLedger({ parties, deposits, expenses, expenseParticipants }), [deposits, expenseParticipants, expenses, parties]);
  const transfers = useMemo(() => buildSettlementTransfers({ parties, summaries: settlement.summaries }), [parties, settlement.summaries]);
  const [mode, setMode] = useState<LedgerMode>('screenshot');
  const [voidTarget, setVoidTarget] = useState<VoidTarget>(null);

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <h2>看整本流水</h2>
          <p>这里分成两种看法：截图时只看最关键的，对账时再看逐笔明细和审计痕迹。</p>
        </div>
      </div>

      <div className="mode-switch">
        <button type="button" className={mode === 'screenshot' ? 'mode-button active' : 'mode-button'} onClick={() => setMode('screenshot')}>
          对账截图模式
        </button>
        <button type="button" className={mode === 'detail' ? 'mode-button active' : 'mode-button'} onClick={() => setMode('detail')}>
          流水明细模式
        </button>
      </div>

      {mode === 'screenshot' ? (
        <article className="screenshot-card">
          <div className="screenshot-header">
            <div>
              <p className="eyebrow">全团对账图</p>
              <h3>{trip.name}</h3>
              <p>{formatDateRange(trip.startDate, trip.endDate)}</p>
            </div>
          </div>
          <div className="screenshot-grid">
            <div><span>总花费</span><strong>{formatCurrency(settlement.totalExpenseCents)}</strong></div>
            <div><span>先收总额</span><strong>{formatCurrency(settlement.totalDepositCents)}</strong></div>
            <div><span>公账余额</span><strong>{formatCurrency(settlement.poolBalanceCents)}</strong></div>
          </div>
          <div className="simple-list screenshot-summary-list">
            {settlement.summaries.map((summary) => {
              const party = parties.find((item) => item.id === summary.partyId);
              return (
                <div key={summary.partyId} className="simple-row">
                  <div>
                    <strong>{party?.name ?? '未命名'}</strong>
                    <span>应承担 {formatCurrency(summary.totalShareCents)} · 已拿出来 {formatCurrency(summary.totalPaidCents)}</span>
                  </div>
                  <strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>
                    {summary.netCents >= 0 ? `应退 ${formatCurrency(summary.netCents)}` : `应补 ${formatCurrency(Math.abs(summary.netCents))}`}
                  </strong>
                </div>
              );
            })}
          </div>
          <div className="transfer-box">
            <strong>最后怎么结</strong>
            {transfers.length > 0 ? transfers.map((transfer) => <p key={`${transfer.fromPartyId}-${transfer.toPartyId}`}>{transfer.sentence}</p>) : <p>已经结清，不需要再转账。</p>}
          </div>
        </article>
      ) : (
        <div className="stack-list ledger-list compact-top-gap">
          {ledger.map((item) => (
            <details key={`${item.type}:${item.id}`} className="ledger-card detail-disclosure">
              <summary className="detail-summary">
                <div className="ledger-main">
                  <div className="history-topline">
                    <span className={`status-pill ${item.status === 'posted' ? 'posted' : 'void'}`}>{formatRecordStatus(item.status)}</span>
                    <span className="history-date">{formatDateLabel(item.date)}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p className="secondary-meta">{item.subtitle}</p>
                </div>
                <div className="ledger-side">
                  <strong>{formatCurrency(item.amountCents)}</strong>
                </div>
              </summary>

              <div className="detail-body">
                <p>{item.note ? `备注：${item.note}` : item.explanation}</p>
                {item.shares.length > 0 ? (
                  <div className="share-grid">
                    {item.shares.map((share) => (
                      <div key={`${item.id}:${share.partyId}`} className="share-chip">
                        <strong>{share.partyName}</strong>
                        <span>
                          {share.headcountSnapshot} 人 · 分 {formatCurrency(share.shareAmountCents)}
                          {share.tailDeltaCents > 0 ? ` · 尾差 +${formatCurrency(share.tailDeltaCents)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {item.tailNote ? <p className="tail-note">{item.tailNote}</p> : null}
                <p className="pool-note">这笔之后公账变成：{formatCurrency(item.poolBalanceAfterCents)}</p>
                {item.auditNote ? <p className="audit-note">{item.auditNote}</p> : null}
                {item.status === 'posted' ? (
                  <div className="mini-actions">
                    {item.type === 'deposit' ? (
                      <>
                        <button type="button" className="ghost-button small-button" onClick={() => onEditDeposit(item.id)}>改这笔</button>
                        <button type="button" className="ghost-button small-button danger-button" onClick={() => setVoidTarget({ kind: 'deposit', id: item.id, summary: item.dialogSummary, title: '作废这笔先收的钱' })}>作废</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="ghost-button small-button" onClick={() => onEditExpense(item.id)}>改这笔</button>
                        <button type="button" className="ghost-button small-button danger-button" onClick={() => setVoidTarget({ kind: 'expense', id: item.id, summary: item.dialogSummary, title: '作废这笔花费' })}>作废</button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}

      <ReasonDialog
        open={Boolean(voidTarget)}
        title={voidTarget?.title ?? ''}
        summary={voidTarget?.summary ?? ''}
        reasonLabel={voidTarget?.kind === 'deposit' ? '为什么要作废这笔收款' : '为什么要作废这笔花费'}
        confirmText="确认作废"
        saving={saving}
        onCancel={() => setVoidTarget(null)}
        onConfirm={async (reason) => {
          if (!voidTarget) {
            return;
          }

          if (voidTarget.kind === 'deposit') {
            await onVoidDeposit({ depositId: voidTarget.id, reason });
          } else {
            await onVoidExpense({ expenseId: voidTarget.id, reason });
          }

          setVoidTarget(null);
        }}
      />
    </section>
  );
}
