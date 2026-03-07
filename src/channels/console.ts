import type { Channel, Digest, DigestSection, NewsItem } from "../types.js";

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function formatItem(item: NewsItem, index: number): string {
  const score = item.score != null ? ` ${YELLOW}[${item.score}]${RESET}` : "";
  return `  ${index + 1}. ${BOLD}${item.title}${RESET}${score}\n     ${CYAN}${item.url}${RESET}`;
}

function formatSection(section: DigestSection): string {
  const lines: string[] = [];
  lines.push(`\n${CYAN}${"=".repeat(60)}${RESET}`);
  lines.push(`${BOLD}${CYAN}  ${section.title}${RESET}`);
  lines.push(`${CYAN}${"=".repeat(60)}${RESET}`);

  if (section.summary) {
    lines.push(`\n  ${section.summary}`);
  }

  lines.push("");
  section.items.forEach((item, i) => {
    lines.push(formatItem(item, i));
  });

  return lines.join("\n");
}

export const consoleChannel: Channel = {
  name: "console",

  async post(digest: Digest): Promise<void> {
    const lines: string[] = [];

    lines.push("");
    lines.push(`${BOLD}${CYAN}${"*".repeat(60)}${RESET}`);
    lines.push(`${BOLD}${CYAN}  AI News Digest - ${digest.date}${RESET}`);
    lines.push(`${BOLD}${CYAN}${"*".repeat(60)}${RESET}`);

    if (digest.summary) {
      lines.push(`\n${BOLD}Summary:${RESET}`);
      lines.push(`  ${digest.summary}`);
    }

    lines.push(`\n  ${YELLOW}${digest.items.length} items collected${RESET}`);

    for (const section of digest.sections) {
      lines.push(formatSection(section));
    }

    lines.push(`\n${CYAN}${"*".repeat(60)}${RESET}\n`);

    console.log(lines.join("\n"));
  },
};
