import "dotenv/config";

import { loadConfig } from "./config.js";
import { Database } from "./db.js";
import { createCollectors } from "./sources/index.js";
import { generateDigest } from "./digest.js";
import { createChannels } from "./channels/index.js";
import type { NewsItem } from "./types.js";

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

type Mode = "collect" | "digest" | "post";

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--collect")) return "collect";
  if (args.includes("--digest")) return "digest";
  if (args.includes("--post") || args.includes("--all") || args.length === 0) return "post";
  return "post";
}

function printBanner(): void {
  console.log("");
  console.log(`${BOLD}${CYAN}============================================${RESET}`);
  console.log(`${BOLD}${CYAN}  AI Latest Stuff - Daily AI News Digest${RESET}`);
  console.log(`${BOLD}${CYAN}============================================${RESET}`);
  console.log("");
}

function deduplicateItems(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
    }
  }
  return Array.from(seen.values());
}

async function main(): Promise<void> {
  printBanner();

  const mode = parseMode();
  console.log(`${YELLOW}Mode: ${mode}${RESET}`);
  console.log("");

  const config = loadConfig();
  const db = new Database(config.dbPath);

  try {
    // Step 1: Calculate time window (last 24 hours)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`Collecting news since: ${since.toISOString()}`);

    // Step 2: Create collectors and collect from all sources in parallel
    const collectors = createCollectors(config.sources);
    console.log(`Running ${collectors.length} source collectors...`);

    const results = await Promise.allSettled(
      collectors.map((c) => c.collect(since))
    );

    // Gather all items, logging any failures
    const allItems: NewsItem[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const collectorName = collectors[i].name;
      if (result.status === "fulfilled") {
        console.log(`  ${collectorName}: ${result.value.length} items`);
        allItems.push(...result.value);
      } else {
        console.error(`  ${collectorName}: FAILED -`, result.reason);
      }
    }

    // Step 3: Deduplicate
    const uniqueItems = deduplicateItems(allItems);
    console.log(`\nTotal items collected: ${allItems.length}`);
    console.log(`Unique items: ${uniqueItems.length}`);

    // Step 4: Store in database
    const newItems = db.upsertItems(uniqueItems);
    console.log(`New items stored: ${newItems}`);

    if (mode === "collect") {
      console.log(`\n${YELLOW}Collection complete.${RESET}`);
      return;
    }

    // Step 5: Generate digest
    const itemsForDigest = db.getItemsSince(since);
    console.log(`\nGenerating digest from ${itemsForDigest.length} items...`);

    if (!config.anthropicApiKey) {
      console.log(`${YELLOW}No ANTHROPIC_API_KEY set — digest will be generated without AI summaries.${RESET}`);
    }

    const digest = await generateDigest(itemsForDigest, config.anthropicApiKey || "");

    // Save digest to database
    db.saveDigest(digest.date, JSON.stringify(digest));
    console.log(`Digest saved for ${digest.date}.`);

    if (mode === "digest") {
      // In digest-only mode, still print to console for visibility
      const channels = createChannels({
        ...config,
        channels: ["console"],
      });
      for (const channel of channels) {
        await channel.post(digest);
      }
      console.log(`\n${YELLOW}Digest generation complete.${RESET}`);
      return;
    }

    // Step 6: Post to all configured channels
    const channels = createChannels(config);
    console.log(`\nPosting to ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);

    for (const channel of channels) {
      try {
        await channel.post(digest);
      } catch (error) {
        console.error(`Failed to post to ${channel.name}:`, error);
      }
    }

    // Summary
    console.log(`\n${BOLD}${CYAN}--- Summary ---${RESET}`);
    console.log(`  Items collected:   ${allItems.length}`);
    console.log(`  Unique items:      ${uniqueItems.length}`);
    console.log(`  New items stored:  ${newItems}`);
    console.log(`  Digest sections:   ${digest.sections.length}`);
    console.log(`  Channels posted:   ${channels.map((c) => c.name).join(", ")}`);
    console.log(`\n${YELLOW}Pipeline complete.${RESET}`);
  } catch (error) {
    console.error("Fatal error in pipeline:", error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
