<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { run } from "../cli";
import TaskRow from "./TaskRow.vue";

const props = defineProps<{ listId: string; listName: string }>();
const emit = defineEmits<{ openTask: [id: string] }>();
const tasks = ref<any[]>([]);
const error = ref("");
const loading = ref(false);
const closed = ref(false);
const subtasks = ref(false);
const q = ref("");
const newName = ref("");

const groups = computed(() => {
  const f = q.value.toLowerCase();
  const m = new Map<string, { color: string; tasks: any[]; order: number }>();
  for (const t of tasks.value) {
    if (f && !t.name.toLowerCase().includes(f)) continue;
    const g = m.get(t.status?.status) ?? { color: t.status?.color, tasks: [] as any[], order: Number(t.status?.orderindex ?? 0) };
    g.tasks.push(t);
    m.set(t.status?.status, g);
  }
  return [...m.entries()].sort((a, b) => a[1].order - b[1].order);
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const args = ["task", "list", "--list-id", props.listId];
    if (closed.value) args.push("--include-closed");
    if (subtasks.value) args.push("--include-subtasks");
    const o = await run([...args, "--json"]);
    tasks.value = o.stdout.trim() ? JSON.parse(o.stdout) : []; // "No tasks found." goes to stderr with exit 0
    if (o.code) error.value = o.stderr;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function create() {
  const name = newName.value.trim();
  if (!name) return;
  const o = await run(["task", "create", "--list-id", props.listId, "--name", name]);
  if (o.code) { error.value = o.stderr; return; }
  newName.value = "";
  await load();
}

onMounted(load);
</script>

<template>
  <div class="uk-flex uk-flex-middle uk-flex-between uk-margin-small">
    <h2 class="uk-margin-remove">{{ listName }}</h2>
    <div class="uk-text-small">
      <label class="uk-margin-small-right"><input class="uk-checkbox" type="checkbox" v-model="closed" @change="load" /> Cerradas</label>
      <label class="uk-margin-small-right"><input class="uk-checkbox" type="checkbox" v-model="subtasks" @change="load" /> Subtareas</label>
      <button class="uk-button uk-button-default uk-button-small" @click="load"><span uk-icon="refresh"></span></button>
    </div>
  </div>
  <form class="uk-flex uk-margin-small" @submit.prevent="create">
    <input class="uk-input" v-model="newName" placeholder="+ Nueva tarea (Enter para crear)" />
    <input class="uk-input uk-width-small uk-margin-small-left" v-model="q" placeholder="Filtrar" />
  </form>
  <div v-if="error" class="uk-alert-danger uk-padding-small">{{ error }}</div>
  <div v-if="loading"><span uk-spinner></span></div>
  <p v-else-if="!groups.length" class="uk-text-muted">Sin tareas.</p>
  <div v-for="[status, g] in groups" :key="status" class="uk-margin">
    <h4 class="uk-margin-small-bottom"><span class="dot" :style="{ background: g.color }"></span>{{ status }} <span class="uk-text-muted uk-text-small">{{ g.tasks.length }}</span></h4>
    <table class="uk-table uk-table-small uk-table-divider uk-margin-remove">
      <tbody><TaskRow v-for="t in g.tasks" :key="t.id" :task="t" @click="emit('openTask', t.id)" /></tbody>
    </table>
  </div>
</template>
