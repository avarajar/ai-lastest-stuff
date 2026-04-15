import type { Channel, Digest } from "../types.js";

const SECTION_EMOJI: Record<string, string> = {
  Anthropic: "\uD83D\uDC9C",      // 💜
  "Claude Code": "\u2328\uFE0F",   // ⌨️
  OpenAI: "\uD83D\uDC9A",          // 💚
  Google: "\uD83D\uDD35",          // 🔵
  Microsoft: "\uD83D\uDFE6",       // 🟦
  "Trending Repos": "\uD83D\uDD25", // 🔥
};

function decodeEntities(str: string): string {
  return str
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201C")
    .replace(/&#8221;/g, "\u201D")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014");
}

function buildText(digest: Digest): string {
  const date = digest.date;
  let text = `> *\uD83E\uDDE0 AI Daily Brief*\n> _${date}_\n\n`;

  if (digest.summary) {
    text += `${digest.summary}\n`;
  }

  for (const section of digest.sections) {
    const emoji = SECTION_EMOJI[section.title] || "\u25AA\uFE0F";
    const isTrending = section.title === "Trending Repos";

    text += `\n*${emoji} ${section.title}*\n`;

    if (section.summary) {
      text += `${section.summary}\n`;
    }

    if (isTrending) {
      // Trending repos: compact one-liner with description
      for (const item of section.items) {
        const title = decodeEntities(item.title);
        // Extract repo name and description from "owner/repo — description"
        const dashIdx = title.indexOf(" \u2014 ");
        if (dashIdx > 0) {
          const repo = title.slice(0, dashIdx);
          const desc = title.slice(dashIdx + 3);
          text += `<${item.url}|${repo}> \u2014 ${desc}\n`;
        } else {
          text += `<${item.url}|${title}>\n`;
        }
      }
    } else {
      // Company sections: links inline with →
      const links = section.items.map((item) => {
        const title = decodeEntities(item.title);
        // Use short title: strip "owner/repo " prefix from releases
        const short = title.replace(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+ /, "");
        return `<${item.url}|${short}>`;
      });
      text += `\u2192 ${links.join(" \u00B7 ")}\n`;
    }
  }

  return text;
}

export function createSlackChannel(webhookUrl: string, channel = "#artificial-intelligence"): Channel {
  return {
    name: "slack",

    async post(digest: Digest): Promise<void> {
      const text = buildText(digest);

      // Slack webhook with mrkdwn — single payload, no blocks needed
      const blocks: Array<{ type: string; text: { type: string; text: string } }> = [
        {
          type: "section",
          text: { type: "mrkdwn", text: text.slice(0, 3000) },
        },
      ];

      // If text exceeds 3000, send overflow as second block
      if (text.length > 3000) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: text.slice(3000, 6000) },
        });
      }

      const payload = {
        channel,
        text: `AI Daily Brief \u2014 ${digest.date}`,
        blocks,
      };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          const body = await response.text();
          console.error(`Slack webhook error: ${response.status} ${response.statusText} - ${body}`);
        } else {
          console.log("Digest posted to Slack successfully.");
        }
      } catch (error) {
        console.error("Failed to post digest to Slack:", error);
      }
    },
  };
}
