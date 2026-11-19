import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import extension, { readGlossary } from "../extensions/index.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

test("/glance asks the agent to create a state-focused model", async () => {
  const mock = createMockPi();
  extension(mock.pi);
  await mock.runCommand("glance", "TODO リストを作る");
  assert.equal(mock.userMessages.length, 1);
  assert.match(String(mock.userMessages[0].content), /TODO リストを作る/);
  assert.match(String(mock.userMessages[0].content), /skills\/glance\/SKILL\.md/);
});

test("/glance asks for a subject and does nothing if cancelled", async () => {
  const mock = createMockPi({ input: [undefined] });
  extension(mock.pi);
  await mock.runCommand("glance");
  assert.equal(mock.userMessages.length, 0);
});

test("/glance show displays the saved model without prompting the agent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-test-"));
  try {
    await mkdir(join(dir, ".glance"));
    await writeFile(join(dir, ".glance", "model.md"), "# Todo model\n");
    const mock = createMockPi();
    (mock.context as { cwd: string }).cwd = dir;
    extension(mock.pi);
    await mock.runCommand("glance", "show");
    assert.equal(mock.messages[0].message.content, "# Todo model\n");
    assert.equal(mock.userMessages.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("/glance diff requests a read-only comparison", async () => {
  const mock = createMockPi();
  mock.setIdle(false);
  extension(mock.pi);
  await mock.runCommand("glance", "diff");
  assert.match(String(mock.userMessages[0].content), /baseline\.md/);
  assert.equal(mock.userMessages[0].options?.deliverAs, "followUp");
});

test("deps displays the project's saved dependency view, with guidance if missing", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "glance-deps-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMockPi();
  (mock.context as { cwd: string }).cwd = cwd;
  extension(mock.pi);
  await mock.runCommand("glance", "deps");
  assert.match(mock.notifications[0].message, /依存図はまだありません/);
  await mkdir(join(cwd, ".glance"));
  const diagram = "# Dependencies\n\n```mermaid\nflowchart LR\n  Client --> Store\n```\n";
  await writeFile(join(cwd, ".glance/dependencies.md"), diagram);
  await mock.runCommand("glance", "deps");
  assert.deepEqual(mock.messages[0].message, { customType: "glance-dependencies", content: diagram, display: true });
  assert.equal(mock.userMessages.length, 0);
});

test("/glance check waits until the agent is idle", async () => {
  const mock = createMockPi();
  mock.setIdle(false);
  extension(mock.pi);
  await mock.runCommand("glance", "check");
  assert.match(mock.notifications[0].message, /処理が終わってから/);
  assert.equal(mock.messages.length, 0);
});

test("check shows the configuration even when TLC cannot start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-cfg-"));
  try {
    await mkdir(join(dir, ".glance"));
    await writeFile(join(dir, ".glance", "Spec.cfg"), "CONSTANT SimulateFailure = TRUE\n");
    const mock = createMockPi();
    (mock.context as { cwd: string }).cwd = dir;
    extension(mock.pi);
    await mock.runCommand("glance", "check");
    assert.match(String(mock.messages[0].message.content), /SimulateFailure = TRUE/);
    assert.match(String(mock.messages[0].message.content), /他の値や条件が検査されたことは分かりません/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("invalid chart arguments report usage without sending a prompt", async () => {
  const mock = createMockPi();
  extension(mock.pi);
  await mock.runCommand("glance", "chart --by");
  assert.match(mock.notifications[0].message, /使い方/);
  assert.equal(mock.userMessages.length, 0);
});

test("glossary shows the explanation and clearly identifies missing or empty descriptions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-glossary-"));
  try {
    assert.match(await readGlossary(dir), /説明はまだありません/);
    await mkdir(join(dir, ".glance"));
    await writeFile(join(dir, ".glance", "glossary.md"), " \n");
    assert.match(await readGlossary(dir), /空です/);
    await writeFile(join(dir, ".glance", "glossary.md"), "### runArtifacts\n測定値の CSV と診断レポートを図中でひとまとめにしたもの。\n");
    assert.match(await readGlossary(dir), /測定値の CSV と診断レポートを図中でひとまとめにしたもの/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
