export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: SourceType;
  description?: string;
  score?: number;
  author?: string;
  publishedAt: Date;
  collectedAt: Date;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export type SourceType =
  | "github"
  | "github-releases"
  | "hackernews"
  | "reddit"
  | "rss"
  | "arxiv";

export type ChannelType = "slack" | "discord" | "console";

export interface Digest {
  date: string;
  items: NewsItem[];
  summary?: string;
  sections: DigestSection[];
}

export interface DigestSection {
  title: string;
  items: NewsItem[];
  summary?: string;
}

export interface SourceCollector {
  name: SourceType;
  collect(since: Date): Promise<NewsItem[]>;
}

export interface Channel {
  name: ChannelType;
  post(digest: Digest): Promise<void>;
}

export interface Config {
  anthropicApiKey?: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  githubToken?: string;
  dbPath: string;
  sources: SourceType[];
  channels: ChannelType[];
}
