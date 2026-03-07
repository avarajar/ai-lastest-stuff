# AI Latest Stuff - Project Guide

## What is this?
Daily AI news aggregator that collects news, repos, papers, and projects from multiple sources, generates a digest using Claude, and posts it to Slack, Discord, or console.

## Tech Stack
- **Runtime**: Node.js 20+ (native fetch, ESM modules)
- **Language**: TypeScript with strict mode
- **Database**: SQLite via better-sqlite3
- **AI**: Anthropic Claude SDK for summarization
- **No framework**: Pure Node.js CLI application

## Project Structure
```
src/
  index.ts          # Main entry point & CLI
  config.ts         # Environment config loader
  types.ts          # Shared TypeScript interfaces
  db.ts             # SQLite database layer
  digest.ts         # Claude-powered digest generator
  sources/          # News source collectors
    index.ts        # Collector factory
    github.ts          # GitHub trending repos
    github-releases.ts # Releases from AI company repos (Anthropic, OpenAI, Meta, etc.)
    hackernews.ts      # HackerNews stories
    reddit.ts          # Reddit AI subreddits (8 subs)
    rss.ts             # RSS/Atom feeds (OpenAI, Google, HuggingFace, TechCrunch, etc.)
    arxiv.ts           # ArXiv papers
  channels/         # Output channels
    index.ts        # Channel factory
    console.ts      # Terminal output
    slack.ts        # Slack webhook
    discord.ts      # Discord webhook
```

## Commands
```bash
npm run collect    # Collect news from all sources
npm run digest     # Collect + generate AI digest
npm run post       # Collect + digest + post to channels
npm start          # Full pipeline (same as post)
npm run dev        # Watch mode for development
npm run typecheck  # TypeScript type checking
```

## Configuration
Copy `.env.example` to `.env` and set:
- `ANTHROPIC_API_KEY` - Required for AI summarization
- `SLACK_WEBHOOK_URL` - Optional, enables Slack posting
- `DISCORD_WEBHOOK_URL` - Optional, enables Discord posting
- `GITHUB_TOKEN` - Optional, increases GitHub API rate limits
- `DB_PATH` - SQLite database path (default: ./ai-news.db)

## Key Conventions
- All imports use `.js` extension (ESM requirement)
- Native fetch for all HTTP calls (no axios/node-fetch)
- All source collectors implement `SourceCollector` interface
- All channels implement `Channel` interface
- Errors are caught per-source/channel so one failure doesn't break others
- Database uses upsert to avoid duplicate items

## Architecture
1. **Collect**: Each source collector fetches AI-related content from the last 24h
2. **Store**: Items are upserted into SQLite (deduped by id)
3. **Digest**: Claude groups and summarizes items into sections
4. **Post**: Formatted digest is sent to configured channels
