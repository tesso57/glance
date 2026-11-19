import { resolve } from "node:path";
import { createJiti } from "jiti";

const loader = createJiti(import.meta.url, { fsCache: false });
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--schema") {
  const { overviewSchema } = await loader.import("../extensions/overview/model.ts");
  console.log(JSON.stringify(overviewSchema, null, 2));
} else if (args.length > 1 || args[0]?.startsWith("-")) {
  console.error("Usage: npm run overview -- [project-directory | --schema]");
  process.exitCode = 1;
} else {
  try {
    const { generateOverview } = await loader.import("../extensions/overview/render.ts");
    console.log(await generateOverview(resolve(args[0] ?? ".")));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
