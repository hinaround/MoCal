import { buildSettlementTransfers } from '../domain/transfers';
import type { Party, SettlementSummary, Trip } from '../domain/types';
import { formatBalanceLabel, formatCurrency, formatDateRange, formatNetLabel } from '../utils/format';

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
          <h2>余额汇总</h2>
          <p>先看各家的当前余额；如果今天就要清账，再照下面的处理建议执行。</p>
        </div>
      </div>

      <article className="screenshot-card">
        <div className="screenshot-header">
          <div>
            <p className="eyebrow">余额汇总图</p>
            <h3>{trip.name}</h3>
            <p>{formatDateRange(trip.startDate, trip.endDate)}</p>
          </div>
        </div>
        <div className="screenshot-grid">
          <div><span>总入金</span><strong>{formatCurrency(totalDepositCents)}</strong></div>
          <div><span>总支出</span><strong>{formatCurrency(totalExpenseCents)}</strong></div>
          <div><span>公账可用余额</span><strong>{formatCurrency(poolBalanceCents)}</strong></div>
        </div>
        <div className="simple-list screenshot-summary-list">
          {summaries.map((summary) => {
            const party = parties.find((item) => item.id === summary.partyId);
            return (
              <div key={summary.partyId} className="simple-row">
                <div>
                  <strong>{party?.name ?? '未命名'}</strong>
                  <span>累计入金 {formatCurrency(summary.depositCents)} · 代付 {formatCurrency(summary.directPaidCents)} · 已分摊 {formatCurrency(summary.totalShareCents)}</span>
                </div>
                <strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(summary.netCents)}</strong>
              </div>
            );
          })}
        </div>
      </article>

      <article className="inline-card compact-top-gap">
        <strong>如现在清账</strong>
        {transfers.length === 0 ? (
          <p>现在如果清账，大家正好持平，不需要再转账。</p>
        ) : (
          <div className="simple-list">
            {transfers.map((transfer) => (
              <div key={`${transfer.fromPartyId}-${transfer.toPartyId}`} className="simple-row">
                <div>
                  <strong>{transfer.sentence}</strong>
                  <span>这是按当前余额自动算出来的直接处理方式。</span>
                </div>
                <strong>{formatCurrency(transfer.amountCents)}</strong>
              </div>
            ))}
          </div>
        )}
      </article>

      <div className="stack-list compact-top-gap">
        {summaries.map((summary) => {
          const party = parties.find((item) => item.id === summary.partyId);
          return (
            <button key={summary.partyId} type="button" className="settlement-card settlement-button" onClick={() => onOpenParty(summary.partyId)}>
              <header>
                <strong>{party?.name ?? '未命名'}</strong>
                <span className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(summary.netCents)}</span>
              </header>
              <div className="settlement-grid">
                <div>
                  <span>累计入金</span>
                  <strong>{formatCurrency(summary.depositCents)}</strong>
                </div>
                <div>
                  <span>代付金额</span>
                  <strong>{formatCurrency(summary.directPaidCents)}</strong>
                </div>
                <div>
                  <span>已分摊金额</span>
                  <strong>{formatCurrency(summary.totalShareCents)}</strong>
                </div>
                <div>
                  <span>如现在清账</span>
                  <strong>{formatNetLabel(summary.netCents)}</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
