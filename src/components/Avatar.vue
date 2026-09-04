<script setup lang="ts">
import { computed } from "vue";
import { isOnline, users, who } from "../chat";

const props = withDefaults(defineProps<{ id: string | number; size?: number }>(), { size: 32 });
const u = computed(() => users[String(props.id)]);
const name = computed(() => who(String(props.id)));
const initials = computed(() => u.value?.initials || name.value.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());
</script>

<template>
  <span class="avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px', background: u?.color || '#7a7a7a' }" :title="name + (isOnline(id) ? ' · en línea' : '')">
    <img v-if="u?.profilePicture" :src="u.profilePicture" :alt="initials" />
    <template v-else>{{ initials }}</template>
    <i v-if="isOnline(id)" class="online"></i>
  </span>
</template>

<style scoped>
.avatar { position: relative; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 600; flex: none; overflow: visible; vertical-align: middle; }
.avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.online { position: absolute; right: -1px; bottom: -1px; width: 30%; height: 30%; min-width: 8px; min-height: 8px; border-radius: 50%; background: #32d296; border: 2px solid #fff; }
</style>
