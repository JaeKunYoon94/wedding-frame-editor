import { openDB, type IDBPDatabase } from 'idb';

/**
 * 기획안 v2 §1·§8: 완전 클라이언트 사이드.
 * - originals: 추출용 원본 Blob (키 = originalKey)
 * - project: 스토어 직렬화 상태 (자동 저장/복구)
 */
const DB_NAME = 'wedding-frame-editor';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('originals')) db.createObjectStore('originals');
        if (!db.objectStoreNames.contains('project')) db.createObjectStore('project');
      },
    });
  }
  return dbPromise;
}

export async function saveOriginal(key: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('originals', blob, key);
}

export async function loadOriginal(key: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get('originals', key);
}

export async function deleteOriginal(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('originals', key);
}

export async function saveProjectState(state: unknown): Promise<void> {
  const db = await getDB();
  await db.put('project', JSON.parse(JSON.stringify(state)), 'current');
}

export async function loadProjectState<T>(): Promise<T | undefined> {
  const db = await getDB();
  return db.get('project', 'current');
}

export async function clearProject(): Promise<void> {
  const db = await getDB();
  await db.clear('project');
  await db.clear('originals');
}
