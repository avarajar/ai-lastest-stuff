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

// Keywords that indicate non-dev noise (investments, politics, office news)
const NOISE_KEYWORDS = [
  "raises", "funding", "valuation", "investor", "seed round", "series ",
  "ipo", "stock", "shares", "revenue",
  "office", "headquarters", "hires", "hired", "ceo ", "cto ",
  "lawsuit", "legal battle", "department of war", "pentagon", "secretary",
  "senate", "congress", "regulation", "policy", "lobbyist",
  "statement from", "where things stand",
];

function isNoise(item: NewsItem): boolean {
  const text = `${item.title} ${item.description || ""}`.toLowerCase();
  return NOISE_KEYWORDS.some((kw) => text.includes(kw));
}

// Claude Code specific: coding tools, skills, CLI, dev workflows
const CLAUDE_CODE_KEYWORDS = [
  "claude code", "claude-code", "claude cli",
  "skill", "hook", "mcp", "slash command",
  "coding agent", "code review", "code generation",
  "terminal", "ide", "vscode", "cursor",
  "subagent", "cowork", "worktree",
  "anthropics/claude-code",
];

function isClaudeCode(item: NewsItem): boolean {
  const text = `${item.title} ${item.description || ""} ${item.id}`.toLowerCase();
  const repo = ((item.metadata?.repo as string) || "").toLowerCase();
  if (repo === "anthropics/claude-code") return true;
  return CLAUDE_CODE_KEYWORDS.some((kw) => text.includes(kw));
}

function detectCompany(item: NewsItem): string | null {
  const title = item.title.toLowerCase();
  const url = item.url.toLowerCase();
  const feedUrl = ((item.metadata?.feedUrl as string) || "").toLowerCase();
  const repo = ((item.metadata?.repo as string) || "").toLowerCase();
  const company = ((item.metadata?.company as string) || "").toLowerCase();

  if (company === "anthropic") return "anthropic";

  if (repo.startsWith("anthropics/")) return "anthropic";
  if (repo.startsWith("openai/")) return "openai";
  if (repo.startsWith("google-deepmind/") || repo.startsWith("google/generative")) return "google";
  if (repo.startsWith("microsoft/")) return "microsoft";

  if (feedUrl.includes("openai.com")) return "openai";
  if (feedUrl.includes("blog.google") || feedUrl.includes("deepmind.google")) return "google";
  if (feedUrl.includes("microsoft.com")) return "microsoft";

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

const SOURCE_PRIORITY: Record<string, number> = {
  "company-blogs": 1,
  rss: 2,
  "github-releases": 3,
  hackernews: 4,
  reddit: 5,
};

function sortBySourceThenDate(items: NewsItem[]): NewsItem[] {
  return items.sort((a, b) => {
    const priA = SOURCE_PRIORITY[a.source] ?? 10;
    const priB = SOURCE_PRIORITY[b.source] ?? 10;
    if (priA !== priB) return priA - priB;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });
}

function groupItems(items: NewsItem[]): DigestSection[] {
  const sections: DigestSection[] = [];
  const companyItems = new Map<string, NewsItem[]>();

  // Attribute items to companies
  for (const item of items) {
    if (item.source === "github" || item.source === "arxiv") continue;

    const company = detectCompany(item);
    if (company && COMPANY_DISPLAY_NAMES[company]) {
      if (!companyItems.has(company)) companyItems.set(company, []);
      companyItems.get(company)!.push(item);
    }
  }

  // Emit company sections
  for (const companyKey of MAIN_COMPANIES) {
    const compItems = companyItems.get(companyKey);
    if (!compItems || compItems.length === 0) continue;

    // Deduplicate releases
    const releases = compItems.filter((i) => i.source === "github-releases");
    const nonReleases = compItems.filter((i) => i.source !== "github-releases");
    const dedupedReleases = latestReleasePerRepo(releases);
    const all = [...nonReleases, ...dedupedReleases];

    if (companyKey === "anthropic") {
      // Split Anthropic into: product/tech news + Claude Code subsection
      const claudeCodeItems = sortBySourceThenDate(
        all.filter((i) => isClaudeCode(i))
      ).slice(0, 6);

      const anthropicItems = sortBySourceThenDate(
        all.filter((i) => !isClaudeCode(i) && !isNoise(i))
      ).slice(0, 6);

      if (anthropicItems.length > 0) {
        sections.push({ title: "Anthropic", items: anthropicItems });
      }
      if (claudeCodeItems.length > 0) {
        sections.push({ title: "Claude Code", items: claudeCodeItems });
      }
    } else {
      // Other companies: filter noise, sort by source priority
      const filtered = sortBySourceThenDate(
        all.filter((i) => !isNoise(i))
      ).slice(0, 6);

      if (filtered.length > 0) {
        sections.push({
          title: COMPANY_DISPLAY_NAMES[companyKey],
          items: filtered,
        });
      }
    }
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

// Sections that get AI summaries
const SUMMARY_SECTIONS = new Set([
  ...Object.values(COMPANY_DISPLAY_NAMES),
  "Claude Code",
]);

function buildPrompt(sections: DigestSection[]): string {
  const companySections = sections.filter((s) => SUMMARY_SECTIONS.has(s.title));

  let prompt = `You are writing a daily AI developer newsletter focused on tools, products, and technical updates.

Write ONLY the sections listed below. Rules:
- Start with a 1 sentence lead highlighting the biggest developer-relevant news today
- Then write EXACTLY one paragraph per section listed below, using the EXACT section name as header in ALL CAPS
- Do NOT add any other sections, headers, or categories beyond what is listed
- Focus on product launches, features, developer tools, APIs, SDKs, and technical updates
- Skip investment news, politics, hiring, and office announcements
- For "CLAUDE CODE": focus on CLI features, skills, integrations, dev workflows, code review, and agent capabilities
- Mention specific product names, versions, and numbers
- Keep each paragraph under 80 words
- Do NOT use markdown — plain text only
- Do NOT include links or URLs
- Casual but informative tone — like a dev colleague giving you the rundown

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

  const headerPattern = sectionTitles
    .map((t) => t.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`^(${headerPattern})\\s*$`, "gm");

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

  for (let i = 0; i < positions.length - 1; i++) {
    positions[i].end = positions[i + 1].start - positions[i + 1].title.length - 1;
  }

  if (positions.length > 0) {
    const lead = summary.slice(0, positions[0].start - positions[0].title.length - 1).trim();
    if (lead) {
      result.set("_lead", lead);
    }
  }

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

      const sectionTitles = sections.map((s) => s.title);
      const parsed = parseSummaryBySections(textBlock.text, sectionTitles);

      for (const section of sections) {
        section.summary = parsed.get(section.title);
      }

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
