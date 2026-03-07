import Anthropic from "@anthropic-ai/sdk";
import { NewsItem, Digest, DigestSection } from "./types.js";

function groupItems(items: NewsItem[]): DigestSection[] {
  const sections: DigestSection[] = [];

  // Top Stories: highest scored items from HN/Reddit (top 5 by score)
  const hnRedditItems = items
    .filter((item) => item.source === "hackernews" || item.source === "reddit")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  if (hnRedditItems.length > 0) {
    sections.push({ title: "Top Stories", items: hnRedditItems });
  }

  // AI Company Releases: GitHub releases from major AI orgs
  const releaseItems = items.filter((item) => item.source === "github-releases");
  if (releaseItems.length > 0) {
    sections.push({ title: "AI Company Releases", items: releaseItems });
  }

  // New Repos & Tools: GitHub trending items
  const githubItems = items.filter((item) => item.source === "github");
  if (githubItems.length > 0) {
    sections.push({ title: "New Repos & Tools", items: githubItems });
  }

  // Research Papers: ArXiv items
  const arxivItems = items.filter((item) => item.source === "arxiv");
  if (arxivItems.length > 0) {
    sections.push({ title: "Research Papers", items: arxivItems });
  }

  // Community Highlights: remaining items from Reddit, RSS
  // Exclude HN/Reddit items already used in Top Stories
  const topStoryIds = new Set(hnRedditItems.map((item) => item.id));
  const communityItems = items.filter(
    (item) =>
      (item.source === "reddit" || item.source === "rss") &&
      !topStoryIds.has(item.id)
  );
  if (communityItems.length > 0) {
    sections.push({ title: "Community Highlights", items: communityItems });
  }

  return sections;
}

function buildPrompt(sections: DigestSection[]): string {
  let prompt = `You are an AI news curator. Below are today's collected AI-related news items, grouped into sections. For each section and for the overall digest, write a brief summary.

Instructions:
- Write a brief overall summary (2-3 sentences) capturing the most important themes of the day in AI news.
- Write a brief summary for each section (1-2 sentences) highlighting the key items.
- Return your response as JSON with this exact structure:
{
  "overallSummary": "...",
  "sectionSummaries": {
    "Section Title": "..."
  }
}

Here are the items:

`;

  for (const section of sections) {
    prompt += `## ${section.title}\n\n`;
    for (const item of section.items) {
      prompt += `- **${item.title}**`;
      if (item.description) {
        prompt += `: ${item.description}`;
      }
      if (item.score !== undefined) {
        prompt += ` (score: ${item.score})`;
      }
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  return prompt;
}

interface SummaryResponse {
  overallSummary: string;
  sectionSummaries: Record<string, string>;
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

  // Skip summarization if no API key is provided
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

    // Extract text content from the response
    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return digest;
    }

    const responseText = textBlock.text;

    // Parse the JSON response - handle possible markdown code fences
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const summaries: SummaryResponse = JSON.parse(jsonStr);

    digest.summary = summaries.overallSummary;

    for (const section of digest.sections) {
      if (summaries.sectionSummaries[section.title]) {
        section.summary = summaries.sectionSummaries[section.title];
      }
    }
  } catch (error) {
    console.error("Failed to generate AI summaries:", error);
    // Return digest without summaries on error
  }

  return digest;
}
