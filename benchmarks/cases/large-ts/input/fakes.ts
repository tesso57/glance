import type { Article, Articles, Cache, Renderer } from "./domain.js";

// No operation has a side effect on failure. get and save use copies.
export class MemoryArticles implements Articles {
  constructor(public readonly items: Map<string, Article>) {}

  async get(id: string): Promise<Article | undefined> {
    const found = this.items.get(id);
    return found ? { ...found } : undefined;
  }

  async save(article: Article, expectedVersion: number): Promise<"saved" | "conflict"> {
    const current = this.items.get(article.id);
    if (!current || current.version !== expectedVersion) return "conflict";
    this.items.set(article.id, { ...article });
    return "saved";
  }
}

export class FakeRenderer implements Renderer {
  constructor(public fail = false) {}
  async render(id: string): Promise<string> {
    if (this.fail) throw new Error("render failed");
    return `page:${id}`;
  }
}

export class MemoryCache implements Cache {
  readonly pages = new Map<string, string>();
  constructor(public fail = false) {}
  async put(id: string, page: string): Promise<void> {
    if (this.fail) throw new Error("cache failed");
    this.pages.set(id, page);
  }
}
