import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPage, mockBrowser, mockChromium } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn(),
    content: vi.fn(),
    close: vi.fn(),
  };
  const mockBrowser = {
    newPage: vi.fn(),
    close: vi.fn(),
  };
  const mockChromium = {
    launch: vi.fn(),
  };
  return { mockPage, mockBrowser, mockChromium };
});

vi.mock('playwright', () => ({ chromium: mockChromium }));

import { fetchPagesWithBrowser } from '../src/playwright.js';

const pageHtml = '<html><head><title>Test Page</title><meta name="description" content="A test."></head><body><main><h1>Hello</h1><p>Content here</p></main></body></html>';

beforeEach(() => {
  vi.clearAllMocks();
  mockChromium.launch.mockResolvedValue(mockBrowser);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  mockPage.goto.mockResolvedValue(null);
  mockPage.content.mockResolvedValue(pageHtml);
  mockPage.close.mockResolvedValue(undefined);
  mockBrowser.close.mockResolvedValue(undefined);
});

describe('fetchPagesWithBrowser', () => {
  it('returns PageData for each URL', async () => {
    const results = await fetchPagesWithBrowser(
      ['https://example.com', 'https://example.com/about'],
      2,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).not.toBeNull();
    expect(results[0]?.title).toBe('Test Page');
    expect(results[0]?.url).toBe('https://example.com');
    expect(results[1]?.url).toBe('https://example.com/about');
  });

  it('returns null for a page that fails to load', async () => {
    mockPage.goto
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Navigation timeout'));

    const results = await fetchPagesWithBrowser(
      ['https://example.com', 'https://example.com/broken'],
      2,
    );
    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull();
  });

  it('closes each page tab after processing', async () => {
    await fetchPagesWithBrowser(['https://example.com', 'https://example.com/about'], 2);
    expect(mockPage.close).toHaveBeenCalledTimes(2);
  });

  it('closes the browser even when a page throws', async () => {
    mockPage.goto.mockRejectedValue(new Error('Crash'));
    await fetchPagesWithBrowser(['https://example.com'], 1);
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('calls onProgress with true on success and false on failure', async () => {
    mockPage.goto
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('fail'));
    const onProgress = vi.fn();
    await fetchPagesWithBrowser(
      ['https://example.com', 'https://example.com/broken'],
      2,
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledWith(true);
    expect(onProgress).toHaveBeenCalledWith(false);
  });

  it('processes pages in batches respecting concurrency', async () => {
    const urls = ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'];
    await fetchPagesWithBrowser(urls, 2);
    // 3 pages total, concurrency 2 → 2 batches, 3 newPage calls
    expect(mockBrowser.newPage).toHaveBeenCalledTimes(3);
  });

  it('launches chromium headless', async () => {
    await fetchPagesWithBrowser(['https://example.com'], 1);
    expect(mockChromium.launch).toHaveBeenCalledWith({ headless: true });
  });

  it('navigates with networkidle and 30s timeout', async () => {
    await fetchPagesWithBrowser(['https://example.com'], 1);
    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://example.com',
      { waitUntil: 'networkidle', timeout: 30000 },
    );
  });
});
