import type { NewsItem, SourceCollector } from "../types.js";

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  story_url?: string | null;
  points: number;
  author: string;
  created_at: string;
  _tags?: string[];
}

interface HNSearchResponse {
  hits?: HNHit[];
}

// Algolia HN API doesn't support OR — run separate queries per term and merge
const SEARCH_TERMS = ["AI", "LLM", "Claude", "GPT", "Anthropic", "machine learning", "artificial intelligence"];

async function searchHN(term: string, sinceTimestamp: number): Promise<HNHit[]> {
  const query = encodeURIComponent(term);
  const url = `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&numericFilters=created_at_i>${sinceTimestamp}&hitsPerPage=20`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error(`HackerNews API error for "${term}": ${response.status} ${response.statusText}`);
    return [];
  }

  const data = (await response.json()) as HNSearchResponse;
  return data.hits ?? [];
}

export const hackernewsCollector: SourceCollector = {
  name: "hackernews",

  async collect(since: Date): Promise<NewsItem[]> {
    try {
      const sinceTimestamp = Math.floor(since.getTime() / 1000);

      // Run all searches in parallel
      const results = await Promise.allSettled(
        SEARCH_TERMS.map((term) => searchHN(term, sinceTimestamp))
      );

      // Merge and deduplicate by objectID
      const seen = new Set<string>();
      const allHits: HNHit[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const hit of result.value) {
            if (!seen.has(hit.objectID)) {
              seen.add(hit.objectID);
              allHits.push(hit);
            }
          }
        }
      }

      const now = new Date();

      // Sort by points descending, take top 15
      const sorted = allHits
        .filter((hit) => hit.title)
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .slice(0, 15);

      return sorted.map((hit): NewsItem => ({
        id: `hn-${hit.objectID}`,
        title: hit.title,
        url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: "hackernews",
        score: hit.points,
        author: hit.author,
        publishedAt: new Date(hit.created_at),
        collectedAt: now,
        tags: Array.isArray(hit._tags) ? hit._tags : [],
        metadata: {
          hnId: hit.objectID,
        },
      }));
    } catch (error) {
      console.error("Failed to collect HackerNews stories:", error);
      return [];
    }
  },
};
