import { mermaidLabel } from "./mermaid-label.ts";

interface Node { label: string; initial: boolean }
interface Edge { from: string; to: string; label: string }

function statements(input: string): string[] {
  const out: string[] = [];
  let buffer = "", quoted = false, escape = false, bracket = 0;
  for (const ch of input.replace(/\r\n/g, "\n")) {
    buffer += ch;
    if (quoted) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "[") bracket++;
    else if (ch === "]") { if (--bracket < 0) throw new Error("Invalid DOT: unexpected ]"); }
    else if (ch === "\n" && bracket === 0) {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = "";
    }
  }
  if (quoted || bracket !== 0) throw new Error("Invalid DOT: incomplete string or attributes");
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}

function attributes(input: string): Map<string, string> {
  const attrs = new Map<string, string>();
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /[\s,]/.test(input[i])) i++;
    if (i === input.length) break;
    const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(input.slice(i));
    if (!match) throw new Error(`Invalid DOT attribute near ${input.slice(i, i + 30)}`);
    const key = match[0]; i += key.length;
    while (/\s/.test(input[i] ?? "")) i++;
    if (input[i++] !== "=") throw new Error(`Invalid DOT attribute ${key}`);
    while (/\s/.test(input[i] ?? "")) i++;
    let value = "";
    if (input[i] === '"') {
      i++;
      let closed = false;
      while (i < input.length) {
        const ch = input[i++];
        if (ch === '"') { closed = true; break; }
        if (ch !== "\\") { value += ch; continue; }
        if (i >= input.length) throw new Error("Invalid DOT escape");
        const next = input[i++];
        if (next === "n" || next === "l" || next === "r") value += "\n";
        else if (next === '"' || next === "\\") value += next;
        else throw new Error(`Unsupported DOT escape \\${next}`);
      }
      if (!closed) throw new Error("Invalid DOT: unclosed attribute string");
    } else {
      const v = /^[A-Za-z0-9_.-]+/.exec(input.slice(i));
      if (!v) throw new Error(`Invalid DOT value for ${key}`);
      value = v[0]; i += value.length;
    }
    if (attrs.has(key)) throw new Error(`Duplicate DOT attribute ${key}`);
    attrs.set(key, value);
    while (/\s/.test(input[i] ?? "")) i++;
    if (i < input.length && input[i] !== ",") throw new Error(`Invalid DOT separator after ${key}`);
  }
  return attrs;
}

function parseGraph(dot: string): {nodes: Map<string, Node>; edges: Edge[]} {
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  let graph = false, cluster = false, closedGraph = false, closedCluster = false;
  for (const line of statements(dot)) {
    if (/^(?:strict\s+)?digraph\s+DiskGraph\s*\{$/.test(line) && !graph) { graph = true; continue; }
    if (!graph || closedGraph) throw new Error(`Unsupported DOT statement: ${line.slice(0, 100)}`);
    if (/^subgraph\s+cluster_graph\s*\{$/.test(line) && !cluster && !closedCluster) { cluster = true; continue; }
    if (line === "}") {
      if (cluster) { cluster = false; closedCluster = true; }
      else if (closedCluster) closedGraph = true;
      else throw new Error("Invalid DOT graph nesting");
      continue;
    }
    if (!cluster) {
      if (/^node\s*\[shape\s*=\s*box\s*,\s*style\s*=\s*rounded\]\s*;?$/.test(line) || /^nodesep\s*=\s*0\.35\s*;?$/.test(line)) continue;
      throw new Error(`Unsupported DOT graph header: ${line.slice(0, 100)}`);
    }
    if (/^color\s*=\s*"white"\s*;?$/.test(line) || /^\{\s*rank\s*=\s*same\s*;\s*(?:-?\d+\s*;\s*)*\}\s*$/.test(line)) continue;
    const edge = /^(-?\d+)\s*->\s*(-?\d+)(?:\s*\[([\s\S]*)\])?\s*;?$/.exec(line);
    if (edge) {
      const attr = edge[3] ? attributes(edge[3]) : new Map<string, string>();
      if ([...attr.keys()].some(key => !["label", "color", "fontcolor", "style"].includes(key))) throw new Error("Unsupported DOT edge attributes");
      edges.push({ from: edge[1], to: edge[2], label: attr.get("label") ?? "" });
      continue;
    }
    const node = /^(-?\d+)\s*\[([\s\S]*)\]\s*;?$/.exec(line);
    if (node) {
      const attr = attributes(node[2]);
      if ([...attr.keys()].some(key => !["label", "style", "tooltip", "fillcolor"].includes(key))) throw new Error("Unsupported DOT node attributes");
      const label = attr.get("label");
      if (label === undefined) throw new Error(`Missing label for state ${node[1]}`);
      if (attr.has("fillcolor")) throw new Error("Unsupported constrained state in DOT");
      const parsed = { label, initial: attr.get("style") === "filled" };
      const existing = nodes.get(node[1]);
      if (existing && (existing.label !== parsed.label || existing.initial !== parsed.initial)) throw new Error(`Conflicting state ${node[1]}`);
      nodes.set(node[1], parsed);
      continue;
    }
    throw new Error(`Unsupported DOT statement: ${line.slice(0, 100)}`);
  }
  if (!closedGraph || !closedCluster || nodes.size === 0) throw new Error("Invalid or empty TLC DOT graph");
  for (const edge of edges) if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`Edge references an unknown state: ${edge.from} -> ${edge.to}`);
  return {nodes, edges};
}

export function dotToMermaid(dot: string): string {
  const {nodes, edges} = parseGraph(dot);
  const ids = [...nodes.keys()].sort();
  const names = new Map(ids.map((id, index) => [id, `s${index}`]));
  const lines = ["stateDiagram-v2"];
  for (const id of ids) lines.push(`    ${names.get(id)} : ${mermaidLabel(nodes.get(id)!.label)}`);
  for (const id of ids) if (nodes.get(id)!.initial) lines.push(`    [*] --> ${names.get(id)}`);
  const arrows = new Set(edges.map(({from, to, label}) => `    ${names.get(from)} --> ${names.get(to)}${label ? ` : ${mermaidLabel(label)}` : ""}`));
  lines.push(...[...arrows].sort());
  return lines.join("\n") + "\n";
}

function scalarState(label: string): Map<string, string> {
  const state = new Map<string, string>();
  for (const line of label.split("\n")) {
    const match = /^\s*(?:\/\\\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|-?[0-9]+|[A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(line);
    if (!match) throw new Error(`Unsupported TLC state value: ${JSON.stringify(line)}`);
    if (state.has(match[1])) throw new Error(`Duplicate variable in TLC state: ${match[1]}`);
    state.set(match[1], match[2]);
  }
  return state;
}

export function projectDot(dot: string, variables: string[]): {mermaid: string; details: string} {
  if (!variables.length) throw new Error("Select at least one state variable");
  if (new Set(variables).size !== variables.length || variables.some(v => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v))) {
    throw new Error("Invalid or duplicate state variable");
  }
  const {nodes, edges} = parseGraph(dot);
  const groups = new Map<string, {values: string[]; members: string[]; initial: boolean}>();
  const membership = new Map<string, string>();
  const ids = [...nodes.keys()].sort();
  for (const id of ids) {
    const node = nodes.get(id)!;
    const state = scalarState(node.label);
    const values = variables.map(variable => {
      const value = state.get(variable);
      if (value === undefined) throw new Error(`Variable ${variable} is missing from state ${id}`);
      return value;
    });
    const key = JSON.stringify(values);
    const group = groups.get(key) ?? {values, members: [], initial: false};
    group.members.push(id);
    group.initial ||= node.initial;
    groups.set(key, group);
    membership.set(id, key);
  }
  const keys = [...groups.keys()].sort();
  const names = new Map(keys.map((key, i) => [key, `s${i}`]));
  const lines = ["stateDiagram-v2"];
  for (const key of keys) {
    const group = groups.get(key)!;
    const label = variables.map((v, i) => `${v} = ${group.values[i]}`).join(", ");
    lines.push(`    ${names.get(key)} : ${mermaidLabel(label)}`);
  }
  for (const key of keys) if (groups.get(key)!.initial) lines.push(`    [*] --> ${names.get(key)}`);
  const arrows = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = names.get(membership.get(edge.from)!)!;
    const to = names.get(membership.get(edge.to)!)!;
    const arrow = `    ${from} --> ${to}${edge.label ? ` : ${mermaidLabel(edge.label)}` : ""}`;
    const sources = arrows.get(arrow) ?? new Set<string>();
    sources.add(`${edge.from} → ${edge.to}`);
    arrows.set(arrow, sources);
  }
  lines.push(...[...arrows.keys()].sort());
  const details = [
    `表示変数: ${variables.join(", ")}`,
    "集約した矢印は元状態の少なくとも一つに遷移があることを示し、すべての元状態で実行できるとは限りません。連続する矢印は元のモデルで実行できない経路を示す場合があります。性質違反の印はこの図には表示していません。検査結果と元状態を確認してください。",
    "初期状態を含む集約状態でも、すべての元状態が初期状態とは限りません。",
    "元状態:",
  ];
  for (const key of keys) {
    const group = groups.get(key)!;
    details.push(`${names.get(key)}:`);
    for (const id of group.members) details.push(`  ${id}${nodes.get(id)!.initial ? " (初期状態)" : ""}: ${JSON.stringify(nodes.get(id)!.label)}`);
  }
  details.push("元遷移:");
  for (const arrow of [...arrows.keys()].sort()) details.push(`${arrow.trim()}: ${[...arrows.get(arrow)!].sort().join(", ")}`);
  return {mermaid: lines.join("\n") + "\n", details: details.join("\n")};
}
