<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Cmd } from "../help";
import { run, type Out } from "../cli";
import OutputView from "./OutputView.vue";

const props = defineProps<{ cmd: Cmd }>();
defineEmits<{ select: [cmd: Cmd] }>();

const pos = ref<string[]>([]);
const vals = ref<Record<string, any>>({});
const stdin = ref("");
const out = ref<Out | null>(null);
const error = ref("");
const busy = ref(false);

// --editor opens $EDITOR and --pick is a TUI picker: neither works without a terminal.
const flags = computed(() => props.cmd.flags.filter((f) => !["editor", "pick"].includes(f.name)));
const bools = computed(() => flags.value.filter((f) => f.type === "bool"));
const inputs = computed(() => flags.value.filter((f) => f.type !== "bool"));
const needsStdin = computed(() => flags.value.some((f) => ["with-token", "input"].includes(f.name)));
const multiline = (name: string, type: string) => type === "stringArray" || /description|content|body/.test(name);

watch(() => props.cmd, reset, { immediate: true });
function reset() {
  pos.value = props.cmd.positionals.map(() => "");
  const v: Record<string, any> = {};
  for (const f of flags.value) v[f.name] = f.type === "bool" ? f.def === "true" || f.name === "json" : "";
  vals.value = v;
  out.value = null;
  error.value = "";
  stdin.value = "";
}

const args = computed(() => {
  const a = [...props.cmd.path];
  const p = pos.value.map((s) => s.trim());
  while (p.length && !p[p.length - 1]) p.pop();
  p.forEach((s, i) => (props.cmd.positionals[i].variadic ? a.push(...s.split(/\s+/).filter(Boolean)) : a.push(s)));
  for (const f of flags.value) {
    const v = vals.value[f.name];
    if (f.type === "bool") {
      if (v && f.def !== "true") a.push(`--${f.name}`);
      else if (!v && f.def === "true") a.push(`--${f.name}=false`);
    } else if (typeof v === "string" && v.trim()) {
      if (f.type === "stringArray") v.split("\n").filter(Boolean).forEach((x) => a.push(`--${f.name}`, x));
      else a.push(`--${f.name}`, v);
    }
  }
  return a;
});

async function go() {
  const last = props.cmd.path.at(-1) ?? "";
  // The CLI only prompts for confirmation on a TTY, so the safety net lives here.
  if (/^(delete|remove|logout|archive)$/.test(last) && !confirm(`¿Ejecutar?\n\nclickup ${args.value.join(" ")}`)) return;
  busy.value = true;
  error.value = "";
  out.value = null;
  try {
    out.value = await run(args.value, needsStdin.value && stdin.value ? stdin.value : undefined);
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h2 class="uk-margin-remove-bottom"><code>clickup {{ cmd.path.join(" ") }}</code></h2>
  <p class="uk-text-muted uk-margin-small-top" style="white-space: pre-wrap">{{ cmd.long }}</p>

  <ul v-if="cmd.subs.length" class="uk-list uk-list-divider">
    <li v-for="s in cmd.subs" :key="s.name">
      <a href="#" @click.prevent="$emit('select', { ...cmd, path: [...cmd.path, s.name] })"><b>{{ s.name }}</b> — {{ s.short }}</a>
    </li>
  </ul>

  <form v-else class="uk-form-stacked" @submit.prevent="go">
    <div v-for="(p, i) in cmd.positionals" :key="i" class="uk-margin-small">
      <label class="uk-form-label">
        {{ p.name }} <span class="uk-text-muted">{{ p.optional ? "(opcional)" : "" }}{{ p.variadic ? " — varios, separados por espacio" : "" }}</span>
      </label>
      <input class="uk-input" v-model="pos[i]" :required="!p.optional && i === 0" />
    </div>

    <div v-if="bools.length" class="uk-margin-small">
      <label v-for="f in bools" :key="f.name" class="uk-margin-right" :title="f.desc">
        <input class="uk-checkbox" type="checkbox" v-model="vals[f.name]" /> --{{ f.name }}
      </label>
    </div>

    <div class="uk-grid-small uk-child-width-1-2@m" uk-grid>
      <div v-for="f in inputs" :key="f.name" :class="{ 'uk-width-1-1': multiline(f.name, f.type) }">
        <label class="uk-form-label">--{{ f.name }} <span class="uk-text-muted uk-text-small">{{ f.desc }}</span></label>
        <textarea v-if="multiline(f.name, f.type)" class="uk-textarea" rows="3" v-model="vals[f.name]"
          :placeholder="f.type === 'stringArray' ? 'Uno por línea' : f.def"></textarea>
        <input v-else class="uk-input" v-model="vals[f.name]" :type="/int|float/.test(f.type) ? 'number' : 'text'"
          step="any" :placeholder="f.def ?? f.type" />
      </div>
      <div v-if="needsStdin" class="uk-width-1-1">
        <label class="uk-form-label">stdin <span class="uk-text-muted uk-text-small">(para --with-token o --input -)</span></label>
        <textarea class="uk-textarea" rows="3" v-model="stdin"></textarea>
      </div>
    </div>

    <div class="uk-margin">
      <button class="uk-button uk-button-primary" :disabled="busy">
        <span v-if="busy" uk-spinner="ratio: 0.6"></span> Ejecutar
      </button>
      <code class="uk-margin-left uk-text-small">clickup {{ args.join(" ") }}</code>
    </div>

    <details v-if="cmd.examples" class="uk-margin-small">
      <summary class="uk-text-muted">Ejemplos</summary>
      <pre class="uk-text-small">{{ cmd.examples }}</pre>
    </details>
  </form>

  <div v-if="error" class="uk-alert-danger uk-padding-small">{{ error }}</div>
  <OutputView v-if="out" :out="out" />
</template>
