import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import extension from "../extensions/index.ts";
import { readChart } from "../extensions/overview/chart.ts";
import { parseOverview } from "../extensions/overview/model.ts";
import { generateOverview } from "../extensions/overview/render.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

const hasDot = spawnSync("dot", ["-V"]).status === 0;

test("version, unique IDs and graph references are validated", () => {
  const components = [{ id: "store", label: "Store" }];
  const input = { schemaVersion: 1, title: "Example", components };
  const check = (changes: object) => parseOverview(JSON.stringify({ ...input, ...changes }));
  assert.throws(() => check({ schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => check({ componentz: [] }), /overview.json/);
  assert.throws(() => check({ components: [...components, ...components] }), /store/);
  assert.throws(() => check({ dependencies: [{ from: "store", to: "missing", kind: "runtime", label: "read" }] }), /missing/);
  assert.throws(() => check({ workflows: [{ id: "f", label: "F", charts: [{ title: "Chart", file: "f.mmd", owners: ["unknown"] }] }] }), /unknown/);
  assert.doesNotThrow(() => check({}));
});

test("reads glance Mermaid by heading, preserving every initial, final, loop and literal label", () => {
  const code = ['stateDiagram-v2', 'a : status = "済"', 'b : next<br/>value', '[*] --> a', '[*] --> b',
    'a --> b : Save', 'b --> b', 'a --> [*]', 'b --> [*]'].join("\n");
  const md = ['## Other', '```text', '## Lifecycle', '```', '## Lifecycle', '', '```mermaid', code, '```'].join("\n");
  const actual = readChart(md, "Lifecycle");
  assert.deepEqual(actual.initial, ["a", "b"]);
  assert.deepEqual(actual.final, ["a", "b"]);
  assert.equal(actual.states[0].label, 'status = "済"');
  assert.equal(actual.states[1].label, 'next\nvalue');
  assert.deepEqual(actual.transitions, [{ from: "a", to: "b", label: "Save" }, { from: "b", to: "b", label: "" }]);
  assert.throws(() => readChart(md + "\n" + md, "Lifecycle"), /一意/);
  assert.throws(() => readChart(code + "\na --> missing"), /missing/);
  assert.throws(() => readChart(md, "Unknown"), /Unknown/);
  assert.throws(() => readChart(code + "\nstate X {"), /記法/);
});

test("Pi renders the example deterministically and failed updates preserve the last report", { skip: !hasDot && "Graphviz dot required" }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), "glance-overview-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dir = join(cwd, ".glance"), input = join(dir, "overview.json");
  await cp("examples/todo", dir, { recursive: true });
  const mock = createMockPi();
  (mock.context as { cwd: string }).cwd = cwd;
  extension(mock.pi);
  const manifest = JSON.parse(await readFile(input, "utf8"));
  manifest.description = "表示例 </script> & @@APP@@";
  manifest.components.push({ id: "isolated", label: "単独" });
  await writeFile(input, JSON.stringify(manifest));
  await mock.runCommand("glance", "overview");
  assert.equal(mock.messages[0]?.message.customType, "glance-overview");
  assert.equal(mock.userMessages.length, 0);
  const output = join(dir, "overview.html"), html = await readFile(output, "utf8");
  const raw = /<script type="application\/json" id="dataset">([^<]+)<\/script>/.exec(html)![1];
  const data = JSON.parse(raw);
  assert.equal(data.description, manifest.description);
  assert.deepEqual(data.workflows[0].components, ["list", "todo"]);
  assert.ok(data.layouts.map.includes('id="node_isolated"'));
  assert.ok(data.layouts.map.includes('id="chart_c0"'));
  assert.ok(data.layouts.map.includes('id="owner_c0_todo"'));
  assert.ok(data.layouts.map.includes("TODO を開始・完了する"));
  assert.ok(!data.layouts.map.includes('id="owner_c0_list"'));
  assert.ok(data.layouts.unified.includes("<title>cluster_c0</title>"));
  assert.match(data.excerpts[".glance/Spec.tla#7"].snippet, /Complete ==/);
  await generateOverview(cwd);
  assert.equal(await readFile(output, "utf8"), html);
  manifest.workflows[0].charts[0].file = "missing.mmd";
  await writeFile(input, JSON.stringify(manifest));
  await assert.rejects(generateOverview(cwd), /missing.mmd/);
  assert.equal(await readFile(output, "utf8"), html);
});

test("chart-only workspaces render without verification or invented components", { skip: !hasDot && "Graphviz dot required" }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), "glance-chart-only-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dir = join(cwd, ".glance");
  await cp("examples/todo", dir, { recursive: true });
  const manifest = { schemaVersion: 1, title: "Status", workflows: [
    { id: "task", label: "Task", charts: [{ title: "Status", file: "status.mmd" }] },
  ] };
  await writeFile(join(dir, "overview.json"), JSON.stringify(manifest));
  const output = await generateOverview(cwd), html = await readFile(output, "utf8");
  const data = JSON.parse(/id="dataset">([^<]+)<\/script>/.exec(html)![1]);
  assert.equal(data.layouts.map, "");
  assert.equal(data.charts.length, 1);
  assert.equal(data.verification, undefined);
  await writeFile(join(cwd, "outside.mmd"), "stateDiagram-v2\na : A");
  await symlink(join(cwd, "outside.mmd"), join(dir, "outside.mmd"));
  manifest.workflows[0].charts[0].file = "outside.mmd";
  await writeFile(join(dir, "overview.json"), JSON.stringify(manifest));
  await assert.rejects(generateOverview(cwd), /作業領域の外/);
});

test("initialization asks Pi for the manifest and rendering a missing manifest explains the next command", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "glance-init-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMockPi();
  (mock.context as { cwd: string }).cwd = cwd;
  extension(mock.pi);
  await mock.runCommand("glance", "overview");
  assert.match(mock.notifications.at(-1)!.message, /overview init/);
  assert.equal(mock.userMessages.length, 0);
  await mock.runCommand("glance", "overview init");
  assert.match(String(mock.userMessages[0].content), /references\/overview.md/);
});
