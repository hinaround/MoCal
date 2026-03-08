import { useEffect, useMemo, useState } from 'react';
import type { Party, ShareMode, Trip } from '../domain/types';
import {
  createDeposit,
  createExpenseWithParticipants,
  createParty,
  createTrip,
  getTripBundle,
  listTrips,
  updateDeposit,
  updateExpenseWithParticipants,
  updateParty,
  voidDeposit,
  voidExpense,
  type TripBundle,
} from '../storage/ledgerRepository';
import { PwaInstallCard } from '../pwa/PwaInstallCard';
import { TripListView } from './TripListView';
import { TripWorkspace, type WorkspaceSection } from './TripWorkspace';

const LAST_TRIP_ID_KEY = 'family-trip-ledger:last-trip-id';

function readLastTripId(): string | null {
  try {
    return window.localStorage.getItem(LAST_TRIP_ID_KEY);
  } catch {
    return null;
  }
}

function writeLastTripId(tripId: string): void {
  try {
    window.localStorage.setItem(LAST_TRIP_ID_KEY, tripId);
  } catch {
    // ignore localStorage write failures
  }
}

export function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<TripBundle | null>(null);
  const [initialSection, setInitialSection] = useState<WorkspaceSection>('home');
  const [lastTripId, setLastTripId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preferredTripId = useMemo(
    () => trips.find((trip) => trip.id === lastTripId)?.id ?? trips[0]?.id ?? null,
    [lastTripId, trips],
  );

  async function refreshTrips() {
    const nextTrips = await listTrips();
    setTrips(nextTrips);
  }

  async function refreshSelectedTrip(tripId: string) {
    const bundle = await getTripBundle(tripId);
    setSelectedBundle(bundle);
  }

  useEffect(() => {
    setLastTripId(readLastTripId());
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError(null);
        await refreshTrips();
      } catch {
        setError('读取账本失败，请刷新后再试');
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedTripId) {
      setSelectedBundle(null);
      return;
    }

    const tripId = selectedTripId;

    async function loadSelectedTrip() {
      try {
        setLoading(true);
        setError(null);
        await refreshSelectedTrip(tripId);
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : '打开这本账失败，请稍后再试');
      } finally {
        setLoading(false);
      }
    }

    void loadSelectedTrip();
  }, [selectedTripId]);

  async function runSavingTask(task: () => Promise<void>) {
    try {
      setSaving(true);
      setError(null);
      await task();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : '保存失败，请再试一次');
    } finally {
      setSaving(false);
    }
  }

  function openTrip(tripId: string, section: WorkspaceSection = 'home') {
    setInitialSection(section);
    setSelectedTripId(tripId);
    setLastTripId(tripId);
    writeLastTripId(tripId);
  }

  async function handleCreateTrip(input: { name: string; startDate?: string; endDate?: string; note?: string }) {
    await runSavingTask(async () => {
      const trip = await createTrip(input);
      await refreshTrips();
      openTrip(trip.id, 'home');
    });
  }

  async function handleCreateParty(input: { name: string; defaultHeadcount: number; note?: string }) {
    if (!selectedBundle) {
      return;
    }

    await runSavingTask(async () => {
      await createParty({
        tripId: selectedBundle.trip.id,
        name: input.name,
        defaultHeadcount: input.defaultHeadcount,
        note: input.note,
        sortOrder: selectedBundle.parties.length,
      });
      await refreshSelectedTrip(selectedBundle.trip.id);
      await refreshTrips();
    });
  }

  async function handleUpdateParty(party: Party) {
    if (!selectedBundle) {
      return;
    }

    await runSavingTask(async () => {
      await updateParty(party);
      await refreshSelectedTrip(selectedBundle.trip.id);
      await refreshTrips();
    });
  }

  async function handleSaveDeposit(input: {
    depositId?: string;
    partyId: string;
    amountCents: number;
    paidAt: string;
    note?: string;
    reason?: string;
  }) {
    if (!selectedBundle) {
      return;
    }

    await runSavingTask(async () => {
      if (input.depositId) {
        await updateDeposit({
          depositId: input.depositId,
          partyId: input.partyId,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
          reason: input.reason,
        });
      } else {
        await createDeposit({
          tripId: selectedBundle.trip.id,
          partyId: input.partyId,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
        });
      }

      await refreshSelectedTrip(selectedBundle.trip.id);
      await refreshTrips();
    });
  }

  async function handleVoidDeposit(input: { depositId: string; reason: string }) {
    if (!selectedBundle) {
      return;
    }

    await runSavingTask(async () => {
      await voidDeposit(input);
      await refreshSelectedTrip(selectedBundle.trip.id);
      await refreshTrips();
    });
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
    if (!selectedBundle) {
      return;
    }

    await runSavingTask(async () => {
      const expense = {
        tripId: selectedBundle.trip.id,
        paidAt: input.paidAt,
        category: input.category,
        title: input.title,
        amountCents: input.amountCents,
        payerKind: input.payerKind,
        payerPartyId: input.payerPartyId,
        shareMode: input.shareMode,
        note: input.note,
      };

      if (input.expenseId) {
        await updateExpenseWithParticipants({
          expenseId: input.expenseId,
          expense,
          participants: input.participants,
          parties: selectedBundle.parties,
          reason: input.reason,
        });
      } else {
        await createExpenseWithParticipants({
          expense,
          participants: input.participants,
          parties: selectedBundle.parties,
        });
      }

      await refreshSelectedTrip(selectedBundle.trip.id);
      await refreshTrips();
    });
  }

  async function handleVoidExpense(input: { expenseId: string; reason: string }) {
    if (!selectedBundle) {
      return;
    }

    await runSavingTask(async () => {
      await voidExpense(input);
      await refreshSelectedTrip(selectedBundle.trip.id);
      await refreshTrips();
    });
  }

  if (selectedTripId && !selectedBundle) {
    return (
      <main className="page-shell">
        {error ? <div className="banner error">{error}</div> : null}
        <section className="hero-card">
          <p className="eyebrow">正在打开</p>
          <h1>正在读取这本账</h1>
          <p className="lead">稍等一下，账本马上就好。</p>
        </section>
      </main>
    );
  }

  if (selectedBundle && selectedTripId) {
    return (
      <>
        {error ? <div className="banner error">{error}</div> : null}
        <PwaInstallCard />
        <TripWorkspace
          bundle={selectedBundle}
          saving={saving}
          initialSection={initialSection}
          onBack={() => setSelectedTripId(null)}
          onCreateParty={handleCreateParty}
          onUpdateParty={handleUpdateParty}
          onSaveDeposit={handleSaveDeposit}
          onVoidDeposit={handleVoidDeposit}
          onSaveExpense={handleSaveExpense}
          onVoidExpense={handleVoidExpense}
        />
      </>
    );
  }

  return (
    <>
      {error ? <div className="banner error">{error}</div> : null}
      <PwaInstallCard />
      <TripListView
        trips={trips}
        loading={loading}
        saving={saving}
        preferredTripId={preferredTripId}
        onOpenTrip={openTrip}
        onCreateTrip={handleCreateTrip}
      />
    </>
  );
}
