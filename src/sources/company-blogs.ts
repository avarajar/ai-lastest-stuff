import type { NewsItem, SourceCollector } from "../types.js";

interface BlogConfig {
  name: string;
  url: string;
  baseUrl: string;
  headers?: Record<string, string>;
  parse: (html: string, since: Date) => ParsedPost[];
}

interface ParsedPost {
  slug: string;
  title: string;
  date: Date;
  description?: string;
  category?: string;
}

// --- Anthropic: SSR HTML with <time> tags and PublicationList items ---
function parseAnthropic(html: string, since: Date): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const seen = new Set<string>();

  // Match PublicationList items: <a href="/news/slug" class="PublicationList...listItem">
  //   <time ...>Mar 11, 2026</time>
  //   <span ...subject...>Category</span>
  //   <span ...title...>Title</span>
  const listItemRegex =
    /<a\s+href="(\/news\/[^"]+)"\s+class="PublicationList[^"]*__listItem"[\s\S]*?<time[^>]*>([^<]+)<\/time>[\s\S]*?__subject[^>]*>([^<]+)<[\s\S]*?__title[^>]*>([^<]+)</g;

  let match: RegExpExecArray | null;
  while ((match = listItemRegex.exec(html)) !== null) {
    const [, path, dateStr, category, title] = match;
    const slug = path.replace("/news/", "");
    if (seen.has(slug)) continue;
    seen.add(slug);

    const date = new Date(dateStr.trim());
    if (isNaN(date.getTime()) || date < since) continue;

    posts.push({
      slug,
      title: decodeHTMLEntities(title.trim()),
      date,
      category: category.trim(),
    });
  }

  // Also match FeaturedGrid items (hero + side cards)
  const featuredRegex =
    /<a\s+href="(\/news\/[^"]+)"\s+class="FeaturedGrid[^"]*"[\s\S]*?<time[^>]*>([^<]+)<\/time>/g;
  const titleRegex = /(?:__featuredTitle|headline-6[^"]*__title)">([^<]+)</g;

  // Collect featured links with dates
  const featuredLinks: Array<{ slug: string; dateStr: string }> = [];
  while ((match = featuredRegex.exec(html)) !== null) {
    const slug = match[1].replace("/news/", "");
    if (!seen.has(slug)) {
      featuredLinks.push({ slug, dateStr: match[2].trim() });
    }
  }

  // Collect featured titles in order
  const featuredTitles: string[] = [];
  while ((match = titleRegex.exec(html)) !== null) {
    featuredTitles.push(match[1].trim());
  }

  for (let i = 0; i < featuredLinks.length && i < featuredTitles.length; i++) {
    const { slug, dateStr } = featuredLinks[i];
    if (seen.has(slug)) continue;
    seen.add(slug);

    const date = new Date(dateStr);
    if (isNaN(date.getTime()) || date < since) continue;

    posts.push({
      slug,
      title: decodeHTMLEntities(featuredTitles[i]),
      date,
    });
  }

  return posts;
}

// --- Meta AI: SSR HTML with obfuscated classes but stable text patterns ---
function parseMetaAI(html: string, since: Date): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const seen = new Set<string>();

  // Match blog links with their surrounding context for title and date
  // Meta uses absolute URLs: href="https://ai.meta.com/blog/slug/"
  const linkRegex = /href="(https:\/\/ai\.meta\.com\/blog\/([^/"]+)\/)"/g;

  let match: RegExpExecArray | null;
  const slugPositions: Array<{ slug: string; fullUrl: string; pos: number }> = [];

  while ((match = linkRegex.exec(html)) !== null) {
    const slug = match[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    slugPositions.push({ slug, fullUrl: match[1], pos: match.index });
  }

  // For each unique slug, look for nearby title text and date
  for (const { slug, fullUrl, pos } of slugPositions) {
    // Get surrounding context (2000 chars after the link)
    const context = html.slice(Math.max(0, pos - 500), pos + 2000);

    // Try to find a title: text inside an <a> that links to this slug
    const titleMatch = context.match(
      new RegExp(`href="${fullUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>\\s*([^<]{10,200})\\s*<`)
    );

    // Try to find date: common patterns like "March 11, 2026" or "Mar 11, 2026"
    const dateMatch = context.match(
      /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/
    );

    if (!titleMatch) continue;

    const title = decodeHTMLEntities(titleMatch[1].trim());
    if (!title || title.length < 5) continue;

    let date: Date;
    if (dateMatch) {
      date = new Date(dateMatch[0]);
      if (isNaN(date.getTime()) || date < since) continue;
    } else {
      // If no date found, skip — we can't determine if it's recent
      continue;
    }

    posts.push({ slug, title, date });
  }

  return posts;
}

// --- Mistral: Next.js RSC with escaped JSON in script tags ---
function parseMistral(html: string, since: Date): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const seen = new Set<string>();

  // RSC data has escaped JSON: \"slug\":\"value\"
  const postRegex =
    /\\"slug\\":\\"([^\\]+)\\".*?\\"date\\":\\"([^\\]+)\\".*?\\"title\\":\\"([^\\]+)\\"/g;

  let match: RegExpExecArray | null;
  while ((match = postRegex.exec(html)) !== null) {
    const [, slug, dateStr, title] = match;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const date = new Date(dateStr);
    if (isNaN(date.getTime()) || date < since) continue;

    posts.push({
      slug,
      title: decodeHTMLEntities(title),
      date,
    });
  }

  // Also try to capture description if available
  const descRegex =
    /\\"slug\\":\\"([^\\]+)\\".*?\\"description\\":(?:\\"([^\\]*)\\")/g;

  while ((match = descRegex.exec(html)) !== null) {
    const [, slug, desc] = match;
    const post = posts.find((p) => p.slug === slug);
    if (post && desc) {
      post.description = desc;
    }
  }

  return posts;
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

const BLOGS: BlogConfig[] = [
  {
    name: "anthropic",
    url: "https://www.anthropic.com/news",
    baseUrl: "https://www.anthropic.com/news/",
    parse: parseAnthropic,
  },
  {
    name: "meta-ai",
    url: "https://ai.meta.com/blog/",
    baseUrl: "", // Meta uses absolute URLs
    headers: { "User-Agent": "ai-lastest-stuff/0.1.0" }, // Meta rejects browser-like Accept headers
    parse: parseMetaAI,
  },
  {
    name: "mistral",
    url: "https://mistral.ai/news",
    baseUrl: "https://mistral.ai/news/",
    parse: parseMistral,
  },
];

export const companyBlogsCollector: SourceCollector = {
  name: "company-blogs",

  async collect(since: Date): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];
    const now = new Date();

    const results = await Promise.allSettled(
      BLOGS.map(async (blog) => {
        try {
          const defaultHeaders: Record<string, string> = {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          };
          const response = await fetch(blog.url, {
            headers: blog.headers ?? defaultHeaders,
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            console.error(`Company blog error for ${blog.name}: ${response.status}`);
            return [];
          }

          const html = await response.text();
          const posts = blog.parse(html, since);

          return posts.map(
            (post): NewsItem => ({
              id: `blog-${blog.name}-${post.slug}`,
              title: post.title,
              url: blog.baseUrl
                ? `${blog.baseUrl}${post.slug}`
                : `https://ai.meta.com/blog/${post.slug}/`,
              source: "company-blogs",
              description: post.description,
              publishedAt: post.date,
              collectedAt: now,
              tags: [blog.name, ...(post.category ? [post.category] : [])],
              metadata: {
                company: blog.name,
                category: post.category,
              },
            })
          );
        } catch (error) {
          console.error(`Failed to collect from ${blog.name} blog:`, error);
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
    }

    return allItems;
  },
};
