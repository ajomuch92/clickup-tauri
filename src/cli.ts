import { invoke } from "@tauri-apps/api/core";
import { parseHelp, type Cmd } from "./help";
import { makeThrottle } from "./throttle";

export type Out = { code: number; stdout: string; stderr: string };

// ponytail: ClickUp allows 100 API calls/min per token; queue anything above 80 so bursts wait instead of failing with 429.
const throttle = makeThrottle(80, 60_000);

export async function run(args: string[], stdin?: string) {
  if (!args.includes("--help") && args[0] !== "auth") await throttle(); // local-only commands cost nothing
  return invoke<Out>("clickup", { args, stdin });
}

export async function help(path: string[], short = ""): Promise<Cmd> {
  const o = await run([...path, "--help"]);
  return parseHelp(path, o.stdout || o.stderr, short);
}

/** Run with --json and parse; throws with the CLI's stderr on failure. */
export async function json<T = any>(args: string[]): Promise<T> {
  const o = await run([...args, "--json"]);
  if (o.code !== 0) throw new Error(o.stderr.trim() || o.stdout.trim() || `exit ${o.code}`);
  return JSON.parse(o.stdout);
}
