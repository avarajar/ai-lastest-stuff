import type { NewsItem, SourceCollector } from "../types.js";

function extractText(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return null;
  return match[1].trim().replace(/<[^>]+>/g, "").trim() || null;
}

function extractLink(entryXml: string): string | null {
  // Prefer the link with type="text/html" or rel="alternate"
  const altMatch = entryXml.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (altMatch) return altMatch[1];

  // Also try href before rel
  const altMatch2 = entryXml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["'][^>]*\/?>/i);
  if (altMatch2) return altMatch2[1];

  // Fallback: first link with href
  const hrefMatch = entryXml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch) return hrefMatch[1];

  return null;
}

function extractArxivId(url: string): string {
  // Extract the arxiv ID from a URL like http://arxiv.org/abs/2301.12345v1
  const match = url.match(/(\d{4}\.\d{4,5}(?:v\d+)?)/);
  if (match) return match[1];
  // Fallback: use the last path segment
  const parts = url.split("/");
  return parts[parts.length - 1] || url;
}

function extractFirstAuthor(entryXml: string): string | null {
  const authorMatch = entryXml.match(/<author[^>]*>\s*<name[^>]*>([^<]+)<\/name>/i);
  return authorMatch ? authorMatch[1].trim() : null;
}

export const arxivCollector: SourceCollector = {
  name: "arxiv",

  async collect(since: Date): Promise<NewsItem[]> {
    try {
      const searchQuery = "cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL";
      const url = `http://export.arxiv.org/api/query?search_query=${searchQuery}&sortBy=submittedDate&sortOrder=descending&max_results=15`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`ArXiv API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const xml = await response.text();
      const now = new Date();
      const items: NewsItem[] = [];

      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      let match: RegExpExecArray | null;

      while ((match = entryRegex.exec(xml)) !== null) {
        const block = match[1];

        const title = extractText(block, "title")?.replace(/\s+/g, " ");
        const link = extractLink(block);
        const publishedStr = extractText(block, "published");
        const summary = extractText(block, "summary")?.replace(/\s+/g, " ");
        const author = extractFirstAuthor(block);

        if (!title || !link) continue;

        const published = publishedStr ? new Date(publishedStr) : null;
        if (!published || isNaN(published.getTime())) continue;
        if (published < since) continue;

        const arxivId = extractArxivId(link);
        const description = summary
          ? summary.length > 500
            ? summary.slice(0, 500) + "..."
            : summary
          : undefined;

        items.push({
          id: `arxiv-${arxivId}`,
          title,
          url: link,
          source: "arxiv",
          description,
          author: author ?? undefined,
          publishedAt: published,
          collectedAt: now,
          tags: ["cs.AI", "cs.LG", "cs.CL"],
          metadata: {
            arxivId,
          },
        });
      }

      return items;
    } catch (error) {
      console.error("Failed to collect ArXiv papers:", error);
      return [];
    }
  },
};
