import * as cheerio from 'cheerio';
import type { SitemapEntry } from './sitemap.js';

const SKIP_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|ico|xml|json|zip|tar|gz|woff|woff2|ttf)(\?|$)/i;

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'llm-txt-gen/0.1 (+https://github.com/remete618/llm-txt-gen)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function crawlSite(baseUrl: string, limit = 50): Promise<SitemapEntry[]> {
  const origin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const queue: string[] = [baseUrl.replace(/\/$/, '') || origin];
  const entries: SitemapEntry[] = [];

  while (queue.length > 0 && entries.length < limit) {
    const url = queue.shift()!;
    const normalized = url.split('#')[0];
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      const html = await fetchPage(normalized);
      const isHome = new URL(normalized).pathname === '/' || normalized === origin;
      entries.push({ url: normalized, priority: isHome ? 1.0 : 0.5 });

      const $ = cheerio.load(html);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        try {
          const abs = new URL(href, normalized);
          const clean = abs.href.split('#')[0];
          if (
            abs.origin === origin &&
            !visited.has(clean) &&
            !queue.includes(clean) &&
            !SKIP_EXTENSIONS.test(abs.pathname)
          ) {
            queue.push(clean);
          }
        } catch { /* invalid URL */ }
      });
    } catch { /* skip failed pages */ }
  }

  return entries;
}
