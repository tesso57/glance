import { execFile } from "node:child_process";
import type { ChartSource, Component, Dependency, Overview } from "./model.ts";
import type { StateChart } from "./chart.ts";

export type Chart = ChartSource & StateChart & { key: string; workflow: string };
const palette = [
  ["#d6eae4", "#559a8d"], ["#eaf1f1", "#98b5b6"], ["#fff0d7", "#c59e64"],
  ["#f3efea", "#b1a79d"], ["#edeaf6", "#a59abb"], ["#eaf0f8", "#8aabc0"],
];
const layers = { runtime: ["#587d7b", "solid"], event: ["#b36524", "dashed"], build: ["#716e9b", "dotted"] };
const graphStyle = 'graph [rankdir=LR, bgcolor="transparent", pad=0.2, nodesep=0.23, ranksep=0.65, outputorder=edgesfirst, fontname="Helvetica"];';
const nodeStyle = 'node [shape=box, style="rounded,filled", fillcolor="#eff7f5", color="#82aa9e", fontcolor="#153b35", fontname="Helvetica", fontsize=14, margin="0.14,0.08"];';
const edgeStyle = 'edge [color="#537977", fontcolor="#38575a", fontname="Helvetica", fontsize=11, arrowsize=0.67];';

function quote(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n?|\n/g, "\\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ") + '"';
}

function svg(lines: string[], graph = graphStyle): Promise<string> {
  return new Promise((resolve, reject) => {
    const dot = execFile("dot", ["-Tsvg"], { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 }, (error, out) => {
      if (error) {
        reject(error.code === "ENOENT" ? new Error("図の生成には Graphviz の dot が必要です。PATH に追加してください。") : error);
        return;
      }
      const start = out.indexOf("<svg ");
      if (start < 0) { reject(new Error("Graphviz の SVG 出力がありません。")); return; }
      resolve(out.slice(start).replace(/<!--[\s\S]*?-->/g, "").trim());
    });
    dot.stdin?.on("error", err => { if ((err as NodeJS.ErrnoException).code !== "EPIPE") reject(err); });
    dot.stdin?.end(["digraph {", graph, nodeStyle, edgeStyle, ...lines, "}"].join("\n"));
  });
}

function stateLines(chart: Chart): string[] {
  const prefix = chart.key + "_";
  const key = (s: string) => quote(prefix + s);
  const lines = chart.states.map(s => `${key(s.id)} [label=${quote(s.label)}];`);
  for (const edge of chart.transitions) lines.push(`${key(edge.from)} -> ${key(edge.to)} [label=${quote(edge.label)}];`);
  if (chart.initial.length) {
    lines.push(`${key("$start")} [shape=point,width=0.12,label="",color="#205c53"];`);
    for (const s of chart.initial) lines.push(`${key("$start")} -> ${key(s)};`);
  }
  if (chart.final.length) {
    lines.push(`${key("$end")} [shape=doublecircle,width=0.12,label="",color="#205c53"];`);
    for (const s of chart.final) lines.push(`${key(s)} -> ${key("$end")};`);
  }
  return lines;
}

function componentLines(components: Component[], dependencies: Dependency[], colors: Map<string, string[]>, labelEdges: boolean) {
  const edges = dependencies.map((edge, i) => {
    const [color, style] = layers[edge.kind];
    const label = labelEdges ? `,label=${quote(edge.label)}` : "";
    return `"n_${edge.from}" -> "n_${edge.to}" [class="dependency",id="edge_${i}"${label},color="${color}",fontcolor="${color}",style=${style}];`;
  });
  const nodes = components.map(c => {
    const [fill, stroke] = colors.get(c.group ?? "")!;
    return `"n_${c.id}" [class="component",id="node_${c.id}",label=${quote(c.label)},fillcolor="${fill}",color="${stroke}"];`;
  });
  return [...nodes, ...edges];
}

function chartBranches(charts: Chart[]): string[] {
  const lines: string[] = [];
  for (const chart of charts) {
    if (!chart.owners?.length) continue;
    const key = `chart_${chart.key}`;
    lines.push(`${key} [id="${key}",class="chart-branch",shape=note,label=${quote(chart.title)},fillcolor="#edf5fb",color="#6790ae",fontcolor="#294f6a",fontsize=12];`);
    for (const owner of chart.owners) {
      lines.push(`"n_${owner}" -> ${key} [id="owner_${chart.key}_${owner}",class="chart-branch",color="#457da8",arrowhead=dot,arrowsize=0.55];`);
    }
  }
  return lines;
}

export async function layoutOverview(data: Overview, charts: Chart[]) {
  const components = data.components ?? [], deps = data.dependencies ?? [];
  const groups = [...new Set(components.map(c => c.group ?? ""))];
  const colors = new Map(groups.map((g, i) => [g, palette[i % palette.length]]));
  const map = components.length ? await svg([...componentLines(components, deps, colors, true), ...chartBranches(charts)]) : "";

  const figures: Record<string, string> = {};
  const combined: string[] = [];
  if (components.length) {
    combined.push('subgraph cluster_components { id="region-components"; label="コンポーネントの依存関係"; color="#99ada5"; bgcolor="#f1f6f2";', ...componentLines(components, deps, colors, false), "}");
  }
  for (const chart of charts) {
    const lines = stateLines(chart);
    figures[chart.key] = await svg(lines, graphStyle.replace("rankdir=LR", "rankdir=TB"));
    combined.push(`subgraph cluster_${chart.key} { id="region-${chart.key}"; label=${quote(chart.workflow + " / " + chart.title)}; color="#99b4c3"; bgcolor="#f4f8fa";`, ...lines, "}");
    const target = chart.initial.length ? "$start" : chart.states[0].id;
    for (const owner of chart.owners ?? []) {
      combined.push(`"n_${owner}" -> "${chart.key}_${target}" [arrowhead=dot,color="#457da8",lhead=cluster_${chart.key},penwidth=1.9];`);
    }
  }
  const unified = charts.length ? await svg(combined, graphStyle + "graph [compound=true];") : "";
  return { map, figures, unified };
}
