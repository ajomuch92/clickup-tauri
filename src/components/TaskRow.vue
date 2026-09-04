<script setup lang="ts">
import { fmtDate } from "../util";
defineProps<{ task: any }>();
</script>

<template>
  <tr class="row">
    <td class="uk-text-nowrap"><span class="dot" :style="{ background: task.status?.color }"></span>{{ task.status?.status }}</td>
    <td>{{ task.name }} <span v-if="task.parent" class="uk-text-muted uk-text-small">(subtarea)</span></td>
    <td class="uk-text-nowrap uk-text-small">
      <span v-for="a in task.assignees" :key="a.id" class="uk-label uk-margin-small-right" :style="{ background: a.color }" :title="a.username">{{ a.initials || a.username }}</span>
    </td>
    <td class="uk-text-nowrap uk-text-small" :style="{ color: task.priority?.color }">{{ task.priority?.priority }}</td>
    <td class="uk-text-nowrap uk-text-small">{{ fmtDate(task.due_date) }}</td>
    <td class="uk-text-small"><span v-for="t in task.tags" :key="t.name" class="uk-label uk-margin-small-right" :style="{ background: t.tag_bg, color: t.tag_fg }">{{ t.name }}</span></td>
  </tr>
</template>
