import type { Deposit, Expense, ExpenseParticipant, MemberProfile, Party, Trip } from '../domain/types';
import { STORE_NAMES, addRecord, deleteRecord, getAll, getById, openDatabase } from './db';

const BACKUP_SCHEMA_VERSION = 1;
const AUTO_SNAPSHOT_LIMIT = 12;
const LAST_MANUAL_EXPORT_AT_KEY = 'family-trip-ledger:last-manual-export-at';

const MAIN_STORE_NAMES = [
  STORE_NAMES.trips,
  STORE_NAMES.memberProfiles,
  STORE_NAMES.parties,
  STORE_NAMES.deposits,
  STORE_NAMES.expenses,
  STORE_NAMES.expenseParticipants,
] as const;

export interface BackupStores {
  trips: Trip[];
  memberProfiles: MemberProfile[];
  parties: Party[];
  deposits: Deposit[];
  expenses: Expense[];
  expenseParticipants: ExpenseParticipant[];
}

export interface BackupCounts {
  trips: number;
  memberProfiles: number;
  parties: number;
  deposits: number;
  expenses: number;
  expenseParticipants: number;
}

export interface LedgerBackupPayload {
  appName: string;
  schemaVersion: number;
  exportedAt: string;
  source: 'manual-export' | 'auto-snapshot';
  stores: BackupStores;
}

export interface BackupSnapshotRecord {
  id: string;
  kind: 'auto';
  label: string;
  createdAt: string;
  counts: BackupCounts;
  payload: LedgerBackupPayload;
}

export interface BackupOverview {
  lastManualExportAt: string | null;
  lastAutoSnapshotAt: string | null;
  autoSnapshotCount: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地数据请求失败'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('本地数据写入已中断'));
    transaction.onerror = () => reject(transaction.error ?? new Error('本地数据写入失败'));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === 'string' && value.id.trim().length > 0;
}

function buildCounts(stores: BackupStores): BackupCounts {
  return {
    trips: stores.trips.length,
    memberProfiles: stores.memberProfiles.length,
    parties: stores.parties.length,
    deposits: stores.deposits.length,
    expenses: stores.expenses.length,
    expenseParticipants: stores.expenseParticipants.length,
  };
}

function readLastManualExportAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_MANUAL_EXPORT_AT_KEY);
  } catch {
    return null;
  }
}

function writeLastManualExportAt(value: string): void {
  try {
    window.localStorage.setItem(LAST_MANUAL_EXPORT_AT_KEY, value);
  } catch {
    // ignore localStorage write failures
  }
}

function normalizeStores(value: unknown): BackupStores | null {
  if (!isRecord(value)) {
    return null;
  }

  const trips = Array.isArray(value.trips) ? value.trips : null;
  const memberProfiles = Array.isArray(value.memberProfiles) ? value.memberProfiles : [];
  const parties = Array.isArray(value.parties) ? value.parties : null;
  const deposits = Array.isArray(value.deposits) ? value.deposits : null;
  const expenses = Array.isArray(value.expenses) ? value.expenses : null;
  const expenseParticipants = Array.isArray(value.expenseParticipants) ? value.expenseParticipants : null;

  if (!trips || !parties || !deposits || !expenses || !expenseParticipants) {
    return null;
  }

  return {
    trips: trips as Trip[],
    memberProfiles: memberProfiles as MemberProfile[],
    parties: parties as Party[],
    deposits: deposits as Deposit[],
    expenses: expenses as Expense[],
    expenseParticipants: expenseParticipants as ExpenseParticipant[],
  };
}

export function validateBackupPayload(value: unknown): { ok: true; payload: LedgerBackupPayload } | { ok: false; errors: string[] } {
  if (!isRecord(value)) {
    return { ok: false, errors: ['备份文件不是有效的 JSON 对象'] };
  }

  const stores = normalizeStores(value.stores);
  if (!stores) {
    return { ok: false, errors: ['备份文件缺少完整的数据表内容'] };
  }

  const errors: string[] = [];

  if (!Array.isArray(stores.trips) || stores.trips.some((item) => !hasStringId(item))) {
    errors.push('活动列表格式不正确');
  }

  if (stores.memberProfiles.some((item) => !hasStringId(item))) {
    errors.push('成员库格式不正确');
  }

  if (!Array.isArray(stores.parties) || stores.parties.some((item) => !hasStringId(item) || !isRecord(item) || typeof item.tripId !== 'string')) {
    errors.push('活动成员列表格式不正确');
  }

  if (!Array.isArray(stores.deposits) || stores.deposits.some((item) => !hasStringId(item) || !isRecord(item) || (typeof item.memberProfileId !== 'string' && typeof item.partyId !== 'string'))) {
    errors.push('成员入金记录格式不正确');
  }

  if (!Array.isArray(stores.expenses) || stores.expenses.some((item) => !hasStringId(item) || !isRecord(item) || typeof item.tripId !== 'string')) {
    errors.push('支出记录格式不正确');
  }

  if (!Array.isArray(stores.expenseParticipants) || stores.expenseParticipants.some((item) => !hasStringId(item) || !isRecord(item) || typeof item.expenseId !== 'string' || typeof item.partyId !== 'string')) {
    errors.push('分摊明细格式不正确');
  }

  const tripIds = new Set(stores.trips.map((item) => item.id));
  const partyIds = new Set(stores.parties.map((item) => item.id));
  const expenseIds = new Set(stores.expenses.map((item) => item.id));

  if (stores.parties.some((item) => !tripIds.has(item.tripId))) {
    errors.push('有成员挂在不存在的活动下');
  }

  if (stores.deposits.some((item) => (typeof item.tripId === 'string' && !tripIds.has(item.tripId)) || (typeof item.partyId === 'string' && !partyIds.has(item.partyId)))) {
    errors.push('有成员交款挂在不存在的活动或成员下');
  }

  if (stores.expenses.some((item) => !tripIds.has(item.tripId))) {
    errors.push('有支出挂在不存在的活动下');
  }

  if (stores.expenseParticipants.some((item) => !expenseIds.has(item.expenseId) || !partyIds.has(item.partyId))) {
    errors.push('有分摊明细挂在不存在的支出或成员下');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      appName: typeof value.appName === 'string' ? value.appName : '活动经费管理',
      schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : BACKUP_SCHEMA_VERSION,
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : nowIso(),
      source: value.source === 'auto-snapshot' ? 'auto-snapshot' : 'manual-export',
      stores,
    },
  };
}

export async function readAllBackupStores(): Promise<BackupStores> {
  const [trips, memberProfiles, parties, deposits, expenses, expenseParticipants] = await Promise.all([
    getAll<Trip>(STORE_NAMES.trips),
    getAll<MemberProfile>(STORE_NAMES.memberProfiles),
    getAll<Party>(STORE_NAMES.parties),
    getAll<Deposit>(STORE_NAMES.deposits),
    getAll<Expense>(STORE_NAMES.expenses),
    getAll<ExpenseParticipant>(STORE_NAMES.expenseParticipants),
  ]);

  return {
    trips,
    memberProfiles,
    parties,
    deposits,
    expenses,
    expenseParticipants,
  };
}

export async function buildBackupPayload(source: LedgerBackupPayload['source']): Promise<LedgerBackupPayload> {
  const stores = await readAllBackupStores();
  return {
    appName: '活动经费管理',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowIso(),
    source,
    stores,
  };
}

function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildBackupFileName(exportedAt: string): string {
  const date = new Date(exportedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `活动经费备份-${year}${month}${day}-${hour}${minute}.json`;
}

export function getBackupCountsFromPayload(payload: LedgerBackupPayload): BackupCounts {
  return buildCounts(payload.stores);
}

export async function exportBackupToFile(): Promise<{ payload: LedgerBackupPayload; counts: BackupCounts; fileName: string }> {
  const payload = await buildBackupPayload('manual-export');
  const fileName = buildBackupFileName(payload.exportedAt);
  downloadTextFile(fileName, JSON.stringify(payload, null, 2));
  writeLastManualExportAt(payload.exportedAt);
  return {
    payload,
    counts: buildCounts(payload.stores),
    fileName,
  };
}

async function pruneAutoSnapshots(): Promise<void> {
  const snapshots = await getAll<BackupSnapshotRecord>(STORE_NAMES.backupSnapshots);
  const autoSnapshots = snapshots
    .filter((item) => item.kind === 'auto')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const overflow = autoSnapshots.slice(AUTO_SNAPSHOT_LIMIT);
  await Promise.all(overflow.map((item) => deleteRecord(STORE_NAMES.backupSnapshots, item.id)));
}

export async function captureAutoSnapshot(label: string): Promise<BackupSnapshotRecord> {
  const payload = await buildBackupPayload('auto-snapshot');
  const snapshot: BackupSnapshotRecord = {
    id: makeId(),
    kind: 'auto',
    label,
    createdAt: nowIso(),
    counts: buildCounts(payload.stores),
    payload,
  };

  await addRecord(STORE_NAMES.backupSnapshots, snapshot);
  await pruneAutoSnapshots();
  return snapshot;
}

export async function listBackupSnapshots(): Promise<BackupSnapshotRecord[]> {
  const snapshots = await getAll<BackupSnapshotRecord>(STORE_NAMES.backupSnapshots);
  return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getBackupOverview(): Promise<BackupOverview> {
  const snapshots = await listBackupSnapshots();
  return {
    lastManualExportAt: readLastManualExportAt(),
    lastAutoSnapshotAt: snapshots[0]?.createdAt ?? null,
    autoSnapshotCount: snapshots.length,
  };
}

export function summarizeBackupCounts(counts: BackupCounts): string {
  return `活动 ${counts.trips} 个、成员 ${counts.parties} 个、入金 ${counts.deposits} 笔、支出 ${counts.expenses} 笔、分摊 ${counts.expenseParticipants} 条`;
}

export async function parseBackupFile(file: File): Promise<{ payload: LedgerBackupPayload; counts: BackupCounts }> {
  const text = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON，请重新选择');
  }

  const result = validateBackupPayload(parsed);
  if (!result.ok) {
    throw new Error(result.errors[0] ?? '备份文件内容不完整，不能导入');
  }

  return {
    payload: result.payload,
    counts: buildCounts(result.payload.stores),
  };
}

export async function replaceMainStoresFromBackup(payload: LedgerBackupPayload): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(MAIN_STORE_NAMES, 'readwrite');

  try {
    for (const storeName of MAIN_STORE_NAMES) {
      await requestToPromise(transaction.objectStore(storeName).clear());
    }

    for (const trip of payload.stores.trips) {
      await requestToPromise(transaction.objectStore(STORE_NAMES.trips).add(trip));
    }

    for (const memberProfile of payload.stores.memberProfiles) {
      await requestToPromise(transaction.objectStore(STORE_NAMES.memberProfiles).add(memberProfile));
    }

    for (const party of payload.stores.parties) {
      await requestToPromise(transaction.objectStore(STORE_NAMES.parties).add(party));
    }

    for (const deposit of payload.stores.deposits) {
      await requestToPromise(transaction.objectStore(STORE_NAMES.deposits).add(deposit));
    }

    for (const expense of payload.stores.expenses) {
      await requestToPromise(transaction.objectStore(STORE_NAMES.expenses).add(expense));
    }

    for (const participant of payload.stores.expenseParticipants) {
      await requestToPromise(transaction.objectStore(STORE_NAMES.expenseParticipants).add(participant));
    }

    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}

export async function importBackupPayload(payload: LedgerBackupPayload): Promise<void> {
  await replaceMainStoresFromBackup(payload);
}

export async function restoreFromAutoSnapshot(snapshotId: string): Promise<BackupSnapshotRecord> {
  const snapshot = await getById<BackupSnapshotRecord>(STORE_NAMES.backupSnapshots, snapshotId);
  if (!snapshot) {
    throw new Error('没找到这份本机恢复点');
  }

  await replaceMainStoresFromBackup(snapshot.payload);
  return snapshot;
}
