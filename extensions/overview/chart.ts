export interface StateChart {
  states: { id: string; label: string }[];
  transitions: { from: string; to: string; label: string }[];
  initial: string[];
  final: string[];
}

function label(value: string): string {
  return value.replace(/<br\/>|\\u([\da-f]{4})/gi, (match, hex: string | undefined) =>
    hex ? String.fromCharCode(parseInt(hex, 16)) : match === "<br/>" ? "\n" : match);
}

export function readChart(source: string, heading?: string): StateChart {
  const lines = source.trim().split(/\r?\n/);
  let code = lines;
  if (heading !== undefined) {
    const blocks: string[][] = [];
    let matches = 0, level = 0, fence = "", capture = false;
    for (const line of lines) {
      if (fence) {
        if (line.trimEnd().startsWith(fence) && /^(`+|~+)$/.test(line.trimEnd()) && line[0] === fence[0]) {
          fence = ""; capture = false;
        } else if (capture) blocks.at(-1)!.push(line);
        continue;
      }
      const opening = /^(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening) {
        fence = opening[1];
        capture = level > 0 && opening[2].trim() === "mermaid";
        if (capture) blocks.push([]);
        continue;
      }
      const title = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!title) continue;
      if (title[2] === heading) { matches++; level = title[1].length; }
      else if (title[1].length <= level) level = 0;
    }
    if (matches !== 1 || blocks.length !== 1 || capture) {
      throw new Error(`見出し「${heading}」には一意の Mermaid ブロックが必要です。`);
    }
    code = blocks[0];
  }
  if (code[0]?.trim() !== "stateDiagram-v2") throw new Error("stateDiagram-v2 の図を指定してください。");
  const states = new Map<string, string>();
  const initial: string[] = [], final: string[] = [];
  const transitions: StateChart["transitions"] = [];
  for (const raw of code.slice(1)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    const state = /^([A-Za-z_]\w*)\s*:\s*(.+)$/.exec(line);
    if (state) {
      if (states.has(state[1])) throw new Error(`状態 ${state[1]} が重複しています。`);
      states.set(state[1], label(state[2]));
      continue;
    }
    const edge = /^(\[\*\]|[A-Za-z_]\w*)\s+-->\s+(\[\*\]|[A-Za-z_]\w*)(?:\s*:\s*(.+))?$/.exec(line);
    if (!edge) throw new Error(`対応していない状態図の記法です（${line}）`);
    const [, from, to, action] = edge;
    if (from === "[*]" || to === "[*]") {
      if (from === to || action) throw new Error(`対応していない始点・終点です（${line}）`);
      if (from === "[*]") initial.push(to);
      else final.push(from);
    } else {
      transitions.push({ from, to, label: label(action ?? "") });
    }
  }
  for (const key of [...initial, ...final, ...transitions.flatMap(e => [e.from, e.to])]) {
    if (!states.has(key)) throw new Error(`状態 ${key} の宣言がありません。`);
  }
  if (!states.size) throw new Error("状態の宣言がありません。");
  return { states: Array.from(states, ([id, label]) => ({ id, label })), initial, final, transitions };
}
