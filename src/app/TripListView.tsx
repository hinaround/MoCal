import { useMemo, useState, type FormEvent } from 'react';
import type { Trip } from '../domain/types';
import { formatDateRange } from '../utils/format';
import type { WorkspaceSection } from './TripWorkspace';

const HOME_ACTIONS: Array<{ section: WorkspaceSection; label: string; hint: string }> = [
  { section: 'home', label: '账户总览', hint: '先看总入金、总支出、公账和各家余额' },
  { section: 'expense', label: '新增支出', hint: '已经花了钱，就从这里记一笔支出' },
  { section: 'deposit', label: '成员入金', hint: '还没花钱，也可以先把经费收上来' },
  { section: 'ledger', label: '总账流水', hint: '适合截图发给朋友或家人对账' },
];

interface TripListViewProps {
  trips: Trip[];
  loading: boolean;
  saving: boolean;
  preferredTripId?: string | null;
  onOpenTrip: (tripId: string, section?: WorkspaceSection) => void;
  onCreateTrip: (input: { name: string; startDate?: string; endDate?: string; note?: string }) => Promise<void>;
}

export function TripListView(props: TripListViewProps) {
  const { trips, loading, saving, preferredTripId, onOpenTrip, onCreateTrip } = props;
  const [name, setName] = useState('春游经费账');
  const [startDate, setStartDate] = useState('');
  const [note, setNote] = useState('');

  const quickOpenTrip = useMemo(
    () => trips.find((trip) => trip.id === preferredTripId) ?? trips[0] ?? null,
    [preferredTripId, trips],
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
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">活动经费管理</p>
        <h1>先开一本账，没开始活动也能先收钱</h1>
        <p className="lead">这不是复杂财务软件，就是把成员入金、支出分摊、总账流水和各家余额记清楚。</p>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>当前账本</h2>
            <p>{quickOpenTrip ? '四个固定入口都会先打开当前账本。' : '还没有账本时，先新建一本就能开始。'}</p>
          </div>
        </div>

        <article className="inline-card current-trip-card">
          {quickOpenTrip ? (
            <>
              <div className="book-status-row">
                <div>
                  <strong>{quickOpenTrip.name}</strong>
                  <span>{formatDateRange(quickOpenTrip.startDate, quickOpenTrip.endDate)}</span>
                </div>
                <button type="button" className="ghost-button small-button" onClick={() => onOpenTrip(quickOpenTrip.id, 'home')}>
                  打开当前账本
                </button>
              </div>
              <div className="action-row home-shortcuts">
                <button type="button" className="primary-button small-button" onClick={() => onOpenTrip(quickOpenTrip.id, 'families')}>
                  先加成员
                </button>
                <button type="button" className="ghost-button small-button" onClick={() => onOpenTrip(quickOpenTrip.id, 'deposit')}>
                  直接成员入金
                </button>
              </div>
              <p className="storage-note">当前账本保存在本设备当前浏览器中。换手机、换浏览器或清空浏览器数据，都不会自动同步。</p>
            </>
          ) : (
            <>
              <strong>还没有当前账本</strong>
              <p className="storage-note">先新建一本账。成员必须挂在某一本账下面，所以建好账本后，就能从这里直接先加成员。</p>
            </>
          )}
        </article>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>固定主入口</h2>
            <p>主流程只保留 4 个固定入口，不用横向滑着找。</p>
          </div>
        </div>

        <div className="action-grid action-grid-home">
          {HOME_ACTIONS.map((action) => (
            <button
              key={action.section}
              type="button"
              className={action.section === 'home' ? 'primary-action-card' : 'secondary-action-card'}
              onClick={() => quickOpenTrip && onOpenTrip(quickOpenTrip.id, action.section)}
              disabled={!quickOpenTrip}
            >
              <strong>{action.label}</strong>
              <span>{quickOpenTrip ? action.hint : '先新建一本账，再从这里直接进入'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>新建账本</h2>
            <p>活动日期没定也没关系，先把经费账开起来，后面再慢慢补。</p>
          </div>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          <label>
            <span>账本名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：清明活动经费账 / 五一待定经费账" />
          </label>

          <label>
            <span>活动日期（没定可先不填）</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>

          <label>
            <span>备注</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：主要记录吃饭、门票、车费和成员入金" rows={3} />
          </label>

          <button className="primary-button" type="submit" disabled={saving || !name.trim()}>
            {saving ? '正在创建…' : '创建当前账本'}
          </button>
        </form>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>已有账本</h2>
            <p>{loading ? '正在读取…' : trips.length > 0 ? `一共 ${trips.length} 本账，点进去前请先确认账本名称。` : '还没有账本，先建一个就能开始。'}</p>
          </div>
        </div>

        <div className="trip-list">
          {trips.map((trip) => {
            const isCurrent = quickOpenTrip?.id === trip.id;
            return (
              <button key={trip.id} type="button" className="trip-card" onClick={() => onOpenTrip(trip.id)}>
                <div className="book-status-row">
                  <div>
                    <strong>{trip.name}</strong>
                    <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                  </div>
                  {isCurrent ? <span className="status-pill posted">当前账本</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
