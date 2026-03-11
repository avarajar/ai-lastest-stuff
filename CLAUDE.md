# CLAUDE.md — Project Intelligence

> This file is the source of truth for Claude Code when working on this project.
> It is automatically loaded at the start of every conversation.

## Identity

**AI Latest Stuff** is a TypeScript CLI tool that aggregates AI news daily from 40+ sources,
generates an AI-powered digest with Claude, and posts it to Slack, Discord, or the terminal.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (native fetch, ESM) |
| Language | TypeScript, strict mode |
| Database | SQLite via better-sqlite3 |
| AI | Anthropic Claude SDK (Sonnet) |
| Framework | None — pure Node.js CLI |

## Project Map

```
src/
  index.ts               Entry point. Parses CLI flags, orchestrates pipeline.
  config.ts              Loads env vars into typed Config object.
  types.ts               All shared interfaces: NewsItem, Digest, SourceCollector, Channel.
  db.ts                  SQLite layer. Tables: news_items, digests. Uses WAL mode.
  digest.ts              Groups items into sections, calls Claude for summaries.
  sources/
    index.ts             Factory: maps SourceType -> collector instance.
    github.ts            GitHub search API. Trending AI repos by stars.
    github-releases.ts   Monitors 30+ repos from AI companies for new releases.
    hackernews.ts        Algolia HN API. Parallel per-term search, merged & deduped.
    reddit.ts            8 subreddits via public JSON API.
    rss.ts               10 RSS/Atom feeds, parsed with regex (no XML lib).
    arxiv.ts             ArXiv Atom API. cs.AI, cs.LG, cs.CL categories.
    company-blogs.ts     Scrapes Anthropic, Meta AI, Mistral news pages (no RSS).
  channels/
    index.ts             Factory: creates channels from config.
    console.ts           ANSI-colored terminal output. Always active.
    slack.ts             Slack Block Kit via incoming webhook.
    discord.ts           Discord embeds via webhook. Color-coded sections.
```

## Commands

```bash
npm run collect       # Fetch from all sources, store in SQLite
npm run digest        # Collect + generate Claude digest
npm run post          # Collect + digest + post to channels
npm start             # Same as post (full pipeline)
npm run dev           # Watch mode
npm run typecheck     # tsc --noEmit
npm run build         # tsc (outputs to dist/)
```

## Architecture

```
Sources (parallel) --> Deduplicate --> SQLite --> Claude Digest --> Channels
```

1. **Collect**: 6 collectors run via `Promise.allSettled`. Each returns `NewsItem[]`.
2. **Store**: Upserted by ID (`INSERT OR IGNORE`). No duplicates.
3. **Digest**: Items grouped into 5 sections. Claude writes summaries as JSON.
4. **Post**: Digest formatted per-channel and delivered.

## Key Conventions

- **ESM**: All imports use `.js` extension. `"type": "module"` in package.json.
- **Native fetch**: No axios, no node-fetch. Requires Node 20+.
- **Interfaces**: Every source implements `SourceCollector`, every channel implements `Channel`.
- **Error isolation**: Each source/channel is wrapped in try/catch. One failure doesn't kill the pipeline.
- **No external XML parser**: RSS and ArXiv XML parsed with regex + string manipulation.
- **Timeouts**: All fetch calls use `AbortSignal.timeout(10000)`.

## Key Types

```typescript
interface NewsItem {
  id: string;              // e.g. "github-owner/repo", "hn-12345"
  title: string;
  url: string;
  source: SourceType;      // "github" | "github-releases" | "hackernews" | "reddit" | "rss" | "arxiv"
  description?: string;
  score?: number;
  author?: string;
  publishedAt: Date;
  collectedAt: Date;
  tags: string[];
  metadata?: Record<string, unknown>;
}

interface Digest {
  date: string;            // ISO date "2025-01-15"
  items: NewsItem[];
  summary?: string;        // Claude-generated overall summary
  sections: DigestSection[];
}
```

## Digest Sections

| Section | Source |
|---------|--------|
| Top Stories | Top 5 HN/Reddit by score |
| Company Announcements | company-blogs (Anthropic, Meta AI, Mistral) |
| Releases | github-releases items (latest per repo) |
| Trending Repos | github trending items |
| Research | arxiv items |
| News | rss items |

## Environment Variables

| Variable | Required | Used in |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | For digest | `digest.ts` |
| `GITHUB_TOKEN` | Recommended | `github.ts`, `github-releases.ts` |
| `SLACK_WEBHOOK_URL` | Optional | `channels/slack.ts` |
| `DISCORD_WEBHOOK_URL` | Optional | `channels/discord.ts` |
| `DB_PATH` | Optional | `db.ts` (default: `./ai-news.db`) |

## Adding a New Source

1. Create `src/sources/my-source.ts` exporting a `SourceCollector`
2. Add type to `SourceType` union in `src/types.ts`
3. Import and register in `src/sources/index.ts` collectorMap
4. Add to sources array in `src/config.ts`

## Adding a New Channel

1. Create `src/channels/my-channel.ts` exporting a `Channel`
2. Add type to `ChannelType` union in `src/types.ts`
3. Import and register in `src/channels/index.ts`
4. Add env var to `src/config.ts` if needed

## Gotchas

- Anthropic, Meta AI, and Mistral don't have RSS feeds. The `company-blogs` collector scrapes their HTML pages directly. Meta AI rejects browser-like Accept headers.
- HackerNews Algolia API doesn't support OR queries. The collector runs parallel searches per term and merges results.
- The GitHub search API returns 422 if the query has too many `topic:` filters without auth. Keep queries simple.
- Reddit rate-limits aggressively. The collector fetches subreddits sequentially with User-Agent set.
- ArXiv API can be slow and sometimes returns stale results. Timeout is 10s.
- Claude's response may be wrapped in markdown code fences. `digest.ts` handles both raw JSON and fenced JSON.
