import { openDB, type IDBPDatabase } from 'idb';

/**
 * 기획안 v2 §1·§8: 완전 클라이언트 사이드. IndexedDB `originals`에 추출용 원본 Blob을 둔다(키 = originalKey).
 * 작업 상태 복구 기능이 없으므로 원본은 한 세션(에디터 1회 진입) 동안만 의미가 있다.
 */
const DB_NAME = 'wedding-frame-editor';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('originals')) db.createObjectStore('originals');
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

/**
 * 지난 세션에서 남은 원본 사진을 지운다. 복구 기능이 없어 다시 쓰이지 않는데도
 * 기기에 사진이 계속 쌓이는 것(저장 공간·개인정보)을 막기 위해 에디터 진입 시 호출한다.
 * ponytail: 탭 여러 개를 동시에 열면 다른 탭의 원본도 지워져 그 탭의 추출은 편집용 축소본으로 대체된다.
 * 탭 간 공존이 필요해지면 세션 id 접두어 키로 바꿔 자기 세션 것만 지운다.
 */
export async function clearOriginals(): Promise<void> {
  const db = await getDB();
  await db.clear('originals');
}
