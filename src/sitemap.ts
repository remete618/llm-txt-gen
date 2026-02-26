import * as cheerio from 'cheerio';

export interface SitemapEntry {
  url: string;
  priority: number;
  lastmod?: string;
}

export async function discoverSitemapUrl(baseUrl: string): Promise<string | null> {
  const normalized = baseUrl.replace(/\/$/, '');
  const candidates: string[] = [];

  // Check robots.txt first for a Sitemap: directive
  try {
    const robotsRes = await fetch(`${normalized}/robots.txt`, { signal: AbortSignal.timeout(5000) });
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const match = robotsTxt.match(/^Sitemap:\s*(.+)$/mi);
      if (match) candidates.push(match[1].trim());
    }
  } catch { /* ignore */ }

  candidates.push(
    `${normalized}/sitemap.xml`,
    `${normalized}/sitemap_index.xml`,
    `${normalized}/sitemap/sitemap.xml`,
  );

  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<urlset') || text.includes('<sitemapindex')) {
          return url;
        }
      }
    } catch { /* continue */ }
  }

  return null;
}

export async function fetchSitemap(sitemapUrl: string, limit = 50): Promise<SitemapEntry[]> {
  const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Failed to fetch sitemap ${sitemapUrl}: ${res.status}`);
  const xml = await res.text();
  return parseSitemapXml(xml, new URL(sitemapUrl).origin, limit);
}

export async function parseSitemapXml(xml: string, origin = '', limit = 50): Promise<SitemapEntry[]> {
  const $ = cheerio.load(xml, { xmlMode: true });

  // Sitemap index — recurse into child sitemaps
  const childSitemaps = $('sitemapindex sitemap loc');
  if (childSitemaps.length > 0) {
    const entries: SitemapEntry[] = [];
    for (const el of childSitemaps.toArray()) {
      if (entries.length >= limit) break;
      const childUrl = $(el).text().trim();
      try {
        const childEntries = await fetchSitemap(childUrl, limit - entries.length);
        entries.push(...childEntries);
      } catch { /* skip broken child sitemaps */ }
    }
    return entries.slice(0, limit);
  }

  // Regular urlset
  const entries: SitemapEntry[] = [];
  $('urlset url').each((_, el) => {
    if (entries.length >= limit) return false as unknown as void;
    const loc = $(el).find('loc').text().trim();
    if (!loc) return;
    const priority = parseFloat($(el).find('priority').text()) || 0.5;
    const lastmod = $(el).find('lastmod').text().trim() || undefined;
    entries.push({ url: loc, priority, lastmod });
  });

  return entries.sort((a, b) => b.priority - a.priority);
}
