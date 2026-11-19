import assert from "node:assert/strict";
import test from "node:test";
import { GUIDANCE, REVIEW_GUIDANCE } from "../extensions/guidance.ts";
import { readFileSync } from "node:fs";
import { SKILL_PATH } from "../extensions/guidance.ts";

test("model guidance asks for a glossary grounded in the domain and actual code", () => {
  const skill = readFileSync(SKILL_PATH, "utf8");
  assert.match(GUIDANCE, /SKILL\.md/);
  for (const ref of ["references/go.md", "references/typescript.md", "references/java.md", "references/external-state.md"]) assert.ok(skill.includes(ref), `missing ${ref}`);
  assert.match(skill, /glossary\.md/);
});

test("review guidance preserves existing material and distinguishes evidence from model-checking", () => {
  assert.match(REVIEW_GUIDANCE, /ファイルの作成、編集、削除.*行わない/);
  assert.match(REVIEW_GUIDANCE, /ファイルと行番号/);
  assert.match(REVIEW_GUIDANCE, /反例はモデル内の経路/);
  assert.match(REVIEW_GUIDANCE, /実装との一致、要求の網羅性、形式証明を保証しない/);
});
