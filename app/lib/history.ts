export type SavedGeneration = {
  id: string;
  prompt: string;
  css: string;
  createdAt: number;
};

export const HISTORY_STORAGE_KEY = "css-ai-generator-history";
export const HISTORY_UPDATE_EVENT = "css-ai-generator-history-update";
export const MAX_HISTORY_ITEMS = 8;

let cachedHistorySnapshot: string | null = null;

function isSavedGeneration(value: unknown): value is SavedGeneration {
  if (!value || typeof value !== "object") return false;

  const item = value as Partial<SavedGeneration>;

  return (
    typeof item.id === "string" &&
    typeof item.prompt === "string" &&
    item.prompt.length <= 1000 &&
    typeof item.css === "string" &&
    item.css.length <= 20000 &&
    typeof item.createdAt === "number" &&
    Number.isFinite(new Date(item.createdAt).getTime())
  );
}

export function getHistorySnapshot() {
  if (typeof window === "undefined") return "[]";
  if (cachedHistorySnapshot !== null) return cachedHistorySnapshot;

  let snapshot = "[]";
  try {
    snapshot = window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]";
  } catch {
    // Mantem o historico em memoria quando o armazenamento do navegador nao esta disponivel.
  }

  cachedHistorySnapshot = snapshot;
  return snapshot;
}

export function getServerHistorySnapshot() {
  return "[]";
}

export function subscribeToHistory(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== HISTORY_STORAGE_KEY && event.key !== null) return;
    cachedHistorySnapshot = event.newValue ?? "[]";
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(HISTORY_UPDATE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HISTORY_UPDATE_EVENT, onStoreChange);
  };
}

export function saveHistory(history: SavedGeneration[]) {
  cachedHistorySnapshot = JSON.stringify(history);

  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, cachedHistorySnapshot);
  } catch {
    // Mantem o historico em memoria quando o armazenamento do navegador nao esta disponivel.
  }

  window.dispatchEvent(new Event(HISTORY_UPDATE_EVENT));
}

export function parseHistorySnapshot(snapshot: string) {
  try {
    const storedHistory = JSON.parse(snapshot) as unknown;
    return Array.isArray(storedHistory)
      ? storedHistory.filter(isSavedGeneration).slice(0, MAX_HISTORY_ITEMS)
      : [];
  } catch {
    return [];
  }
}
