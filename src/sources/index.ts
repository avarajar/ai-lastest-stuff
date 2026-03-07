import type { SourceCollector, SourceType } from "../types.js";
import { githubCollector } from "./github.js";
import { githubReleasesCollector } from "./github-releases.js";
import { hackernewsCollector } from "./hackernews.js";
import { redditCollector } from "./reddit.js";
import { rssCollector } from "./rss.js";
import { arxivCollector } from "./arxiv.js";

const collectorMap: Record<SourceType, SourceCollector> = {
  github: githubCollector,
  "github-releases": githubReleasesCollector,
  hackernews: hackernewsCollector,
  reddit: redditCollector,
  rss: rssCollector,
  arxiv: arxivCollector,
};

export function createCollectors(sources: SourceType[]): SourceCollector[] {
  return sources
    .filter((source) => source in collectorMap)
    .map((source) => collectorMap[source]);
}
