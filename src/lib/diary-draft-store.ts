/**
 * On-phone diary draft persistence (localStorage — drafts are a few KB of
 * JSON and transient; the photo offline-queue stays IndexedDB). Every
 * access is try/caught: storage can be unavailable or evicted, and the
 * ritual must render regardless.
 */

export interface DiaryDraftRecord {
  payload: unknown;
  enteredAt: string; // ISO — the client-claimed time, preserved across offline replays
  updatedAt: string;
  /** Set when submit was tapped offline; replayed on reconnect. */
  pendingSubmit?: boolean;
}

const PREFIX = "sitefile.diary.";

function key(projectId: string, localDate: string) {
  return `${PREFIX}${projectId}.${localDate}`;
}

export function loadDiaryDraft(
  projectId: string,
  localDate: string
): DiaryDraftRecord | null {
  try {
    const raw = localStorage.getItem(key(projectId, localDate));
    return raw ? (JSON.parse(raw) as DiaryDraftRecord) : null;
  } catch {
    return null;
  }
}

export function saveDiaryDraft(
  projectId: string,
  localDate: string,
  record: Omit<DiaryDraftRecord, "updatedAt">
) {
  try {
    localStorage.setItem(
      key(projectId, localDate),
      JSON.stringify({ ...record, updatedAt: new Date().toISOString() })
    );
  } catch {
    // storage full/blocked — the in-memory state still holds the draft
  }
}

export function clearDiaryDraft(projectId: string, localDate: string) {
  try {
    localStorage.removeItem(key(projectId, localDate));
  } catch {
    /* ignore */
  }
}

/** All drafts flagged pendingSubmit — replayed when signal returns. */
export function listPendingSubmits(): {
  projectId: string;
  localDate: string;
  record: DiaryDraftRecord;
}[] {
  const out: { projectId: string; localDate: string; record: DiaryDraftRecord }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const rest = k.slice(PREFIX.length);
      const dot = rest.lastIndexOf(".");
      if (dot < 0) continue;
      const projectId = rest.slice(0, dot);
      const localDate = rest.slice(dot + 1);
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const record = JSON.parse(raw) as DiaryDraftRecord;
      if (record.pendingSubmit) out.push({ projectId, localDate, record });
    }
  } catch {
    /* ignore */
  }
  return out;
}
