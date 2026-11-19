import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.ts";
import { listRevisions } from "../extensions/history.ts";
import { createFakeModel } from "./helpers/fake-model.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

async function project(t: TestContext) {
  const cwd = await mkdtemp(join(tmpdir(), "glance-history-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dir = join(cwd, ".glance");
  await mkdir(dir);
  const newSession = () => {
    const mock = createMockPi();
    (mock.context as { cwd: string }).cwd = cwd;
    extension(mock.pi);
    return mock;
  };
  return { dir, cwd, newSession };
}

test("save keeps the original files and dates across sessions, including config-only changes and reversions", async t => {
  const { dir, cwd, newSession } = await project(t);
  const first = newSession();
  const spec = Buffer.from("VARIABLE 状態\r\n");
  await writeFile(join(dir, "Spec.tla"), spec);
  await first.runCommand("glance", "save");
  assert.match(first.notifications.at(-1)!.message, /両方/);
  assert.deepEqual(await readdir(dir), ["Spec.tla"]);
  await writeFile(join(dir, "Spec.cfg"), "CONSTANT Fail = TRUE\n");
  await first.runCommand("glance", "save");
  const second = newSession();
  await second.runCommand("glance", "save");
  await writeFile(join(dir, "Spec.cfg"), "CONSTANT Fail = FALSE\n");
  await second.runCommand("glance", "save");
  await writeFile(join(dir, "Spec.cfg"), "CONSTANT Fail = TRUE\n");
  await second.runCommand("glance", "save");
  const entries = await listRevisions(cwd);
  assert.deepEqual(entries.map(e => e.id), ["v1", "v2", "v3"]);
  assert.equal(new Date(entries[0].addedAt).toISOString(), entries[0].addedAt);
  assert.equal(entries[0].sha256["Spec.tla"], createHash("sha256").update(spec).digest("hex"));
  assert.equal(entries[0].workspaceHead, null);
  assert.deepEqual(await readFile(join(dir, "history/v1/Spec.tla")), spec);
  assert.equal(await readFile(join(dir, "history/v1/Spec.cfg"), "utf8"), "CONSTANT Fail = TRUE\n");
  assert.equal(await readFile(join(dir, "history/v2/Spec.cfg"), "utf8"), "CONSTANT Fail = FALSE\n");
  await second.runCommand("glance", "history");
  const shown = String(second.messages[0].message.content);
  assert.ok(shown.includes(entries[0].addedAt));
  assert.match(shown, /v2 .*変更: Spec.cfg\n/);
  assert.equal(second.userMessages.length, 0);
  await second.runCommand("glance", "diff v99");
  assert.equal(second.userMessages.length, 0);
  await second.runCommand("glance", "diff v2");
  assert.match(String(second.userMessages[0].content), /\.glance\/history\/v2\//);
});

test("simultaneous saves publish one complete revision", async t => {
  const { cwd, dir, newSession } = await project(t);
  await writeFile(join(dir, "Spec.tla"), "A");
  await writeFile(join(dir, "Spec.cfg"), "a");
  const sessions = Array.from({ length: 5 }, newSession);
  await Promise.all(sessions.map(mock => mock.runCommand("glance", "save")));
  for (const mock of sessions) assert.match(mock.notifications.at(-1)!.message, /現在のモデルは v1/);
  assert.deepEqual((await listRevisions(cwd)).map(e => e.id), ["v1"]);
  assert.deepEqual(await readdir(join(dir, "history")), ["v1"]);
});

async function seedHistory(dir: string) {
  const history = join(dir, "history");
  const ids = Array.from({ length: 10 }, (_, index) => `v${index + 1}`);
  for (const id of ids.toReversed()) {
    const revision = join(history, id);
    const spec = `model ${id}`;
    const config = "config";
    const hash = (data: string) => createHash("sha256").update(data).digest("hex");
    await mkdir(revision, { recursive: true });
    await Promise.all([
      writeFile(join(revision, "Spec.tla"), spec),
      writeFile(join(revision, "Spec.cfg"), config),
      writeFile(join(revision, "metadata.json"), JSON.stringify({
        id, addedAt: "2026-01-01T00:00:00.000Z", workspaceHead: null,
        sha256: { "Spec.tla": hash(spec), "Spec.cfg": hash(config) },
      })),
    ]);
  }
  return { history, ids };
}

function interceptMetadata(
  t: TestContext, history: string, read: (id: string, original: () => Promise<string>) => Promise<string>,
) {
  const original = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (...args: Parameters<typeof original>) => {
    const [path, encoding] = args;
    if (typeof path === "string" && encoding === "utf8" && basename(path) === "metadata.json"
        && dirname(dirname(path)) === history) {
      return read(basename(dirname(path)), () => original(path, "utf8"));
    }
    return original(...args);
  });
  syncBuiltinESMExports();
  t.after(() => {
    mock.mock.restore();
    syncBuiltinESMExports();
  });
}

function gate() {
  let release!: () => void;
  const opened = new Promise<void>(resolve => { release = resolve; });
  return { opened, release };
}

test("list reads eight at a time and omits a revision saved after enumeration", { timeout: 15000 }, async t => {
  const { cwd, dir, newSession } = await project(t);
  const { history, ids } = await seedHistory(dir);
  await mkdir(join(history, ".pending-unpublished"));
  await writeFile(join(dir, "Spec.tla"), "new model");
  await writeFile(join(dir, "Spec.cfg"), "new config");
  const started = gate();
  const first = gate();
  const eighth = gate();
  const reads: string[] = [];
  let saving = false;
  interceptMetadata(t, history, async (id, original) => {
    if (saving) return original();
    reads.push(id);
    if (id === "v1") {
      started.release();
      await first.opened;
    }
    const contents = await original();
    if (id === "v8") eighth.release();
    return contents;
  });

  const listing = listRevisions(cwd);
  try {
    await Promise.race([started.opened, listing]);
    assert.deepEqual(reads, ids.slice(0, 8));
    await Promise.race([eighth.opened, listing]);
    saving = true;
    const writer = newSession();
    await writer.runCommand("glance", "save");
    assert.match(writer.notifications.at(-1)!.message, /現在のモデルは v11/);
    assert.deepEqual(reads, ids.slice(0, 8));
  } finally {
    saving = false;
    first.release();
  }
  assert.deepEqual((await listing).map(entry => entry.id), ids);
  assert.deepEqual(reads, ids);
  assert.deepEqual((await listRevisions(cwd)).map(entry => entry.id), [...ids, "v11"]);
});

test("list rejects with the first error in numeric order and skips the next batch", { timeout: 15000 }, async t => {
  const { cwd, dir } = await project(t);
  const { history, ids } = await seedHistory(dir);
  const earlierPath = join(history, "v2", "metadata.json");
  await writeFile(earlierPath, "{}");
  await rm(join(history, "v3", "metadata.json"));
  const earlier = gate();
  const later = gate();
  const reads: string[] = [];
  interceptMetadata(t, history, async (id, original) => {
    reads.push(id);
    if (id === "v2") await earlier.opened;
    try {
      return await original();
    } catch (error) {
      if (id === "v3") later.release();
      throw error;
    }
  });

  const rejected = assert.rejects(listRevisions(cwd), {
    message: `履歴のメタデータを読み取れません: ${earlierPath}`,
  });
  try {
    await Promise.race([later.opened, rejected]);
    assert.deepEqual(reads, ids.slice(0, 8));
  } finally {
    earlier.release();
  }
  await rejected;
  assert.deepEqual(reads, ids.slice(0, 8));
});

test("Pi archives a pre-existing model and the finished pair when its agent edits both files", async t => {
  const { cwd, dir } = await project(t);
  await writeFile(join(dir, "Spec.tla"), "first model");
  await writeFile(join(dir, "Spec.cfg"), "first config");
  const agentDir = join(cwd, "agent");
  const loader = new DefaultResourceLoader({
    cwd, agentDir, additionalExtensionPaths: [resolve("extensions/index.ts")],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const fake = createFakeModel([
    { content: [{ type: "text", text: "概要です。" }] },
    { content: [{ type: "toolCall", id: "spec", name: "write", arguments: { path: ".glance/Spec.tla", content: "new model" } }] },
    { content: [{ type: "toolCall", id: "cfg", name: "write", arguments: { path: ".glance/Spec.cfg", content: "new config" } }] },
    { content: [{ type: "text", text: "更新しました。" }] },
  ]);
  const {session} = await createAgentSession({
    cwd, agentDir, resourceLoader: loader, model: fake.model, sessionManager: SessionManager.inMemory(cwd), tools: ["write"],
  });
  try {
    session.modelRuntime.hasConfiguredAuth = () => true;
    session.agent.streamFunction = fake.stream;
    await session.prompt("モデルを説明して");
    assert.deepEqual(await listRevisions(cwd), []);
    await session.prompt("モデルと設定を更新して");
    assert.equal(await readFile(join(dir, "Spec.cfg"), "utf8"), "new config");
    assert.deepEqual((await listRevisions(cwd)).map(e => e.id), ["v1", "v2"]);
    assert.equal(await readFile(join(dir, "history/v1/Spec.tla"), "utf8"), "first model");
    assert.equal(await readFile(join(dir, "history/v1/Spec.cfg"), "utf8"), "first config");
    assert.equal(await readFile(join(dir, "history/v2/Spec.tla"), "utf8"), "new model");
    assert.equal(await readFile(join(dir, "history/v2/Spec.cfg"), "utf8"), "new config");
    await session.prompt("/glance history");
    const shown = session.messages.find(m => m.role === "custom" && m.customType === "glance-history");
    assert.ok(shown && shown.role === "custom");
    assert.match(String(shown.content), /v2 .*Spec\.tla, Spec\.cfg/);
  } finally { session.dispose(); }
});
