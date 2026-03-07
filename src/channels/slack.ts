import type { Channel, Digest, DigestSection } from "../types.js";

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
}

function buildBlocks(digest: Digest): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `AI News Digest - ${digest.date}`,
      emoji: true,
    },
  });

  // Summary
  if (digest.summary) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: digest.summary,
      },
    });
  }

  // Each section
  for (const section of digest.sections) {
    blocks.push({ type: "divider" });

    const itemLines = section.items.map((item) => {
      const score = item.score != null ? ` (${item.score})` : "";
      return `*<${item.url}|${item.title}>*${score}`;
    });

    const sectionText = section.summary
      ? `${section.summary}\n\n${itemLines.join("\n")}`
      : itemLines.join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${section.title}*\n\n${sectionText}`,
      },
    });
  }

  return blocks;
}

export function createSlackChannel(webhookUrl: string): Channel {
  return {
    name: "slack",

    async post(digest: Digest): Promise<void> {
      const blocks = buildBlocks(digest);

      // Slack has a 50-block limit; truncate if needed
      const payload = {
        text: `AI News Digest - ${digest.date}`,
        blocks: blocks.slice(0, 50),
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
