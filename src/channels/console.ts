import type { Channel, Digest } from "../types.js";

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export const consoleChannel: Channel = {
  name: "console",

  async post(digest: Digest): Promise<void> {
    console.log("");
    console.log(`${BOLD}${CYAN}  AI Daily Brief - ${digest.date}${RESET}`);
    console.log(`${CYAN}  ${"=".repeat(40)}${RESET}`);

    if (digest.summary) {
      console.log(`\n${digest.summary}`);
    } else {
      for (const section of digest.sections) {
        console.log(`\n${BOLD}${section.title}${RESET}`);
        for (const item of section.items) {
          console.log(`  ${item.title}`);
          console.log(`  ${DIM}${item.url}${RESET}`);
        }
      }
    }

    // Top links
    const topItems = digest.sections.flatMap((s) => s.items).slice(0, 8);
    console.log(`\n${DIM}Top links:${RESET}`);
    for (const item of topItems) {
      console.log(`  ${DIM}${item.url}${RESET}`);
    }

    console.log("");
  },
};
