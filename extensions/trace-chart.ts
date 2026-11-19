import type { TlcTrace } from "./tlc.ts";
import { mermaidLabel } from "./mermaid-label.ts";

export function traceToMermaid(trace: TlcTrace): string {
  if (!trace.states.length) throw new Error("反例に状態がありません。");
  const numbers = new Set(trace.states.map(state => state.number));
  if (numbers.size !== trace.states.length || trace.states.some(state => !Number.isSafeInteger(state.number) || state.number < 1)) {
    throw new Error("反例の状態番号が不正です。");
  }
  const lines = ["stateDiagram-v2"];
  for (const state of trace.states) lines.push(`    t${state.number} : ${mermaidLabel(`${state.number}. ${state.value}`)}`);
  lines.push(`    [*] --> t${trace.states[0].number}`);
  for (let i = 1; i < trace.states.length; i++) {
    const state = trace.states[i];
    lines.push(`    t${trace.states[i - 1].number} --> t${state.number} : ${mermaidLabel(state.action)}`);
  }
  if (trace.loop?.kind === "back") {
    if (!numbers.has(trace.loop.target)) throw new Error("反例のループ先が見つかりません。");
    lines.push(`    t${trace.states.at(-1)!.number} --> t${trace.loop.target} : ${mermaidLabel(trace.loop.action ?? "ループ")}`);
  } else if (trace.loop?.kind === "stuttering") {
    lines.push(`    t${trace.states.at(-1)!.number} --> t${trace.states.at(-1)!.number} : 停止`);
  }
  return lines.join("\n") + "\n";
}
