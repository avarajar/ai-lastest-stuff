import Anthropic from "@anthropic-ai/sdk";
import { NewsItem, Digest, DigestSection } from "./types.js";

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

  // Top Stories: highest scored from HN/Reddit (top 5)
  const hnRedditItems = items
    .filter((item) => item.source === "hackernews" || item.source === "reddit")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  if (hnRedditItems.length > 0) {
    sections.push({ title: "Top Stories", items: hnRedditItems });
  }

  // Releases: only latest per repo, max 5
  const releaseItems = latestReleasePerRepo(
    items.filter((item) => item.source === "github-releases")
  ).slice(0, 5);

  if (releaseItems.length > 0) {
    sections.push({ title: "Releases", items: releaseItems });
  }

  // Trending Repos: top 5 by stars
  const githubItems = items
    .filter((item) => item.source === "github")
    .slice(0, 5);

  if (githubItems.length > 0) {
    sections.push({ title: "Trending Repos", items: githubItems });
  }

  // Papers: top 5
  const arxivItems = items
    .filter((item) => item.source === "arxiv")
    .slice(0, 5);

  if (arxivItems.length > 0) {
    sections.push({ title: "Research", items: arxivItems });
  }

  // News: RSS items, top 5
  const topStoryIds = new Set(hnRedditItems.map((item) => item.id));
  const newsItems = items
    .filter((item) => item.source === "rss")
    .slice(0, 5);

  if (newsItems.length > 0) {
    sections.push({ title: "News", items: newsItems });
  }

  return sections;
}

function buildPrompt(sections: DigestSection[]): string {
  let prompt = `You are writing a short daily AI newsletter brief. Below are today's items grouped by category.

Write a single concise newsletter in plain text. Rules:
- Start with a 1-2 sentence headline summary of the most important thing today
- Then write one short paragraph per section (2-3 sentences max each)
- Mention specific names, versions, and numbers when relevant
- Keep the TOTAL response under 300 words
- Do NOT use markdown, bullet points, or lists — write in prose paragraphs
- Do NOT include links or URLs
- Separate sections with a blank line and the section name in caps on its own line
- Write in a casual but informative tone, like a smart colleague giving you a quick rundown

Here are today's items:

`;

  for (const section of sections) {
    prompt += `## ${section.title}\n`;
    for (const item of section.items) {
      prompt += `- ${item.title}`;
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
