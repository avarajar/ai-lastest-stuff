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
      text: `AI Daily Brief \u2014 ${digest.date}`,
      emoji: true,
    },
  });

  // Lead summary
  if (digest.summary) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: digest.summary,
      },
    });
  }

  // Each section: summary + links
  for (const section of digest.sections) {
    blocks.push({ type: "divider" });

    let text = `*\u2014 ${section.title} \u2014*\n`;

    if (section.summary) {
      text += `${section.summary}\n\n`;
    }

    for (const item of section.items) {
      const title = decodeEntities(item.title);
      text += `\u2022 <${item.url}|${title}>\n`;
    }

    // Slack section text limit is 3000 chars
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: text.slice(0, 3000),
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

      const payload = {
        text: `AI Daily Brief \u2014 ${digest.date}`,
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
