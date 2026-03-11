import Anthropic from "@anthropic-ai/sdk";
import { NewsItem, Digest, DigestSection } from "./types.js";

// Company priority order — Anthropic first, then major AI labs, then ecosystem
const COMPANY_PRIORITY: Record<string, number> = {
  anthropic: 1,
  openai: 2,
  google: 3,
  "google-deepmind": 3,
  "meta-ai": 4,
  mistral: 5,
  nvidia: 6,
  microsoft: 7,
};

const COMPANY_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "google-deepmind": "Google DeepMind",
  "meta-ai": "Meta AI",
  mistral: "Mistral",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
};

// Map github-releases repos and RSS feed URLs to company keys
function detectCompany(item: NewsItem): string | null {
  const id = item.id.toLowerCase();
  const title = item.title.toLowerCase();
  const url = item.url.toLowerCase();
  const feedUrl = ((item.metadata?.feedUrl as string) || "").toLowerCase();
  const repo = ((item.metadata?.repo as string) || "").toLowerCase();
  const company = ((item.metadata?.company as string) || "").toLowerCase();

  // Direct company blog
  if (company) return company;

  // GitHub releases by org
  if (repo.startsWith("anthropics/")) return "anthropic";
  if (repo.startsWith("openai/")) return "openai";
  if (repo.startsWith("meta-llama/") || repo.startsWith("facebookresearch/")) return "meta-ai";
  if (repo.startsWith("google-deepmind/") || repo.startsWith("google/generative")) return "google-deepmind";
  if (repo.startsWith("mistralai/")) return "mistral";

  // RSS by feed URL
  if (feedUrl.includes("openai.com")) return "openai";
  if (feedUrl.includes("blog.google") || feedUrl.includes("deepmind.google")) return "google";
  if (feedUrl.includes("blogs.nvidia.com")) return "nvidia";
  if (feedUrl.includes("microsoft.com")) return "microsoft";

  // Title/URL heuristics for HN/Reddit items about specific companies
  if (title.includes("anthropic") || title.includes("claude") || url.includes("anthropic.com")) return "anthropic";
  if (title.includes("openai") || title.includes("chatgpt") || url.includes("openai.com")) return "openai";
  if ((title.includes("google") && (title.includes("gemini") || title.includes("ai"))) || title.includes("deepmind")) return "google";
  if (title.includes("meta") && (title.includes("llama") || title.includes(" ai"))) return "meta-ai";
  if (title.includes("mistral")) return "mistral";
  if (title.includes("nvidia")) return "nvidia";

  return null;
}

function latestReleasePerRepo(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const item of items) {
    const repo = (item.metadata?.repo as string) || item.title.split(" ")[0];
    if (!seen.has(repo)) {
      seen.set(repo, item);
    }
  }
  return Array.from(seen.values());
}

function groupItems(items: NewsItem[]): DigestSection[] {
  const sections: DigestSection[] = [];

  // ========================================
  // 1. COMPANY SECTIONS — grouped by company, sorted by priority
  // ========================================

  // Collect all company-attributable items
  const companyItems = new Map<string, NewsItem[]>();
  const communityPool: NewsItem[] = [];

  // Company blogs + company RSS + company releases
  const companySourceItems = items.filter(
    (item) => item.source === "company-blogs" || item.source === "github-releases" || item.source === "rss"
  );

  for (const item of companySourceItems) {
    const company = detectCompany(item);
    if (company && COMPANY_DISPLAY_NAMES[company]) {
      if (!companyItems.has(company)) companyItems.set(company, []);
      companyItems.get(company)!.push(item);
    }
  }

  // Also check HN/Reddit for company-specific stories (high score only)
  const hnRedditItems = items
    .filter((item) => item.source === "hackernews" || item.source === "reddit")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  for (const item of hnRedditItems) {
    const company = detectCompany(item);
    if (company && COMPANY_DISPLAY_NAMES[company]) {
      if (!companyItems.has(company)) companyItems.set(company, []);
      companyItems.get(company)!.push(item);
    } else {
      communityPool.push(item);
    }
  }

  // Sort companies by priority, emit sections
  const sortedCompanies = Array.from(companyItems.entries()).sort(([a], [b]) => {
    return (COMPANY_PRIORITY[a] ?? 99) - (COMPANY_PRIORITY[b] ?? 99);
  });

  // Source priority: official blogs first, then official RSS, then releases, then community
  const SOURCE_PRIORITY: Record<string, number> = {
    "company-blogs": 1,
    rss: 2,
    "github-releases": 3,
    hackernews: 4,
    reddit: 5,
  };

  for (const [company, compItems] of sortedCompanies) {
    // Deduplicate releases (only latest per repo)
    const releases = compItems.filter((i) => i.source === "github-releases");
    const nonReleases = compItems.filter((i) => i.source !== "github-releases");
    const dedupedReleases = latestReleasePerRepo(releases);
    const merged = [...nonReleases, ...dedupedReleases]
      .sort((a, b) => {
        // Sort by source priority first (official sources first), then by date
        const priA = SOURCE_PRIORITY[a.source] ?? 10;
        const priB = SOURCE_PRIORITY[b.source] ?? 10;
        if (priA !== priB) return priA - priB;
        return b.publishedAt.getTime() - a.publishedAt.getTime();
      })
      .slice(0, 8);

    if (merged.length > 0) {
      sections.push({
        title: COMPANY_DISPLAY_NAMES[company],
        items: merged,
      });
    }
  }

  // ========================================
  // 2. TRENDING REPOS
  // ========================================
  const githubItems = items
    .filter((item) => item.source === "github")
    .slice(0, 5);

  if (githubItems.length > 0) {
    sections.push({ title: "Trending Repos", items: githubItems });
  }

  // ========================================
  // 3. RESEARCH
  // ========================================
  const arxivItems = items
    .filter((item) => item.source === "arxiv")
    .slice(0, 5);

  if (arxivItems.length > 0) {
    sections.push({ title: "Research", items: arxivItems });
  }

  // ========================================
  // 4. COMMUNITY — remaining HN/Reddit + non-company RSS
  // ========================================
  const usedRssIds = new Set(
    sortedCompanies.flatMap(([, items]) => items.map((i) => i.id))
  );

  const communityRss = items
    .filter((item) => item.source === "rss" && !usedRssIds.has(item.id))
    .slice(0, 5);

  const communityFinal = [
    ...communityPool.slice(0, 5),
    ...communityRss,
  ].slice(0, 8);

  if (communityFinal.length > 0) {
    sections.push({ title: "Community", items: communityFinal });
  }

  return sections;
}

function buildPrompt(sections: DigestSection[]): string {
  let prompt = `You are writing a daily AI industry newsletter. Below are today's items grouped by company and category.

Write a structured newsletter in plain text. Rules:
- Start with a 1-2 sentence lead highlighting the BIGGEST news today
- Then write one paragraph per section, using the EXACT section name as header
- Company sections go first (Anthropic, OpenAI, Google, etc.) — for each, summarize their announcements and releases
- Mention specific product names, versions, and numbers
- Keep the TOTAL response under 400 words
- Do NOT use markdown formatting — use plain text only
- Do NOT include links or URLs
- Section headers should be the company/section name in ALL CAPS on its own line, preceded by a blank line
- Write in a casual but informative tone, like a smart colleague giving you a quick rundown
- If a company section has both blog posts AND releases, mention both

Here are today's items:

`;

  for (const section of sections) {
    prompt += `## ${section.title}\n`;
    for (const item of section.items) {
      prompt += `- [${item.source}] ${item.title}`;
      if (item.description) {
        const desc = item.description.slice(0, 200);
        prompt += `: ${desc}`;
      }
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  return prompt;
}

export async function generateDigest(
  items: NewsItem[],
  apiKey: string
): Promise<Digest> {
  const today = new Date().toISOString().split("T")[0];

  if (items.length === 0) {
    return {
      date: today,
      items: [],
      sections: [],
      summary: "No AI news items were collected today.",
    };
  }

  const sections = groupItems(items);

  const digest: Digest = {
    date: today,
    items,
    sections,
  };

  if (!apiKey) {
    return digest;
  }

  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(sections);

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (textBlock && textBlock.type === "text") {
      digest.summary = textBlock.text;
    }
  } catch (error) {
    console.error("Failed to generate AI summary:", error);
  }

  return digest;
}
