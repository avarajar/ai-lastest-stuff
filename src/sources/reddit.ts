import type { NewsItem, SourceCollector } from "../types.js";

interface RedditPost {
  data: {
    name: string;
    title: string;
    permalink: string;
    score: number;
    author: string;
    selftext: string;
    created_utc: number;
    subreddit: string;
    url: string;
  };
}

interface RedditListingResponse {
  data?: {
    children?: RedditPost[];
  };
}

const SUBREDDITS = [
  "artificial",
  "MachineLearning",
  "LocalLLaMA",
  "ClaudeAI",
  "singularity",
  "OpenAI",
  "ChatGPT",
  "StableDiffusion",
];

export const redditCollector: SourceCollector = {
  name: "reddit",

  async collect(since: Date): Promise<NewsItem[]> {
    const sinceTimestamp = since.getTime() / 1000;
    const now = new Date();
    const allItems: NewsItem[] = [];

    for (const subreddit of SUBREDDITS) {
      try {
        const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;

        const response = await fetch(url, {
          headers: {
            "User-Agent": "ai-lastest-stuff/0.1.0",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.error(`Reddit API error for r/${subreddit}: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = (await response.json()) as RedditListingResponse;
        const posts = data.data?.children ?? [];

        for (const post of posts) {
          const p = post.data;
          if (!p || p.created_utc <= sinceTimestamp) continue;

          const description = p.selftext
            ? p.selftext.length > 300
              ? p.selftext.slice(0, 300) + "..."
              : p.selftext
            : undefined;

          allItems.push({
            id: `reddit-${p.name}`,
            title: p.title,
            url: `https://reddit.com${p.permalink}`,
            source: "reddit",
            description,
            score: p.score,
            author: p.author,
            publishedAt: new Date(p.created_utc * 1000),
            collectedAt: now,
            tags: [subreddit],
            metadata: {
              subreddit: p.subreddit,
              externalUrl: p.url,
            },
          });
        }
      } catch (error) {
        console.error(`Failed to collect from r/${subreddit}:`, error);
      }
    }

    return allItems;
  },
};
