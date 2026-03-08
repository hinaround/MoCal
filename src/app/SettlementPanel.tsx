import { buildSettlementTransfers } from '../domain/transfers';
import type { Party, SettlementSummary, Trip } from '../domain/types';
import { formatCurrency, formatDateRange, formatNetLabel } from '../utils/format';

interface SettlementPanelProps {
  trip: Trip;
  parties: Party[];
  summaries: SettlementSummary[];
  totalExpenseCents: number;
  totalDepositCents: number;
  poolBalanceCents: number;
  onOpenParty: (partyId: string) => void;
}

export function SettlementPanel(props: SettlementPanelProps) {
  const { trip, parties, summaries, totalExpenseCents, totalDepositCents, poolBalanceCents, onOpenParty } = props;
  const transfers = buildSettlementTransfers({ parties, summaries });

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <h2>最后谁该补、谁该退</h2>
          <p>这里不是只给余额，而是直接给出最后怎么结。</p>
        </div>
      </div>

      <article className="screenshot-card">
        <div className="screenshot-header">
          <div>
            <p className="eyebrow">全团对账图</p>
            <h3>{trip.name}</h3>
            <p>{formatDateRange(trip.startDate, trip.endDate)}</p>
          </div>
        </div>
        <div className="screenshot-grid">
          <div><span>总花费</span><strong>{formatCurrency(totalExpenseCents)}</strong></div>
          <div><span>先收总额</span><strong>{formatCurrency(totalDepositCents)}</strong></div>
          <div><span>公账还剩</span><strong>{formatCurrency(poolBalanceCents)}</strong></div>
        </div>
        <div className="simple-list screenshot-summary-list">
          {summaries.map((summary) => {
            const party = parties.find((item) => item.id === summary.partyId);
            return (
              <div key={summary.partyId} className="simple-row">
                <div>
                  <strong>{party?.name ?? '未命名'}</strong>
                  <span>应承担 {formatCurrency(summary.totalShareCents)} · 已拿出来 {formatCurrency(summary.totalPaidCents)}</span>
                </div>
                <strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatNetLabel(summary.netCents)}</strong>
              </div>
            );
          })}
        </div>
      </article>

      <article className="inline-card">
        <strong>直接照着结就行</strong>
        {transfers.length === 0 ? (
          <p>已经结清，不需要再转账。</p>
        ) : (
          <div className="simple-list">
            {transfers.map((transfer) => (
              <div key={`${transfer.fromPartyId}-${transfer.toPartyId}`} className="simple-row">
                <div>
                  <strong>{transfer.sentence}</strong>
                  <span>这是按最终余额自动算出来的最直接结法。</span>
                </div>
                <strong>{formatCurrency(transfer.amountCents)}</strong>
              </div>
            ))}
          </div>
        )}
      </article>

      <div className="stack-list">
        {summaries.map((summary) => {
          const party = parties.find((item) => item.id === summary.partyId);
          return (
            <button key={summary.partyId} type="button" className="settlement-card settlement-button" onClick={() => onOpenParty(summary.partyId)}>
              <header>
                <strong>{party?.name ?? '未命名'}</strong>
                <span className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatNetLabel(summary.netCents)}</span>
              </header>
              <div className="settlement-grid">
                <div>
                  <span>该承担多少</span>
                  <strong>{formatCurrency(summary.totalShareCents)}</strong>
                </div>
                <div>
                  <span>先收的钱</span>
                  <strong>{formatCurrency(summary.depositCents)}</strong>
                </div>
                <div>
                  <span>这家代大家先付的钱</span>
                  <strong>{formatCurrency(summary.directPaidCents)}</strong>
                </div>
                <div>
                  <span>这家已经拿出来的钱</span>
                  <strong>{formatCurrency(summary.totalPaidCents)}</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
