import { useMemo, useState } from 'react';
import { buildAccountLedger, buildAccountSettlement, buildMemberAccountLedger } from '../domain/accountBook';
import type { Deposit, Expense, ExpenseParticipant, MemberProfile, Party, Trip } from '../domain/types';
import { formatBalanceLabel, formatCurrency, formatDateLabel, formatRecordStatus, formatSignedCurrency } from '../utils/format';

interface AccountBookPanelProps {
  members: MemberProfile[];
  trips: Trip[];
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}

export function AccountBookPanel(props: AccountBookPanelProps) {
  const { members, trips, parties, deposits, expenses, expenseParticipants } = props;
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');

  const settlement = useMemo(
    () => buildAccountSettlement({ memberProfiles: members, parties, deposits, expenses, expenseParticipants }),
    [members, parties, deposits, expenses, expenseParticipants],
  );
  const ledger = useMemo(
    () => buildAccountLedger({ memberProfiles: members, parties, trips, deposits, expenses, expenseParticipants }),
    [members, parties, trips, deposits, expenses, expenseParticipants],
  );
  const memberLedger = useMemo(
    () => (selectedMemberId
      ? buildMemberAccountLedger({ memberProfileId: selectedMemberId, memberProfiles: members, parties, trips, deposits, expenses, expenseParticipants })
      : null),
    [selectedMemberId, members, parties, trips, deposits, expenses, expenseParticipants],
  );

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const summaries = useMemo(
    () => [...settlement.summaries].sort((left, right) => {
      const leftMember = memberById.get(left.memberProfileId);
      const rightMember = memberById.get(right.memberProfileId);
      return (leftMember?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (rightMember?.sortOrder ?? Number.MAX_SAFE_INTEGER);
    }),
    [memberById, settlement.summaries],
  );

  return (
    <section className="panel-card compact-top-gap">
      <div className="section-heading">
        <div>
          <h2>总账</h2>
          <p>这里看的不是某一次活动，而是整本账：全局交款、全局支出、公账余额、各家余额和单家历史都在这里。</p>
        </div>
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <span>总交款</span>
          <strong>{formatCurrency(settlement.totalDepositCents)}</strong>
        </article>
        <article className="stat-card">
          <span>总支出</span>
          <strong>{formatCurrency(settlement.totalExpenseCents)}</strong>
        </article>
        <article className={`stat-card ${settlement.poolBalanceCents >= 0 ? 'good' : 'warn'}`}>
          <span>公账余额</span>
          <strong>{formatCurrency(settlement.poolBalanceCents)}</strong>
        </article>
        <article className="stat-card">
          <span>成员数</span>
          <strong>{members.length} 家</strong>
        </article>
      </div>

      <article className="inline-card compact-top-gap">
        <strong>各家余额</strong>
        {summaries.length === 0 ? (
          <p className="storage-note">还没有成员，先去“成员”里建成员。</p>
        ) : (
          <div className="simple-list compact-top-gap">
            {summaries.map((summary) => {
              const member = memberById.get(summary.memberProfileId);
              return (
                <button key={summary.memberProfileId} type="button" className="simple-row balance-row summary-row-button" onClick={() => setSelectedMemberId(summary.memberProfileId)}>
                  <div>
                    <strong>{member?.name ?? '未命名'}</strong>
                    <span>累计交款 {formatCurrency(summary.depositCents)} · 代付 {formatCurrency(summary.directPaidCents)} · 已分摊 {formatCurrency(summary.totalShareCents)}</span>
                  </div>
                  <strong className={summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(summary.netCents)}</strong>
                </button>
              );
            })}
          </div>
        )}
      </article>

      {memberLedger?.summary ? (
        <article className="screenshot-card single-party-card compact-top-gap">
          <p className="eyebrow">单家解释图</p>
          <h3>{memberById.get(selectedMemberId)?.name ?? '未命名'}</h3>
          <div className="screenshot-grid">
            <div><span>累计交款</span><strong>{formatCurrency(memberLedger.summary.depositCents)}</strong></div>
            <div><span>代付金额</span><strong>{formatCurrency(memberLedger.summary.directPaidCents)}</strong></div>
            <div><span>已分摊金额</span><strong>{formatCurrency(memberLedger.summary.totalShareCents)}</strong></div>
            <div><span>当前余额</span><strong className={memberLedger.summary.netCents >= 0 ? 'good-text' : 'warn-text'}>{formatBalanceLabel(memberLedger.summary.netCents)}</strong></div>
          </div>
        </article>
      ) : null}

      {memberLedger ? (
        <div className="stack-list history-list compact-top-gap">
          {memberLedger.history.length === 0 ? (
            <article className="inline-card">
              <strong>{memberById.get(selectedMemberId)?.name ?? '未命名'}</strong>
              <span>还没有任何记录。</span>
            </article>
          ) : (
            memberLedger.history.slice(-6).reverse().map((item) => (
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
                    <strong className={item.signedAmountCents >= 0 ? 'good-text history-amount' : 'warn-text history-amount'}>{formatSignedCurrency(item.signedAmountCents)}</strong>
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
      ) : null}

      <div className="section-heading compact-gap compact-top-gap">
        <div>
          <h3>整本流水</h3>
          <p>按时间看清每一笔钱的去向；成员交款和活动支出都放在同一本流水里。</p>
        </div>
      </div>
      <div className="stack-list ledger-list">
        {ledger.length === 0 ? (
          <article className="inline-card">
            <strong>还没有总账流水</strong>
            <p className="storage-note">先记一笔成员交款，或者进活动记第一笔支出。</p>
          </article>
        ) : (
          ledger.slice().reverse().map((item) => (
            <details key={item.id} className="ledger-card detail-disclosure">
              <summary className="detail-summary detail-summary-actions">
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
                      <div key={`${item.id}:${share.memberProfileId}`} className="share-chip">
                        <strong>{share.memberName}</strong>
                        <span>
                          {share.headcountSnapshot} 人 · 分 {formatCurrency(share.shareAmountCents)}
                          {share.tailDeltaCents > 0 ? ` · 尾差 +${formatCurrency(share.tailDeltaCents)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {item.tailNote ? <p className="tail-note">{item.tailNote}</p> : null}
                <p className="pool-note">这笔后公账余额：{formatCurrency(item.poolBalanceAfterCents)}</p>
                {item.auditNote ? <p className="audit-note">{item.auditNote}</p> : null}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
