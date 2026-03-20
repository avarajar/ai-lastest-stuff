import type { Channel, Digest } from "../types.js";

const SECTION_EMOJI: Record<string, string> = {
  Anthropic: "\uD83D\uDC9C",
  "Claude Code": "\u2328\uFE0F",
  OpenAI: "\uD83D\uDC9A",
  Google: "\uD83D\uDD35",
  Microsoft: "\uD83D\uDFE6",
  "Trending Repos": "\uD83D\uDD25",
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

function splitText(text: string, limit: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      parts.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", limit - 100);
    if (splitAt <= 0) splitAt = limit - 100;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return parts;
}

function buildMessages(digest: Digest): string[] {
  let full = `> **\uD83E\uDDE0 AI Daily Brief**\n> _${digest.date}_\n`;

  if (digest.summary) {
    full += `\n${digest.summary}\n`;
  }

  for (const section of digest.sections) {
    const emoji = SECTION_EMOJI[section.title] || "\u25AA\uFE0F";
    const isTrending = section.title === "Trending Repos";

    full += `\n**${emoji} ${section.title}**\n`;

    if (section.summary) {
      full += `${section.summary}\n`;
    }

    if (isTrending) {
      for (const item of section.items) {
        const title = decodeEntities(item.title);
        const dashIdx = title.indexOf(" \u2014 ");
        if (dashIdx > 0) {
          const repo = title.slice(0, dashIdx);
          const desc = title.slice(dashIdx + 3);
          full += `[${repo}](${item.url}) \u2014 ${desc}\n`;
        } else {
          full += `[${title}](${item.url})\n`;
        }
      }
    } else {
      const links = section.items.map((item) => {
        const title = decodeEntities(item.title);
        const short = title.replace(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+ /, "");
        return `[${short}](${item.url})`;
      });
      full += `\u2192 ${links.join(" \u00B7 ")}\n`;
    }
  }

  return splitText(full, 2000);
}

export function createDiscordChannel(webhookUrl: string): Channel {
  return {
    name: "discord",

    async post(digest: Digest): Promise<void> {
      const messages = buildMessages(digest);

      for (const content of messages) {
        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const body = await response.text();
            console.error(`Discord webhook error: ${response.status} ${response.statusText} - ${body}`);
          }
        } catch (error) {
          console.error("Failed to post digest to Discord:", error);
        }
      }

      console.log("Digest posted to Discord successfully.");
    },
  };
}
