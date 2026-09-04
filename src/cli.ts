import { invoke } from "@tauri-apps/api/core";
import { parseHelp, type Cmd } from "./help";

export type Out = { code: number; stdout: string; stderr: string };

export const run = (args: string[], stdin?: string) => invoke<Out>("clickup", { args, stdin });

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
