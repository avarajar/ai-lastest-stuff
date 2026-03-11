import type { Channel, Digest } from "../types.js";

function splitToDiscordMessages(text: string): string[] {
  const messages: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      messages.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", 1900);
    if (splitAt <= 0) splitAt = 1900;
    messages.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return messages;
}

function buildMessages(digest: Digest): string[] {
  let full = `========================================\n`;
  full += `  AI Daily Brief - ${digest.date}\n`;
  full += `========================================\n`;

  if (digest.summary) {
    full += `\n${digest.summary}\n`;
  }

  // Add links organized by section (company-first)
  for (const section of digest.sections) {
    full += `\n--- ${section.title} ---\n`;
    for (const item of section.items) {
      full += `${item.title}\n${item.url}\n`;
    }
  }

  return splitToDiscordMessages(full);
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
