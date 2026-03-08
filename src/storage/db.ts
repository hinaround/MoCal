const DB_NAME = 'family-trip-ledger';
const DB_VERSION = 3;

export const STORE_NAMES = {
  trips: 'trips',
  memberProfiles: 'memberProfiles',
  parties: 'parties',
  deposits: 'deposits',
  expenses: 'expenses',
  expenseParticipants: 'expenseParticipants',
  backupSnapshots: 'backupSnapshots',
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

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

export async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAMES.trips)) {
        const store = database.createObjectStore(STORE_NAMES.trips, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.memberProfiles)) {
        const store = database.createObjectStore(STORE_NAMES.memberProfiles, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.parties)) {
        const store = database.createObjectStore(STORE_NAMES.parties, { keyPath: 'id' });
        store.createIndex('tripId', 'tripId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.deposits)) {
        const store = database.createObjectStore(STORE_NAMES.deposits, { keyPath: 'id' });
        store.createIndex('tripId', 'tripId', { unique: false });
        store.createIndex('partyId', 'partyId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.expenses)) {
        const store = database.createObjectStore(STORE_NAMES.expenses, { keyPath: 'id' });
        store.createIndex('tripId', 'tripId', { unique: false });
        store.createIndex('paidAt', 'paidAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.expenseParticipants)) {
        const store = database.createObjectStore(STORE_NAMES.expenseParticipants, { keyPath: 'id' });
        store.createIndex('expenseId', 'expenseId', { unique: false });
        store.createIndex('partyId', 'partyId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.backupSnapshots)) {
        const store = database.createObjectStore(STORE_NAMES.backupSnapshots, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('kind', 'kind', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开本地数据失败'));
  });
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const request = transaction.objectStore(storeName).getAll();
  const [result] = await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  database.close();
  return result as T[];
}

export async function getById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const request = transaction.objectStore(storeName).get(id);
  const [result] = await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  database.close();
  return result as T | undefined;
}

export async function getAllByIndex<T>(
  storeName: StoreName,
  indexName: string,
  query: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const request = transaction.objectStore(storeName).index(indexName).getAll(query);
  const [result] = await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  database.close();
  return result as T[];
}

export async function putRecord<T>(storeName: StoreName, value: T): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const request = transaction.objectStore(storeName).put(value);
  await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  database.close();
  return value;
}

export async function addRecord<T>(storeName: StoreName, value: T): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const request = transaction.objectStore(storeName).add(value);
  await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  database.close();
  return value;
}

export async function deleteRecord(storeName: StoreName, id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(id);
  await transactionToPromise(transaction);
  database.close();
}

export async function addExpenseBundle<TExpense, TParticipant extends { id: string }>(params: {
  expense: TExpense;
  participants: TParticipant[];
}): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORE_NAMES.expenses, STORE_NAMES.expenseParticipants],
    'readwrite',
  );

  transaction.objectStore(STORE_NAMES.expenses).add(params.expense);
  const participantStore = transaction.objectStore(STORE_NAMES.expenseParticipants);

  for (const participant of params.participants) {
    participantStore.add(participant);
  }

  await transactionToPromise(transaction);
  database.close();
}

export async function replaceExpenseBundle<TExpense extends { id: string }, TParticipant extends { id: string }>(params: {
  expense: TExpense;
  participants: TParticipant[];
}): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORE_NAMES.expenses, STORE_NAMES.expenseParticipants],
    'readwrite',
  );

  transaction.objectStore(STORE_NAMES.expenses).put(params.expense);

  const participantStore = transaction.objectStore(STORE_NAMES.expenseParticipants);
  const index = participantStore.index('expenseId');
  const keysRequest = index.getAllKeys(params.expense.id);

  keysRequest.onsuccess = () => {
    const keys = keysRequest.result as IDBValidKey[];

    for (const key of keys) {
      participantStore.delete(key);
    }

    for (const participant of params.participants) {
      participantStore.put(participant);
    }
  };

  keysRequest.onerror = () => {
    transaction.abort();
  };

  await transactionToPromise(transaction);
  database.close();
}
