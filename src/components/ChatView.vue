<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch as vwatch } from "vue";
import { fmtDateTime } from "../util";
import { md } from "../md";
import { invoke } from "@tauri-apps/api/core";
import { run } from "../cli";
import { channels, fetchMessages, fetchReactions, fetchReplies, loadChannels, post, session, unread, who, type Channel, type Msg, type Reaction } from "../chat";
import "emoji-picker-element";
import { Database } from "emoji-picker-element";
import Avatar from "./Avatar.vue";
// ClickUp's reaction endpoint accepts Slack-style short names ("+1", "tada", "heart_eyes"); the iamcal preset is that list. Spanish presets emit localized names and are rejected.
import emojiData from "emoji-picker-element-data/en/iamcal/data.json?url";

const props = defineProps<{ openId?: string | null }>();
const active = ref<Channel | null>(null);
const msgs = ref<Msg[]>([]);
const text = ref("");
const thread = ref<{ parent: Msg; replies: Msg[] } | null>(null);
const editing = ref<Msg | null>(null);
const editText = ref("");
const edited = (m: Msg) => (m.date_updated ?? 0) > m.date + 2_000; // ClickUp stamps date_updated ~1s after creation even without edits
const replyText = ref("");
const error = ref("");
const busy = ref(false);
const box = ref<HTMLElement>();
const pickFor = ref<Msg | null>(null);
const pickInsert = ref(false); // picker opened from the compose toolbar
const input = ref<HTMLTextAreaElement>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(0);
const reactions = ref<Record<string, Reaction[]>>({});
const glyphs = reactive<Record<string, string>>({}); // shortcode -> emoji, resolved from the picker's own offline database
const db = new Database({ dataSource: emojiData });
let timer: number | undefined;

const others = (c: Channel) => (c.memberIds ?? []).filter((id) => id !== session.me);
const sorted = computed(() =>
  [...channels.value].sort((a, b) => (a.type === "CHANNEL" ? 0 : 1) - (b.type === "CHANNEL" ? 0 : 1) || (b.latest_comment_at ?? 0) - (a.latest_comment_at ?? 0)),
);

async function guard<T>(fn: () => Promise<T>) {
  error.value = "";
  try { return await fn(); } catch (e) { error.value = String(e); }
}

const ALIAS: Record<string, string> = { thumbs_up: "+1", thumbs_down: "-1" }; // ClickUp's web UI stores these under names the Slack preset lacks
function glyph(code: string) {
  if (!(code in glyphs)) {
    glyphs[code] = `:${code}:`;
    db.getEmojiByShortcode(ALIAS[code] ?? code).then((e) => { if (e && "unicode" in e) glyphs[code] = e.unicode; });
  }
  return glyphs[code];
}

/** Group a message's reactions into pills: emoji, count, whether I am among them. */
const pills = (m: Msg) => {
  const g = new Map<string, { code: string; count: number; mine: boolean }>();
  for (const r of reactions.value[m.id] ?? []) {
    const p = g.get(r.reaction) ?? { code: r.reaction, count: 0, mine: false };
    p.count++;
    if (String(r.user_id) === session.me) p.mine = true;
    g.set(r.reaction, p);
  }
  return [...g.values()];
};

async function loadReactions(id: string) {
  reactions.value[id] = await fetchReactions(id);
}

// ponytail: reactions are one request per message and ClickUp allows 100/min. Cached across channels; only the newest few are (re)fetched.
const OPEN_WINDOW = 10;
const REFRESH_WINDOW = 5;
const refreshReactions = (n = REFRESH_WINDOW, onlyMissing = false) =>
  Promise.all(msgs.value.slice(-n).filter((m) => !onlyMissing || !(m.id in reactions.value)).map((m) => loadReactions(m.id).catch(() => {})));

async function load() {
  if (!active.value) return;
  msgs.value = await fetchMessages(active.value.id);
  delete unread[active.value.id];
  await nextTick();
  box.value?.scrollTo(0, box.value.scrollHeight);
  await refreshReactions(OPEN_WINDOW, true);
  if (thread.value) thread.value.replies = await fetchReplies(thread.value.parent.id).catch(() => thread.value!.replies);
}

async function toggle(m: Msg, code: string, mine: boolean) {
  await guard(async () => {
    await post(`chat/messages/${m.id}/reactions${mine ? `/${encodeURIComponent(code)}` : ""}`, mine ? {} : { reaction: code }, mine ? "DELETE" : "POST");
    await loadReactions(m.id);
  });
}

function open(ch: Channel) {
  active.value = ch;
  thread.value = null;
  guard(load);
}

async function openThread(m: Msg) {
  thread.value = { parent: m, replies: [] };
  await guard(async () => { thread.value = { parent: m, replies: await fetchReplies(m.id) }; });
}

async function sendReply() {
  const t = replyText.value.trim();
  if (!thread.value || !t) return;
  busy.value = true;
  await guard(async () => {
    await post(`chat/messages/${thread.value!.parent.id}/replies`, { type: "message", content: t });
    replyText.value = "";
    thread.value!.replies = await fetchReplies(thread.value!.parent.id);
    thread.value!.parent.replies_count = thread.value!.replies.length;
  });
  busy.value = false;
}

/** Wrap the textarea selection (or insert at the caret) and keep focus. */
function wrap(before: string, after = before) {
  const el = input.value;
  if (!el) return;
  const { selectionStart: a, selectionEnd: b } = el;
  const sel = text.value.slice(a, b);
  text.value = text.value.slice(0, a) + before + sel + after + text.value.slice(b);
  nextTick(() => { el.focus(); el.setSelectionRange(a + before.length, b + before.length); });
}
const FORMATS: Record<string, [string, string?]> = { b: ["**"], i: ["_"], u: ["<u>", "</u>"], e: ["`"] };
function keys(e: KeyboardEvent) {
  const f = (e.ctrlKey || e.metaKey) && FORMATS[e.key.toLowerCase()];
  if (f) { e.preventDefault(); wrap(f[0], f[1]); }
}

// ponytail: ClickUp has no public upload endpoint for chat, so images become attachments of a "mailbox" task and are embedded by URL.
function uploadTask() {
  let id = localStorage.getItem("uploadTask") ?? "";
  if (!id) {
    id = (prompt("ClickUp no permite subir imágenes al chat directamente. Indica el ID de una tarea que sirva de buzón para los adjuntos (por ejemplo, crea una llamada «Adjuntos del chat»). Se recordará.") ?? "").trim();
    if (id) localStorage.setItem("uploadTask", id);
  }
  return id;
}

const resetUploadTask = () => { localStorage.removeItem("uploadTask"); uploadTask(); };

async function upload(files: Iterable<File>) {
  const list = [...files].filter((f) => f.type.startsWith("image/"));
  if (!list.length) return;
  const task = uploadTask();
  if (!task) return;
  uploading.value += list.length;
  for (const f of list) {
    await guard(async () => {
      const name = (f.name || `pasted-${Date.now()}.png`).replace(/[^\w.-]/g, "_");
      const path = await invoke<string>("save_temp", new Uint8Array(await f.arrayBuffer()), { headers: { "x-name": name } });
      const o = await run(["attachment", "add", task, path]);
      const url = o.stdout.match(/URL:\s*(https?:\/\/\S+)/)?.[1];
      if (o.code || !url) throw new Error(o.stderr.trim() || o.stdout.trim() || "Sin URL en la respuesta");
      wrap(`![${name}](${url}) `, "");
    });
    uploading.value--;
  }
}
const onPaste = (e: ClipboardEvent) => { const fs = [...(e.clipboardData?.files ?? [])]; if (fs.length) { e.preventDefault(); upload(fs); } };

async function send() {
  const t = text.value.trim();
  if (!active.value || !t) return;
  busy.value = true;
  await guard(async () => {
    await post(`chat/channels/${active.value!.id}/messages`, { type: "message", content: t });
    text.value = "";
    await load();
  });
  busy.value = false;
}

async function react(e: CustomEvent) {
  if (pickInsert.value) { pickInsert.value = false; wrap(e.detail.unicode, ""); return; }
  const m = pickFor.value;
  pickFor.value = null;
  const codes: string[] = e.detail.emoji.shortcodes ?? [];
  if (!m || !codes.length) return;
  await guard(async () => {
    let err: unknown;
    for (const code of codes) { // aliases differ per emoji ("+1" works, "thumbsup" does not): try each until ClickUp accepts one
      try { await post(`chat/messages/${m.id}/reactions`, { reaction: code }); err = null; break; } catch (x) { err = x; }
    }
    if (err) throw err;
    await loadReactions(m.id);
  });
}

function startEdit(m: Msg) {
  editing.value = m;
  editText.value = m.content;
}
async function saveEdit() {
  const m = editing.value;
  const t = editText.value.trim();
  if (!m || !t) return;
  if (t !== m.content) await guard(async () => { await post(`chat/messages/${m.id}`, { content: t }, "PATCH"); await load(); });
  editing.value = null;
}

async function del(m: Msg) {
  if (!confirm("¿Borrar el mensaje? No se puede deshacer.")) return;
  await guard(async () => { await post(`chat/messages/${m.id}`, {}, "DELETE"); await load(); });
}

vwatch(() => props.openId, (id) => { const c = channels.value.find((c) => c.id === id); if (c) open(c); });
// The global watcher (chat.ts) already polls channel activity; reload messages only when this channel's last-message stamp moves.
vwatch(() => channels.value.find((c) => c.id === active.value?.id)?.latest_comment_at, (now, before) => { if (before !== undefined && now !== before) load().catch(() => {}); });

onMounted(async () => {
  await guard(async () => {
    if (!channels.value.length) await loadChannels();
    const c = channels.value.find((c) => c.id === props.openId);
    if (c) open(c);
  });
  timer = window.setInterval(() => refreshReactions(), 120_000); // background: silent on rate limit, retries next tick
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="chat">
    <ul class="uk-nav uk-nav-default channels">
      <li class="uk-nav-header">Canales</li>
      <li v-for="c in sorted" :key="c.id" :class="{ 'uk-active': c.id === active?.id }">
        <a href="#" class="uk-flex uk-flex-middle" @click.prevent="open(c)">
          <span v-if="c.type === 'CHANNEL'" uk-icon="hashtag" class="uk-margin-small-right"></span>
          <Avatar v-else-if="others(c)[0]" :id="others(c)[0]" :size="22" class="uk-margin-small-right" />
          <span v-else uk-icon="user" class="uk-margin-small-right"></span>
          <span class="uk-text-truncate">{{ c.label ?? c.id }}</span>
          <span v-if="unread[c.id]" class="uk-badge">{{ unread[c.id] }}</span>
        </a>
      </li>
      <li v-if="!channels.length && !error" class="uk-text-muted"><span uk-spinner="ratio: 0.6"></span></li>
    </ul>

    <div class="pane">
      <div v-if="error" class="uk-alert-danger uk-padding-small">{{ error }}</div>
      <p v-if="!active" class="uk-text-muted">Elige un canal.</p>
      <template v-else>
        <div class="uk-flex uk-flex-between uk-flex-middle">
          <h3 class="uk-margin-remove uk-flex uk-flex-middle">
            {{ active.label }}
            <span class="uk-margin-small-left"><Avatar v-for="id in others(active)" :key="id" :id="id" :size="26" class="stack" /></span>
          </h3>
          <button class="uk-button uk-button-default uk-button-small" @click="guard(load)"><span uk-icon="refresh"></span></button>
        </div>
        <div ref="box" class="messages">
          <article v-for="m in msgs" :key="m.id" class="uk-comment uk-margin-small" :class="{ 'uk-comment-primary': m.user_id === session.me }">
            <header class="uk-comment-header uk-margin-remove uk-flex uk-flex-middle">
              <Avatar :id="m.user_id" :size="32" class="uk-margin-small-right" />
              <b>{{ who(m.user_id) }}</b> <span class="uk-text-muted uk-text-small uk-margin-small-left">{{ fmtDateTime(m.date) }}</span>
              <span class="actions uk-margin-auto-left">
                <a href="#" uk-icon="reply" class="uk-icon-link" title="Responder en hilo" @click.prevent="openThread(m)"></a>
                <a href="#" uk-icon="happy" class="uk-icon-link" title="Reaccionar" @click.prevent="pickFor = m"></a>
                <a v-if="m.user_id === session.me" href="#" uk-icon="pencil" class="uk-icon-link" title="Editar" @click.prevent="startEdit(m)"></a>
                <a v-if="m.user_id === session.me" href="#" uk-icon="trash" class="uk-icon-link uk-text-danger" title="Borrar" @click.prevent="del(m)"></a>
              </span>
            </header>
            <form v-if="editing?.id === m.id" class="uk-margin-small-top" @submit.prevent="saveEdit">
              <textarea class="uk-textarea" rows="3" v-model="editText" @keydown.ctrl.enter="saveEdit" @keydown.esc="editing = null"></textarea>
              <button class="uk-button uk-button-primary uk-button-small uk-margin-small-top" :disabled="busy">Guardar</button>
              <button type="button" class="uk-button uk-button-default uk-button-small uk-margin-small-top uk-margin-small-left" @click="editing = null">Cancelar</button>
            </form>
            <div v-else class="uk-comment-body uk-margin-remove md" v-html="md(m.content) + (edited(m) ? ' <span class=\'uk-text-muted uk-text-small\'>(editado)</span>' : '')"></div>
            <div v-if="m.replies_count || reactions[m.id]?.length" class="uk-text-small uk-text-muted uk-margin-small-top">
              <button v-for="p in pills(m)" :key="p.code" class="pill" :class="{ mine: p.mine }" :title="p.code" @click="toggle(m, p.code, p.mine)">
                {{ glyph(p.code) }} {{ p.count }}
              </button>
              <a v-if="m.replies_count" href="#" @click.prevent="openThread(m)">{{ m.replies_count }} respuestas</a>
            </div>
          </article>
          <p v-if="!msgs.length" class="uk-text-muted">Sin mensajes.</p>
        </div>
        <form class="uk-margin-small-top" @submit.prevent="send">
          <div class="toolbar">
            <a href="#" uk-icon="bold" class="uk-icon-link" title="Negrita (Ctrl+B)" @click.prevent="wrap('**')"></a>
            <a href="#" uk-icon="italic" class="uk-icon-link" title="Cursiva (Ctrl+I)" @click.prevent="wrap('_')"></a>
            <a href="#" class="uk-icon-link ul" title="Subrayado (Ctrl+U)" @click.prevent="wrap('<u>', '</u>')">U</a>
            <a href="#" uk-icon="code" class="uk-icon-link" title="Código (Ctrl+E)" @click.prevent="wrap('`')"></a>
            <a href="#" uk-icon="happy" class="uk-icon-link" title="Emoji" @click.prevent="pickInsert = true"></a>
            <a href="#" uk-icon="image" class="uk-icon-link" title="Imagen: clic para elegir, o pega / arrastra en el cuadro. Shift+clic cambia la tarea buzón." @click.prevent="$event.shiftKey ? resetUploadTask() : fileInput?.click()"></a>
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="upload(($event.target as HTMLInputElement).files ?? []); ($event.target as HTMLInputElement).value = ''" />
            <span v-if="uploading" class="uk-text-small uk-text-muted"><span uk-spinner="ratio: 0.5"></span> subiendo {{ uploading }}…</span>
          </div>
          <div class="uk-flex">
            <textarea ref="input" class="uk-textarea" rows="2" v-model="text" placeholder="Escribe un mensaje (Ctrl+Enter para enviar)" @keydown.ctrl.enter="send" @keydown="keys" @paste="onPaste" @drop.prevent="upload($event.dataTransfer?.files ?? [])" @dragover.prevent></textarea>
            <button class="uk-button uk-button-primary uk-margin-small-left" :disabled="busy || !text.trim()">Enviar</button>
          </div>
        </form>
      </template>
    </div>

    <div v-if="thread" class="thread">
      <div class="uk-flex uk-flex-between uk-flex-middle uk-margin-small-bottom">
        <h4 class="uk-margin-remove">Hilo</h4>
        <a href="#" uk-icon="close" class="uk-icon-link" @click.prevent="thread = null"></a>
      </div>
      <div class="thread-msgs">
        <article v-for="m in [thread.parent, ...thread.replies]" :key="m.id" class="uk-comment uk-margin-small" :class="{ parent: m.id === thread.parent.id }">
          <header class="uk-comment-header uk-margin-remove uk-flex uk-flex-middle">
            <Avatar :id="m.user_id" :size="26" class="uk-margin-small-right" />
            <b>{{ who(m.user_id) }}</b> <span class="uk-text-muted uk-text-small uk-margin-small-left">{{ fmtDateTime(m.date) }}</span>
          </header>
          <div class="uk-comment-body uk-margin-remove md uk-text-small" v-html="md(m.content)"></div>
        </article>
        <p v-if="!thread.replies.length" class="uk-text-muted uk-text-small">Sin respuestas aún.</p>
      </div>
      <form class="uk-margin-small-top" @submit.prevent="sendReply">
        <textarea class="uk-textarea" rows="2" v-model="replyText" placeholder="Responder en el hilo (Ctrl+Enter)" @keydown.ctrl.enter="sendReply"></textarea>
        <button class="uk-button uk-button-primary uk-button-small uk-margin-small-top" :disabled="busy || !replyText.trim()">Responder</button>
      </form>
    </div>
  </div>
  <div v-if="pickFor || pickInsert" class="picker-overlay" @click.self="pickFor = null; pickInsert = false">
    <emoji-picker :data-source="emojiData" @emoji-click="react($event as CustomEvent)"></emoji-picker>
  </div>
</template>

<style scoped>
.chat { display: flex; height: calc(100vh - 60px); gap: 20px; }
.channels { width: 240px; flex: none; overflow: auto; }
.pane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.messages { flex: 1; overflow: auto; padding-right: 14px; } /* keep action icons clear of the scrollbar */
.thread { width: 360px; flex: none; display: flex; flex-direction: column; border-left: 1px solid #e5e5e5; padding-left: 16px; min-width: 0; }
.thread-msgs { flex: 1; overflow: auto; }
.thread .parent { border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }
.actions a { margin-left: 8px; }
.toolbar a { margin-right: 10px; }
.toolbar .ul { text-decoration: underline; font-weight: 700; font-size: 15px; }
.md { white-space: pre-wrap; }
.md :deep(code) { background: #f3f3f3; padding: 0 4px; border-radius: 3px; }
.md :deep(.mention) { color: #1e87f0; font-weight: 600; }
.md :deep(.emo) { height: 1.4em; vertical-align: middle; }
.md :deep(.img) { display: block; max-width: 420px; max-height: 320px; border-radius: 6px; margin: 4px 0; }
.stack { margin-left: -6px; border: 2px solid #fff; }
.pill { border: 1px solid #ddd; border-radius: 12px; background: #fff; padding: 0 8px; margin-right: 4px; cursor: pointer; font-size: 13px; }
.pill.mine { border-color: #1e87f0; background: #e8f2fd; }
.picker-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; z-index: 1000; }
</style>
