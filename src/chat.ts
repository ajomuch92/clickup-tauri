import { reactive, ref } from "vue";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { json, run } from "./cli";

// ponytail: `clickup chat list` crashes on the API's numeric created_at (CLI bug), so everything goes through the raw `api --v3` endpoints.
export type Channel = { id: string; name: string | null; type: string; latest_comment_at?: number; label?: string; memberIds?: string[] };
export type User = { id: string; username: string; initials?: string; color?: string | null; profilePicture?: string | null; last_active?: string };
export type Msg = { id: string; user_id: string; content: string; date: number; replies_count?: number };

export const session = reactive({ ws: "", me: "" });
export const channels = ref<Channel[]>([]);
export const members = reactive<Record<string, string>>({});
export const users = reactive<Record<string, User>>({});
export const now = ref(Date.now());
// ponytail: ClickUp has no public presence API; "online" = UI activity in the last 10 min, refreshed by the watcher tick.
export const isOnline = (id: string | number) => now.value - Number(users[String(id)]?.last_active ?? 0) < 10 * 60_000;
export const unread = reactive<Record<string, number>>({}); // channel id -> new messages since last opened
export const who = (id: string) => members[String(id)] ?? id;
const v3 = (path: string) => `workspaces/${session.ws}/${path}`;

export async function loadSession() {
  if (session.ws) return;
  const st = (await run(["auth", "status"])).stdout;
  session.ws = st.match(/Workspace:\s+(\S+)/)?.[1] ?? "";
  session.me = st.match(/User ID:\s+(\S+)/)?.[1] ?? "";
  if (!session.ws) throw new Error("No hay workspace configurado. Ejecuta `clickup auth login`.");
  await loadUsers().catch(() => {}); // names, avatars and presence are cosmetic
}

export async function loadUsers() {
  const r = await json<{ teams: { id: string; members: { user: any }[] }[] }>(["api", "team"]);
  const team = r.teams.find((t) => t.id === session.ws) ?? r.teams[0];
  for (const { user } of team?.members ?? []) {
    users[String(user.id)] = { ...user, id: String(user.id) };
    members[String(user.id)] = user.username;
  }
  now.value = Date.now();
}

// DMs come with name=null: label them with the other participants.
async function label(ch: Channel) {
  if (ch.name) return (ch.label = ch.name);
  const r = await json<{ data: { id: string; name: string }[] }>(["api", "--v3", v3(`chat/channels/${ch.id}/members`)]);
  for (const m of r.data ?? []) members[m.id] ??= m.name;
  ch.memberIds = (r.data ?? []).map((m) => m.id);
  ch.label = (r.data ?? []).filter((m) => m.id !== session.me).map((m) => m.name).join(", ") || ch.id;
}

let inflight: Promise<Channel[]> | null = null;
export function loadChannels() {
  return (inflight ??= loadChannelsNow().finally(() => (inflight = null))); // callers racing at startup share one round of requests
}
async function loadChannelsNow() {
  await loadSession();
  const fresh = (await json<{ data: Channel[] }>(["api", "--v3", v3("chat/channels")])).data ?? [];
  const known = new Map(channels.value.map((c) => [c.id, c]));
  await Promise.all(fresh.map(async (c) => {
    const k = known.get(c.id);
    if (k?.label) { c.label = k.label; c.memberIds = k.memberIds; } else await label(c);
  }));
  channels.value = fresh;
  return fresh;
}

export async function fetchMessages(channelId: string) {
  const r = await json<{ data: Msg[] }>(["api", "--v3", v3(`chat/channels/${channelId}/messages`)]);
  return (r.data ?? []).sort((a, b) => a.date - b.date);
}

export async function fetchReplies(msgId: string) {
  return ((await json<{ data: Msg[] }>(["api", "--v3", v3(`chat/messages/${msgId}/replies`)])).data ?? []).sort((a, b) => a.date - b.date);
}

export type Reaction = { reaction: string; user_id: string | number };
export async function fetchReactions(msgId: string) {
  return (await json<{ data: Reaction[] }>(["api", "--v3", v3(`chat/messages/${msgId}/reactions`)])).data ?? [];
}

export async function post(path: string, fields: Record<string, string>, method = "POST") {
  const o = await run(["api", "-X", method, "--v3", v3(path), ...Object.entries(fields).flatMap(([k, v]) => ["--raw-field", `${k}=${v}`])]);
  if (o.code) throw new Error(o.stderr.trim() || o.stdout.trim());
}

/** Poll channel activity; notify on new messages from others. Returns a stop function. */
export function watch(onNew: (ch: Channel, msg: Msg) => void, everyMs = 45_000) {
  const seen: Record<string, number> = {};
  let primed = false;
  const tick = async () => {
    try {
      const [list] = await Promise.all([loadChannels(), loadUsers().catch(() => {})]);
      const changed = primed ? list.filter((c) => (c.latest_comment_at ?? 0) > (seen[c.id] ?? 0)) : [];
      for (const c of list) seen[c.id] = c.latest_comment_at ?? 0;
      primed = true;
      for (const c of changed) {
        const last = (await fetchMessages(c.id)).at(-1);
        if (!last || last.user_id === session.me) continue;
        unread[c.id] = (unread[c.id] ?? 0) + 1;
        onNew(c, last);
        if (await isPermissionGranted().catch(() => false) || (await requestPermission().catch(() => "denied")) === "granted")
          sendNotification({ title: `${who(last.user_id)} · ${c.label}`, body: last.content.slice(0, 200) });
      }
    } catch { /* offline or logged out: retry next tick */ }
  };
  tick();
  const id = window.setInterval(tick, everyMs); // ponytail: polling; the CLI has no push/websocket surface
  return () => clearInterval(id);
}
