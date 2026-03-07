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

export const githubCollector: SourceCollector = {
  name: "github",

  async collect(since: Date): Promise<NewsItem[]> {
    try {
      const sinceDate = since.toISOString().split("T")[0];
      const query = encodeURIComponent(
        `ai llm machine-learning pushed:>${sinceDate} stars:>10`
      );
      const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=15`;

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "ai-lastest-stuff/0.1.0",
      };

      const token = process.env.GITHUB_TOKEN;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`GitHub API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as GitHubSearchResponse;
      const repos = data.items ?? [];
      const now = new Date();

      return repos.slice(0, 15).map((repo): NewsItem => ({
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
