import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const git = promisify(execFile);
const inputs = ["Spec.tla", "Spec.cfg"] as const;
type InputName = typeof inputs[number];
type Hashes = Record<InputName, string>;
type Model = { spec: Buffer; config: Buffer; sha256: Hashes };

interface Revision {
  id: string;
  addedAt: string;
  sha256: Hashes;
  workspaceHead: string | null;
}

function errno(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code;
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isDirectory()) throw new Error(`履歴用のディレクトリとして扱えません: ${path}`);
    return true;
  } catch (error) {
    if (errno(error) === "ENOENT") return false;
    throw error;
  }
}

export async function readModel(cwd: string): Promise<Model | undefined> {
  const dir = join(cwd, ".glance");
  if (!await directoryExists(dir)) return;
  const stats = () => Promise.all(inputs.map(name => lstat(join(dir, name), { bigint: true })));
  try {
    const before = await stats();
    if (!before.every(file => file.isFile())) throw new Error("履歴には通常ファイルの Spec.tla と Spec.cfg が必要です。");
    const [spec, config] = await Promise.all(inputs.map(async name => {
      const file = await open(join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try { return await file.readFile(); } finally { await file.close(); }
    }));
    const after = await stats();
    if (after.some((file, i) => file.dev !== before[i].dev || file.ino !== before[i].ino || file.ctimeNs !== before[i].ctimeNs)) {
      throw new Error("モデルが読み取り中に変更されました。編集後に /glance save で保存できます。");
    }
    const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
    return { spec, config, sha256: { "Spec.tla": hash(spec), "Spec.cfg": hash(config) } };
  } catch (error) {
    if (errno(error) === "ENOENT") return;
    throw error;
  }
}

export function sameModel(a: Model | undefined, b: Model | undefined): boolean {
  return inputs.every(name => a?.sha256[name] === b?.sha256[name]);
}

const idPattern = /^v([1-9][0-9]*)$/;
const digestPattern = /^[a-f0-9]{64}$/;
const readBatchSize = 8;

async function revisionIds(dir: string): Promise<string[]> {
  if (!await directoryExists(dir)) return [];
  const ids: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!idPattern.test(entry.name)) continue;
    if (!entry.isDirectory() || !Number.isSafeInteger(Number(entry.name.slice(1)))) {
      throw new Error(`履歴の版を読み取れません: ${entry.name}`);
    }
    ids.push(entry.name);
  }
  return ids.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

async function readRevision(dir: string, id: string): Promise<Revision> {
  const path = join(dir, id, "metadata.json");
  const meta = JSON.parse(await readFile(path, "utf8")) as Revision;
  if (meta?.id !== id || typeof meta.addedAt !== "string" || !Number.isFinite(Date.parse(meta.addedAt))
      || !inputs.every(name => typeof meta.sha256?.[name] === "string" && digestPattern.test(meta.sha256[name]))
      || !(meta.workspaceHead === null || /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(meta.workspaceHead))) {
    throw new Error(`履歴のメタデータを読み取れません: ${path}`);
  }
  return meta;
}

export async function listRevisions(cwd: string): Promise<Revision[]> {
  const dir = join(cwd, ".glance", "history");
  const ids = await revisionIds(dir);
  const revisions: Revision[] = [];
  for (let offset = 0; offset < ids.length; offset += readBatchSize) {
    const batch = ids.slice(offset, offset + readBatchSize);
    const results = await Promise.allSettled(batch.map(id => readRevision(dir, id)));
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      revisions.push(result.value);
    }
  }
  return revisions;
}

async function workspaceHead(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await git("git", ["rev-parse", "--verify", "HEAD"], { cwd, timeout: 2000 });
    return stdout.trim();
  } catch { return null; }
}

export async function recordModel(cwd: string, model: Model, reuseEarlier = false): Promise<Revision> {
  const parent = join(cwd, ".glance");
  if (!await directoryExists(parent)) throw new Error(".glance が見つかりません。");
  const dir = join(parent, "history");
  await mkdir(dir, { recursive: true });
  for (;;) {
    const ids = await revisionIds(dir);
    const last = ids.at(-1);
    for (const id of reuseEarlier ? ids.toReversed() : last ? [last] : []) {
      const saved = await readRevision(dir, id);
      if (inputs.every(name => saved.sha256[name] === model.sha256[name])) return saved;
    }
    const id = `v${last ? Number(last.slice(1)) + 1 : 1}`;
    const meta: Revision = { id, addedAt: new Date().toISOString(), sha256: model.sha256, workspaceHead: await workspaceHead(cwd) };
    const temp = await mkdtemp(join(dir, ".pending-"));
    try {
      await writeFile(join(temp, "Spec.tla"), model.spec);
      await writeFile(join(temp, "Spec.cfg"), model.config);
      await writeFile(join(temp, "metadata.json"), JSON.stringify(meta, null, 2) + "\n");
      try { await rename(temp, join(dir, id)); }
      catch (error) {
        if (errno(error) === "EEXIST" || errno(error) === "ENOTEMPTY") continue;
        throw error;
      }
      return meta;
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
}

export function describeHistory(revisions: Revision[]): string {
  if (!revisions.length) return "モデル履歴はまだありません。現在の版は /glance save で保存できます。";
  const rows = revisions.map((entry, index) => {
    const changed = inputs.filter(name => entry.sha256[name] !== revisions[index - 1]?.sha256[name]);
    return `${entry.id}  ${entry.addedAt}  ${index ? "変更" : "初回"}: ${changed.join(", ")}`;
  });
  return ["モデル履歴（保存日時は UTC）", ...rows.reverse()].join("\n");
}
