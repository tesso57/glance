import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { readChart } from "./chart.ts";
import { layoutOverview, type Chart } from "./layout.ts";
import { parseOverview, type Overview, type Workflow } from "./model.ts";

const exec = promisify(execFile);
const docs: [string, string][] = [
  ["Spec.tla", "TLA+ 仕様"], ["Spec.cfg", "TLC 設定"], ["model.md", "モデルの説明"],
  ["dependencies.md", "依存関係の根拠"], ["verification.md", "検査記録"],
];

function checkPath(path: string) {
  if (isAbsolute(path) || path.split("/").some(p => !p || p === "." || p === "..") || /[\\:\u0000-\u001f]/.test(path)) {
    throw new Error(`作業領域からの相対パスを指定してください（${path}）。`);
  }
}
async function localFile(root: string, path: string) {
  checkPath(path);
  const file = await realpath(join(root, path));
  const rel = relative(root, file);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) throw new Error(`作業領域の外を参照しています（${path}）。`);
  return file;
}

function cachedFile<T>(read: (path: string) => Promise<T>) {
  const files = new Map<string, Promise<T>>();
  return (path: string) => {
    if (!files.has(path)) files.set(path, read(path));
    return files.get(path)!;
  };
}

async function resolveCharts(input: Workflow[], dir: string) {
  const read = cachedFile(async path => readFile(await localFile(dir, path), "utf8"));
  const charts: Chart[] = [], workflows = [];
  for (const flow of input) {
    const keys = [];
    const involved = new Set(flow.components ?? []);
    for (const source of flow.charts ?? []) {
      const key = "c" + charts.length;
      try {
        const diagram = readChart(await read(source.file), source.heading);
        charts.push({ ...source, ...diagram, key, workflow: flow.label });
      } catch (error) { throw new Error(`${source.file}（${source.title}）: ${(error as Error).message}`); }
      keys.push(key);
      for (const owner of source.owners ?? []) involved.add(owner);
    }
    workflows.push({ ...flow, components: [...involved], charts: keys });
  }
  return { charts, workflows };
}

async function sourceExcerpts(root: string, data: Overview) {
  let gitPrefix: string | undefined;
  const readLines = cachedFile(async file => {
    let contents: string;
    if (data.sourceCommit) {
      checkPath(file);
      gitPrefix ??= (await exec("git", ["rev-parse", "--show-prefix"], { cwd: root })).stdout.trimEnd();
      const { stdout } = await exec("git", ["cat-file", "blob", data.sourceCommit + ":" + gitPrefix + file], {
        cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
      });
      contents = stdout;
    } else {
      contents = await readFile(await localFile(root, file), "utf8");
    }
    const lines = contents.replace(/\r\n/g, "\n").split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines;
  });

  const sources = [
    ...(data.workflows ?? []).flatMap(flow => (flow.evidence ?? []).flatMap(fact => fact.sources ?? [])),
    ...(data.dependencies ?? []).flatMap(edge => edge.sources ?? []),
  ];
  const excerpts = new Map<string, { file: string; line: number; start: number; snippet: string }>();
  for (const { file, line } of sources) {
    const key = file + "#" + line;
    if (excerpts.has(key)) continue;
    const lines = await readLines(file);
    if (line > lines.length) throw new Error(`根拠の行がありません（${file}:${line}）。`);
    const start = Math.max(1, line - 1);
    excerpts.set(key, { file, line, start, snippet: lines.slice(start - 1, line + 3).join("\n") });
  }
  return Object.fromEntries(excerpts);
}

async function renderPage(payload: unknown) {
  const assets = ["page.html", "style.css", "map-camera.js", "component-map.js", "overview-dialog.js", "viewer.js"];
  const [template, style, ...scripts] = await Promise.all(assets.map(file => readFile(new URL(file, import.meta.url), "utf8")));
  const json = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  const slots: Record<string, string> = { STYLE: style, DATA: json, APP: scripts.join("\n") };
  return template.replace(/@@(STYLE|DATA|APP)@@/g, (_, key: string) => slots[key]);
}

export async function generateOverview(cwd: string): Promise<string> {
  const root = await realpath(cwd);
  let dir: string, input: string;
  try {
    dir = await localFile(root, ".glance");
    input = await readFile(await localFile(dir, "overview.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("入力の .glance/overview.json がありません。/glance overview init で準備できます。");
    }
    throw error;
  }
  const data = parseOverview(input);
  const { workflows, charts } = await resolveCharts(data.workflows ?? [], dir);
  const excerpts = await sourceExcerpts(root, data);
  const layouts = await layoutOverview(data, charts);
  const links = [];
  for (const [file, label] of docs) {
    try { if ((await stat(await localFile(dir, file))).isFile()) links.push({ file, label }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const html = await renderPage({ ...data, workflows, charts, excerpts, links, layouts });
  const output = join(dir, "overview.html");
  const temp = join(dir, ".overview.html." + randomUUID() + ".tmp");
  try {
    await writeFile(temp, html, { flag: "wx" });
    await rename(temp, output);
  } finally { await rm(temp, { force: true }); }
  return output;
}
