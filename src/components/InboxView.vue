<script setup lang="ts">
import { onMounted, ref } from "vue";
import { json } from "../cli";

const emit = defineEmits<{ openTask: [id: string] }>();
const items = ref<any[]>([]);
const error = ref("");
const loading = ref(true);
const days = ref(7);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    items.value = await json(["inbox", "--days", String(days.value)]);
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
    <h2 class="uk-margin-remove">Inbox</h2>
    <label class="uk-text-small">Últimos <input class="uk-input uk-form-small uk-form-width-xsmall" type="number" v-model="days" @change="load" /> días</label>
  </div>
  <div v-if="error" class="uk-alert-danger uk-padding-small">{{ error }}</div>
  <div v-if="loading"><span uk-spinner></span> Escaneando menciones (la primera vez tarda)…</div>
  <p v-else-if="!items.length" class="uk-text-muted">Sin menciones ni asignaciones.</p>
  <ul v-else class="uk-list uk-list-divider">
    <li v-for="(it, i) in items" :key="i" class="row uk-padding-small" @click="emit('openTask', it.task_id)">
      <span class="uk-label" :class="it.type === 'mention' ? 'uk-label-warning' : 'uk-label-success'">{{ it.type }}</span>
      <b class="uk-margin-small-left">{{ it.task_name }}</b>
      <span class="uk-text-muted uk-text-small uk-margin-small-left">{{ it.author }} · {{ it.date }}</span>
      <div v-if="it.comment_text" class="uk-text-small" style="white-space: pre-wrap">{{ it.comment_text }}</div>
    </li>
  </ul>
</template>
