import { useEffect, useState } from "react";
import { sb } from "./supabase";

// A-040 offline write queue, shared with the current app: same IndexedDB
// database, store and item shape ({table, payload, opts, attempts, queued_at}),
// so a save queued in either version is sent by whichever is open next.
// Only natural-key upserts (attendance) and plain inserts are queued.

const DB_NAME = "coachToolsOffline";
const STORE = "pendingWrites";
const MAX_ATTEMPTS = 5;
const EVENT = "coach-offline-queue";

interface QueuedWrite {
  id?: number;
  table: string;
  payload: Record<string, unknown>;
  opts: { onConflict?: string } | null;
  attempts: number;
  queued_at: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(db => new Promise(resolve => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => resolve(undefined);
  }));
}

const notify = () => dispatchEvent(new Event(EVENT));

/** A failure worth retrying later: no connection, not a server rejection. */
export function looksOffline(error: { message?: string } | null): boolean {
  return !navigator.onLine || (!!error && /fetch|network|load failed/i.test(error.message || ""));
}

export async function queueWrite(table: string, payload: Record<string, unknown>, opts?: { onConflict?: string }) {
  await tx("readwrite", s => s.add({ table, payload, opts: opts || null, attempts: 0, queued_at: new Date().toISOString() }));
  notify();
}

export async function pendingCount(): Promise<number> {
  try { return (await tx<number>("readonly", s => s.count())) ?? 0; } catch { return 0; }
}

let busy = false;
export async function flushQueue() {
  if (busy || !navigator.onLine) return;
  busy = true;
  try {
    const items = (await tx<QueuedWrite[]>("readonly", s => s.getAll())) ?? [];
    for (const item of items) {
      const table = (sb.from.bind(sb) as unknown as (t: string) => ReturnType<typeof sb.from>)(item.table);
      const { error } = item.opts?.onConflict
        ? await table.upsert(item.payload as never, { onConflict: item.opts.onConflict })
        : await table.insert(item.payload as never);
      if (error && looksOffline(error)) break; // still offline: keep this and the rest
      if (error && item.attempts + 1 < MAX_ATTEMPTS) {
        console.error("Queued write rejected, will retry:", item, error);
        await tx("readwrite", s => s.put({ ...item, attempts: item.attempts + 1 }));
        continue;
      }
      if (error) console.error("Queued write dropped after repeated rejection:", item, error);
      await tx("readwrite", s => s.delete(item.id!));
    }
  } catch (e) {
    console.error("flushQueue:", e);
  } finally {
    busy = false;
    notify();
  }
}

/** Number of saves waiting to sync; flushes on reconnect, every 25s and on mount. */
export function usePendingWrites(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => { pendingCount().then(setN); };
    const flush = () => { flushQueue(); };
    addEventListener(EVENT, refresh);
    addEventListener("online", flush);
    const timer = setInterval(flush, 25000);
    flush();
    refresh();
    return () => {
      removeEventListener(EVENT, refresh);
      removeEventListener("online", flush);
      clearInterval(timer);
    };
  }, []);
  return n;
}
