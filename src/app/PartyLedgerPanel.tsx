import { useMemo } from 'react';
import { buildPartyLedger } from '../domain/partyLedger';
import type { TripBundle } from '../storage/ledgerRepository';
import { formatCurrency, formatDateLabel, formatNetLabel, formatRecordStatus, formatSignedCurrency } from '../utils/format';

interface PartyLedgerPanelProps {
  bundle: TripBundle;
  selectedPartyId: string;
  onChangeSelectedPartyId: (partyId: string) => void;
}

export function PartyLedgerPanel(props: PartyLedgerPanelProps) {
  const { bundle, selectedPartyId, onChangeSelectedPartyId } = props;
  const selectedParty = bundle.parties.find((party) => party.id === selectedPartyId) ?? bundle.parties[0];

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
          <h2>看这家的流水</h2>
          <p>有人质疑时，直接打开这一页：这家交了多少、代付多少、分到多少，都能对得上。</p>
        </div>
      </div>

      <label>
        <span>现在要看谁</span>
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
            <div><span>这家先交了多少</span><strong>{formatCurrency(summary.depositCents)}</strong></div>
            <div><span>这家代大家先付</span><strong>{formatCurrency(summary.directPaidCents)}</strong></div>
            <div><span>这家该承担多少</span><strong>{formatCurrency(summary.totalShareCents)}</strong></div>
            <div><span>最后还该补/退</span><strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatNetLabel(summary.netCents)}</strong></div>
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
              <summary className="detail-summary">
                <div className="history-main">
                  <div className="history-topline">
                    <span className={`status-pill ${item.status === 'posted' ? 'posted' : 'void'}`}>{formatRecordStatus(item.status)}</span>
                    <span className="history-kind">{item.kindLabel}</span>
                    <span className="history-date">{formatDateLabel(item.date)}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p className="secondary-meta">{item.detail}</p>
                </div>
                <strong className={item.signedAmountCents >= 0 ? 'good-text history-amount' : 'warn-text history-amount'}>
                  {formatSignedCurrency(item.signedAmountCents)}
                </strong>
              </summary>
              <div className="detail-body">
                <p>{item.note ? `备注：${item.note}` : '没写备注。'}</p>
                <p className="after-note">到这一步为止，这家的结果变成：{formatNetLabel(item.afterNetCents)}</p>
                {item.auditNote ? <p className="audit-note">{item.auditNote}</p> : null}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
