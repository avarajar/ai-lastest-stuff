import type { Channel, Digest } from "../types.js";

function buildMessages(digest: Digest): string[] {
  const messages: string[] = [];

  let msg = `========================================\n`;
  msg += `  AI Daily Brief - ${digest.date}\n`;
  msg += `========================================\n`;

  if (digest.summary) {
    msg += `\n${digest.summary}\n`;
  } else {
    // Fallback: simple list if no AI summary
    for (const section of digest.sections) {
      msg += `\n--- ${section.title} ---\n`;
      for (const item of section.items) {
        msg += `${item.title}\n${item.url}\n`;
      }
    }
  }

  // Split into multiple messages if needed (Discord 2000 char limit)
  while (msg.length > 0) {
    if (msg.length <= 2000) {
      messages.push(msg);
      break;
    }
    // Find a good split point (newline before 2000)
    let splitAt = msg.lastIndexOf("\n", 1900);
    if (splitAt <= 0) splitAt = 1900;
    messages.push(msg.slice(0, splitAt));
    msg = msg.slice(splitAt);
  }

  // Always add a links message so people can dig deeper
  let links = `\nTop links:\n`;
  const topItems = digest.sections.flatMap((s) => s.items).slice(0, 8);
  for (const item of topItems) {
    links += `${item.url}\n`;
  }
  messages.push(links);

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
