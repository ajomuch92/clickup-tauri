// Self-check: `pnpm check`. Fails loudly if the help parser breaks.
import assert from "node:assert/strict";
import { parseHelp } from "./help.ts";
import { makeThrottle } from "./throttle.ts";
import { md } from "./md.ts";

const c = parseHelp(["task", "list-add"], `
Add tasks.

Usage:
  clickup task list-add <task-id>... --list-id <list-id> [flags]

Examples:
  clickup task list-add 86abc123 --list-id 901613544162

Flags:
  -h, --help              help for list-add
      --json              Output JSON
      --list-id string    Target list ID (required)
      --team string[=" "]   Workspace ID override
      --points float      Sprint/story points (default -999)
      --type string       Template type: task, folder, or list (default "task")
  -y, --yes               Skip confirmation prompt
`);
assert.deepEqual(c.positionals, [{ name: "task-id", optional: false, variadic: true }]);
assert.deepEqual(c.flags.map((f) => [f.name, f.type, f.short, f.def]), [
  ["json", "bool", undefined, undefined],
  ["list-id", "string", undefined, undefined],
  ["team", "string", undefined, undefined],
  ["points", "float", undefined, "-999"],
  ["type", "string", undefined, "task"],
  ["yes", "bool", "y", undefined],
]);
assert.equal(c.long, "Add tasks.");
assert.equal(c.examples, "clickup task list-add 86abc123 --list-id 901613544162");

const a = parseHelp(["attachment", "add"], "Usage:\n  clickup attachment add [TASK] <FILE>... [flags]\n");
assert.deepEqual(a.positionals, [
  { name: "TASK", optional: true, variadic: false },
  { name: "FILE", optional: false, variadic: true },
]);
const v = parseHelp(["task", "view"], "Usage:\n  clickup task view [<task-id>...] [flags]\n");
assert.deepEqual(v.positionals, [{ name: "task-id", optional: true, variadic: true }]);

const g = parseHelp(["task"], "Usage:\n  clickup task <command> [flags]\n  clickup task [command]\n\nAvailable Commands:\n  view        View tasks\n  help        Help\n");
assert.deepEqual(g.subs, [{ name: "view", short: "View tasks" }]);
assert.deepEqual(g.positionals, [{ name: "command", optional: false, variadic: false }]);
console.log("help.ts ok");

const t = makeThrottle(3, 200);
const t0 = Date.now();
await t(); await t(); await t();
assert.ok(Date.now() - t0 < 50, "first 3 calls are immediate");
await t();
assert.ok(Date.now() - t0 >= 200, "4th call waits for the window");
console.log("throttle.ts ok");

assert.equal(md("**b** _i_ *i2* <u>u</u> ~~s~~ `c`"), "<b>b</b> <i>i</i> <i>i2</i> <u>u</u> <s>s</s> <code>c</code>");
assert.equal(md("[@Ana López](#user_mention#1) hi"), '<span class="mention">@Ana López</span> hi');
assert.equal(md("![:gandalf:](https://x.test/g.gif)"), '<img class="emo" src="https://x.test/g.gif" alt=":gandalf:" title=":gandalf:">');
assert.equal(md('<script>alert(1)</script> [x](javascript:alert(1))'), "&lt;script&gt;alert(1)&lt;/script&gt; [x](javascript:alert(1))");
assert.equal(md("snake_case_name and 2*3*4"), "snake_case_name and 2*3*4");
assert.equal(md("![shot.png](https://x.test/s.png)"), '<img class="img" src="https://x.test/s.png" alt="shot.png" title="shot.png">');
console.log("md.ts ok");
