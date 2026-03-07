import type { NewsItem, SourceCollector } from "../types.js";

// AI company GitHub orgs and their key repos to monitor
const ORGS_AND_REPOS = [
  // Anthropic
  "anthropics/claude-code",
  "anthropics/anthropic-sdk-python",
  "anthropics/anthropic-sdk-typescript",
  "anthropics/courses",
  // OpenAI
  "openai/openai-python",
  "openai/openai-node",
  "openai/whisper",
  "openai/codex",
  // Meta
  "meta-llama/llama",
  "meta-llama/llama-models",
  "facebookresearch/llama-recipes",
  // Google
  "google-deepmind/gemma",
  "google/generative-ai-python",
  // Mistral
  "mistralai/mistral-inference",
  "mistralai/mistral-common",
  // Hugging Face
  "huggingface/transformers",
  "huggingface/diffusers",
  "huggingface/trl",
  "huggingface/smolagents",
  // Other key AI projects
  "langchain-ai/langchain",
  "run-llama/llama_index",
  "ollama/ollama",
  "ggml-org/llama.cpp",
  "lmstudio-ai/lms",
  "vercel/ai",
  "stanfordnlp/dspy",
];

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string;
  author: {
    login: string;
  } | null;
  prerelease: boolean;
  draft: boolean;
}

export const githubReleasesCollector: SourceCollector = {
  name: "github-releases",

  async collect(since: Date): Promise<NewsItem[]> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-lastest-stuff/0.1.0",
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const now = new Date();
    const allItems: NewsItem[] = [];

    // Fetch releases in parallel, batched to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < ORGS_AND_REPOS.length; i += batchSize) {
      const batch = ORGS_AND_REPOS.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (repo) => {
          try {
            const url = `https://api.github.com/repos/${repo}/releases?per_page=5`;
            const response = await fetch(url, {
              headers,
              signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
              if (response.status !== 404) {
                console.error(`GitHub releases error for ${repo}: ${response.status}`);
              }
              return [];
            }

            const releases = (await response.json()) as GitHubRelease[];

            return releases
              .filter((r) => !r.draft && new Date(r.published_at) >= since)
              .map((release): NewsItem => {
                const description = release.body
                  ? release.body.length > 500
                    ? release.body.slice(0, 500) + "..."
                    : release.body
                  : undefined;

                return {
                  id: `gh-release-${repo}-${release.tag_name}`,
                  title: `${repo} ${release.tag_name}${release.name ? ` - ${release.name}` : ""}`,
                  url: release.html_url,
                  source: "github-releases",
                  description,
                  author: release.author?.login,
                  publishedAt: new Date(release.published_at),
                  collectedAt: now,
                  tags: [repo.split("/")[0], release.prerelease ? "prerelease" : "stable"],
                  metadata: {
                    repo,
                    tagName: release.tag_name,
                    prerelease: release.prerelease,
                  },
                };
              });
          } catch (error) {
            console.error(`Failed to fetch releases for ${repo}:`, error);
            return [];
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          allItems.push(...result.value);
        }
      }
    }

    return allItems;
  },
};
