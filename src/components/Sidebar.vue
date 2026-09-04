<script setup lang="ts">
import { onMounted, ref } from "vue";
import { json } from "../cli";
import type { View } from "../App.vue";

type List = { id: string; name: string; task_count?: string | number };
type Folder = { id: string; name: string; lists: List[] };
type Space = { id: string; name: string; folders?: Folder[]; lists?: List[]; open?: boolean; loading?: boolean };

const props = defineProps<{ view: View }>();
const emit = defineEmits<{ navigate: [view: View] }>();
const spaces = ref<Space[]>([]);
const error = ref("");
const openFolders = ref<Record<string, boolean>>({});

const nav = [
  { kind: "home", label: "Mis tareas", icon: "home" },
  { kind: "inbox", label: "Inbox", icon: "bell" },
  { kind: "chat", label: "Chat", icon: "comments" },
  { kind: "advanced", label: "Avanzado (CLI)", icon: "cog" },
] as const;

const active = (kind: string, id?: string) => props.view.kind === kind && (!id || ("id" in props.view && props.view.id === id));

async function toggle(s: Space) {
  s.open = !s.open;
  if (!s.open || s.folders) return;
  s.loading = true;
  try {
    [s.folders, s.lists] = await Promise.all([
      json<Folder[]>(["folder", "list", "--space", s.id]),
      json<List[]>(["list", "list", "--space", s.id]),
    ]);
  } catch (e) {
    error.value = String(e);
  } finally {
    s.loading = false;
  }
}

onMounted(async () => {
  try {
    spaces.value = await json<Space[]>(["space", "list"]);
  } catch (e) {
    error.value = String(e);
  }
});
</script>

<template>
  <ul class="uk-nav uk-nav-default uk-padding-small uk-padding-remove-vertical">
    <li v-for="n in nav" :key="n.kind" :class="{ 'uk-active': active(n.kind) }">
      <a href="#" @click.prevent="emit('navigate', { kind: n.kind })"><span :uk-icon="n.icon" class="uk-margin-small-right"></span>{{ n.label }}</a>
    </li>
    <li class="uk-nav-divider"></li>
    <li class="uk-nav-header">Espacios</li>
    <li v-if="error" class="uk-text-danger uk-text-small">{{ error }}</li>
    <li v-for="s in spaces" :key="s.id">
      <a href="#" @click.prevent="toggle(s)">
        <span :uk-icon="s.open ? 'chevron-down' : 'chevron-right'"></span> {{ s.name }}
        <span v-if="s.loading" uk-spinner="ratio: 0.5"></span>
      </a>
      <ul v-if="s.open" class="uk-nav-sub">
        <li v-for="f in s.folders" :key="f.id">
          <a href="#" @click.prevent="openFolders[f.id] = !openFolders[f.id]">
            <span uk-icon="folder"></span> {{ f.name }}
          </a>
          <ul v-if="openFolders[f.id]" class="uk-nav-sub">
            <li v-for="l in f.lists" :key="l.id" :class="{ 'uk-active': active('list', l.id) }">
              <a href="#" @click.prevent="emit('navigate', { kind: 'list', id: l.id, name: `${f.name} / ${l.name}` })"><span uk-icon="list"></span> {{ l.name }}</a>
            </li>
          </ul>
        </li>
        <li v-for="l in s.lists" :key="l.id" :class="{ 'uk-active': active('list', l.id) }">
          <a href="#" @click.prevent="emit('navigate', { kind: 'list', id: l.id, name: l.name })"><span uk-icon="list"></span> {{ l.name }}</a>
        </li>
        <li v-if="s.folders && !s.folders.length && !s.lists?.length" class="uk-text-muted uk-text-small">Vacío</li>
      </ul>
    </li>
  </ul>
</template>
