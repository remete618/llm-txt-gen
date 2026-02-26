import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crawlWithFirecrawl } from '../src/firecrawl.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

const samplePage = {
  url: 'https://example.com/about',
  markdown: '# About Us\n\nWe build great software.',
  metadata: {
    title: 'About Us - Example',
    description: 'Learn about our team.',
    ogTitle: 'About Us OG',
    ogDescription: 'OG description for about page',
  },
};

describe('crawlWithFirecrawl', () => {
  it('starts a crawl, polls until complete, and returns PageData', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-123', success: true }))
      .mockResolvedValueOnce(res({ status: 'scraping', data: [] }))
      .mockResolvedValueOnce(res({ status: 'completed', data: [samplePage] }));

    const pages = await crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0);

    expect(pages).toHaveLength(1);
    expect(pages[0].url).toBe('https://example.com/about');
    expect(pages[0].title).toBe('About Us OG');
    expect(pages[0].description).toBe('OG description for about page');
    expect(pages[0].h1).toBe('About Us');
    expect(pages[0].content).toContain('We build great software');
  });

  it('throws on API error when starting crawl', async () => {
    mockFetch.mockResolvedValueOnce(res('Unauthorized', 401));
    await expect(crawlWithFirecrawl('https://example.com', 'bad-key', 50, 0))
      .rejects.toThrow('Firecrawl error 401');
  });

  it('throws when crawl job status is failed', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-456', success: true }))
      .mockResolvedValueOnce(res({ status: 'failed' }));
    await expect(crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0))
      .rejects.toThrow('Firecrawl crawl job failed');
  });

  it('throws on poll HTTP error', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-789', success: true }))
      .mockResolvedValueOnce(res('Server Error', 500));
    await expect(crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0))
      .rejects.toThrow('Firecrawl poll error 500');
  });

  it('respects the page limit', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/page${i}`,
      markdown: `# Page ${i}`,
      metadata: { title: `Page ${i}`, description: '' },
    }));
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-limit', success: true }))
      .mockResolvedValueOnce(res({ status: 'completed', data: pages }));
    const result = await crawlWithFirecrawl('https://example.com', 'fc-key', 3, 0);
    expect(result).toHaveLength(3);
  });

  it('sends correct Authorization header', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-auth', success: true }))
      .mockResolvedValueOnce(res({ status: 'completed', data: [] }));
    await crawlWithFirecrawl('https://example.com', 'fc-mykey', 50, 0);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer fc-mykey');
  });

  it('falls back to metadata.title when no ogTitle', async () => {
    const page = {
      url: 'https://example.com',
      markdown: '# Home',
      metadata: { title: 'Home Page', description: 'Welcome' },
    };
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-meta', success: true }))
      .mockResolvedValueOnce(res({ status: 'completed', data: [page] }));
    const [result] = await crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0);
    expect(result.title).toBe('Home Page');
    expect(result.description).toBe('Welcome');
  });

  it('handles pages with no metadata gracefully', async () => {
    const page = { url: 'https://example.com/minimal', markdown: 'Some text.' };
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-nometa', success: true }))
      .mockResolvedValueOnce(res({ status: 'completed', data: [page] }));
    const [result] = await crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0);
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.h1).toBe('');
  });

  it('truncates content to 3000 chars', async () => {
    const page = {
      url: 'https://example.com',
      markdown: 'x'.repeat(5000),
      metadata: { title: 'Test', description: '' },
    };
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-trunc', success: true }))
      .mockResolvedValueOnce(res({ status: 'completed', data: [page] }));
    const [result] = await crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0);
    expect(result.content.length).toBeLessThanOrEqual(3000);
  });

  it('accumulates pages across multiple scraping polls', async () => {
    const page1 = { url: 'https://example.com/p1', markdown: '# P1', metadata: { title: 'P1', description: '' } };
    const page2 = { url: 'https://example.com/p2', markdown: '# P2', metadata: { title: 'P2', description: '' } };
    mockFetch
      .mockResolvedValueOnce(res({ id: 'job-acc', success: true }))
      .mockResolvedValueOnce(res({ status: 'scraping', data: [page1] }))
      .mockResolvedValueOnce(res({ status: 'completed', data: [page2] }));
    const result = await crawlWithFirecrawl('https://example.com', 'fc-key', 50, 0);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.url)).toContain('https://example.com/p1');
    expect(result.map(p => p.url)).toContain('https://example.com/p2');
  });
});
