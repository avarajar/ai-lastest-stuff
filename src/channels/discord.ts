import type { Channel, Digest } from "../types.js";

function buildMessages(digest: Digest): string[] {
  const messages: string[] = [];

  // Header + summary
  let header = `**AI News Digest - ${digest.date}**\n`;
  if (digest.summary) {
    header += `\n${digest.summary}\n`;
  }
  messages.push(header);

  // One message per section (Discord has 2000 char limit per message)
  for (const section of digest.sections) {
    let msg = `**--- ${section.title} ---**\n`;
    if (section.summary) {
      msg += `_${section.summary}_\n`;
    }
    msg += "\n";

    for (const item of section.items) {
      const score = item.score != null ? ` (${item.score})` : "";
      const line = `- ${item.title}${score}\n  ${item.url}\n`;

      // Split if approaching Discord's 2000 char limit
      if (msg.length + line.length > 1900) {
        messages.push(msg);
        msg = `**--- ${section.title} (cont.) ---**\n\n`;
      }
      msg += line;
    }

    if (msg.trim()) {
      messages.push(msg);
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
