// Parses cobra-style `clickup ... --help` text into a form spec. No imports: runnable under plain node for the self-check.
export type Flag = { name: string; short?: string; type: string; desc: string; def?: string };
export type Positional = { name: string; optional: boolean; variadic: boolean };
export type Cmd = {
  path: string[];
  short: string;
  long: string;
  positionals: Positional[];
  flags: Flag[];
  subs: { name: string; short: string }[];
  examples: string;
};

const HEADERS = ["Usage", "Examples", "Available Commands", "Flags", "Global Flags", "Aliases"];

export function parseHelp(path: string[], text: string, short = ""): Cmd {
  const sections: Record<string, string[]> = { long: [] };
  let cur = "long";
  for (const line of text.split("\n")) {
    const h = HEADERS.find((h) => line === h + ":");
    if (h) { cur = h; sections[h] = []; continue; }
    if (line.startsWith('Use "')) continue;
    sections[cur].push(line);
  }
  const usage =
    (sections.Usage ?? []).map((l) => l.trim()).find((l) => l.startsWith("clickup") && !l.endsWith("[command]")) ?? "";
  return {
    path,
    short,
    long: sections.long.join("\n").trim(),
    positionals: parseUsage(usage, path),
    flags: (sections.Flags ?? []).map(parseFlag).filter((f): f is Flag => !!f),
    subs: (sections["Available Commands"] ?? [])
      .map((l) => l.trim().match(/^(\S+)\s+(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ name: m[1], short: m[2] }))
      .filter((s) => s.name !== "help"),
    examples: (sections.Examples ?? []).join("\n").trim(),
  };
}

function parseUsage(usage: string, path: string[]): Positional[] {
  const out: Positional[] = [];
  let skip = false;
  for (const t of usage.split(/\s+/).slice(1 + path.length)) {
    if (skip) { skip = false; continue; }
    if (t.startsWith("-")) { skip = true; continue; } // `--list-id <list-id>` inside usage is a flag, not a positional
    if (t === "[flags]" || t === "[command]") continue;
    const name = t.replace(/[<>[\].]/g, "");
    if (name) out.push({ name, optional: t.startsWith("["), variadic: t.includes("...") });
  }
  return out;
}

function parseFlag(line: string): Flag | undefined {
  const m = line.replace(/\[=[^\]]*\]/, "").match(/^\s+(?:-(\w),\s+)?--([\w-]+)(?:\s+(\w+))?\s{2,}(.*)$/);
  if (!m || m[2] === "help") return;
  const def = m[4].match(/\(default (.+)\)\s*$/)?.[1]?.replace(/^"|"$/g, "");
  return { name: m[2], short: m[1], type: m[3] ?? "bool", desc: m[4], def };
}
