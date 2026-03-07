import type { Channel, Config } from "../types.js";
import { consoleChannel } from "./console.js";
import { createSlackChannel } from "./slack.js";
import { createDiscordChannel } from "./discord.js";

export function createChannels(config: Config): Channel[] {
  const channels: Channel[] = [];

  // Console channel is always included
  channels.push(consoleChannel);

  // Add Slack channel if webhook is configured
  if (config.channels.includes("slack") && config.slackWebhookUrl) {
    channels.push(createSlackChannel(config.slackWebhookUrl));
  }

  // Add Discord channel if webhook is configured
  if (config.channels.includes("discord") && config.discordWebhookUrl) {
    channels.push(createDiscordChannel(config.discordWebhookUrl));
  }

  return channels;
}
