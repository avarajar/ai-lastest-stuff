import BetterSqlite3 from "better-sqlite3";
import { NewsItem, SourceType } from "./types.js";

interface NewsItemRow {
  id: string;
  title: string;
  url: string;
  source: string;
  description: string | null;
  score: number | null;
  author: string | null;
  published_at: string;
  collected_at: string;
  tags: string;
  metadata: string | null;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        description TEXT,
        score INTEGER,
        author TEXT,
        published_at TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  upsertItems(items: NewsItem[]): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO news_items (id, title, url, source, description, score, author, published_at, collected_at, tags, metadata)
      VALUES (@id, @title, @url, @source, @description, @score, @author, @published_at, @collected_at, @tags, @metadata)
    `);

    const transaction = this.db.transaction((items: NewsItem[]) => {
      let count = 0;
      for (const item of items) {
        const result = insert.run({
          id: item.id,
          title: item.title,
          url: item.url,
          source: item.source,
          description: item.description ?? null,
          score: item.score ?? null,
          author: item.author ?? null,
          published_at: item.publishedAt.toISOString(),
          collected_at: item.collectedAt.toISOString(),
          tags: JSON.stringify(item.tags),
          metadata: item.metadata ? JSON.stringify(item.metadata) : null,
        });
        if (result.changes > 0) {
          count++;
        }
      }
      return count;
    });

    return transaction(items);
  }

  getItemsSince(since: Date): NewsItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM news_items
      WHERE collected_at >= @since
      ORDER BY score DESC
    `);

    const rows = stmt.all({ since: since.toISOString() }) as NewsItemRow[];
    return rows.map(this.rowToNewsItem);
  }

  saveDigest(date: string, content: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO digests (date, content, created_at)
      VALUES (@date, @content, datetime('now'))
    `);
    stmt.run({ date, content });
  }

  getDigest(date: string): string | null {
    const stmt = this.db.prepare(`
      SELECT content FROM digests WHERE date = @date
    `);
    const row = stmt.get({ date }) as { content: string } | undefined;
    return row?.content ?? null;
  }

  close(): void {
    this.db.close();
  }

  private rowToNewsItem(row: NewsItemRow): NewsItem {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      source: row.source as SourceType,
      description: row.description ?? undefined,
      score: row.score ?? undefined,
      author: row.author ?? undefined,
      publishedAt: new Date(row.published_at),
      collectedAt: new Date(row.collected_at),
      tags: JSON.parse(row.tags) as string[],
      metadata: row.metadata
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : undefined,
    };
  }
}
