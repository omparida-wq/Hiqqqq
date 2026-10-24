// Server-side validation for POST /api/history. Only known, bounded text fields are forwarded,
// so images, tokens or whole model responses can't be sent to the backend's history store.
export const HISTORY_SOURCES = ["photo", "text", "live", "dlc"] as const;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const TEXT_FIELDS = ["material", "category", "bin", "ruleId", "guideVersion", "preparation", "quotation", "condition", "notes", "scanId"] as const;
export const MAX_HISTORY_BODY = 16 * 1024;

export type HistoryEntryInput = {
  id: string;
  item: string;
  source?: (typeof HISTORY_SOURCES)[number];
  quantity?: number;
} & Partial<Record<(typeof TEXT_FIELDS)[number], string>>;

function cleanEntry(raw: unknown): HistoryEntryInput | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Each entry must be an object.";
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id)) return "Entry id must be 1–100 letters, numbers, _ or -.";
  if (typeof r.item !== "string" || !r.item.trim() || r.item.length > 160) return "Entry item must be 1–160 characters.";
  const out: HistoryEntryInput = { id: r.id, item: r.item.trim() };
  if (r.source !== undefined) {
    if (!HISTORY_SOURCES.includes(r.source as never)) return "Entry source must be photo, text, live or dlc.";
    out.source = r.source as HistoryEntryInput["source"];
  }
  if (r.quantity !== undefined) {
    if (!Number.isInteger(r.quantity) || (r.quantity as number) < 1 || (r.quantity as number) > 100) return "Entry quantity must be a whole number from 1 to 100.";
    out.quantity = r.quantity as number;
  }
  for (const f of TEXT_FIELDS) {
    const v = r[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" || v.length > 2000) return `Entry ${f} must be text of at most 2,000 characters.`;
    out[f] = v;
  }
  return out;
}

/** Returns the cleaned request body, or an error message. */
export function validateHistoryBody(data: unknown): { body: { entries: HistoryEntryInput[] } | HistoryEntryInput } | { error: string } {
  if (data && typeof data === "object" && !Array.isArray(data) && "entries" in data) {
    const list = (data as { entries: unknown }).entries;
    if (!Array.isArray(list) || list.length < 1 || list.length > 30) return { error: "Send 1–30 history entries at a time." };
    const entries: HistoryEntryInput[] = [];
    for (const raw of list) {
      const e = cleanEntry(raw);
      if (typeof e === "string") return { error: e };
      entries.push(e);
    }
    return { body: { entries } };
  }
  const e = cleanEntry(data);
  return typeof e === "string" ? { error: e } : { body: e };
}
