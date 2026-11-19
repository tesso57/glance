export type ArticleStatus = "draft" | "published";

export interface Article {
  id: string;
  status: ArticleStatus;
  version: number;
}

export interface Articles {
  get(id: string): Promise<Article | undefined>;
  save(article: Article, expectedVersion: number): Promise<"saved" | "conflict">;
}

export interface Renderer {
  render(id: string): Promise<string>;
}

export interface Cache {
  put(id: string, page: string): Promise<void>;
}
