import type { Articles, Cache, Renderer } from "./domain.js";

export type PublishResult = "missing" | "alreadyPublished" | "conflict" | "published";

// Exceptions from dependencies are propagated to the caller.
export async function publish(
  id: string,
  articles: Articles,
  renderer: Renderer,
  cache: Cache,
): Promise<PublishResult> {
  const article = await articles.get(id);
  if (!article) return "missing";
  if (article.status === "published") return "alreadyPublished";

  const page = await renderer.render(id);
  const saved = await articles.save({ ...article, status: "published", version: article.version + 1 }, article.version);
  if (saved === "conflict") return "conflict";

  await cache.put(id, page);
  return "published";
}
