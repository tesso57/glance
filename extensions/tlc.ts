import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveTlcJar, TLC_LOCK, type TlcJar } from "./tlc-pin.ts";

const OUTPUT_LIMIT = 64 * 1024;
const OUTPUT_HEAD_LIMIT = 16 * 1024;
const TIMEOUT_MS = 60_000;

export type TlcTrace = {
  kind: "invariant" | "deadlock" | "temporal";
  property?: string;
  states: { number: number; action: string; value: string }[];
  loop?: { kind: "back"; target: number; action?: string } | { kind: "stuttering" };
};

export function parseTlcTrace(output: string, diagnostics = output): TlcTrace | undefined {
  output = output.replace(/\r\n/g, "\n");
  diagnostics = diagnostics.replace(/\r\n/g, "\n");
  const invariant = /^Error: Invariant (.+?) is violated\.$/m.exec(diagnostics);
  const kind: TlcTrace["kind"] | undefined = invariant ? "invariant"
    : /^Error: Deadlock reached\.$/m.test(diagnostics) ? "deadlock"
    : /^Error: Temporal properties were violated\.$/m.test(diagnostics) ? "temporal" : undefined;
  if (!kind) return undefined;
  const marker = /^Error: (?:The behavior up to this point is:|The following behavior constitutes a counter-example:)\s*$/m.exec(output);
  if (!marker) return undefined;
  const rest = output.slice(marker.index + marker[0].length);
  const lines = rest.replace(/\r\n/g, "\n").split("\n");
  const states: TlcTrace["states"] = [];
  let current: { number: number; action: string; lines: string[] } | undefined;
  let loop: TlcTrace["loop"];
  let finished = false;
  const flush = (): boolean => {
    if (!current) return true;
    const value = current.lines.join("\n").trim();
    if (!value) return false;
    states.push({ number: current.number, action: current.action, value });
    current = undefined;
    return true;
  };
  for (const line of lines) {
    const state = /^State (\d+): <(.+)>\s*$/.exec(line);
    if (state) {
      if (loop || !flush() || Number(state[1]) !== states.length + 1) return undefined;
      current = { number: Number(state[1]), action: state[2], lines: [] };
      continue;
    }
    const stuttering = /^State (\d+): Stuttering\s*$/.exec(line);
    if (stuttering) {
      if (kind !== "temporal" || !flush() || Number(stuttering[1]) !== states.length + 1 || !states.length || loop) return undefined;
      loop = { kind: "stuttering" };
      continue;
    }
    const back = /^Back to state (\d+)(?:: <(.+)>)?\s*$/.exec(line);
    if (back) {
      if (kind !== "temporal" || !flush() || !states.some(s => s.number === Number(back[1])) || loop) return undefined;
      loop = { kind: "back", target: Number(back[1]), ...(back[2] ? { action: back[2] } : {}) };
      continue;
    }
    if (/^(?:\d+ states generated|Finished(?: checking temporal properties)? in|Progress\(|Error:)/.test(line)) {
      finished = true;
      break;
    }
    if (current) current.lines.push(line);
    else if (line.trim()) return undefined;
  }
  if (!finished || !flush() || !states.length || (kind === "temporal" && !loop)) return undefined;
  return { kind, ...(invariant ? { property: invariant[1] } : {}), states, ...(loop ? { loop } : {}) };
}

export async function runTlc(cwd: string, options: { graph?: boolean; resolveJar?: (cwd: string) => Promise<TlcJar> } = {}): Promise<{ text: string; dot?: string; complete?: boolean; trace?: TlcTrace }> {
  const dir = resolve(cwd, ".glance");
  const spec = join(dir, "Spec.tla");
  const config = join(dir, "Spec.cfg");
  for (const file of [spec, config]) {
    try { await access(file); } catch { return { text: `TLC を実行できません: ${file} がありません。モデルと設定を用意してください。` }; }
  }
  let jar: TlcJar;
  try { jar = await (options.resolveJar ?? resolveTlcJar)(cwd); }
  catch (error) { return { text: `TLC を実行できません: ${error instanceof Error ? error.message : String(error)}` }; }
  let meta: string;
  try { meta = await mkdtemp(join(tmpdir(), "glance-tlc-")); }
  catch (error) { return { text: `TLC の一時領域を作成できません: ${String(error)}` }; }
  try {
    return await new Promise((resolveResult) => {
      let head = "", tail = "", total = 0;
      let timedOut = false;
      let launchError: string | undefined;
      const append = (str: string) => {
        total += str.length;
        if (head.length < OUTPUT_HEAD_LIMIT) head += str.slice(0, OUTPUT_HEAD_LIMIT - head.length);
        tail = (tail + str).slice(-OUTPUT_LIMIT);
      };
      const dotPath = join(meta, "states.dot");
      const args = ["-cp", jar.path, "tlc2.TLC", "-workers", "1", "-fp", "0", "-metadir", meta, "-config", config];
      if (options.graph) args.push("-dump", "dot,actionlabels", dotPath);
      args.push(spec);
      const child = spawn("java", args, {
        cwd: dir, stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (error) => { launchError = error.message; });
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, TIMEOUT_MS);
      child.on("close", async (code, signal) => {
        clearTimeout(timer);
        const truncated = total > OUTPUT_LIMIT;
        const output = truncated ? `${head}\n[中間の出力は省略されました]\n${tail}` : tail;
        const success = code === 0 && output.includes("Model checking completed. No error has been found.") && !truncated;
        const violation = /(?:Invariant .* is violated|Deadlock reached|Temporal properties were violated)/i.test(output);
        const trace = !timedOut && !signal && !launchError ? (parseTlcTrace(tail, output) ?? (!truncated ? undefined : parseTlcTrace(head, output))) : undefined;
        const status = launchError ? `起動失敗: ${launchError}`
          : timedOut ? "時間切れ: 検査は完了していません"
          : signal ? `中断: ${signal}`
          : success ? "モデル検査完了: TLC はエラーを検出しませんでした"
          : trace?.kind === "invariant" ? `性質違反: 不変条件 ${trace.property}（モデル上の反例）`
          : trace?.kind === "deadlock" ? "デッドロックを検出しました（モデル上の反例）"
          : trace?.kind === "temporal" ? "性質違反: 時間的性質（モデル上の反例）"
          : violation ? "性質違反またはデッドロックの可能性: TLC の出力を確認してください"
          : `検査失敗または結果不明 (終了コード: ${code})`;
        let dot: string | undefined;
        if (options.graph) {
          try { dot = await readFile(dotPath, "utf8"); } catch {}
        }
        const jarInfo = jar.source === "cache" ? `TLA+ Tools キャッシュ: v${TLC_LOCK.version}（実行時の照合なし）` : "指定 JAR（バージョン未確認）";
        resolveResult({ text: `${status}\n${jarInfo}: ${jar.path}\n対象: ${spec}\n設定: ${config}\nこの設定で指定したモデルの検査結果であり、実装の正しさや形式証明を意味しません。\n\n${output}${truncated ? "\n[出力は上限で切り詰められました]" : ""}`, dot, complete: success, trace });
      });
    });
  } finally {
    await rm(meta, { recursive: true, force: true });
  }
}
