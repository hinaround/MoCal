import { useMemo, useState } from 'react';
import { buildPartyLedger } from '../domain/partyLedger';
import type { TripBundle } from '../storage/ledgerRepository';
import { formatBalanceLabel, formatCurrency, formatDateLabel, formatRecordStatus, formatSignedCurrency } from '../utils/format';
import { ReasonDialog } from './ReasonDialog';

interface PartyLedgerPanelProps {
  bundle: TripBundle;
  saving: boolean;
  selectedPartyId: string;
  onChangeSelectedPartyId: (partyId: string) => void;
  onEditDeposit: (depositId: string) => void;
  onVoidDeposit: (input: { depositId: string; reason: string }) => Promise<void>;
  onEditExpense: (expenseId: string) => void;
  onVoidExpense: (input: { expenseId: string; reason: string }) => Promise<void>;
}

type VoidTarget = { kind: 'deposit' | 'expense'; id: string; summary: string; title: string } | null;

export function PartyLedgerPanel(props: PartyLedgerPanelProps) {
  const { bundle, saving, selectedPartyId, onChangeSelectedPartyId, onEditDeposit, onVoidDeposit, onEditExpense, onVoidExpense } = props;
  const selectedParty = bundle.parties.find((party) => party.id === selectedPartyId) ?? bundle.parties[0];
  const [voidTarget, setVoidTarget] = useState<VoidTarget>(null);

  const ledger = useMemo(
    () =>
      selectedParty
        ? buildPartyLedger({
            partyId: selectedParty.id,
            parties: bundle.parties,
            deposits: bundle.deposits,
            expenses: bundle.expenses,
            expenseParticipants: bundle.expenseParticipants,
          })
        : null,
    [bundle.deposits, bundle.expenseParticipants, bundle.expenses, bundle.parties, selectedParty],
  );

  if (!selectedParty || !ledger) {
    return null;
  }

  const summary = ledger.summary;

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <h2>成员账户</h2>
          <p>有人质疑时，直接打开这一页：这家累计入金、代付、分摊和当前余额都能一路解释清楚。</p>
        </div>
      </div>

      <label>
        <span>查看哪一家</span>
        <select value={selectedParty.id} onChange={(event) => onChangeSelectedPartyId(event.target.value)}>
          {bundle.parties.map((party) => (
            <option key={party.id} value={party.id}>{party.name}</option>
          ))}
        </select>
      </label>

      {summary ? (
        <article className="screenshot-card single-party-card compact-top-gap">
          <p className="eyebrow">单家解释图</p>
          <h3>{selectedParty.name}</h3>
          <div className="screenshot-grid">
            <div><span>累计入金</span><strong>{formatCurrency(summary.depositCents)}</strong></div>
            <div><span>代付金额</span><strong>{formatCurrency(summary.directPaidCents)}</strong></div>
            <div><span>已分摊金额</span><strong>{formatCurrency(summary.totalShareCents)}</strong></div>
            <div><span>当前余额</span><strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(summary.netCents)}</strong></div>
          </div>
        </article>
      ) : null}

      <div className="stack-list history-list compact-top-gap">
        {ledger.history.length === 0 ? (
          <article className="inline-card">
            <strong>{selectedParty.name}</strong>
            <span>还没有任何记录。</span>
          </article>
        ) : (
          ledger.history.map((item) => (
            <details key={item.id} className="history-card detail-disclosure">
              <summary className="detail-summary detail-summary-actions">
                <div className="history-main">
                  <div className="history-topline">
                    <span className={`status-pill ${item.status === 'posted' ? 'posted' : 'void'}`}>{formatRecordStatus(item.status)}</span>
                    <span className="history-kind">{item.kindLabel}</span>
                    <span className="history-date">{formatDateLabel(item.date)}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p className="secondary-meta">{item.detail}</p>
                </div>
                <div className="ledger-side">
                  <strong className={item.signedAmountCents >= 0 ? 'good-text history-amount' : 'warn-text history-amount'}>
                    {formatSignedCurrency(item.signedAmountCents)}
                  </strong>
                  {item.status === 'posted' ? (
                    <div className="summary-actions">
                      {item.sourceType === 'deposit' ? (
                        <>
                          <button type="button" className="ghost-button small-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onEditDeposit(item.sourceId); }}>
                            调整账目
                          </button>
                          <button type="button" className="ghost-button small-button danger-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setVoidTarget({ kind: 'deposit', id: item.sourceId, summary: item.dialogSummary, title: '作废这笔成员入金' }); }}>
                            作废账目
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="ghost-button small-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onEditExpense(item.sourceId); }}>
                            调整账目
                          </button>
                          <button type="button" className="ghost-button small-button danger-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setVoidTarget({ kind: 'expense', id: item.sourceId, summary: item.dialogSummary, title: '作废这笔支出' }); }}>
                            作废账目
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </summary>
              <div className="detail-body">
                <p>{item.note ? `备注：${item.note}` : '没写备注。'}</p>
                <p className="after-note">到这一步为止，这家的当前余额变成：{formatBalanceLabel(item.afterNetCents)}</p>
                {item.auditNote ? <p className="audit-note">{item.auditNote}</p> : null}
              </div>
            </details>
          ))
        )}
      </div>

      <ReasonDialog
        open={Boolean(voidTarget)}
        title={voidTarget?.title ?? ''}
        summary={voidTarget?.summary ?? ''}
        reasonLabel="作废原因"
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
