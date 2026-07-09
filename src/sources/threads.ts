import type { NewsItem, SourceCollector } from "../types.js";

const THREADS_ACCOUNTS = [
  { handle: "evolving.ai", url: "https://www.threads.com/@evolving.ai" },
];

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\"/g, '"');
}

interface ThreadPost {
  id: string;
  text: string;
  timestamp: number;
  permalink: string;
}

function parseThreadsHTML(html: string, since: Date): ThreadPost[] {
  const posts: ThreadPost[] = [];
  const seen = new Set<string>();

  // Threads embeds SSR data in a <script type="application/json"> tag with relay/require data.
  // Look for thread items with text content and timestamps.

  // Pattern 1: relay store JSON with thread_items containing text_post_app_info
  // {"id":"...","taken_at":1234567890,...,"caption":{"text":"..."}}
  const captionRegex =
    /"pk":"(\d+)"[^}]*?"taken_at":(\d+)[^}]*?"text":"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = captionRegex.exec(html)) !== null) {
    const [, id, tsStr, rawText] = match;
    if (seen.has(id)) continue;

    const timestamp = parseInt(tsStr, 10) * 1000;
    const date = new Date(timestamp);
    if (isNaN(date.getTime()) || date < since) continue;

    const text = decodeHTMLEntities(rawText).trim();
    if (!text || text.length < 10) continue;

    seen.add(id);
    posts.push({ id, text, timestamp, permalink: "" });
  }

  // Pattern 2: newer Threads SSR format with "thread_id" and "body_text"
  const bodyRegex =
    /"thread_id":"([^"]+)".*?"body_text":"((?:[^"\\]|\\.)*)","created_at":(\d+)/g;
  while ((match = bodyRegex.exec(html)) !== null) {
    const [, id, rawText, tsStr] = match;
    if (seen.has(id)) continue;

    const timestamp = parseInt(tsStr, 10) * 1000;
    const date = new Date(timestamp);
    if (isNaN(date.getTime()) || date < since) continue;

    const text = decodeHTMLEntities(rawText).trim();
    if (!text || text.length < 10) continue;

    seen.add(id);
    posts.push({ id, text, timestamp, permalink: "" });
  }

  // Pattern 3: code="id" in post URLs — extract post IDs and match text nearby
  const postLinkRegex = /threads\.(?:com|net)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/g;
  const postIds: string[] = [];
  while ((match = postLinkRegex.exec(html)) !== null) {
    if (!seen.has(match[1])) postIds.push(match[1]);
  }

  for (const postId of postIds) {
    const idx = html.indexOf(`/post/${postId}`);
    if (idx === -1) continue;
    const ctx = html.slice(Math.max(0, idx - 200), idx + 1000);

    // Look for text content near the post link
    const textMatch = ctx.match(/"text":"((?:[^"\\]|\\.){10,500})"/);
    const tsMatch = ctx.match(/"taken_at":(\d{10})/);

    if (!textMatch) continue;

    const timestamp = tsMatch ? parseInt(tsMatch[1], 10) * 1000 : Date.now();
    const date = new Date(timestamp);
    if (date < since) continue;

    seen.add(postId);
    posts.push({
      id: postId,
      text: decodeHTMLEntities(textMatch[1]).trim(),
      timestamp,
      permalink: `https://www.threads.com/post/${postId}`,
    });
  }

  return posts;
}

function truncate(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "…";
}

export const threadsCollector: SourceCollector = {
  name: "threads",

  async collect(since: Date): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];
    const now = new Date();

    const results = await Promise.allSettled(
      THREADS_ACCOUNTS.map(async (account) => {
        try {
          const response = await fetch(account.url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            console.error(`Threads error for @${account.handle}: ${response.status}`);
            return [];
          }

          const html = await response.text();
          const posts = parseThreadsHTML(html, since);

          return posts.map(
            (post): NewsItem => ({
              id: `threads-${account.handle}-${post.id}`,
              title: truncate(post.text),
              url:
                post.permalink ||
                `https://www.threads.com/@${account.handle}/post/${post.id}`,
              source: "threads",
              description: post.text.length > 120 ? post.text : undefined,
              publishedAt: new Date(post.timestamp),
              collectedAt: now,
              tags: ["threads", account.handle],
              metadata: { account: account.handle },
            })
          );
        } catch (error) {
          console.error(`Failed to collect from Threads @${account.handle}:`, error);
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
