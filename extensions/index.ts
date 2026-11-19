import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { runTlc } from "./tlc.ts";
import { GUIDANCE, REVIEW_GUIDANCE } from "./guidance.ts";
import { dotToMermaid, projectDot } from "./graph.ts";
import { summarizeConfig } from "./coverage.ts";
import { traceToMermaid } from "./trace-chart.ts";
import type { TlcTrace } from "./tlc.ts";
import { describeHistory, listRevisions, readModel, recordModel, sameModel } from "./history.ts";
import { generateOverview } from "./overview/render.ts";

export function formatTrace(trace?: TlcTrace): string {
  if (!trace) return "";
  try {
    return `\n\nTLC が報告した反例の経路（モデル内の振る舞いであり、実装の不具合とは限りません）:\n\n\`\`\`mermaid\n${traceToMermaid(trace)}\n\`\`\``;
  } catch (error) {
    return `\n\n反例の図を生成できません: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function makePrompt(subject: string): string {
  return `${GUIDANCE}

対象（ユーザーの指定）:
${subject}

この対象についてモデルを検討し、結果を会話にも簡潔に示して、次の設計上の問いを一つ提示してください。今回の依頼で編集してよいのは .glance/ の設計資料のみです。アプリケーションのコードは変更しないでください。`;
}

function sendPrompt(pi: ExtensionAPI, ctx: ExtensionCommandContext, prompt: string) {
  pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
}

export async function readGlossary(cwd: string): Promise<string> {
  const path = join(cwd, ".glance", "glossary.md");
  try {
    const content = await readFile(path, "utf8");
    return content.trim() ? `図の用語（モデル作成者による説明。内容と根拠を確認してください）:\n\n${content.trim()}` : "図の用語: 説明はまだありません（glossary.md が空です）。";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "図の用語: 説明はまだありません（.glance/glossary.md がありません）。";
    return `図の用語を読めません: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export default function (pi: ExtensionAPI) {
  let before: { cwd: string; model: Awaited<ReturnType<typeof readModel>> } | undefined;
  pi.on("before_agent_start", async (_event, ctx) => {
    before = undefined;
    try { before = { cwd: ctx.cwd, model: await readModel(ctx.cwd) }; }
    catch (error) { ctx.ui.notify(`変更前のモデルを読めません: ${String(error)}`, "warning"); }
  });
  pi.on("agent_settled", async (_event, ctx) => {
    const start = before;
    before = undefined;
    if (!start || start.cwd !== ctx.cwd) return;
    try {
      const current = await readModel(ctx.cwd);
      if (!current || sameModel(start.model, current)) return;
      if (start.model) await recordModel(ctx.cwd, start.model, true);
      const revision = await recordModel(ctx.cwd, current);
      ctx.ui.notify(`モデル履歴に保存しました（${revision.id}）`, "info");
    } catch (error) { ctx.ui.notify(`モデル履歴を保存できません: ${String(error)}`, "error"); }
  });

  pi.registerCommand("glance", {
    description: "Model software states, check and chart them, or generate an offline web overview",
    handler: async (args, ctx) => {
      let subject = args.trim();
      if (subject === "overview init") {
        sendPrompt(pi, ctx, `${GUIDANCE}\nWeb UI の入力を準備してください。スキルの references/overview.md を読み、対象の .glance/ にある既存の図と根拠から overview.json を作成・更新してください。HTML の生成には共通の生成コマンドを使い、完成したファイルのパスを伝えてください。`);
        return;
      }
      if (subject === "overview") {
        if (!ctx.isIdle()) {
          ctx.ui.notify("エージェントの編集が終わってから Web UI を生成してください。", "warning");
          return;
        }
        try {
          const path = await generateOverview(ctx.cwd);
          pi.sendMessage({ customType: "glance-overview", content: `Web UI を生成しました。ブラウザーで開けます。\n\n${path}`, display: true });
        } catch (error) { ctx.ui.notify(`Web UI を生成できません。 ${(error as Error).message}`, "error"); }
        return;
      }
      if (subject === "save") {
        if (!ctx.isIdle()) {
          ctx.ui.notify("モデルの編集が終わってから保存してください。", "warning");
          return;
        }
        try {
          const model = await readModel(ctx.cwd);
          if (!model) {
            ctx.ui.notify("保存には .glance/Spec.tla と .glance/Spec.cfg の両方が必要です。", "warning");
            return;
          }
          const revision = await recordModel(ctx.cwd, model);
          ctx.ui.notify(`現在のモデルは ${revision.id}（保存日時 ${revision.addedAt}）です。`, "info");
        } catch (error) { ctx.ui.notify(`モデル履歴を保存できません: ${String(error)}`, "error"); }
        return;
      }
      if (subject === "history") {
        try {
          pi.sendMessage({ customType: "glance-history", content: describeHistory(await listRevisions(ctx.cwd)), display: true });
        } catch (error) { ctx.ui.notify(`モデル履歴を読めません: ${String(error)}`, "error"); }
        return;
      }
      if (subject === "show" || subject === "deps") {
        const isDeps = subject === "deps";
        const file = isDeps ? "dependencies.md" : "model.md";
        try {
          const content = await readFile(join(ctx.cwd, ".glance", file), "utf8");
          pi.sendMessage({ customType: isDeps ? "glance-dependencies" : "glance-model", content, display: true });
        } catch (error) {
          if (isDeps && (error as NodeJS.ErrnoException).code === "ENOENT") {
            ctx.ui.notify("依存図はまだありません。/glance で対象を指定して依存図の作成を依頼できます。", "info");
            return;
          }
          const detail = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`${isDeps ? "依存図" : "モデル"}を読めません: ${detail}`, "error");
        }
        return;
      }
      if (subject === "diff") {
        sendPrompt(pi, ctx, `読み取り専用で .glance/baseline.md と .glance/model.md を比較し、状態、操作、遷移、保証したい性質の変更を説明してください。ファイルを変更しないでください。いずれかのファイルがない場合はその旨を説明し、差分を推測しないでください。`);
        return;
      }
      if (/^diff\s/.test(subject)) {
        const id = subject.slice(4).trim();
        if (!/^v[1-9][0-9]*$/.test(id)) {
          ctx.ui.notify("使い方: /glance diff v1（版は /glance history で確認できます）", "error");
          return;
        }
        try {
          if (!(await listRevisions(ctx.cwd)).some(item => item.id === id)) {
            ctx.ui.notify(`モデル履歴に ${id} はありません。`, "error");
            return;
          }
          sendPrompt(pi, ctx, `読み取り専用で .glance/history/${id}/ の Spec.tla・Spec.cfg を、現在の .glance/Spec.tla・Spec.cfg と比較してください。モデルの状態・遷移・性質の変更と、設定だけで変わる探索範囲を区別してください。ファイルが不足していればその旨を報告してください。`);
        } catch (error) { ctx.ui.notify(`モデル履歴を読めません: ${String(error)}`, "error"); }
        return;
      }
      if (subject === "review" || subject.startsWith("review ")) {
        sendPrompt(pi, ctx, `${GUIDANCE}\n${REVIEW_GUIDANCE}\nユーザーの追加指定: ${subject.slice(6).trim() || "なし"}`);
        return;
      }
      if (subject === "chart" || subject.startsWith("chart ")) {
        const chartArgs = subject.slice(5).trim();
        const match = /^(?:--by\s+([A-Za-z_][A-Za-z0-9_]*(?:,[A-Za-z_][A-Za-z0-9_]*)*))?$/.exec(chartArgs);
        if (!match) {
          ctx.ui.notify("使い方: /glance chart [--by phase,agent]", "error");
          return;
        }
        if (!ctx.isIdle()) {
          ctx.ui.notify("エージェントの処理が終わってから状態遷移図を生成してください。", "warning");
          return;
        }
        const result = await runTlc(ctx.cwd, { graph: true });
        let chart = "";
        if (result.dot) {
          try {
            const grouped = match[1] ? projectDot(result.dot, match[1].split(",")) : undefined;
            chart = `\n\n${result.complete ? "検査が完了した範囲のグラフ" : "不完全な探索結果のグラフ（全状態ではありません）"}:\n\n\`\`\`mermaid\n${grouped?.mermaid ?? dotToMermaid(result.dot)}\n\`\`\`\n\n${await readGlossary(ctx.cwd)}${grouped ? `\n\n${grouped.details}` : ""}`;
          }
          catch (error) { chart = `\n\n図の生成に失敗しました: ${String(error)}`; }
        } else chart = "\n\n状態グラフは出力されませんでした。";
        const scope = await summarizeConfig(ctx.cwd);
        pi.sendMessage({ customType: "glance-chart", content: `${result.text}\n\n${scope}${chart}${formatTrace(result.trace)}`, display: true });
        return;
      }
      if (subject === "check") {
        if (!ctx.isIdle()) {
          ctx.ui.notify("エージェントの処理が終わってからモデル検査を実行してください。", "warning");
          return;
        }
        const result = await runTlc(ctx.cwd);
        const scope = await summarizeConfig(ctx.cwd);
        pi.sendMessage({ customType: "glance-check", content: `${result.text}\n\n${scope}${formatTrace(result.trace)}`, display: true });
        return;
      }
      if (!subject && ctx.hasUI) {
        subject = (await ctx.ui.input("glance: 何を考えますか？", "例: TODO リストを新規開発する"))?.trim() ?? "";
      }
      if (!subject) {
        ctx.ui.notify("対象を指定してください。例: /glance TODO リストを作る", "info");
        return;
      }
      if (ctx.isIdle()) {
        try {
          const current = await readModel(ctx.cwd);
          if (current) await recordModel(ctx.cwd, current);
        } catch (error) {
          ctx.ui.notify(`変更前のモデルを保存できません: ${String(error)}`, "error");
          return;
        }
      }
      sendPrompt(pi, ctx, makePrompt(subject));
    },
  });
}
