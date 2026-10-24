import { getIdToken } from "./firebase-client.ts";
export type Rule = {
  id: string;
  title: string;
  category: string;
  text: string;
};
export type Classification = {
  query?: string;
  recognized: boolean;
  item: string;
  category: string;
  bin: string;
  dustbin: string;
  color: string;
  rule?: Rule;
  tip?: string | null;
  material?: string;
  certain?: boolean;
  quantity?: number;
};
export type CatalogItem = {
  name: string;
  material: string;
  ruleId: string;
  family: string;
};
export type Analysis = {
  items: {
    item: string;
    label?: string;
    quantity?: number;
    certain?: boolean;
    ruleId?: string;
    condition?: string;
    material?: string;
  }[];
  tagObjects?: { type: string; box_2d: number[]; certain?: boolean }[];
  overview?: string;
  incomplete?: boolean;
};
export type Bin = {
  id: string;
  title: string;
  short: string;
  destination: string;
  color: string;
  pale: string;
  rules: string[];
  example: string;
  detail: string;
};
// Category mappings and examples are supplied in the user's backend contract.
export const BINS: Bin[] = [
  {
    id: "wet",
    title: "Wet waste",
    short: "Wet",
    destination: "Green bin",
    color: "#22c55e",
    pale: "#edf7cf",
    rules: ["R5"],
    example: "Banana peel",
    detail: "Food scraps, peels & tea leaves",
  },
  {
    id: "dry",
    title: "Dry recycling",
    short: "Dry",
    destination: "Blue bin",
    color: "#3b82f6",
    pale: "#e6edff",
    rules: ["R1", "R2", "R3"],
    example: "Plastic bottle",
    detail: "Clean paper, plastic & metal",
  },
  {
    id: "general",
    title: "General waste",
    short: "General",
    destination: "Black / grey bin",
    color: "#eab308",
    pale: "#fff1cd",
    rules: ["R6", "R7"],
    example: "Used tissue",
    detail: "Soiled paper & mixed packaging",
  },
  {
    id: "special",
    title: "Special collection",
    short: "Special",
    destination: "Red bin / staffed desk",
    color: "#ef4444",
    pale: "#ffe6df",
    rules: ["R8"],
    example: "Battery",
    detail: "Batteries, cables & electronics",
  },
  {
    id: "glass",
    title: "Glass",
    short: "Glass",
    destination: "Glass point",
    color: "#a78bfa",
    pale: "#eee6ff",
    rules: ["R4"],
    example: "Glass jar",
    detail: "Clean glass bottles & jars",
  },
];
export function binForRule(id?: string) {
  return BINS.find((b) => b.rules.includes(id || ""));
}
export function safeColor(color?: string) {
  return BINS.find((b) => b.color === color)?.color || "#94a3b8";
}
async function request<T>(
  endpoint: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    "x-api-client": "wastewise",
  };
  // The server proxy only answers signed-in users (Firebase ID token).
  const token = await getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/wastewise/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      (data as { error?: string })?.error ||
        `Request failed (${response.status}).`,
    );
  return data as T;
}
export const api = {
  config: () => request<{ provider: string; configured: boolean }>("config"),
  rules: () =>
    request<{ campus: string; rules: Rule[]; version: string }>("rules"),
  catalog: (query = "", signal?: AbortSignal) =>
    request<{ total: number; items: CatalogItem[] }>(
      `catalog${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      undefined,
      signal,
    ),
  classify: async (text: string, signal?: AbortSignal) => {
    const r = await request<Classification>("classify", { text }, signal);
    if (typeof r.recognized !== "boolean" || (r.recognized && !r.item))
      throw new Error("The backend returned an invalid classification.");
    return r;
  },
  analyze: async (body: unknown, signal?: AbortSignal) => {
    const r = await request<Analysis>("analyze", body, signal);
    if (!Array.isArray(r.items))
      throw new Error(
        "The backend returned an invalid analysis. Please retry.",
      );
    return r;
  },
};
// ---------- Rewards & deposit sessions (backend /api/rewards/*, /api/dlc/*) ----------
// Field names vary between backend versions, so the screens read them defensively.
export type RewardAccount = Record<string, unknown> & { points?: number };
export type RewardTransaction = Record<string, unknown>;
export type DisposalBin = { id: string; name?: string; category?: string } & Record<string, unknown>;
export type DisposalSession = Record<string, unknown> & { id?: string; status?: string };

export const rewardsApi = {
  me: (signal?: AbortSignal) => request<RewardAccount>("rewards/me", undefined, signal),
  transactions: async (signal?: AbortSignal) => {
    const r = await request<unknown>("rewards/transactions", undefined, signal);
    const list = Array.isArray(r) ? r : (r as { transactions?: unknown[]; items?: unknown[] })?.transactions ?? (r as { items?: unknown[] })?.items;
    return (Array.isArray(list) ? list : []) as RewardTransaction[];
  },
  bins: async (signal?: AbortSignal) => {
    const r = await request<{ bins?: DisposalBin[] } | DisposalBin[]>("dlc/bins", undefined, signal);
    return (Array.isArray(r) ? r : r?.bins ?? []).filter((b) => b && typeof b.id === "string");
  },
  startDisposal: async (binId: string) => {
    const r = await request<DisposalSession & { session?: DisposalSession }>("dlc/sessions", { binId });
    return (r.session && typeof r.session === "object" ? r.session : r) as DisposalSession;
  },
  session: async (id: string, signal?: AbortSignal) => {
    const r = await request<DisposalSession & { session?: DisposalSession }>(`dlc/sessions/${encodeURIComponent(id)}`, undefined, signal);
    return (r.session && typeof r.session === "object" ? r.session : r) as DisposalSession;
  },
};

export function resultFromItem(
  item: Analysis["items"][number],
  rules: Rule[],
): Classification {
  const bin = binForRule(item.ruleId),
    rule = rules.find((r) => r.id === item.ruleId);
  return {
    recognized: !!bin,
    item: item.label || item.item,
    category: bin?.title || "Needs review",
    bin: bin?.destination || "Check the campus guide",
    dustbin: bin
      ? `${bin.title} · ${bin.destination}`
      : "No verified bin returned",
    color: bin?.color || "#94a3b8",
    rule,
    certain: item.certain,
    quantity: item.quantity,
    material: item.material,
  };
}
