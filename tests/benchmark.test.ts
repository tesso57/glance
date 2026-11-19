import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("benchmark preparation copies inputs and request, excludes expectations, and refuses overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "glance-bench-test-"));
  try {
    for (const size of ["small", "medium", "large"]) {
      for (const language of ["go", "ts", "java"]) {
        const name = `${size}-${language}`;
        const target = join(root, name);
        const run = spawnSync(process.execPath, ["benchmarks/prepare.mjs", name, target], { cwd: resolve("."), encoding: "utf8" });
        assert.equal(run.status, 0, run.stderr);
        assert.deepEqual((await readdir(target)).sort(), ["REQUEST.md", "input"]);
        assert.equal(await readFile(join(target, "REQUEST.md"), "utf8"), await readFile(`benchmarks/cases/${name}/request.md`, "utf8"));
        assert.ok((await readdir(join(target, "input"))).length > 0);
        assert.ok((await readFile(`benchmarks/cases/${name}/expected.md`, "utf8")).length > 0);
      }
    }
    const marker = join(root, "small-go", "marker");
    await writeFile(marker, "preserve");
    const rerun = spawnSync(process.execPath, ["benchmarks/prepare.mjs", "small-go", join(root, "small-go")], { encoding: "utf8" });
    assert.notEqual(rerun.status, 0);
    assert.equal(await readFile(marker, "utf8"), "preserve");
  } finally { await rm(root, { recursive: true, force: true }); }
});
