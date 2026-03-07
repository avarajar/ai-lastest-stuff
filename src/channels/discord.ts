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

  // One embed per section, split if too long (Discord 4096 char limit per embed description)
  for (let i = 0; i < digest.sections.length; i++) {
    const section = digest.sections[i];
    const color = EMBED_COLORS[i % EMBED_COLORS.length];

    const itemLines = section.items.map((item) => {
      const score = item.score != null ? ` (${item.score})` : "";
      return `[${item.title}](${item.url})${score}`;
    });

    // Build description respecting Discord's 4096 char limit
    const header = section.summary ? `${section.summary}\n\n` : "";
    let description = header;
    let partIndex = 0;

    for (const line of itemLines) {
      if (description.length + line.length + 1 > 3900) {
        embeds.push({
          title: partIndex === 0 ? section.title : `${section.title} (cont.)`,
          description,
          color,
        });
        description = "";
        partIndex++;
      }
      description += (description ? "\n" : "") + line;
    }

    if (description) {
      embeds.push({
        title: partIndex === 0 ? section.title : `${section.title} (cont.)`,
        description,
        color,
      });
    }
  }

  return embeds;
}

export function createDiscordChannel(webhookUrl: string): Channel {
  return {
    name: "discord",

    async post(digest: Digest): Promise<void> {
      const embeds = buildEmbeds(digest);

      // Send header message first
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `**AI News Digest - ${digest.date}**` }),
          signal: AbortSignal.timeout(15000),
        });
      } catch (error) {
        console.error("Failed to post Discord header:", error);
      }

      // Send each embed as its own message (Discord's 6000 char total limit per message)
      for (const embed of embeds) {
        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
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
