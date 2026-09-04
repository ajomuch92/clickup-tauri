import { reactive, ref } from "vue";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { json, run } from "./cli";

// ponytail: `clickup chat list` crashes on the API's numeric created_at (CLI bug), so everything goes through the raw `api --v3` endpoints.
export type Channel = { id: string; name: string | null; type: string; latest_comment_at?: number; label?: string };
export type Msg = { id: string; user_id: string; content: string; date: number; replies_count?: number };

export const session = reactive({ ws: "", me: "" });
export const channels = ref<Channel[]>([]);
export const members = reactive<Record<string, string>>({});
export const unread = reactive<Record<string, number>>({}); // channel id -> new messages since last opened
export const who = (id: string) => members[String(id)] ?? id;
const v3 = (path: string) => `workspaces/${session.ws}/${path}`;

export async function loadSession() {
  if (session.ws) return;
  const st = (await run(["auth", "status"])).stdout;
  session.ws = st.match(/Workspace:\s+(\S+)/)?.[1] ?? "";
  session.me = st.match(/User ID:\s+(\S+)/)?.[1] ?? "";
  if (!session.ws) throw new Error("No hay workspace configurado. Ejecuta `clickup auth login`.");
  try {
    for (const m of await json<any[]>(["member", "list"])) members[String(m.id)] = m.username;
  } catch { /* names are cosmetic */ }
}

// DMs come with name=null: label them with the other participants.
async function label(ch: Channel) {
  if (ch.name) return (ch.label = ch.name);
  const r = await json<{ data: { id: string; name: string }[] }>(["api", "--v3", v3(`chat/channels/${ch.id}/members`)]);
  for (const m of r.data ?? []) members[m.id] ??= m.name;
  ch.label = (r.data ?? []).filter((m) => m.id !== session.me).map((m) => m.name).join(", ") || ch.id;
}

export async function loadChannels() {
  await loadSession();
  const fresh = (await json<{ data: Channel[] }>(["api", "--v3", v3("chat/channels")])).data ?? [];
  const known = new Map(channels.value.map((c) => [c.id, c.label]));
  await Promise.all(fresh.map(async (c) => (c.label = known.get(c.id)) || label(c)));
  channels.value = fresh;
  return fresh;
}

export async function fetchMessages(channelId: string) {
  const r = await json<{ data: Msg[] }>(["api", "--v3", v3(`chat/channels/${channelId}/messages`)]);
  return (r.data ?? []).sort((a, b) => a.date - b.date);
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
      const list = await loadChannels();
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
