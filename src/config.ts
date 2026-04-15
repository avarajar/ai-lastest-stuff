import type { Config, SourceType, ChannelType } from "./types.js";

export function loadConfig(): Config {
  const sources: SourceType[] = ["github", "github-releases", "hackernews", "reddit", "rss", "arxiv", "company-blogs"];

  const channels: ChannelType[] = ["console"];
  if (process.env.SLACK_WEBHOOK_URL) channels.push("slack");
  if (process.env.DISCORD_WEBHOOK_URL) channels.push("discord");

  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    slackChannel: process.env.SLACK_CHANNEL,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    githubToken: process.env.GITHUB_TOKEN,
    dbPath: process.env.DB_PATH || "./ai-news.db",
    sources,
    channels,
  };
}
