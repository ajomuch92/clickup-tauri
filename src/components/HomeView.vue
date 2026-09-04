<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { json } from "../cli";
import TaskRow from "./TaskRow.vue";

const emit = defineEmits<{ openTask: [id: string] }>();
const tasks = ref<any[]>([]);
const error = ref("");
const loading = ref(true);
const all = ref(false);

const groups = computed(() => {
  const m = new Map<string, any[]>();
  for (const t of tasks.value) {
    const k = [t.folder?.name, t.list?.name].filter(Boolean).join(" / ") || "Sin lista";
    m.set(k, [...(m.get(k) ?? []), t]);
  }
  return [...m.entries()];
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    tasks.value = await json(["task", "recent", "--limit", "50", ...(all.value ? ["--all"] : [])]);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="uk-flex uk-flex-between uk-flex-middle uk-margin-small">
    <h2 class="uk-margin-remove">{{ all ? "Actividad del equipo" : "Mis tareas recientes" }}</h2>
    <label class="uk-text-small"><input class="uk-checkbox" type="checkbox" v-model="all" @change="load" /> Todo el equipo</label>
  </div>
  <div v-if="error" class="uk-alert-danger uk-padding-small">{{ error }}</div>
  <div v-if="loading"><span uk-spinner></span></div>
  <p v-else-if="!tasks.length" class="uk-text-muted">Nada reciente.</p>
  <div v-for="[name, ts] in groups" :key="name" class="uk-margin">
    <h4 class="uk-margin-small-bottom">{{ name }}</h4>
    <table class="uk-table uk-table-small uk-table-divider uk-margin-remove">
      <tbody><TaskRow v-for="t in ts" :key="t.id" :task="t" @click="emit('openTask', t.id)" /></tbody>
    </table>
  </div>
</template>
