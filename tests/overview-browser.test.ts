import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { generateOverview } from "../extensions/overview/render.ts";
import { parseOverview } from "../extensions/overview/model.ts";

const chrome = process.env.GLANCE_CHROMIUM || ["chromium", "google-chrome"].find(bin =>
  spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
const skip = !chrome ? "Chromium required" : spawnSync("dot", ["-V"]).status !== 0 && "Graphviz dot required";

test("an offline map preserves shared charts, layer visibility and zoom across expansions", { skip }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), "glance-browser-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dir = join(cwd, ".glance");
  await cp("examples/todo", dir, { recursive: true });
  const input = join(dir, "overview.json");
  const data = parseOverview(await readFile(input, "utf8"));
  data.components!.push({ id: "isolated", label: "単独" });
  data.workflows![0].charts![0].owners = ["todo", "list"];
  data.dependencies![0].sources = [{ file: ".glance/Spec.tla", line: 7 }];
  data.dependencies!.push({ from: "todo", to: "todo", kind: "event", label: "自己遷移" });
  await writeFile(input, JSON.stringify(data));
  const output = await generateOverview(cwd);

  const html = await readFile(output, "utf8");
  const check = await readFile(new URL("./helpers/overview-browser.js", import.meta.url), "utf8");
  await writeFile(output, html.replace("</body>", () => `<script type="module">\n${check}\n</script></body>`));
  const { stdout } = await promisify(execFile)(chrome!, [
    "--headless", "--disable-background-networking", "--disable-sync", "--no-first-run",
    "--user-data-dir=" + join(cwd, "profile"), "--dump-dom", pathToFileURL(output).href,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(/<body>([^<]*)<\/body>/.exec(stdout)?.[1], "PASS");
});
