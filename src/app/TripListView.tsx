import { useMemo, useState, type FormEvent } from 'react';
import { PwaInstallCard } from '../pwa/PwaInstallCard';
import type { Deposit, Expense, ExpenseParticipant, MemberProfile, Party, Trip } from '../domain/types';
import type { BackupOverview, BackupSnapshotRecord, LedgerBackupPayload } from '../storage/backupRepository';
import { formatDateRange } from '../utils/format';
import { BackupPanel } from './BackupPanel';
import { SecurityPanel } from './SecurityPanel';
import type { WorkspaceSection } from './TripWorkspace';
import { MemberProfilesPanel } from './MemberProfilesPanel';
import { MemberDepositPanel } from './MemberDepositPanel';
import { AccountBookPanel } from './AccountBookPanel';
import { buildAccountSettlement } from '../domain/accountBook';

type HomeSection = 'members' | 'deposits' | 'activities' | 'ledger';

interface TripListViewProps {
  trips: Trip[];
  members: MemberProfile[];
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
  loading: boolean;
  saving: boolean;
  preferredTripId?: string | null;
  backupOverview: BackupOverview;
  backupSnapshots: BackupSnapshotRecord[];
  securityEnabled: boolean;
  securityLocked: boolean;
  onSetPasscode: (passcode: string) => Promise<void>;
  onChangePasscode: (currentPasscode: string, nextPasscode: string) => Promise<void>;
  onDisablePasscode: (currentPasscode: string) => Promise<void>;
  onLockNow: () => void;
  onOpenTrip: (tripId: string, section?: WorkspaceSection) => void;
  onCreateTrip: (input: { name: string; startDate?: string; endDate?: string; note?: string }) => Promise<void>;
  onCreateMember: (input: { name: string; defaultHeadcount: number; note?: string }) => Promise<void>;
  onUpdateMember: (member: MemberProfile) => Promise<void>;
  onSaveGlobalDeposit: (input: { depositId?: string; memberProfileId: string; amountCents: number; paidAt: string; note?: string; reason?: string }) => Promise<void>;
  onVoidGlobalDeposit: (input: { depositId: string; reason: string }) => Promise<void>;
  onExportBackup: () => Promise<void>;
  onImportBackup: (payload: LedgerBackupPayload, fileName: string) => Promise<void>;
  onRestoreSnapshot: (snapshotId: string) => Promise<void>;
}

const HOME_ACTIONS = [
  { value: 'members', label: '成员', hint: '先把成员录好，后面都能直接点' },
  { value: 'deposits', label: '交款', hint: '没有活动时，也能先收钱' },
  { value: 'activities', label: '活动', hint: '新建活动、进入活动、记支出' },
  { value: 'ledger', label: '总账', hint: '看整本账和各家余额' },
] as const;

export function TripListView(props: TripListViewProps) {
  const {
    trips,
    members,
    parties,
    deposits,
    expenses,
    expenseParticipants,
    loading,
    saving,
    preferredTripId,
    backupOverview,
    backupSnapshots,
    securityEnabled,
    securityLocked,
    onSetPasscode,
    onChangePasscode,
    onDisablePasscode,
    onLockNow,
    onOpenTrip,
    onCreateTrip,
    onCreateMember,
    onUpdateMember,
    onSaveGlobalDeposit,
    onVoidGlobalDeposit,
    onExportBackup,
    onImportBackup,
    onRestoreSnapshot,
  } = props;
  const [section, setSection] = useState<HomeSection>('activities');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAllTrips, setShowAllTrips] = useState(false);
  const [showManagement, setShowManagement] = useState(false);
  const [name, setName] = useState('清明活动');
  const [startDate, setStartDate] = useState('');
  const [note, setNote] = useState('');

  const quickOpenTrip = useMemo(
    () => trips.find((trip) => trip.id === preferredTripId) ?? trips[0] ?? null,
    [preferredTripId, trips],
  );
  const visibleTrips = showAllTrips ? trips : trips.slice(0, 3);
  const hasMoreTrips = trips.length > 3;
  const accountSettlement = useMemo(
    () => buildAccountSettlement({ memberProfiles: members, parties, deposits, expenses, expenseParticipants }),
    [members, parties, deposits, expenses, expenseParticipants],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await onCreateTrip({
      name,
      startDate: startDate || undefined,
      note: note || undefined,
    });
    setName('');
    setStartDate('');
    setNote('');
    setShowCreateModal(false);
  }

  return (
    <main className="page-shell home-shell">
      <section className="hero-card compact">
        <p className="eyebrow">活动经费账本系统</p>
        <h1>这不是先开活动才开始记账</h1>
        <p className="lead">成员、交款、活动、总账是四件并列的事。现在都放在首页，一眼就能找到。</p>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading compact-gap">
          <div>
            <h2>首页主入口</h2>
            <p>先点你现在要做的事，不用先理解整套系统。</p>
          </div>
        </div>
        <div className="action-grid action-grid-home">
          {HOME_ACTIONS.map((action) => (
            <button key={action.value} type="button" className={section === action.value ? 'primary-action-card active' : 'secondary-action-card'} onClick={() => setSection(action.value)}>
              <strong>{action.label}</strong>
              <span>{action.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {section === 'members' ? (
        <MemberProfilesPanel members={members} saving={saving} onCreate={onCreateMember} onUpdate={onUpdateMember} />
      ) : null}

      {section === 'deposits' ? (
        <MemberDepositPanel
          members={members}
          trips={trips}
          deposits={deposits}
          saving={saving}
          poolBalanceCents={accountSettlement.poolBalanceCents}
          onSave={onSaveGlobalDeposit}
          onVoid={onVoidGlobalDeposit}
        />
      ) : null}

      {section === 'activities' ? (
        <>
          <section className="panel-card compact-top-gap">
            <div className="section-heading">
              <div>
                <h2>当前活动</h2>
                <p>{quickOpenTrip ? '先进入这次活动，再继续记支出和看活动内流水。' : '还没有活动时，先新建一个活动。'}</p>
              </div>
              <button type="button" className="primary-button small-button" onClick={() => setShowCreateModal(true)}>
                新建活动
              </button>
            </div>

            <article className="inline-card current-trip-card">
              {quickOpenTrip ? (
                <>
                  <div className="book-status-row">
                    <div>
                      <strong>{quickOpenTrip.name}</strong>
                      <span>{formatDateRange(quickOpenTrip.startDate, quickOpenTrip.endDate)}</span>
                    </div>
                    <span className="status-pill posted">最近打开</span>
                  </div>
                  <p className="storage-note">当前数据保存在本设备当前浏览器中。换手机、换浏览器或清空浏览器数据，都不会自动同步。</p>
                  <div className="action-row">
                    <button type="button" className="primary-button" onClick={() => onOpenTrip(quickOpenTrip.id, 'home')}>
                      进入活动
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setShowCreateModal(true)}>
                      再建一个活动
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <strong>还没有当前活动</strong>
                  <p className="storage-note">活动是用来记支出的。成员和交款现在可以直接在首页操作，不用等活动先建好。</p>
                  <div className="action-row">
                    <button type="button" className="primary-button" onClick={() => setShowCreateModal(true)}>
                      现在新建活动
                    </button>
                  </div>
                </>
              )}
            </article>
          </section>

          <section className="panel-card compact-top-gap">
            <div className="section-heading">
              <div>
                <h2>最近活动</h2>
                <p>{loading ? '正在读取…' : trips.length > 0 ? '先确认活动名称，再点进去。' : '还没有活动，先建一个就能开始。'}</p>
              </div>
              {hasMoreTrips ? (
                <button type="button" className="ghost-button small-button" onClick={() => setShowAllTrips((current) => !current)}>
                  {showAllTrips ? '收起活动列表' : '查看全部活动'}
                </button>
              ) : null}
            </div>

            <div className="trip-list">
              {visibleTrips.map((trip) => {
                const isCurrent = quickOpenTrip?.id === trip.id;
                return (
                  <button key={trip.id} type="button" className="trip-card" onClick={() => onOpenTrip(trip.id)}>
                    <div className="book-status-row">
                      <div>
                        <strong>{trip.name}</strong>
                        <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                      </div>
                      {isCurrent ? <span className="status-pill posted">当前活动</span> : null}
                    </div>
                  </button>
                );
              })}
              {!loading && visibleTrips.length === 0 ? (
                <article className="inline-card">
                  <strong>还没有活动</strong>
                  <p className="storage-note">先点上面的“新建活动”。</p>
                </article>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {section === 'ledger' ? (
        <AccountBookPanel members={members} trips={trips} parties={parties} deposits={deposits} expenses={expenses} expenseParticipants={expenseParticipants} />
      ) : null}

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>管理与备份</h2>
            <p>导出备份、导入恢复、口令保护都继续保留。平时不常点，所以收在这里。</p>
          </div>
          <button type="button" className="ghost-button small-button" onClick={() => setShowManagement((current) => !current)}>
            {showManagement ? '收起' : '展开'}
          </button>
        </div>

        {!showManagement ? (
          <article className="inline-card current-trip-card">
            <strong>口令保护、备份恢复、安装到桌面</strong>
            <p className="storage-note">建议先设 4 位数字口令，再学会导出备份。你的历史数据导出、导入和本机恢复点都还在。</p>
          </article>
        ) : (
          <>
            <PwaInstallCard />
            <SecurityPanel
              enabled={securityEnabled}
              locked={securityLocked}
              onSetPasscode={onSetPasscode}
              onChangePasscode={onChangePasscode}
              onDisablePasscode={onDisablePasscode}
              onLockNow={onLockNow}
            />
            <BackupPanel
              saving={saving}
              overview={backupOverview}
              snapshots={backupSnapshots}
              onExport={onExportBackup}
              onImport={onImportBackup}
              onRestoreSnapshot={onRestoreSnapshot}
            />
          </>
        )}
      </section>

      {showCreateModal ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card sheet-card" role="dialog" aria-modal="true" aria-labelledby="create-activity-title">
            <div className="section-heading compact-gap">
              <div>
                <h3 id="create-activity-title">新建活动</h3>
                <p>活动主要是拿来记支出的。成员和交款可以先记，不一定等活动先建好。</p>
              </div>
            </div>

            <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                <span>活动名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：清明出游 / 五一聚餐" />
              </label>

              <label>
                <span>活动日期（可不填）</span>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>

              <details className="more-fields-card">
                <summary>补充备注（可不填）</summary>
                <div className="compact-top-gap">
                  <label>
                    <span>备注</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：主要记录这次活动的餐费、门票和车费" rows={3} />
                  </label>
                </div>
              </details>

              <div className="action-row">
                <button className="primary-button" type="submit" disabled={saving || !name.trim()}>
                  {saving ? '正在创建…' : '创建活动'}
                </button>
                <button type="button" className="ghost-button" onClick={() => setShowCreateModal(false)}>
                  先取消
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
