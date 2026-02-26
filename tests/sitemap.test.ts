import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSitemapXml, fetchSitemap, discoverSitemapUrl } from '../src/sitemap.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function res(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) };
}

const urlsetXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <priority>1.0</priority>
    <lastmod>2024-01-15</lastmod>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/docs</loc>
    <priority>0.9</priority>
    <lastmod>2024-02-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/blog/post-1</loc>
    <priority>0.5</priority>
  </url>
</urlset>`;

describe('parseSitemapXml', () => {
  it('parses all URLs from urlset', async () => {
    const entries = await parseSitemapXml(urlsetXml);
    expect(entries).toHaveLength(4);
  });

  it('extracts loc values', async () => {
    const entries = await parseSitemapXml(urlsetXml);
    const urls = entries.map(e => e.url);
    expect(urls).toContain('https://example.com/');
    expect(urls).toContain('https://example.com/about');
    expect(urls).toContain('https://example.com/docs');
  });

  it('extracts priority values', async () => {
    const entries = await parseSitemapXml(urlsetXml);
    const home = entries.find(e => e.url === 'https://example.com/');
    expect(home?.priority).toBe(1.0);
  });

  it('extracts lastmod when present', async () => {
    const entries = await parseSitemapXml(urlsetXml);
    const home = entries.find(e => e.url === 'https://example.com/');
    expect(home?.lastmod).toBe('2024-01-15');
  });

  it('sorts by priority descending', async () => {
    const entries = await parseSitemapXml(urlsetXml);
    expect(entries[0].priority).toBeGreaterThanOrEqual(entries[1].priority);
    expect(entries[1].priority).toBeGreaterThanOrEqual(entries[2].priority);
  });

  it('respects limit', async () => {
    const entries = await parseSitemapXml(urlsetXml, '', 2);
    expect(entries).toHaveLength(2);
  });

  it('defaults priority to 0.5 when not specified', async () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page</loc></url>
    </urlset>`;
    const entries = await parseSitemapXml(xml);
    expect(entries[0].priority).toBe(0.5);
  });

  it('returns empty array for empty urlset', async () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
    const entries = await parseSitemapXml(xml);
    expect(entries).toHaveLength(0);
  });

  it('skips url entries with no <loc>', async () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><priority>1.0</priority></url>
      <url><loc>https://example.com/valid</loc></url>
    </urlset>`;
    const entries = await parseSitemapXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://example.com/valid');
  });

  it('parses sitemapindex and fetches child sitemaps', async () => {
    const childXml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page-1</loc><priority>0.8</priority></url>
      <url><loc>https://example.com/page-2</loc><priority>0.7</priority></url>
    </urlset>`;
    mockFetch.mockResolvedValue(res(childXml));

    const indexXml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
    </sitemapindex>`;

    const entries = await parseSitemapXml(indexXml, 'https://example.com');
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.url)).toContain('https://example.com/page-1');
  });

  it('skips broken child sitemaps in sitemapindex gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const indexXml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/broken-sitemap.xml</loc></sitemap>
    </sitemapindex>`;
    const entries = await parseSitemapXml(indexXml, 'https://example.com');
    expect(entries).toHaveLength(0);
  });
});

describe('fetchSitemap', () => {
  it('fetches and parses a sitemap', async () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/</loc><priority>1.0</priority></url>
    </urlset>`;
    mockFetch.mockResolvedValueOnce(res(xml));
    const entries = await fetchSitemap('https://example.com/sitemap.xml');
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://example.com/');
  });

  it('throws when sitemap URL returns HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(res('Not Found', 404));
    await expect(fetchSitemap('https://example.com/sitemap.xml')).rejects.toThrow('404');
  });
});

describe('discoverSitemapUrl', () => {
  it('finds sitemap URL declared in robots.txt', async () => {
    mockFetch
      .mockResolvedValueOnce(res('User-agent: *\nSitemap: https://example.com/custom-sitemap.xml'))
      .mockResolvedValueOnce(res('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'));
    const url = await discoverSitemapUrl('https://example.com');
    expect(url).toBe('https://example.com/custom-sitemap.xml');
  });

  it('falls back to /sitemap.xml when robots.txt has no Sitemap directive', async () => {
    mockFetch
      .mockResolvedValueOnce(res('User-agent: *\nDisallow: /admin'))
      .mockResolvedValueOnce(res('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'));
    const url = await discoverSitemapUrl('https://example.com');
    expect(url).toBe('https://example.com/sitemap.xml');
  });

  it('returns null when no sitemap is found anywhere', async () => {
    mockFetch.mockResolvedValue(res('Not Found', 404));
    const url = await discoverSitemapUrl('https://example.com');
    expect(url).toBeNull();
  });

  it('returns null when robots.txt fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const url = await discoverSitemapUrl('https://example.com');
    expect(url).toBeNull();
  });

  it('handles trailing slash in base URL', async () => {
    mockFetch
      .mockResolvedValueOnce(res('User-agent: *'))
      .mockResolvedValueOnce(res('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'));
    const url = await discoverSitemapUrl('https://example.com/');
    expect(url).toBe('https://example.com/sitemap.xml');
  });
});
