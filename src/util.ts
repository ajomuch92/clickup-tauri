export const fmtDate = (ms?: number | string | null) => (ms ? new Date(Number(ms)).toLocaleDateString() : "");
export const fmtDateTime = (ms?: number | string | null) => (ms ? new Date(Number(ms)).toLocaleString() : "");
export const toISO = (ms?: number | string | null) => (ms ? new Date(Number(ms)).toISOString().slice(0, 10) : "");
export const PRIORITIES: Record<string, string> = { "1": "Urgente", "2": "Alta", "3": "Normal", "4": "Baja" };
export const priorityNum = (p?: { priority?: string } | null) =>
  ({ urgent: "1", high: "2", normal: "3", low: "4" } as Record<string, string>)[p?.priority ?? ""] ?? "";
