<script setup lang="ts">
import { onMounted, ref } from "vue";
import { help } from "../cli";
import type { Cmd } from "../help";
import CommandTree, { type Node } from "./CommandTree.vue";
import CommandForm from "./CommandForm.vue";

const tree = ref<Node[]>([]);
const loadError = ref("");
const filter = ref("");
const selected = ref<Cmd | null>(null);

async function load(path: string[], short = ""): Promise<Node> {
  const cmd = await help(path, short);
  const children = await Promise.all(cmd.subs.map((s) => load([...path, s.name], s.short)));
  return { cmd, children };
}

onMounted(async () => {
  try {
    tree.value = (await load([])).children;
  } catch (e) {
    loadError.value = String(e);
  }
});
</script>

<template>
  <h2 class="uk-margin-small">Avanzado: cualquier comando del CLI</h2>
  <div class="uk-grid-small" uk-grid>
    <div class="uk-width-1-3">
      <input class="uk-input uk-form-small uk-margin-small-bottom" v-model="filter" placeholder="Filtrar comandos" />
      <div v-if="loadError" class="uk-alert-danger uk-padding-small">{{ loadError }}</div>
      <div v-else-if="!tree.length" class="uk-text-muted"><span uk-spinner="ratio: 0.6"></span> Cargando…</div>
      <CommandTree v-else :nodes="tree" :filter="filter" @select="selected = $event" />
    </div>
    <div class="uk-width-2-3">
      <CommandForm v-if="selected" :cmd="selected" @select="selected = $event" />
      <p v-else class="uk-text-muted">Elige un comando.</p>
    </div>
  </div>
</template>
