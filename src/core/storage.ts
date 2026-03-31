const DB_NAME = "moanete";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

export interface ScreenCapture {
  timestamp: number;
  /** Base64-encoded PNG (no data: prefix) */
  image: string;
  /** LLM-generated description of the screen content */
  description: string;
}

export interface StoredSession {
  id: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  transcript: TranscriptLine[];
  insights: Record<string, string[]>;
  summary: string;
  categories: string[];
  screenCaptures?: ScreenCapture[];
}

export interface TranscriptLine {
  source: "mic" | "tab";
  text: string;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session: StoredSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSessions(): Promise<StoredSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index("startedAt");
    const req = idx.openCursor(null, "prev"); // newest first
    const results: StoredSession[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value as StoredSession);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSession(id: string): Promise<StoredSession | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as StoredSession | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function exportSessionMarkdown(s: StoredSession): string {
  const date = new Date(s.startedAt).toLocaleString();
  const dur = formatDuration(s.duration);
  const lines: string[] = [`# Session — ${date} (${dur})`, ""];

  if (s.summary) {
    lines.push("## Summary", "", s.summary, "");
  }

  lines.push("## Transcript", "");
  for (const line of s.transcript) {
    const label = line.source === "mic" ? "You" : "Them";
    lines.push(`**${label}:** ${line.text}`);
  }

  lines.push("", "## Insights", "");
  for (const cat of s.categories) {
    const key = cat
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const items = s.insights[key] || [];
    lines.push(`### ${cat}`);
    if (items.length === 0) {
      lines.push("_Nothing_");
    } else {
      for (const item of items) {
        lines.push(`- ${item}`);
      }
    }
    lines.push("");
  }

  if (s.screenCaptures && s.screenCaptures.length > 0) {
    lines.push("## Screen Captures", "");
    for (const cap of s.screenCaptures) {
      const time = new Date(cap.timestamp).toLocaleTimeString();
      lines.push(`### ${time}`, "", cap.description, "");
    }
  }

  return lines.join("\n");
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
