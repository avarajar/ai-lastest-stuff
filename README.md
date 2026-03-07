<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js_20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Claude_AI-D97757?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

<h1 align="center">AI Latest Stuff</h1>

<p align="center">
  <strong>Your daily AI intelligence briefing, delivered automatically.</strong>
  <br />
  <em>Collects, curates, and delivers AI news from 40+ sources — straight to Slack, Discord, or your terminal.</em>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#sources">Sources</a> &bull;
  <a href="#channels">Channels</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#configuration">Configuration</a>
</p>

---

## What is this?

**AI Latest Stuff** is a zero-dependency CLI tool that aggregates AI news from across the internet every day. It pulls from GitHub, HackerNews, Reddit, RSS feeds, ArXiv, and direct releases from AI companies — then uses **Claude** to generate an intelligent summary and delivers it wherever your team hangs out.

Think of it as your personal AI research assistant that never sleeps.

```
 Sources                    Pipeline                     Channels
 --------                   --------                     --------
 GitHub Trending     ─┐                              ┌─  Slack
 GitHub Releases     ─┤    Collect                    ├─  Discord
 HackerNews          ─┤      │                        └─  Console
 Reddit (8 subs)     ─┼──►  Store (SQLite)
 RSS Feeds (8)       ─┤      │
 ArXiv Papers        ─┘    Digest (Claude AI)
                             │
                           Deliver ──────────────────►  Your Team
```

---

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/avarajar/ai-lastest-stuff.git
cd ai-lastest-stuff
npm install

# 2. Configure
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Run
npm start
```

That's it. You'll see a full AI news digest in your terminal.

---

## Sources

### Direct from AI Companies

The **GitHub Releases** collector monitors 30+ repositories from major AI organizations for new versions, updates, and launches:

| Organization | Tracked Repos |
|:---|:---|
| **Anthropic** | `claude-code`, `anthropic-sdk-python`, `anthropic-sdk-typescript`, `courses` |
| **OpenAI** | `openai-python`, `openai-node`, `whisper`, `codex` |
| **Meta** | `llama`, `llama-models`, `llama-recipes` |
| **Google** | `gemma`, `generative-ai-python` |
| **Mistral** | `mistral-inference`, `mistral-common` |
| **Hugging Face** | `transformers`, `diffusers`, `trl`, `smolagents` |
| **Community** | `ollama`, `llama.cpp`, `langchain`, `llama_index`, `dspy`, `vercel/ai` |

### Community & News

| Source | What it captures |
|:---|:---|
| **GitHub Trending** | Top repos with AI/LLM/ML topics, sorted by stars |
| **HackerNews** | Stories matching AI, LLM, Claude, GPT, Anthropic keywords |
| **Reddit** | `r/artificial` `r/MachineLearning` `r/LocalLLaMA` `r/ClaudeAI` `r/singularity` `r/OpenAI` `r/ChatGPT` `r/StableDiffusion` |
| **RSS Feeds** | OpenAI Blog, Google AI, DeepMind, Hugging Face, Latent Space, TechCrunch AI, MIT Tech Review, The Decoder |
| **ArXiv** | Papers from `cs.AI`, `cs.LG`, `cs.CL` categories |

---

## Channels

### Console
Rich terminal output with ANSI colors. Always active.

### Slack
Posts formatted digests using **Block Kit** — headers, sections, and linked items. Just add a webhook URL.

### Discord
Beautiful **embed cards** with color-coded sections. One embed per digest section with linked items.

---

## How It Works

The pipeline runs in 4 stages:

### 1. Collect
All 6 source collectors run **in parallel** using `Promise.allSettled`. Each collector fetches content from the last 24 hours. If one source fails, the others keep going.

### 2. Store
Items are deduplicated by ID and upserted into a local **SQLite** database. This means running the tool multiple times a day won't create duplicates.

### 3. Digest
**Claude** receives all collected items and generates:
- An **overall summary** of the day's AI landscape (2-3 sentences)
- A **section summary** for each category (1-2 sentences)

Items are grouped into 5 sections:
| Section | Content |
|:---|:---|
| **Top Stories** | Highest-scored items from HackerNews & Reddit |
| **AI Company Releases** | New versions from tracked repos |
| **New Repos & Tools** | Trending GitHub repositories |
| **Research Papers** | ArXiv papers |
| **Community Highlights** | Remaining Reddit & RSS items |

### 4. Deliver
The formatted digest is posted to all configured channels simultaneously.

---

## Commands

```bash
npm run collect    # Collect only — fetch and store items
npm run digest     # Collect + generate AI-powered digest
npm run post       # Full pipeline — collect, digest, and post
npm start          # Same as post

npm run dev        # Watch mode (auto-restarts on file changes)
npm run typecheck  # TypeScript type checking
npm run build      # Compile to JavaScript
```

---

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|:---|:---:|:---|
| `ANTHROPIC_API_KEY` | Yes | API key from [console.anthropic.com](https://console.anthropic.com) |
| `GITHUB_TOKEN` | No | Increases GitHub API rate limits (recommended) |
| `SLACK_WEBHOOK_URL` | No | Enables Slack delivery via [incoming webhook](https://api.slack.com/messaging/webhooks) |
| `DISCORD_WEBHOOK_URL` | No | Enables Discord delivery via [webhook](https://support.discord.com/hc/en-us/articles/228383668) |
| `DB_PATH` | No | SQLite path (default: `./ai-news.db`) |

---

## Running Daily with Cron

Set it up to run every morning at 8 AM:

```bash
# Edit your crontab
crontab -e

# Add this line (adjust the path)
0 8 * * * cd /path/to/ai-lastest-stuff && /usr/local/bin/node --import tsx src/index.ts >> /var/log/ai-news.log 2>&1
```

Or with **launchd** on macOS, **systemd** on Linux, or any scheduler you prefer.

---

## Cost

This app makes **one Claude API call per day**. That's it.

| Model | Cost/day | Cost/month |
|:---|:---:|:---:|
| Sonnet (default) | ~$0.03 | ~$0.90 |
| Haiku | ~$0.005 | ~$0.15 |
| Opus | ~$0.16 | ~$4.80 |

---

## Tech Stack

- **Runtime** — Node.js 20+ with native `fetch`
- **Language** — TypeScript (strict mode, ESM modules)
- **Database** — SQLite via `better-sqlite3`
- **AI** — Anthropic Claude SDK
- **Zero frameworks** — Pure Node.js, no Express, no Next, no nothing

---

## Project Structure

```
src/
  index.ts               Main entry point & CLI router
  config.ts              Environment configuration loader
  types.ts               Shared TypeScript interfaces
  db.ts                  SQLite database layer
  digest.ts              Claude-powered digest generator

  sources/
    index.ts             Source collector factory
    github.ts            GitHub trending repos
    github-releases.ts   AI company release tracker
    hackernews.ts        HackerNews stories
    reddit.ts            Reddit AI subreddits
    rss.ts               RSS/Atom feed parser
    arxiv.ts             ArXiv paper collector

  channels/
    index.ts             Channel factory
    console.ts           Terminal output (ANSI colors)
    slack.ts             Slack Block Kit webhook
    discord.ts           Discord embeds webhook
```

---

## Adding Sources & Channels

### New Source
1. Create `src/sources/my-source.ts` implementing `SourceCollector`
2. Add the source type to `SourceType` in `src/types.ts`
3. Register it in `src/sources/index.ts`
4. Add it to the sources array in `src/config.ts`

### New Channel
1. Create `src/channels/my-channel.ts` implementing `Channel`
2. Add the channel type to `ChannelType` in `src/types.ts`
3. Register it in `src/channels/index.ts`

---

## License

MIT

---

<p align="center">
  <sub>Built with Claude Code</sub>
</p>
