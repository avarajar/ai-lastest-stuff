import type { Channel, Digest } from "../types.js";

function buildMessages(digest: Digest): string[] {
  const messages: string[] = [];

  let header = `========================================\n`;
  header += `  AI Daily Brief - ${digest.date}\n`;
  header += `========================================\n`;

  if (digest.summary) {
    header += `\n${digest.summary}\n`;
  }

  messages.push(header);

  // Build links organized by section (company-first)
  let links = "";
  for (const section of digest.sections) {
    links += `\n--- ${section.title} ---\n`;
    for (const item of section.items) {
      links += `${item.title}\n${item.url}\n`;
    }
  }

  if (links) {
    // Split links if needed (Discord 2000 char limit)
    let remaining = links;
    while (remaining.length > 0) {
      if (remaining.length <= 2000) {
        messages.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf("\n", 1900);
      if (splitAt <= 0) splitAt = 1900;
      messages.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }
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
