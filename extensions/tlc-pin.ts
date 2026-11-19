import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type TlcLock = { version: string; url: string; sha256: string };
export type TlcJar = { path: string; source: "override" | "cache" };
export const TLC_LOCK: TlcLock = JSON.parse(readFileSync(new URL("./tlc-lock.json", import.meta.url), "utf8"));

export function tlcCachePath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache");
  if (!isAbsolute(base)) throw new Error("XDG_CACHE_HOME must be an absolute path");
  return join(base, "glance", "tlc", TLC_LOCK.version, "tla2tools.jar");
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyJar(path: string, expected = TLC_LOCK.sha256): Promise<void> {
  const actual = await sha256File(path);
  if (actual !== expected) throw new Error(`TLC JAR の SHA-256 が一致しません: ${path} (期待: ${expected}, 実際: ${actual})`);
}

export async function resolveTlcJar(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<TlcJar> {
  const override = env.GLANCE_TLA2TOOLS_JAR?.trim();
  const path = override ? resolve(cwd, override) : tlcCachePath(env);
  try { await access(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(override ? `指定された TLC JAR がありません: ${path}` : `固定 TLC JAR がありません: ${path}。インストーラを実行してください。`);
    }
    throw error;
  }
  return { path, source: override ? "override" : "cache" };
}
