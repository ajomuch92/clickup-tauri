<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { json, run } from "../cli";
import { fmtDateTime } from "../util";
import "emoji-picker-element";
// en/cldr shortcodes ("thumbs_up", "saluting_face") are exactly what ClickUp stores; the es set is localized and would not match.
import emojiData from "emoji-picker-element-data/en/cldr/data.json?url";

// ponytail: `clickup chat list` crashes on the API's numeric created_at (CLI bug), so everything goes through the raw `api --v3` endpoints.
type Channel = { id: string; name: string | null; type: string; latest_comment_at?: number; label?: string };
type Msg = { id: string; user_id: string; content: string; date: number; replies_count?: number };

const ws = ref("");
const me = ref("");
const channels = ref<Channel[]>([]);
const active = ref<Channel | null>(null);
const msgs = ref<Msg[]>([]);
const members = ref<Record<string, string>>({});
const text = ref("");
const replyTo = ref<Msg | null>(null);
const error = ref("");
const busy = ref(false);
const box = ref<HTMLElement>();
const pickFor = ref<Msg | null>(null);
const reacted = ref<Record<string, string[]>>({}); // local echo of my reactions this session; the list endpoint does not inline them
let timer: number | undefined;

const v3 = (path: string) => `workspaces/${ws.value}/${path}`;
const who = (id: string) => members.value[String(id)] ?? id;
const sorted = computed(() =>
  [...channels.value].sort((a, b) => (a.type === "CHANNEL" ? 0 : 1) - (b.type === "CHANNEL" ? 0 : 1) || (b.latest_comment_at ?? 0) - (a.latest_comment_at ?? 0)),
);

async function guard<T>(fn: () => Promise<T>) {
  error.value = "";
  try { return await fn(); } catch (e) { error.value = String(e); }
}
async function post(path: string, fields: Record<string, string>, method = "POST") {
  const o = await run(["api", "-X", method, "--v3", v3(path), ...Object.entries(fields).flatMap(([k, v]) => ["--raw-field", `${k}=${v}`])]);
  if (o.code) throw new Error(o.stderr.trim() || o.stdout.trim());
}

async function load() {
  if (!active.value) return;
  const r = await json<{ data: Msg[] }>(["api", "--v3", v3(`chat/channels/${active.value.id}/messages`)]);
  msgs.value = (r.data ?? []).sort((a, b) => a.date - b.date);
  await nextTick();
  box.value?.scrollTo(0, box.value.scrollHeight);
}

function open(ch: Channel) {
  active.value = ch;
  replyTo.value = null;
  guard(load);
}

async function send() {
  const t = text.value.trim();
  if (!active.value || !t) return;
  busy.value = true;
  await guard(async () => {
    await post(replyTo.value ? `chat/messages/${replyTo.value.id}/replies` : `chat/channels/${active.value!.id}/messages`, { type: "message", content: t });
    text.value = "";
    replyTo.value = null;
    await load();
  });
  busy.value = false;
}

async function react(e: CustomEvent) {
  const m = pickFor.value;
  pickFor.value = null;
  const code = e.detail.emoji.shortcodes?.[0];
  if (!m || !code) return;
  await guard(async () => {
    await post(`chat/messages/${m.id}/reactions`, { reaction: code });
    (reacted.value[m.id] ??= []).push(e.detail.unicode);
  });
}

async function del(m: Msg) {
  if (!confirm("¿Borrar el mensaje? No se puede deshacer.")) return;
  await guard(async () => { await post(`chat/messages/${m.id}`, {}, "DELETE"); await load(); });
}

// DMs come with name=null: label them with the other participants.
async function label(ch: Channel) {
  if (ch.name) return (ch.label = ch.name);
  const r = await json<{ data: { id: string; name: string }[] }>(["api", "--v3", v3(`chat/channels/${ch.id}/members`)]);
  for (const m of r.data ?? []) members.value[m.id] ??= m.name;
  ch.label = (r.data ?? []).filter((m) => m.id !== me.value).map((m) => m.name).join(", ") || ch.id;
}

onMounted(async () => {
  await guard(async () => {
    const st = (await run(["auth", "status"])).stdout;
    ws.value = st.match(/Workspace:\s+(\S+)/)?.[1] ?? "";
    me.value = st.match(/User ID:\s+(\S+)/)?.[1] ?? "";
    if (!ws.value) throw new Error("No hay workspace configurado. Ejecuta `clickup auth login`.");
    try {
      for (const m of await json<any[]>(["member", "list"])) members.value[String(m.id)] = m.username;
    } catch { /* names are cosmetic */ }
    channels.value = (await json<{ data: Channel[] }>(["api", "--v3", v3("chat/channels")])).data ?? [];
    await Promise.all(channels.value.map(label));
  });
  timer = window.setInterval(() => guard(load), 30_000); // ponytail: 30s poll; websockets if it ever feels slow
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="chat">
    <ul class="uk-nav uk-nav-default channels">
      <li class="uk-nav-header">Canales</li>
      <li v-for="c in sorted" :key="c.id" :class="{ 'uk-active': c.id === active?.id }">
        <a href="#" @click.prevent="open(c)">
          <span :uk-icon="c.type === 'CHANNEL' ? 'hashtag' : 'user'"></span> {{ c.label ?? c.id }}
        </a>
      </li>
      <li v-if="!channels.length && !error" class="uk-text-muted"><span uk-spinner="ratio: 0.6"></span></li>
    </ul>

    <div class="pane">
      <div v-if="error" class="uk-alert-danger uk-padding-small">{{ error }}</div>
      <p v-if="!active" class="uk-text-muted">Elige un canal.</p>
      <template v-else>
        <div class="uk-flex uk-flex-between uk-flex-middle">
          <h3 class="uk-margin-remove">{{ active.label }}</h3>
          <button class="uk-button uk-button-default uk-button-small" @click="guard(load)"><span uk-icon="refresh"></span></button>
        </div>
        <div ref="box" class="messages">
          <article v-for="m in msgs" :key="m.id" class="uk-comment uk-margin-small" :class="{ 'uk-comment-primary': m.user_id === me }">
            <header class="uk-comment-header uk-margin-remove">
              <b>{{ who(m.user_id) }}</b> <span class="uk-text-muted uk-text-small">{{ fmtDateTime(m.date) }}</span>
              <span class="uk-float-right actions">
                <a href="#" uk-icon="reply" class="uk-icon-link" title="Responder" @click.prevent="replyTo = m"></a>
                <a href="#" uk-icon="happy" class="uk-icon-link" title="Reaccionar" @click.prevent="pickFor = m"></a>
                <a v-if="m.user_id === me" href="#" uk-icon="trash" class="uk-icon-link uk-text-danger" title="Borrar" @click.prevent="del(m)"></a>
              </span>
            </header>
            <div class="uk-comment-body uk-margin-remove" style="white-space: pre-wrap">{{ m.content }}</div>
            <div v-if="m.replies_count || reacted[m.id]" class="uk-text-small uk-text-muted">
              <span v-for="(u, i) in reacted[m.id]" :key="i" class="uk-margin-small-right">{{ u }}</span>
              <span v-if="m.replies_count">{{ m.replies_count }} respuestas</span>
            </div>
          </article>
          <p v-if="!msgs.length" class="uk-text-muted">Sin mensajes.</p>
        </div>
        <form class="uk-margin-small-top" @submit.prevent="send">
          <div v-if="replyTo" class="uk-text-small uk-text-muted">
            Respondiendo a {{ who(replyTo.user_id) }}: “{{ replyTo.content.slice(0, 60) }}”
            <a href="#" uk-icon="close" class="uk-icon-link" @click.prevent="replyTo = null"></a>
          </div>
          <div class="uk-flex">
            <textarea class="uk-textarea" rows="2" v-model="text" placeholder="Escribe un mensaje (Ctrl+Enter para enviar)" @keydown.ctrl.enter="send"></textarea>
            <button class="uk-button uk-button-primary uk-margin-small-left" :disabled="busy || !text.trim()">Enviar</button>
          </div>
        </form>
      </template>
    </div>
  </div>
  <div v-if="pickFor" class="picker-overlay" @click.self="pickFor = null">
    <emoji-picker :data-source="emojiData" @emoji-click="react($event as CustomEvent)"></emoji-picker>
  </div>
</template>

<style scoped>
.actions a { margin-left: 8px; }
.picker-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.chat { display: flex; height: calc(100vh - 60px); gap: 20px; }
.channels { width: 240px; flex: none; overflow: auto; }
.pane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.messages { flex: 1; overflow: auto; }
</style>
