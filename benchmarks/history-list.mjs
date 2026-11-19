import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { listRevisions } from "../extensions/history.ts";

if (process.argv.length !== 3) {
  throw new Error("Pass the path to the baseline extensions/history.ts");
}
const { listRevisions: baseline } = await import(pathToFileURL(resolve(process.argv[2])).href);
const hash = data => createHash("sha256").update(data).digest("hex");

async function seedHistory(cwd, count) {
  const config = "INVARIANT Safety\n";
  const configHash = hash(config);
  for (let number = 1; number <= count; number++) {
    const id = `v${number}`;
    const spec = `---- MODULE Spec ----\nSafety == ${number} > 0\n====\n`;
    const dir = join(cwd, ".glance", "history", id);
    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, "Spec.tla"), spec),
      writeFile(join(dir, "Spec.cfg"), config),
      writeFile(join(dir, "metadata.json"), JSON.stringify({
        id, addedAt: "2026-01-01T00:00:00.000Z", workspaceHead: null,
        sha256: { "Spec.tla": hash(spec), "Spec.cfg": configHash },
      }, null, 2) + "\n"),
    ]);
  }
}

async function measure(list, cwd) {
  const start = performance.now();
  await list(cwd);
  return performance.now() - start;
}

function summarize(times) {
  times.sort((a, b) => a - b);
  const percentile = fraction => times[Math.ceil(times.length * fraction) - 1].toFixed(3);
  return { median: percentile(0.5), p95: percentile(0.95) };
}

const root = await mkdtemp(join(tmpdir(), "glance-history-bench-"));
try {
  const warmup = 20;
  const samples = 101;
  console.log(`${process.version}, ${process.platform} ${process.arch}, ${warmup} warmups and ${samples} samples per variant and size (ms)`);
  const rows = [];
  for (const count of [1, 8, 32, 1000]) {
    const cwd = join(root, String(count));
    await seedHistory(cwd, count);
    const expected = await baseline(cwd);
    assert.equal(expected.length, count);
    assert.deepEqual(await listRevisions(cwd), expected);
    const before = [];
    const after = [];
    for (let run = 0; run < warmup + samples; run++) {
      const order = [[baseline, before], [listRevisions, after]];
      if (run % 2 === 1) order.reverse();
      for (const [list, times] of order) {
        const elapsed = await measure(list, cwd);
        if (run >= warmup) times.push(elapsed);
      }
    }
    const baselineStats = summarize(before);
    const parallelStats = summarize(after);
    rows.push({
      revisions: count,
      "baseline median": baselineStats.median,
      "parallel median": parallelStats.median,
      "baseline p95": baselineStats.p95,
      "parallel p95": parallelStats.p95,
    });
  }
  console.table(rows);
} finally {
  await rm(root, { recursive: true, force: true });
}
