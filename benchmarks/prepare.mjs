import { cp, mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./cases/", import.meta.url));
const [name, destination, ...extra] = process.argv.slice(2);
if (!name || !/^(small|medium|large)-(go|ts|java)$/.test(name) || !destination || extra.length) {
  console.error("Usage: node benchmarks/prepare.mjs <small|medium|large>-<go|ts|java> <new-directory>");
  process.exitCode = 2;
} else {
  const source = join(root, name);
  const target = resolve(destination);
  const request = await readFile(join(source, "request.md"), "utf8");
  await mkdir(target);
  await cp(join(source, "input"), join(target, "input"), { recursive: true, force: false, errorOnExist: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(target, "REQUEST.md"), request, { flag: "wx" });
  console.log(`Prepared ${name} in ${target}. Expected answers were not copied.`);
}
