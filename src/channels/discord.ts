import type { Channel, Digest } from "../types.js";

function decodeEntities(str: string): string {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");
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
  const messages: string[] = [];

  // Message 1: Header + AI summary
  let summary = `**========================================**\n`;
  summary += `**  AI Daily Brief — ${digest.date}  **\n`;
  summary += `**========================================**\n`;

  if (digest.summary) {
    summary += `\n${digest.summary}`;
  }

  messages.push(...splitText(summary, 2000));

  // Message 2+: Links organized by company/section
  let links = "";
  for (const section of digest.sections) {
    links += `\n**— ${section.title} —**\n`;
    for (const item of section.items) {
      const title = decodeEntities(item.title);
      links += `> ${title}\n> ${item.url}\n`;
    }
  }

  if (links) {
    messages.push(...splitText(links, 2000));
  }

  return messages;
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
