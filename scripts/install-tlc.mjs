import { mkdir, mkdtemp, open, link, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TLC_LOCK, tlcCachePath, verifyJar } from "../extensions/tlc-pin.ts";

const MAX_BYTES = 50 * 1024 * 1024;

export async function installPinnedTlc({ env = process.env, lock = TLC_LOCK, fetcher = fetch } = {}) {
  const dest = tlcCachePath(env);
  try {
    await verifyJar(dest, lock.sha256);
    return { path: dest, installed: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const parent = dirname(dest);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const tempDir = await mkdtemp(join(parent, ".download-"));
  const tempJar = join(tempDir, "tla2tools.jar");
  try {
    const response = await fetcher(lock.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error(`TLC download failed: HTTP ${response.status}`);
    const file = await open(tempJar, "wx", 0o600);
    try {
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.byteLength;
        if (total > MAX_BYTES) throw new Error("TLC download exceeds size limit");
        await file.writeFile(chunk);
      }
    } finally { await file.close(); }
    await verifyJar(tempJar, lock.sha256);
    try {
      await link(tempJar, dest);
      return { path: dest, installed: true };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await verifyJar(dest, lock.sha256);
      return { path: dest, installed: false };
    }
  } finally { await rm(tempDir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await installPinnedTlc();
    console.log(`${result.installed ? "Installed" : "Already installed"} TLC ${TLC_LOCK.version}: ${result.path}`);
  } catch (error) {
    console.error(`TLC installation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
