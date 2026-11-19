import { open } from "node:fs/promises";
import { join } from "node:path";

const MAX_CONFIG_BYTES = 64 * 1024;

export function formatTlcScope(config: string, truncated = false): string {
  let longestRun = 0;
  for (const match of config.matchAll(/`+/g)) longestRun = Math.max(longestRun, match[0].length);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  const body = config || "(空の設定ファイル)";
  return [
    "TLC の設定（Spec.cfg の原文）:",
    "検査する性質や定数の値、探索の制約はモデルとこの設定に依存します。設定の記載だけでは検査が実行・完了したことや、他の値や条件が検査されたことは分かりません。TLC の結果も確認してください。",
    "これは表示時に読み取った内容であり、実行中のファイル変更がある場合、TLC が読み取った内容と異なる可能性があります。",
    "",
    `${fence}text`,
    body,
    fence,
    ...(truncated ? ["[設定が長いため先頭 64 KiB のみ表示しています。残りも確認してください。]"] : []),
  ].join("\n");
}

export async function summarizeConfig(cwd: string): Promise<string> {
  const path = join(cwd, ".glance", "Spec.cfg");
  try {
    const file = await open(path, "r");
    try {
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      return formatTlcScope(buffer.subarray(0, Math.min(total, MAX_CONFIG_BYTES)).toString("utf8"), total > MAX_CONFIG_BYTES);
    } finally {
      await file.close();
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `TLC の設定を読み取れません: ${path}\n${detail}\n検査の範囲は未確認です。`;
  }
}
