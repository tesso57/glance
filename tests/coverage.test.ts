import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatTlcScope, summarizeConfig } from "../extensions/coverage.ts";

test("reports the complete configuration without guessing what was checked", () => {
  const config = `SPECIFICATION Spec
CONSTANTS
  SimulateWriteFailure = TRUE
  SimulateReadFailure = TRUE
INVARIANTS TypeOK Outcome
CONSTRAINT Bound
PROPERTY Live
`;
  const result = formatTlcScope(config);
  assert.ok(result.includes(config));
  assert.match(result, /他の値や条件が検査されたことは分かりません/);
  assert.match(result, /TLC の結果も確認/);
  assert.doesNotMatch(result, /すべての条件を検査/);
});

test("preserves unfamiliar syntax and safely encloses embedded code fences", () => {
  const config = 'CONSTANT Foo <- Other!Op\n\\* comment ` ```\nVIEW CustomView\n';
  const result = formatTlcScope(config);
  assert.ok(result.includes(config));
  assert.ok(result.includes("````text\n"));
  assert.ok(result.endsWith("````"));
});

test("reads config, reports missing files and marks oversized snapshots", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-scope-"));
  try {
    assert.match(await summarizeConfig(dir), /設定を読み取れません/);
    await mkdir(join(dir, ".glance"));
    const path = join(dir, ".glance", "Spec.cfg");
    await writeFile(path, "INIT Init\nNEXT Next\n");
    const normal = await summarizeConfig(dir);
    assert.match(normal, /INIT Init\nNEXT Next/);
    assert.doesNotMatch(normal, /先頭 64 KiB/);
    await writeFile(path, "x".repeat(64 * 1024 + 1));
    const large = await summarizeConfig(dir);
    assert.match(large, /先頭 64 KiB のみ表示/);
    assert.ok(large.length < 64 * 1024 + 1024);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
