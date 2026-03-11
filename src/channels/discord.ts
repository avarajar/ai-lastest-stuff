import type { Channel, Digest } from "../types.js";

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
  // Build one big text, then split for Discord limits
  let full = `**AI Daily Brief \u2014 ${digest.date}**\n`;

  // Lead summary
  if (digest.summary) {
    full += `\n${digest.summary}\n`;
  }

  // Each section: summary paragraph + links underneath
  for (const section of digest.sections) {
    full += `\n**\u2014 ${section.title} \u2014**\n`;

    if (section.summary) {
      full += `${section.summary}\n`;
    }

    for (const item of section.items) {
      const title = decodeEntities(item.title);
      full += `> [${title}](${item.url})\n`;
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
