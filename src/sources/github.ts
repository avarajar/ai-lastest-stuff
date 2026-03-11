import type { NewsItem, SourceCollector } from "../types.js";

interface GitHubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  owner: { login: string };
  topics: string[];
  pushed_at: string;
  created_at: string;
}

interface GitHubSearchResponse {
  items?: GitHubRepo[];
}

// Searches to find actually trending repos — recently created with fast growth
const SEARCHES = [
  // Anthropic/Claude ecosystem — highest priority
  { query: "claude anthropic", label: "claude" },
  { query: "claude-code", label: "claude" },
  // Other AI trending
  { query: "llm agent", label: "ai" },
  { query: "ai tool", label: "ai" },
  { query: "gpt openai", label: "ai" },
  { query: "machine learning", label: "ai" },
];

async function searchGitHub(
  query: string,
  sinceDate: string,
  headers: Record<string, string>
): Promise<GitHubRepo[]> {
  // Search for repos created recently with some traction
  const q = encodeURIComponent(
    `${query} created:>${sinceDate} stars:>5`
  );
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`;

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as GitHubSearchResponse;
  return data.items ?? [];
}

export const githubCollector: SourceCollector = {
  name: "github",

  async collect(since: Date): Promise<NewsItem[]> {
    try {
      // Look for repos created in the last 2 weeks
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const sinceDate = twoWeeksAgo.toISOString().split("T")[0];

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "ai-lastest-stuff/0.1.0",
      };

      const token = process.env.GITHUB_TOKEN;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Run searches sequentially to avoid rate limits
      const seen = new Set<string>();
      const allRepos: Array<GitHubRepo & { searchLabel: string }> = [];

      for (const search of SEARCHES) {
        const repos = await searchGitHub(search.query, sinceDate, headers);
        for (const repo of repos) {
          if (!seen.has(repo.full_name)) {
            seen.add(repo.full_name);
            allRepos.push({ ...repo, searchLabel: search.label });
          }
        }
      }

      const now = new Date();

      // Sort: claude/anthropic repos first, then by stars
      allRepos.sort((a, b) => {
        const aIsClaude = a.searchLabel === "claude" ? 1 : 0;
        const bIsClaude = b.searchLabel === "claude" ? 1 : 0;
        if (aIsClaude !== bIsClaude) return bIsClaude - aIsClaude;
        return b.stargazers_count - a.stargazers_count;
      });

      return allRepos.slice(0, 15).map((repo): NewsItem => ({
        id: `github-${repo.full_name}`,
        title: repo.full_name,
        url: repo.html_url,
        source: "github",
        description: repo.description ?? undefined,
        score: repo.stargazers_count,
        author: repo.owner?.login,
        publishedAt: new Date(repo.pushed_at || repo.created_at),
        collectedAt: now,
        tags: Array.isArray(repo.topics) ? repo.topics : [],
        metadata: {
          stars: repo.stargazers_count,
        },
      }));
    } catch (error) {
      console.error("Failed to collect GitHub trending repos:", error);
      return [];
    }
  },
};
