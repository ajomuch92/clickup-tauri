<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import UIkit from "uikit";
import { watch as watchChat, who } from "./chat";
import AuthBar from "./components/AuthBar.vue";
import Sidebar from "./components/Sidebar.vue";
import HomeView from "./components/HomeView.vue";
import InboxView from "./components/InboxView.vue";
import ChatView from "./components/ChatView.vue";
import AdvancedView from "./components/AdvancedView.vue";
import TaskList from "./components/TaskList.vue";
import TaskDetail from "./components/TaskDetail.vue";

export type View = { kind: "home" | "inbox" | "chat" | "advanced" } | { kind: "list"; id: string; name: string };

const view = ref<View>({ kind: "home" });
const taskId = ref<string | null>(null);
const refreshKey = ref(0); // bump to make the visible list/home reload after an edit
const chatOpen = ref<string | null>(null);

function openChat(id: string) {
  chatOpen.value = id;
  view.value = { kind: "chat" };
}

// In-app toast is the click target: desktop OS notifications have no click callback in tauri-plugin-notification.
let stop: (() => void) | undefined;
onMounted(() => {
  stop = watchChat((ch, msg) => {
    const n = UIkit.notification({ message: `<a class="uk-link-reset"><b>${who(msg.user_id)}</b> · ${ch.label}<br><span class="uk-text-small">${msg.content.slice(0, 120)}</span></a>`, pos: "bottom-right", timeout: 8000 });
    n.$el.addEventListener("click", () => { openChat(ch.id); n.close(); });
  });
});
onUnmounted(() => stop?.());
</script>

<template>
  <div class="layout">
    <aside class="side uk-background-muted">
      <h3 class="uk-margin-small uk-padding-small uk-padding-remove-bottom">ClickUp Lite</h3>
      <div class="uk-padding-small uk-padding-remove-vertical"><AuthBar /></div>
      <Sidebar :view="view" @navigate="view = $event; chatOpen = null" />
    </aside>

    <main class="main">
      <HomeView v-if="view.kind === 'home'" :key="refreshKey" @open-task="taskId = $event" />
      <InboxView v-else-if="view.kind === 'inbox'" @open-task="taskId = $event" />
      <ChatView v-else-if="view.kind === 'chat'" :open-id="chatOpen" />
      <AdvancedView v-else-if="view.kind === 'advanced'" />
      <TaskList v-else-if="view.kind === 'list'" :key="view.id + refreshKey" :list-id="view.id" :list-name="view.name" @open-task="taskId = $event" />
    </main>

    <aside v-if="taskId" class="detail">
      <TaskDetail :key="taskId" :task-id="taskId" @close="taskId = null" @open-task="taskId = $event" @changed="refreshKey++" />
    </aside>
  </div>
</template>

<style>
html, body { height: 100%; }
.layout { display: flex; height: 100vh; }
.side { width: 270px; flex: none; overflow: auto; border-right: 1px solid #e5e5e5; }
.main { flex: 1; overflow: auto; min-width: 0; padding: 20px 30px; }
.detail { width: 480px; flex: none; overflow: auto; border-left: 1px solid #e5e5e5; padding: 20px; background: #fff; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.row { cursor: pointer; }
.row:hover { background: #f8f8f8; }
</style>
