import type { PageData } from './extractor.js';

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';
const MAX_POLL_ATTEMPTS = 150; // 5 minutes at 2s intervals

interface FirecrawlPage {
  url: string;
  markdown?: string;
  metadata?: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  };
}

interface FirecrawlStatusResponse {
  status: 'scraping' | 'completed' | 'failed';
  data?: FirecrawlPage[];
}

export async function crawlWithFirecrawl(
  url: string,
  apiKey: string,
  limit = 50,
  pollIntervalMs = 2000,
): Promise<PageData[]> {
  const startRes = await fetch(`${FIRECRAWL_API}/crawl`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, limit, scrapeOptions: { formats: ['markdown'] } }),
    signal: AbortSignal.timeout(30000),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Firecrawl error ${startRes.status}: ${err}`);
  }

  const { id } = await startRes.json() as { id: string };
  const pages = await pollCrawl(id, apiKey, pollIntervalMs);
  return pages.slice(0, limit).map(mapToPageData);
}

async function pollCrawl(
  id: string,
  apiKey: string,
  pollIntervalMs: number,
): Promise<FirecrawlPage[]> {
  const allPages: FirecrawlPage[] = [];

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (pollIntervalMs > 0) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    const res = await fetch(`${FIRECRAWL_API}/crawl/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Firecrawl poll error ${res.status}`);

    const status = await res.json() as FirecrawlStatusResponse;

    if (status.status === 'failed') throw new Error('Firecrawl crawl job failed');
    if (status.data) allPages.push(...status.data);
    if (status.status === 'completed') return allPages;
  }

  throw new Error('Firecrawl crawl timed out after 5 minutes');
}

function mapToPageData(page: FirecrawlPage): PageData {
  const meta = page.metadata ?? {};
  const title = meta.ogTitle || meta.title || '';
  const description = meta.ogDescription || meta.description || '';
  const markdown = page.markdown ?? '';
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  const h1 = h1Match?.[1]?.trim() ?? '';
  const content = markdown.slice(0, 3000);
  return { url: page.url, title, description, h1, content };
}
