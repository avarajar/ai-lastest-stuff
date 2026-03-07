import type { Channel, Digest, DigestSection } from "../types.js";

const EMBED_COLORS = [0x5865f2, 0x57f287, 0xfee75c, 0xeb459e];

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
}

function buildEmbeds(digest: Digest): DiscordEmbed[] {
  const embeds: DiscordEmbed[] = [];

  // Summary embed
  if (digest.summary) {
    embeds.push({
      title: `AI News Digest - ${digest.date}`,
      description: digest.summary,
      color: 0x5865f2,
    });
  }

  // One embed per section
  for (let i = 0; i < digest.sections.length; i++) {
    const section = digest.sections[i];
    const color = EMBED_COLORS[i % EMBED_COLORS.length];

    const itemLines = section.items.map((item) => {
      const score = item.score != null ? ` (${item.score})` : "";
      return `[${item.title}](${item.url})${score}`;
    });

    const description = section.summary
      ? `${section.summary}\n\n${itemLines.join("\n")}`
      : itemLines.join("\n");

    embeds.push({
      title: section.title,
      description,
      color,
    });
  }

  return embeds;
}

export function createDiscordChannel(webhookUrl: string): Channel {
  return {
    name: "discord",

    async post(digest: Digest): Promise<void> {
      const embeds = buildEmbeds(digest);

      // Discord allows max 10 embeds per message; send in batches if needed
      const batchSize = 10;
      for (let i = 0; i < embeds.length; i += batchSize) {
        const batch = embeds.slice(i, i + batchSize);
        const payload = {
          content: i === 0 ? `**AI News Digest - ${digest.date}**` : undefined,
          embeds: batch,
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
