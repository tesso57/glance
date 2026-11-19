import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { resolveTlcJar, tlcCachePath, TLC_LOCK, verifyJar } from "../extensions/tlc-pin.ts";
// @ts-expect-error no declaration file for script
import { installPinnedTlc } from "../scripts/install-tlc.mjs";

test("installer hash validation is separate from resolving an explicit path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-pin-"));
  try {
    const path = join(dir, "wrong.jar");
    const data = "not a real JAR";
    await writeFile(path, data);
    const sha = createHash("sha256").update(data).digest("hex");
    await verifyJar(path, sha);
    await assert.rejects(verifyJar(path), /SHA-256/);
    assert.deepEqual(await resolveTlcJar(dir, { GLANCE_TLA2TOOLS_JAR: "wrong.jar", XDG_CACHE_HOME: dir }), { path, source: "override" });
    await assert.rejects(resolveTlcJar(dir, { GLANCE_TLA2TOOLS_JAR: "missing.jar", XDG_CACHE_HOME: dir }), /ありません/);
    await assert.rejects(resolveTlcJar(dir, { XDG_CACHE_HOME: dir }), /インストーラ/);
    assert.throws(() => tlcCachePath({ XDG_CACHE_HOME: "relative" }), /absolute/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("installer verifies and installs atomically, and never replaces a bad cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-pin-"));
  const bytes = "offline fixture";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const lock = { ...TLC_LOCK, sha256 };
  const env = { XDG_CACHE_HOME: dir };
  let downloads = 0;
  const fetcher = async () => { downloads++; return new Response(bytes); };
  try {
    const results = await Promise.all([installPinnedTlc({ env, lock, fetcher }), installPinnedTlc({ env, lock, fetcher })]);
    const dest = tlcCachePath(env);
    assert.equal(await readFile(dest, "utf8"), bytes);
    assert.equal(results.filter((r: {installed: boolean}) => r.installed).length, 1);
    assert.equal((await installPinnedTlc({ env, lock, fetcher })).installed, false);
    assert.equal(downloads, 2);
    await writeFile(dest, "do not replace");
    await assert.rejects(installPinnedTlc({ env, lock, fetcher }), /SHA-256/);
    assert.equal(await readFile(dest, "utf8"), "do not replace");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("installer rejects wrong downloads without leaving a cache jar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glance-pin-"));
  const env = { XDG_CACHE_HOME: dir };
  try {
    await mkdir(dirname(tlcCachePath(env)), { recursive: true });
    await assert.rejects(installPinnedTlc({ env, fetcher: async () => new Response("bad download") }), /SHA-256/);
    await assert.rejects(readFile(tlcCachePath(env)), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
