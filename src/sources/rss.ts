import type { NewsItem, SourceCollector } from "../types.js";

const FEED_URLS = [
  // AI companies - direct sources
  "https://openai.com/blog/rss.xml",
  "https://blog.google/technology/ai/rss/",
  "https://deepmind.google/blog/rss.xml",
  "https://huggingface.co/blog/feed.xml",
  "https://www.latent.space/feed",
  // Tech media
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://www.technologyreview.com/topic/artificial-intelligence/feed",
  "https://the-decoder.com/feed/",
];

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

function extractText(xml: string, tagName: string): string | null {
  // Handle both <tag>...</tag> and <tag ...>...</tag>
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return null;

  let text = match[1].trim();

  // Strip CDATA wrappers
  const cdataMatch = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdataMatch) {
    text = cdataMatch[1].trim();
  }

  // Strip HTML tags for descriptions
  text = text.replace(/<[^>]+>/g, "").trim();

  return text || null;
}

function extractLink(itemXml: string): string | null {
  // Try <link href="..."> (Atom style)
  const attrMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (attrMatch) return attrMatch[1];

  // Try <link>...</link> (RSS style)
  const tagMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
  if (tagMatch) return tagMatch[1].trim();

  return null;
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function parseItems(xml: string): Array<{ title: string; link: string; pubDate: Date; description?: string }> {
  const results: Array<{ title: string; link: string; pubDate: Date; description?: string }> = [];

  // Match both <item>...</item> (RSS) and <entry>...</entry> (Atom)
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractText(block, "title");
    const link = extractLink(block);
    const pubDateStr = extractText(block, "pubDate") || extractText(block, "published") || extractText(block, "updated");
    const description = extractText(block, "description") || extractText(block, "summary") || extractText(block, "content");
    const pubDate = parseDate(pubDateStr);

    if (!title || !link || !pubDate) continue;

    results.push({
      title,
      link,
      pubDate,
      description: description ?? undefined,
    });
  }

  return results;
}

export const rssCollector: SourceCollector = {
  name: "rss",

  async collect(since: Date): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];
    const now = new Date();

    for (const feedUrl of FEED_URLS) {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            "User-Agent": "ai-lastest-stuff/0.1.0",
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.error(`RSS fetch error for ${feedUrl}: ${response.status} ${response.statusText}`);
          continue;
        }

        const xml = await response.text();
        const items = parseItems(xml);

        for (const item of items) {
          if (item.pubDate < since) continue;

          allItems.push({
            id: `rss-${simpleHash(item.link)}`,
            title: item.title,
            url: item.link,
            source: "rss",
            description: item.description
              ? item.description.length > 500
                ? item.description.slice(0, 500) + "..."
                : item.description
              : undefined,
            publishedAt: item.pubDate,
            collectedAt: now,
            tags: [],
            metadata: {
              feedUrl,
            },
          });
        }
      } catch (error) {
        console.error(`Failed to collect RSS from ${feedUrl}:`, error);
      }
    }

    return allItems;
  },
};
