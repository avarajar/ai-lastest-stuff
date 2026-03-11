import Anthropic from "@anthropic-ai/sdk";
import { NewsItem, Digest, DigestSection } from "./types.js";

// Only the 4 major AI companies — in this exact order
const MAIN_COMPANIES = ["anthropic", "openai", "google", "microsoft"] as const;

const COMPANY_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  microsoft: "Microsoft",
};

function detectCompany(item: NewsItem): string | null {
  const title = item.title.toLowerCase();
  const url = item.url.toLowerCase();
  const feedUrl = ((item.metadata?.feedUrl as string) || "").toLowerCase();
  const repo = ((item.metadata?.repo as string) || "").toLowerCase();
  const company = ((item.metadata?.company as string) || "").toLowerCase();

  // Direct company blog
  if (company === "anthropic") return "anthropic";

  // GitHub releases by org
  if (repo.startsWith("anthropics/")) return "anthropic";
  if (repo.startsWith("openai/")) return "openai";
  if (repo.startsWith("google-deepmind/") || repo.startsWith("google/generative")) return "google";
  if (repo.startsWith("microsoft/")) return "microsoft";

  // RSS by feed URL
  if (feedUrl.includes("openai.com")) return "openai";
  if (feedUrl.includes("blog.google") || feedUrl.includes("deepmind.google")) return "google";
  if (feedUrl.includes("microsoft.com")) return "microsoft";

  // Title/URL heuristics
  if (title.includes("anthropic") || title.includes("claude") || url.includes("anthropic.com")) return "anthropic";
  if (title.includes("openai") || title.includes("chatgpt") || title.includes("gpt-") || url.includes("openai.com")) return "openai";
  if ((title.includes("google") && (title.includes("gemini") || title.includes("ai"))) || title.includes("deepmind")) return "google";
  if (title.includes("microsoft") || title.includes("copilot")) return "microsoft";

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

// Source priority: official blogs first, then official RSS, then releases, then community
const SOURCE_PRIORITY: Record<string, number> = {
  "company-blogs": 1,
  rss: 2,
  "github-releases": 3,
  hackernews: 4,
  reddit: 5,
};

function groupItems(items: NewsItem[]): DigestSection[] {
  const sections: DigestSection[] = [];
  const companyItems = new Map<string, NewsItem[]>();
  const communityPool: NewsItem[] = [];

  // Attribute items from all sources to companies
  for (const item of items) {
    if (item.source === "github" || item.source === "arxiv") continue; // handled separately

    const company = detectCompany(item);
    if (company && COMPANY_DISPLAY_NAMES[company]) {
      if (!companyItems.has(company)) companyItems.set(company, []);
      companyItems.get(company)!.push(item);
    } else if (item.source === "hackernews" || item.source === "reddit" || item.source === "rss") {
      communityPool.push(item);
    }
  }

  // Emit company sections in fixed priority order
  for (const companyKey of MAIN_COMPANIES) {
    const compItems = companyItems.get(companyKey);
    if (!compItems || compItems.length === 0) continue;

    const releases = compItems.filter((i) => i.source === "github-releases");
    const nonReleases = compItems.filter((i) => i.source !== "github-releases");
    const dedupedReleases = latestReleasePerRepo(releases);
    const merged = [...nonReleases, ...dedupedReleases]
      .sort((a, b) => {
        const priA = SOURCE_PRIORITY[a.source] ?? 10;
        const priB = SOURCE_PRIORITY[b.source] ?? 10;
        if (priA !== priB) return priA - priB;
        return b.publishedAt.getTime() - a.publishedAt.getTime();
      })
      .slice(0, 6);

    sections.push({
      title: COMPANY_DISPLAY_NAMES[companyKey],
      items: merged,
    });
  }

  // Trending Repos
  const githubItems = items
    .filter((item) => item.source === "github")
    .slice(0, 5);

  if (githubItems.length > 0) {
    sections.push({ title: "Trending Repos", items: githubItems });
  }


  return sections;
}

// Only company sections get AI summaries — Trending Repos is just links
const SUMMARY_SECTIONS = new Set(Object.values(COMPANY_DISPLAY_NAMES));

function buildPrompt(sections: DigestSection[]): string {
  const companySections = sections.filter((s) => SUMMARY_SECTIONS.has(s.title));

  let prompt = `You are writing a daily AI industry newsletter. Below are today's items grouped by company.

Write ONLY the sections listed below. Rules:
- Start with a 1 sentence lead highlighting the biggest news today
- Then write EXACTLY one paragraph per company listed below, using the EXACT company name as header in ALL CAPS
- Do NOT add any other sections, headers, or categories beyond what is listed
- Summarize their most important announcements, products, and releases
- Mention specific product names, versions, and numbers
- Keep each paragraph under 80 words
- Do NOT use markdown — plain text only
- Do NOT include links or URLs
- Casual but informative tone

Sections to write: ${companySections.map((s) => s.title.toUpperCase()).join(", ")}

Here are today's items:

`;

  for (const section of companySections) {
    prompt += `## ${section.title}\n`;
    for (const item of section.items) {
      prompt += `- [${item.source}] ${item.title}`;
      if (item.description) {
        prompt += `: ${item.description.slice(0, 200)}`;
      }
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  return prompt;
}

// Parse the AI summary into per-section summaries
function parseSummaryBySections(
  summary: string,
  sectionTitles: string[]
): Map<string, string> {
  const result = new Map<string, string>();

  // Build regex to split by section headers (e.g. "ANTHROPIC", "OPENAI")
  const headerPattern = sectionTitles
    .map((t) => t.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`^(${headerPattern})\\s*$`, "gm");

  // Find all section positions
  const positions: Array<{ title: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(summary)) !== null) {
    const normalTitle = sectionTitles.find(
      (t) => t.toUpperCase() === match![1].toUpperCase()
    );
    if (normalTitle) {
      positions.push({
        title: normalTitle,
        start: match.index + match[0].length,
        end: summary.length,
      });
    }
  }

  // Set end boundaries
  for (let i = 0; i < positions.length - 1; i++) {
    positions[i].end = positions[i + 1].start - positions[i + 1].title.length - 1;
  }

  // Extract text for the lead (before first section)
  if (positions.length > 0) {
    const lead = summary.slice(0, positions[0].start - positions[0].title.length - 1).trim();
    if (lead) {
      result.set("_lead", lead);
    }
  }

  // Extract each section's text
  for (const pos of positions) {
    const text = summary.slice(pos.start, pos.end).trim();
    if (text) {
      result.set(pos.title, text);
    }
  }

  return result;
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

      // Parse per-section summaries and attach them
      const sectionTitles = sections.map((s) => s.title);
      const parsed = parseSummaryBySections(textBlock.text, sectionTitles);

      for (const section of sections) {
        section.summary = parsed.get(section.title);
      }

      // Store lead as the overall summary
      const lead = parsed.get("_lead");
      if (lead) {
        digest.summary = lead;
      }
    }
  } catch (error) {
    console.error("Failed to generate AI summary:", error);
  }

  return digest;
}
