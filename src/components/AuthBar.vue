<script setup lang="ts">
import { onMounted, ref } from "vue";
import { run } from "../cli";

const status = ref("");
const ok = ref(false);
const token = ref("");
const busy = ref(false);

async function check() {
  const o = await run(["auth", "status"]);
  ok.value = o.code === 0;
  status.value = (o.stdout || o.stderr).trim();
}

async function login() {
  busy.value = true;
  try {
    const o = await run(["auth", "login", "--with-token"], token.value.trim() + "\n");
    status.value = (o.stderr || o.stdout).trim();
    token.value = "";
    await check();
  } finally {
    busy.value = false;
  }
}

onMounted(check);
defineExpose({ check });
</script>

<template>
  <div class="uk-margin-small-bottom uk-text-small">
    <span class="uk-label" :class="ok ? 'uk-label-success' : 'uk-label-danger'">{{ ok ? "Autenticado" : "Sin sesión" }}</span>
    <div class="uk-text-muted uk-text-truncate" :title="status">{{ status }}</div>
    <form v-if="!ok" class="uk-margin-small-top" @submit.prevent="login">
      <input class="uk-input uk-form-small" v-model="token" type="password" placeholder="API token (pk_…)" required />
      <button class="uk-button uk-button-small uk-button-default uk-width-1-1 uk-margin-small-top" :disabled="busy">Iniciar sesión</button>
    </form>
  </div>
</template>
