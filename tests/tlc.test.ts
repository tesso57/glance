import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { parseTlcTrace, runTlc } from "../extensions/tlc.ts";

test("extracts a complete invariant counterexample without mistaking evaluation errors for violations", () => {
  const trace = `Error: Invariant NotDone is violated.\nError: The behavior up to this point is:\nState 1: <Initial predicate>\nstatus = "todo"\n\nState 2: <Start line 6, col 1 of module Spec>\nstatus = "doing"\n\n2 states generated, 2 distinct states found, 0 states left on queue.\n`;
  assert.deepEqual(parseTlcTrace(trace), { kind: "invariant", property: "NotDone", states: [
    { number: 1, action: "Initial predicate", value: 'status = "todo"' },
    { number: 2, action: "Start line 6, col 1 of module Spec", value: 'status = "doing"' },
  ] });
  assert.equal(parseTlcTrace(trace.replace("Invariant NotDone is violated.", "Successor state is not completely specified.")), undefined);
  assert.equal(parseTlcTrace(trace.replace("State 2:", "State 3:")), undefined);
  assert.equal(parseTlcTrace(trace.replace(/2 states generated.*/, "")), undefined);
});

test("preserves stuttering and back-to-state loops in temporal counterexamples", () => {
  const prefix = 'Error: Temporal properties were violated.\n\nError: The following behavior constitutes a counter-example:\n\nState 1: <Initial predicate>\nx = 0\n\n';
  const done = 'Finished checking temporal properties in 00s\n';
  assert.deepEqual(parseTlcTrace(prefix + 'State 2: Stuttering\n' + done), {
    kind: "temporal", states: [{ number: 1, action: "Initial predicate", value: "x = 0" }], loop: { kind: "stuttering" },
  });
  assert.deepEqual(parseTlcTrace(prefix + 'State 2: <Advance>\nx = 1\n\nBack to state 1: <Advance>\n' + done), {
    kind: "temporal", states: [{ number: 1, action: "Initial predicate", value: "x = 0" }, { number: 2, action: "Advance", value: "x = 1" }], loop: { kind: "back", target: 1, action: "Advance" },
  });
  assert.equal(parseTlcTrace(prefix + 'State 2: <Advance>\nx = 1\n\nBack to state 3: <Advance>\n' + done), undefined);
});

test("TLC reports missing model, config and jar clearly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-test-"));
  const prevJar = process.env.GLANCE_TLA2TOOLS_JAR;
  const prevCache = process.env.XDG_CACHE_HOME;
  try {
    delete process.env.GLANCE_TLA2TOOLS_JAR;
    process.env.XDG_CACHE_HOME = dir;
    assert.match((await runTlc(dir)).text, /Spec\.tla.*ありません/);
    await mkdir(join(dir, ".glance"));
    await writeFile(join(dir, ".glance", "Spec.tla"), "");
    assert.match((await runTlc(dir)).text, /Spec\.cfg.*ありません/);
    await writeFile(join(dir, ".glance", "Spec.cfg"), "");
    assert.match((await runTlc(dir)).text, /固定 TLC JAR がありません/);
    process.env.GLANCE_TLA2TOOLS_JAR = "missing.jar";
    assert.match((await runTlc(dir)).text, /TLC JAR がありません/);
  } finally {
    if (prevJar === undefined) delete process.env.GLANCE_TLA2TOOLS_JAR; else process.env.GLANCE_TLA2TOOLS_JAR = prevJar;
    if (prevCache === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = prevCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test("TLC output distinguishes successful checks, violations, and failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-test-"));
  const prevJar = process.env.GLANCE_TLA2TOOLS_JAR;
  const prevPath = process.env.PATH;
  try {
    await mkdir(join(dir, ".glance"));
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, ".glance", "Spec.tla"), "");
    await writeFile(join(dir, ".glance", "Spec.cfg"), "");
    await writeFile(join(dir, "tla2tools.jar"), "");
    const java = join(dir, "bin", "java");
    process.env.PATH = `${join(dir, "bin")}:${prevPath ?? ""}`;
    process.env.GLANCE_TLA2TOOLS_JAR = "tla2tools.jar";
    const options = { resolveJar: async () => ({ path: join(dir, "tla2tools.jar"), source: "override" as const }) };
    await writeFile(java, '#!/bin/sh\nprintf "Model checking completed. No error has been found.\\n"\n');
    await chmod(java, 0o755);
    assert.match((await runTlc(dir, options)).text, /TLC はエラーを検出しませんでした/);
    await writeFile(java, '#!/bin/sh\nprintf "Invariant Safe is violated.\\n"\nexit 12\n');
    assert.match((await runTlc(dir, options)).text, /性質違反/);
    await writeFile(java, '#!/bin/sh\nprintf "Successor state is not completely specified\\nThe behavior up to this point is:\\n"\nexit 1\n');
    assert.match((await runTlc(dir, options)).text, /検査失敗または結果不明/);
    await writeFile(java, `#!/bin/sh
printf 'Error: Invariant Safe is violated.\nError: The behavior up to this point is:\nState 1: <Initial predicate>\nname = "'
printf '\\343\\201'
sleep 0.05
printf '\\202"\n1 states generated\n'
exit 12
`);
    const splitUtf8 = await runTlc(dir, options);
    assert.equal(splitUtf8.trace?.states[0].value, 'name = "あ"');
    await writeFile(java, '#!/bin/sh\nprintf "%070000d\\n" 0\nprintf "Error: Invariant Safe is violated.\\nError: The behavior up to this point is:\\nState 1: <Initial predicate>\\nx = 1\\n\\n1 states generated, 1 distinct states found, 0 states left on queue.\\n"\nexit 12\n');
    const longResult = await runTlc(dir, options);
    assert.equal(longResult.trace?.property, "Safe");
    assert.match(longResult.text, /中間の出力は省略/);
  } finally {
    if (prevJar === undefined) delete process.env.GLANCE_TLA2TOOLS_JAR; else process.env.GLANCE_TLA2TOOLS_JAR = prevJar;
    if (prevPath === undefined) delete process.env.PATH; else process.env.PATH = prevPath;
    await rm(dir, { recursive: true, force: true });
  }
});
