import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPage, crawlSite } from '../src/crawler.js';

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

describe('fetchPage', () => {
  it('returns HTML on success', async () => {
    mockFetch.mockResolvedValueOnce(res('<html><body>Hello</body></html>'));
    const html = await fetchPage('https://example.com');
    expect(html).toContain('Hello');
  });

  it('throws on HTTP 404', async () => {
    mockFetch.mockResolvedValueOnce(res('Not Found', 404));
    await expect(fetchPage('https://example.com')).rejects.toThrow('HTTP 404');
  });

  it('throws on HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce(res('Server Error', 500));
    await expect(fetchPage('https://example.com')).rejects.toThrow('HTTP 500');
  });

  it('sends User-Agent header containing llm-txt-gen', async () => {
    mockFetch.mockResolvedValueOnce(res('<html></html>'));
    await fetchPage('https://example.com');
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['User-Agent']).toContain('llm-txt-gen');
  });
});

describe('crawlSite', () => {
  const homeHtml = `<html><body>
    <a href="/about">About</a>
    <a href="/docs">Docs</a>
    <a href="https://external.com/page">External</a>
  </body></html>`;

  it('returns home page with priority 1.0', async () => {
    mockFetch.mockResolvedValue(res('<html><body></body></html>'));
    const entries = await crawlSite('https://example.com', 1);
    expect(entries[0].url).toBe('https://example.com');
    expect(entries[0].priority).toBe(1.0);
  });

  it('discovers and follows internal links', async () => {
    mockFetch
      .mockResolvedValueOnce(res(homeHtml))
      .mockResolvedValueOnce(res('<html><body>About</body></html>'))
      .mockResolvedValueOnce(res('<html><body>Docs</body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    const urls = entries.map(e => e.url);
    expect(urls).toContain('https://example.com');
    expect(urls).toContain('https://example.com/about');
    expect(urls).toContain('https://example.com/docs');
  });

  it('assigns priority 0.5 to non-home pages', async () => {
    mockFetch
      .mockResolvedValueOnce(res(homeHtml))
      .mockResolvedValue(res('<html><body></body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    const about = entries.find(e => e.url === 'https://example.com/about');
    expect(about?.priority).toBe(0.5);
  });

  it('skips external links', async () => {
    mockFetch
      .mockResolvedValueOnce(res(homeHtml))
      .mockResolvedValue(res('<html><body></body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    expect(entries.map(e => e.url)).not.toContain('https://external.com/page');
  });

  it('skips binary file extensions', async () => {
    const html = `<html><body>
      <a href="/file.pdf">PDF</a>
      <a href="/image.jpg">Image</a>
      <a href="/font.woff2">Font</a>
      <a href="/about">About</a>
    </body></html>`;
    mockFetch
      .mockResolvedValueOnce(res(html))
      .mockResolvedValue(res('<html><body></body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    const urls = entries.map(e => e.url);
    expect(urls).not.toContain('https://example.com/file.pdf');
    expect(urls).not.toContain('https://example.com/image.jpg');
    expect(urls).not.toContain('https://example.com/font.woff2');
  });

  it('respects the page limit', async () => {
    mockFetch.mockResolvedValue(res(homeHtml));
    const entries = await crawlSite('https://example.com', 2);
    expect(entries.length).toBeLessThanOrEqual(2);
  });

  it('deduplicates URLs', async () => {
    const htmlWithDupes = `<html><body>
      <a href="/about">About 1</a>
      <a href="/about">About 2</a>
      <a href="/about">About 3</a>
    </body></html>`;
    mockFetch
      .mockResolvedValueOnce(res(htmlWithDupes))
      .mockResolvedValueOnce(res('<html><body></body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    const aboutCount = entries.filter(e => e.url === 'https://example.com/about').length;
    expect(aboutCount).toBe(1);
  });

  it('handles fetch errors gracefully and continues crawling', async () => {
    mockFetch
      .mockResolvedValueOnce(res(homeHtml))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(res('<html><body>Docs</body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].url).toBe('https://example.com');
  });

  it('strips fragments from URLs before queuing', async () => {
    const html = `<html><body>
      <a href="/about#team">About Team</a>
    </body></html>`;
    mockFetch
      .mockResolvedValueOnce(res(html))
      .mockResolvedValueOnce(res('<html><body></body></html>'));
    const entries = await crawlSite('https://example.com', 10);
    const urls = entries.map(e => e.url);
    expect(urls).not.toContain('https://example.com/about#team');
    expect(urls).toContain('https://example.com/about');
  });

  it('does not re-crawl already visited URLs', async () => {
    mockFetch
      .mockResolvedValueOnce(res(homeHtml))
      .mockResolvedValue(res('<html><body></body></html>'));
    await crawlSite('https://example.com', 10);
    // home + about + docs = 3 fetches max
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
