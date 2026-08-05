import type { StateStorage } from "zustand/middleware";

const DB_NAME = "word-brawl";
const DB_VERSION = 1;
const STORE_NAME = "zustand";

let databasePromise: Promise<IDBDatabase> | null = null;
const legacyModeNames = new Set<string>();

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB 打开失败"));
    request.onblocked = () => reject(new Error("IndexedDB 升级被阻塞"));
  });
  databasePromise = pending;
  void pending.catch(() => {
    if (databasePromise === pending) {
      databasePromise = null;
    }
  });
  return pending;
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB 请求失败"));
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB 事务失败"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB 事务已中止"));
  });

const readValue = async (name: string): Promise<string | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const completed = transactionComplete(transaction);
  const value = await requestResult(
    transaction.objectStore(STORE_NAME).get(name) as IDBRequest<
      string | undefined
    >,
  );
  await completed;
  return typeof value === "string" ? value : null;
};

const writeValue = async (name: string, value: string): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  transaction.objectStore(STORE_NAME).put(value, name);
  await completed;
};

const removeValue = async (name: string): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  transaction.objectStore(STORE_NAME).delete(name);
  await completed;
};

const getLegacyValue = (name: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
};

const writeLegacyValue = (name: string, value: string): void => {
  if (typeof window === "undefined") {
    throw new Error("当前环境不支持浏览器存储");
  }
  window.localStorage.setItem(name, value);
};

const isIndexedDbUnavailable = (error: unknown): boolean =>
  typeof indexedDB === "undefined" ||
  (error instanceof DOMException &&
    (error.name === "SecurityError" || error.name === "NotSupportedError"));

export const indexedDbStateStorage: StateStorage = {
  getItem: async (name) => {
    let stored: string | null;
    try {
      stored = await readValue(name);
    } catch (error) {
      if (!isIndexedDbUnavailable(error)) {
        throw error;
      }
      legacyModeNames.add(name);
      return getLegacyValue(name);
    }
    if (stored !== null) {
      legacyModeNames.delete(name);
      return stored;
    }

    const legacy = getLegacyValue(name);
    if (legacy === null) {
      legacyModeNames.delete(name);
      return null;
    }
    try {
      await writeValue(name, legacy);
    } catch {
      // 迁移失败时继续使用旧存档，不能阻塞应用 hydration。
      legacyModeNames.add(name);
      return legacy;
    }
    legacyModeNames.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      // IndexedDB 已完成迁移，旧副本清理失败不影响读取。
    }
    return legacy;
  },
  setItem: async (name, value) => {
    if (legacyModeNames.has(name)) {
      writeLegacyValue(name, value);
      return;
    }
    await writeValue(name, value);
  },
  removeItem: async (name) => {
    if (!legacyModeNames.has(name)) {
      await removeValue(name);
    }
    legacyModeNames.delete(name);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(name);
      } catch {
        // 忽略旧存储清理失败。
      }
    }
  },
};
