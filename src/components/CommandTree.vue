<script setup lang="ts">
import { ref } from "vue";
import type { Cmd } from "../help";

export type Node = { cmd: Cmd; children: Node[] };

const props = defineProps<{ nodes: Node[]; filter: string }>();
const emit = defineEmits<{ select: [cmd: Cmd] }>();
const open = ref<Record<string, boolean>>({});

const key = (n: Node) => n.cmd.path.join(" ");
const visible = (n: Node): boolean =>
  !props.filter || key(n).includes(props.filter.toLowerCase()) || n.children.some(visible);
const isOpen = (n: Node) => !!props.filter || open.value[key(n)];

function click(n: Node) {
  if (n.children.length) open.value[key(n)] = !open.value[key(n)];
  else emit("select", n.cmd);
}
</script>

<template>
  <ul class="uk-nav uk-nav-default">
    <template v-for="n in nodes" :key="key(n)">
      <li v-if="visible(n)">
        <a href="#" @click.prevent="click(n)" :title="n.cmd.short">
          <span v-if="n.children.length" :uk-icon="isOpen(n) ? 'chevron-down' : 'chevron-right'"></span>
          {{ n.cmd.path.at(-1) }}
          <span class="uk-text-muted uk-text-small"> — {{ n.cmd.short }}</span>
        </a>
        <CommandTree v-if="n.children.length && isOpen(n)" class="uk-nav-sub" :nodes="n.children" :filter="filter" @select="emit('select', $event)" />
      </li>
    </template>
  </ul>
</template>
