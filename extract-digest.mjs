import { loadConfig } from "./dist/config.js";
import { Database } from "./dist/db.js";
import { createCollectors } from "./dist/sources/index.js";
import { generateDigest } from "./dist/digest.js";

const config = loadConfig();
const db = new Database(config.dbPath);

const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const collectors = createCollectors(config.sources);

process.stderr.write(`Running ${collectors.length} collectors...\n`);
const results = await Promise.allSettled(collectors.map(c => c.collect(since)));

const allItems = [];
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const name = collectors[i].name;
  if (r.status === "fulfilled") {
    process.stderr.write(`  ${name}: ${r.value.length} items\n`);
    allItems.push(...r.value);
  } else {
    process.stderr.write(`  ${name}: FAILED - ${r.reason}\n`);
  }
}

const seen = new Map();
for (const item of allItems) {
  if (!seen.has(item.id)) seen.set(item.id, item);
}
const uniqueItems = Array.from(seen.values());
process.stderr.write(`\nTotal: ${allItems.length}, Unique: ${uniqueItems.length}\n`);

db.upsertItems(uniqueItems);
const itemsForDigest = db.getItemsSince(since);
process.stderr.write(`Generating digest from ${itemsForDigest.length} items...\n`);

const digest = await generateDigest(itemsForDigest, config.anthropicApiKey || "");
db.saveDigest(digest.date, JSON.stringify(digest));
db.close();

process.stdout.write(JSON.stringify(digest));
