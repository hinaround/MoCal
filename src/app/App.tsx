import { useEffect, useMemo, useState } from 'react';
import type { Deposit, Expense, ExpenseParticipant, MemberProfile, Party, ShareMode, Trip } from '../domain/types';
import type { BackupOverview, BackupSnapshotRecord, LedgerBackupPayload } from '../storage/backupRepository';
import {
  captureAutoSnapshot,
  exportBackupToFile,
  getBackupCountsFromPayload,
  getBackupOverview,
  importBackupPayload,
  listBackupSnapshots,
  restoreFromAutoSnapshot,
  summarizeBackupCounts,
} from '../storage/backupRepository';
import {
  createDeposit,
  createExpenseWithParticipants,
  createMemberProfile,
  createParty,
  createTrip,
  getHomeBundle,
  getTripBundle,
  updateDeposit,
  updateExpenseWithParticipants,
  updateMemberProfile,
  updateParty,
  voidDeposit,
  voidExpense,
  type TripBundle,
} from '../storage/ledgerRepository';
import { clearSecurityConfig, createSecurityConfig, readSecurityConfig, type SecurityConfig, verifyPasscodeAgainstConfig, writeSecurityConfig } from '../security/passcode';
import { LockScreen } from './LockScreen';
import { SuccessDialog } from './SuccessDialog';
import { TripListView } from './TripListView';
import { TripWorkspace, type WorkspaceSection } from './TripWorkspace';

const LAST_TRIP_ID_KEY = 'family-trip-ledger:last-trip-id';
const EMPTY_BACKUP_OVERVIEW: BackupOverview = {
  lastManualExportAt: null,
  lastAutoSnapshotAt: null,
  autoSnapshotCount: 0,
};

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

function clearLastTripId(): void {
  try {
    window.localStorage.removeItem(LAST_TRIP_ID_KEY);
  } catch {
    // ignore localStorage write failures
  }
}

function readInitialSecurityConfig(): SecurityConfig | null {
  try {
    return readSecurityConfig();
  } catch {
    return null;
  }
}

export function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [allDeposits, setAllDeposits] = useState<Deposit[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allExpenseParticipants, setAllExpenseParticipants] = useState<ExpenseParticipant[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<TripBundle | null>(null);
  const [initialSection, setInitialSection] = useState<WorkspaceSection>('home');
  const [lastTripId, setLastTripId] = useState<string | null>(null);
  const [backupOverview, setBackupOverview] = useState<BackupOverview>(EMPTY_BACKUP_OVERVIEW);
  const [backupSnapshots, setBackupSnapshots] = useState<BackupSnapshotRecord[]>([]);
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig | null>(() => readInitialSecurityConfig());
  const [locked, setLocked] = useState<boolean>(() => Boolean(readInitialSecurityConfig()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<{ title: string; message: string } | null>(null);

  const preferredTripId = useMemo(
    () => trips.find((trip) => trip.id === lastTripId)?.id ?? trips[0]?.id ?? null,
    [lastTripId, trips],
  );

  async function refreshHomeData() {
    const nextHome = await getHomeBundle();
    setTrips(nextHome.trips);
    setMembers(nextHome.memberProfiles);
    setAllParties(nextHome.parties);
    setAllDeposits(nextHome.deposits);
    setAllExpenses(nextHome.expenses);
    setAllExpenseParticipants(nextHome.expenseParticipants);
  }

  async function refreshSelectedTrip(tripId: string) {
    const bundle = await getTripBundle(tripId);
    setSelectedBundle(bundle);
  }

  async function refreshBackups() {
    const [overview, snapshots] = await Promise.all([getBackupOverview(), listBackupSnapshots()]);
    setBackupOverview(overview);
    setBackupSnapshots(snapshots);
  }

  function showSuccess(title: string, message: string) {
    setSuccessFeedback({ title, message });
  }

  useEffect(() => {
    setLastTripId(readLastTripId());
  }, []);

  useEffect(() => {
    if (!securityConfig) {
      return;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        setLocked(true);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [securityConfig]);

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([refreshHomeData(), refreshBackups()]);
      } catch {
        setError('读取活动列表失败，请刷新后再试');
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
        setError(cause instanceof Error && cause.message ? cause.message : '打开当前活动失败，请稍后再试');
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
      return true;
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : '保存失败，请再试一次');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runSavingTaskOrThrow(task: () => Promise<void>) {
    try {
      setSaving(true);
      setError(null);
      await task();
    } catch (cause) {
      const message = cause instanceof Error && cause.message ? cause.message : '保存失败，请再试一次';
      setError(message);
      throw new Error(message);
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

  function lockNow() {
    if (securityConfig) {
      setLocked(true);
    }
  }

  async function unlockWithPasscode(passcode: string) {
    if (!securityConfig) {
      setLocked(false);
      return;
    }

    const ok = await verifyPasscodeAgainstConfig(securityConfig, passcode);
    if (!ok) {
      throw new Error('管理口令不对，请再试一次');
    }

    setLocked(false);
  }

  async function returnToHomeAndReload() {
    setSelectedBundle(null);
    setSelectedTripId(null);
    setInitialSection('home');
    clearLastTripId();
    setLastTripId(null);
    await Promise.all([refreshHomeData(), refreshBackups()]);
  }

  async function handleSetPasscode(passcode: string) {
    const config = await createSecurityConfig(passcode);
    writeSecurityConfig(config);
    setSecurityConfig(config);
    setLocked(false);
    showSuccess('管理口令已开启', '以后打开应用或回到应用时，都需要先输入 4 位数字口令。');
  }

  async function handleChangePasscode(currentPasscode: string, nextPasscode: string) {
    if (!securityConfig) {
      throw new Error('还没有开启管理口令');
    }

    const ok = await verifyPasscodeAgainstConfig(securityConfig, currentPasscode);
    if (!ok) {
      throw new Error('当前管理口令不对');
    }

    const nextConfig = await createSecurityConfig(nextPasscode);
    writeSecurityConfig(nextConfig);
    setSecurityConfig(nextConfig);
    setLocked(false);
    showSuccess('管理口令已更新', '新的 4 位数字口令已经生效。');
  }

  async function handleDisablePasscode(currentPasscode: string) {
    if (!securityConfig) {
      return;
    }

    const ok = await verifyPasscodeAgainstConfig(securityConfig, currentPasscode);
    if (!ok) {
      throw new Error('当前管理口令不对');
    }

    clearSecurityConfig();
    setSecurityConfig(null);
    setLocked(false);
    showSuccess('管理口令已关闭', '现在打开应用时不再需要输入口令。');
  }

  async function handleCreateTrip(input: { name: string; startDate?: string; endDate?: string; note?: string }) {
    const created = await runSavingTask(async () => {
      const trip = await createTrip(input);
      await captureAutoSnapshot('新建活动后自动留底');
      await Promise.all([refreshHomeData(), refreshBackups()]);
      openTrip(trip.id, 'home');
    });

    if (created) {
      showSuccess('活动已创建', `活动“${input.name.trim()}”已经创建成功，现在可以继续加成员、记入金或记支出。`);
    }
  }

  async function handleCreateMember(input: { name: string; defaultHeadcount: number; note?: string }) {
    const created = await runSavingTask(async () => {
      await createMemberProfile(input);
      await captureAutoSnapshot('新增全局成员后自动留底');
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (created) {
      showSuccess('成员已创建', `成员“${input.name.trim()}”已经建好，后面可以直接记交款，也可以加入活动。`);
    }
  }

  async function handleUpdateMember(member: MemberProfile) {
    const updated = await runSavingTask(async () => {
      await updateMemberProfile(member);
      await captureAutoSnapshot('修改全局成员后自动留底');
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (updated) {
      showSuccess('成员资料已保存', `“${member.name}”的全局资料已经保存成功。`);
    }
  }

  async function handleSaveGlobalDeposit(input: {
    depositId?: string;
    memberProfileId: string;
    amountCents: number;
    paidAt: string;
    note?: string;
    reason?: string;
  }) {
    const memberName = members.find((member) => member.id === input.memberProfileId)?.name ?? '该成员';
    const saved = await runSavingTask(async () => {
      if (input.depositId) {
        await updateDeposit({
          depositId: input.depositId,
          memberProfileId: input.memberProfileId,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
          reason: input.reason,
        });
        await captureAutoSnapshot('调整全局成员交款后自动留底');
      } else {
        await createDeposit({
          memberProfileId: input.memberProfileId,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
        });
        await captureAutoSnapshot('新增全局成员交款后自动留底');
      }

      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (saved) {
      if (input.depositId) {
        showSuccess('成员交款已调整', `${memberName}的这笔成员交款已经调整成功，并已重新计入总账。`);
      } else {
        showSuccess('成员交款已记入', `${memberName}的成员交款已经正式入账，公账余额也已同步更新。`);
      }
    }
  }

  async function handleVoidGlobalDeposit(input: { depositId: string; reason: string }) {
    const voided = await runSavingTask(async () => {
      await voidDeposit(input);
      await captureAutoSnapshot('作废全局成员交款后自动留底');
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (voided) {
      showSuccess('成员交款已作废', '这笔成员交款已经作废，不再计入总账和公账余额。');
    }
  }

  async function handleCreateParty(input: { name: string; defaultHeadcount: number; note?: string }) {
    if (!selectedBundle) {
      return;
    }

    const tripId = selectedBundle.trip.id;
    const created = await runSavingTask(async () => {
      await createParty({
        tripId,
        name: input.name,
        defaultHeadcount: input.defaultHeadcount,
        note: input.note,
        sortOrder: selectedBundle.parties.length,
      });
      await captureAutoSnapshot('新增活动成员后自动留底');
      await refreshSelectedTrip(tripId);
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (created) {
      showSuccess('成员已加入', `成员“${input.name.trim()}”已经加入当前活动，后面记支出时可以直接点选。`);
    }
  }

  async function handleUpdateParty(party: Party) {
    if (!selectedBundle) {
      return;
    }

    const tripId = selectedBundle.trip.id;
    const updated = await runSavingTask(async () => {
      await updateParty(party);
      await captureAutoSnapshot('修改成员资料后自动留底');
      await refreshSelectedTrip(tripId);
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (updated) {
      showSuccess('成员资料已保存', `“${party.name}”的名称、默认人数或状态已经保存成功。`);
    }
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

    const tripId = selectedBundle.trip.id;
    const partyName = selectedBundle.parties.find((party) => party.id === input.partyId)?.name ?? '该成员';
    const saved = await runSavingTask(async () => {
      if (input.depositId) {
        await updateDeposit({
          depositId: input.depositId,
          partyId: input.partyId,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
          reason: input.reason,
        });
        await captureAutoSnapshot('调整成员交款后自动留底');
      } else {
        await createDeposit({
          tripId,
          partyId: input.partyId,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          note: input.note,
        });
        await captureAutoSnapshot('新增成员交款后自动留底');
      }

      await refreshSelectedTrip(tripId);
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (saved) {
      if (input.depositId) {
        showSuccess('成员交款已调整', `${partyName}的这笔成员交款已经调整成功，并已重新计入总账。`);
      } else {
        showSuccess('成员交款已记入', `${partyName}的成员交款已经正式入账，公账余额也已同步更新。`);
      }
    }
  }

  async function handleVoidDeposit(input: { depositId: string; reason: string }) {
    if (!selectedBundle) {
      return;
    }

    const tripId = selectedBundle.trip.id;
    const voided = await runSavingTask(async () => {
      await voidDeposit(input);
      await captureAutoSnapshot('作废成员交款后自动留底');
      await refreshSelectedTrip(tripId);
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (voided) {
      showSuccess('成员交款已作废', '这笔成员交款已经作废，不再计入总账和公账余额。');
    }
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

    const tripId = selectedBundle.trip.id;
    const title = input.title?.trim() || input.category?.trim() || '这笔支出';
    const saved = await runSavingTask(async () => {
      const expense = {
        tripId,
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
        await captureAutoSnapshot('调整支出后自动留底');
      } else {
        await createExpenseWithParticipants({
          expense,
          participants: input.participants,
          parties: selectedBundle.parties,
        });
        await captureAutoSnapshot('新增支出后自动留底');
      }

      await refreshSelectedTrip(tripId);
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (saved) {
      if (input.expenseId) {
        showSuccess('支出已调整', `“${title}”已经调整成功，分摊结果和余额也已同步更新。`);
      } else {
        showSuccess('支出已记入', `“${title}”已经正式入账，这笔支出的分摊和余额已经同步更新。`);
      }
    }
  }

  async function handleVoidExpense(input: { expenseId: string; reason: string }) {
    if (!selectedBundle) {
      return;
    }

    const tripId = selectedBundle.trip.id;
    const voided = await runSavingTask(async () => {
      await voidExpense(input);
      await captureAutoSnapshot('作废支出后自动留底');
      await refreshSelectedTrip(tripId);
      await Promise.all([refreshHomeData(), refreshBackups()]);
    });

    if (voided) {
      showSuccess('支出已作废', '这笔支出已经作废，不再计入总账、成员余额和清账建议。');
    }
  }

  async function handleExportBackup() {
    await runSavingTaskOrThrow(async () => {
      const { counts, fileName } = await exportBackupToFile();
      await refreshBackups();
      showSuccess('备份文件已导出', `已导出“${fileName}”，内容包含 ${summarizeBackupCounts(counts)}。`);
    });
  }

  async function handleImportBackup(payload: LedgerBackupPayload, fileName: string) {
    await runSavingTaskOrThrow(async () => {
      if (trips.length > 0) {
        await captureAutoSnapshot('导入备份前自动留底');
      }
      await importBackupPayload(payload);
      await captureAutoSnapshot('导入备份后自动留底');
      await returnToHomeAndReload();
      const counts = getBackupCountsFromPayload(payload);
      showSuccess('备份已导入', `已从“${fileName}”恢复数据，内容包含 ${summarizeBackupCounts(counts)}。`);
    });
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    await runSavingTaskOrThrow(async () => {
      if (trips.length > 0) {
        await captureAutoSnapshot('恢复前自动留底');
      }
      const snapshot = await restoreFromAutoSnapshot(snapshotId);
      await captureAutoSnapshot('恢复后自动留底');
      await returnToHomeAndReload();
      showSuccess('本机恢复点已恢复', `已恢复到“${snapshot.label}”，内容包含 ${summarizeBackupCounts(snapshot.counts)}。`);
    });
  }

  const successDialog = (
    <SuccessDialog
      open={Boolean(successFeedback)}
      title={successFeedback?.title ?? ''}
      message={successFeedback?.message ?? ''}
      onClose={() => setSuccessFeedback(null)}
    />
  );

  if (selectedTripId && !selectedBundle) {
    return (
      <>
        {successDialog}
        <main className="page-shell">
          {error ? <div className="banner error">{error}</div> : null}
          <section className="hero-card">
            <p className="eyebrow">正在打开</p>
            <h1>正在读取当前活动</h1>
            <p className="lead">稍等一下，活动数据马上就好。</p>
          </section>
        </main>
        <LockScreen open={Boolean(securityConfig && locked)} onUnlock={unlockWithPasscode} />
      </>
    );
  }

  if (selectedBundle && selectedTripId) {
    return (
      <>
        {successDialog}
        {error ? <div className="banner error">{error}</div> : null}
        <TripWorkspace
          bundle={selectedBundle}
          saving={saving}
          initialSection={initialSection}
          securityEnabled={Boolean(securityConfig)}
          onLockNow={lockNow}
          onBack={() => setSelectedTripId(null)}
          onCreateParty={handleCreateParty}
          onUpdateParty={handleUpdateParty}
          onSaveDeposit={handleSaveDeposit}
          onVoidDeposit={handleVoidDeposit}
          onSaveExpense={handleSaveExpense}
          onVoidExpense={handleVoidExpense}
        />
        <LockScreen open={Boolean(securityConfig && locked)} onUnlock={unlockWithPasscode} />
      </>
    );
  }

  return (
    <>
      {successDialog}
      {error ? <div className="banner error">{error}</div> : null}
      <TripListView
        trips={trips}
        members={members}
        parties={allParties}
        deposits={allDeposits}
        expenses={allExpenses}
        expenseParticipants={allExpenseParticipants}
        loading={loading}
        saving={saving}
        preferredTripId={preferredTripId}
        backupOverview={backupOverview}
        backupSnapshots={backupSnapshots}
        securityEnabled={Boolean(securityConfig)}
        securityLocked={locked}
        onSetPasscode={handleSetPasscode}
        onChangePasscode={handleChangePasscode}
        onDisablePasscode={handleDisablePasscode}
        onLockNow={lockNow}
        onOpenTrip={openTrip}
        onCreateTrip={handleCreateTrip}
        onCreateMember={handleCreateMember}
        onUpdateMember={handleUpdateMember}
        onSaveGlobalDeposit={handleSaveGlobalDeposit}
        onVoidGlobalDeposit={handleVoidGlobalDeposit}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onRestoreSnapshot={handleRestoreSnapshot}
      />
      <LockScreen open={Boolean(securityConfig && locked)} onUnlock={unlockWithPasscode} />
    </>
  );
}
