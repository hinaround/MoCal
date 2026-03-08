import { useMemo, useState, type FormEvent } from 'react';
import type { Trip } from '../domain/types';
import type { WorkspaceSection } from './TripWorkspace';

const HOME_ACTIONS: Array<{ section: WorkspaceSection; label: string; hint: string }> = [
  { section: 'home', label: '先看总账', hint: '先看现在谁该补谁该退' },
  { section: 'expense', label: '记一笔花费', hint: '已经花了钱，就从这里记' },
  { section: 'deposit', label: '先收的钱', hint: '还没花也能先把钱收上来' },
  { section: 'ledger', label: '看整本流水', hint: '适合截图发给别人对账' },
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
  const [name, setName] = useState('春游记账');
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
        <p className="eyebrow">家庭旅游动态记账工具</p>
        <h1>先开一本账，活动没定也能先记</h1>
        <p className="lead">先收钱也行，后面再补活动日期、记花费、看最后谁补谁退。</p>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>固定主入口</h2>
            <p>{quickOpenTrip ? `点下面入口后，会打开你最近在用的一本账。` : '还没有账本时，先新开一本账。'}</p>
          </div>
        </div>

        <div className="action-grid action-grid-home">
          {HOME_ACTIONS.map((action) => (
            <button
              key={action.section}
              type="button"
              className={action.section === 'ledger' ? 'primary-action-card' : 'secondary-action-card'}
              onClick={() => quickOpenTrip && onOpenTrip(quickOpenTrip.id, action.section)}
              disabled={!quickOpenTrip}
            >
              <strong>{action.label}</strong>
              <span>{quickOpenTrip ? action.hint : '先新开一本账，再从这里直接进入'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>新开一本账</h2>
            <p>先有一本账最重要。活动还没定时，也可以先写“待定”或“预收款”。</p>
          </div>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          <label>
            <span>账本名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：清明出游这笔账 / 五一待定" />
          </label>

          <label>
            <span>活动日期（没定可先不填）</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>

          <label>
            <span>备注</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：主要记录吃饭、门票和车费" rows={3} />
          </label>

          <button className="primary-button" type="submit" disabled={saving || !name.trim()}>
            {saving ? '正在创建…' : '开始记这本账'}
          </button>
        </form>
      </section>

      <section className="panel-card compact-top-gap">
        <div className="section-heading">
          <div>
            <h2>已有账本</h2>
            <p>{loading ? '正在读取…' : trips.length > 0 ? `一共 ${trips.length} 本账` : '还没有账本，先建一个就能开始。'}</p>
          </div>
        </div>

        <div className="trip-list">
          {trips.map((trip) => (
            <button key={trip.id} type="button" className="trip-card" onClick={() => onOpenTrip(trip.id)}>
              <strong>{trip.name}</strong>
              <span>{trip.startDate || '活动还没定，也可以先收钱'}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
