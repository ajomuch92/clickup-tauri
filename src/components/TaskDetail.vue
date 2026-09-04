<script setup lang="ts">
import { onMounted, ref } from "vue";
import { json, run } from "../cli";
import { fmtDateTime, toISO, PRIORITIES, priorityNum } from "../util";

const props = defineProps<{ taskId: string }>();
const emit = defineEmits<{ close: []; openTask: [id: string]; changed: [] }>();
const task = ref<any>(null);
const statuses = ref<{ status: string; color: string }[]>([]);
const comments = ref<any[]>([]);
const error = ref("");
const busy = ref(false);
const comment = ref("");
const editingDesc = ref(false);
const desc = ref("");
const timer = ref<any>(null);

async function exec(args: string[]) {
  busy.value = true;
  error.value = "";
  const o = await run(args);
  busy.value = false;
  if (o.code) { error.value = o.stderr.trim() || o.stdout.trim(); return false; }
  emit("changed");
  return true;
}

async function load() {
  try {
    task.value = await json(["task", "view", props.taskId]);
    desc.value = task.value.markdown_description || task.value.description || "";
    const [st, cm, tm] = await Promise.all([
      json<any[]>(["status", "list", "--space", task.value.space.id]).catch(() => []),
      json<any[]>(["comment", "list", props.taskId]).catch(() => []),
      json<any>(["task", "time", "running"]).catch(() => null),
    ]);
    statuses.value = st;
    comments.value = cm;
    timer.value = tm?.id ? tm : null;
  } catch (e) {
    error.value = String(e);
  }
}

const setStatus = async (s: string) => (await exec(["status", "set", s, props.taskId])) && load();
const edit = async (...flags: string[]) => (await exec(["task", "edit", props.taskId, ...flags])) && load();
async function rename() {
  const n = prompt("Nuevo nombre:", task.value.name);
  if (n && n !== task.value.name) await edit("--name", n);
}
async function addComment() {
  const t = comment.value.trim();
  if (!t) return;
  if (await exec(["comment", "add", props.taskId, t])) { comment.value = ""; await load(); }
}
async function saveDesc() {
  editingDesc.value = false;
  if (desc.value !== (task.value.markdown_description || task.value.description || "")) await edit("--markdown-description", desc.value);
}
const resolveItem = async (cl: any, it: any) => (await exec(["task", "checklist", "item", "resolve", cl.id, it.id])) && load();
async function logTime() {
  const d = prompt("Duración (ej. 1h30m):");
  if (d) await exec(["task", "time", "log", props.taskId, "--duration", d]);
}

onMounted(load);
</script>

<template>
  <div class="uk-flex uk-flex-between uk-flex-top">
    <h3 class="uk-margin-remove" v-if="task">{{ task.name }} <a href="#" uk-icon="pencil" @click.prevent="rename"></a></h3>
    <span v-else uk-spinner></span>
    <a href="#" uk-icon="close" @click.prevent="emit('close')"></a>
  </div>
  <div v-if="error" class="uk-alert-danger uk-padding-small uk-margin-small">{{ error }}</div>

  <template v-if="task">
    <div class="uk-text-small uk-text-muted uk-margin-small">
      {{ task.folder?.name }} / {{ task.list?.name }} · <a :href="task.url" target="_blank">{{ task.custom_id || task.id }}</a>
      <span v-if="busy" uk-spinner="ratio: 0.5" class="uk-margin-small-left"></span>
    </div>

    <div class="uk-grid-small uk-child-width-1-2" uk-grid>
      <div>
        <label class="uk-form-label">Estado</label>
        <select class="uk-select uk-form-small" :value="task.status?.status" @change="setStatus(($event.target as HTMLSelectElement).value)">
          <option v-for="s in statuses" :key="s.status" :value="s.status">{{ s.status }}</option>
          <option v-if="!statuses.some(s => s.status === task.status?.status)" :value="task.status?.status">{{ task.status?.status }}</option>
        </select>
      </div>
      <div>
        <label class="uk-form-label">Prioridad</label>
        <select class="uk-select uk-form-small" :value="priorityNum(task.priority)" @change="edit('--priority', ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>—</option>
          <option v-for="(label, n) in PRIORITIES" :key="n" :value="n">{{ label }}</option>
        </select>
      </div>
      <div>
        <label class="uk-form-label">Vence</label>
        <input class="uk-input uk-form-small" type="date" :value="toISO(task.due_date)" @change="edit('--due-date', ($event.target as HTMLInputElement).value || 'none')" />
      </div>
      <div>
        <label class="uk-form-label">Asignados</label>
        <div><span v-for="a in task.assignees" :key="a.id" class="uk-label uk-margin-small-right" :style="{ background: a.color }">{{ a.username }}</span><span v-if="!task.assignees?.length" class="uk-text-muted">—</span></div>
      </div>
    </div>

    <div class="uk-margin-small">
      <span v-for="t in task.tags" :key="t.name" class="uk-label uk-margin-small-right" :style="{ background: t.tag_bg, color: t.tag_fg }">{{ t.name }}</span>
    </div>

    <div class="uk-margin-small uk-text-small">
      <span uk-icon="clock"></span>
      <template v-if="timer?.task?.id === task.id">
        Timer en marcha · <a href="#" @click.prevent="exec(['task', 'time', 'stop']).then(load)">Detener</a>
      </template>
      <template v-else>
        <a href="#" @click.prevent="exec(['task', 'time', 'start', task.id]).then(load)">Iniciar timer</a> · <a href="#" @click.prevent="logTime">Registrar tiempo</a>
      </template>
    </div>

    <h5 class="uk-margin-small-bottom">Descripción <a v-if="!editingDesc" href="#" uk-icon="pencil" @click.prevent="editingDesc = true"></a></h5>
    <textarea v-if="editingDesc" class="uk-textarea" rows="8" v-model="desc" @blur="saveDesc"></textarea>
    <p v-else class="uk-text-small" style="white-space: pre-wrap">{{ desc || "—" }}</p>

    <template v-if="task.subtasks?.length">
      <h5 class="uk-margin-small-bottom">Subtareas</h5>
      <ul class="uk-list uk-list-divider uk-text-small uk-margin-remove">
        <li v-for="s in task.subtasks" :key="s.id" class="row" @click="emit('openTask', s.id)">
          <span class="dot" :style="{ background: s.status?.color }"></span>{{ s.name }}
        </li>
      </ul>
    </template>

    <template v-for="cl in task.checklists" :key="cl.id">
      <h5 class="uk-margin-small-bottom">{{ cl.name }} <span class="uk-text-muted uk-text-small">{{ cl.resolved }}/{{ cl.resolved + cl.unresolved }}</span></h5>
      <ul class="uk-list uk-text-small uk-margin-remove">
        <li v-for="it in cl.items" :key="it.id">
          <label><input class="uk-checkbox" type="checkbox" :checked="it.resolved" :disabled="it.resolved" @change="resolveItem(cl, it)" /> {{ it.name }}</label>
        </li>
      </ul>
    </template>

    <h5 class="uk-margin-small-bottom">Comentarios ({{ comments.length }})</h5>
    <article v-for="c in comments" :key="c.id" class="uk-comment uk-margin-small">
      <header class="uk-comment-header uk-margin-remove uk-text-small"><b>{{ c.user?.username }}</b> <span class="uk-text-muted">{{ fmtDateTime(c.date) }}</span></header>
      <div class="uk-comment-body uk-margin-remove uk-text-small" style="white-space: pre-wrap">{{ c.comment_text }}</div>
      <div v-for="r in c.replies" :key="r.id" class="uk-margin-small-left uk-text-small uk-margin-small-top" style="border-left: 2px solid #e5e5e5; padding-left: 8px">
        <b>{{ r.user?.username }}</b> <span class="uk-text-muted">{{ fmtDateTime(r.date) }}</span><br />{{ r.comment_text }}
      </div>
    </article>
    <form @submit.prevent="addComment">
      <textarea class="uk-textarea" rows="2" v-model="comment" placeholder="Comentar (@usuario para mencionar, Ctrl+Enter)" @keydown.ctrl.enter="addComment"></textarea>
      <button class="uk-button uk-button-primary uk-button-small uk-margin-small-top" :disabled="busy || !comment.trim()">Comentar</button>
    </form>
  </template>
</template>
