<script setup lang="ts">
import { computed } from "vue";
import type { Out } from "../cli";

const props = defineProps<{ out: Out }>();

const json = computed(() => {
  try { return JSON.parse(props.out.stdout); } catch { return undefined; }
});
const rows = computed<Record<string, unknown>[] | null>(() =>
  Array.isArray(json.value) && json.value.length && typeof json.value[0] === "object" ? json.value : null,
);
const cols = computed(() => (rows.value ? Object.keys(rows.value[0]) : []));
const cell = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
</script>

<template>
  <div v-if="out.stderr.trim()" class="uk-padding-small" :class="out.code ? 'uk-alert-danger' : 'uk-alert-warning'">
    <pre class="uk-margin-remove uk-text-small">{{ out.stderr.trim() }}</pre>
  </div>
  <div v-if="rows" class="uk-overflow-auto">
    <table class="uk-table uk-table-small uk-table-divider uk-table-hover uk-text-small">
      <thead><tr><th v-for="c in cols" :key="c">{{ c }}</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td v-for="c in cols" :key="c" class="uk-text-truncate" style="max-width: 24em" :title="cell(r[c])">{{ cell(r[c]) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <pre v-else-if="json !== undefined" class="uk-text-small">{{ JSON.stringify(json, null, 2) }}</pre>
  <pre v-else-if="out.stdout.trim()" class="uk-text-small">{{ out.stdout }}</pre>
  <p v-else-if="!out.code" class="uk-text-success">OK (sin salida)</p>
</template>
