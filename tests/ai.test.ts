import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDescriptions, getProviderEnvVar } from '../src/ai.js';
import type { AiProvider } from '../src/ai.js';
import type { PageData } from '../src/extractor.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const page: PageData = {
  url: 'https://example.com/about',
  title: 'About Us',
  description: 'Original description.',
  h1: 'About',
  content: 'We build great software.',
};

const openAIResp = {
  choices: [{ message: { content: 'AI generated description.' } }],
};

const geminiResp = {
  candidates: [{ content: { parts: [{ text: 'Gemini description.' }] } }],
};

describe('getProviderEnvVar', () => {
  it.each([
    ['claude', 'ANTHROPIC_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['gemini', 'GEMINI_API_KEY'],
    ['perplexity', 'PERPLEXITY_API_KEY'],
    ['grok', 'XAI_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
  ] as [AiProvider, string][])('%s → %s', (provider, envVar) => {
    expect(getProviderEnvVar(provider)).toBe(envVar);
  });
});

describe('generateDescriptions — OpenAI-compatible providers', () => {
  it.each(['openai', 'perplexity', 'grok', 'deepseek'] as AiProvider[])(
    'calls %s API and updates description',
    async (provider) => {
      mockFetch.mockResolvedValueOnce(jsonRes(openAIResp));
      const results = await generateDescriptions([page], provider, 'test-key');
      expect(results[0].description).toBe('AI generated description.');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/chat/completions');
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
    },
  );

  it('falls back to original description on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const results = await generateDescriptions([page], 'openai', 'test-key');
    expect(results[0].description).toBe(page.description);
  });

  it('falls back to original description on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes('Unauthorized', 401));
    const results = await generateDescriptions([page], 'openai', 'test-key');
    expect(results[0].description).toBe(page.description);
  });
});

describe('generateDescriptions — Gemini', () => {
  it('calls Gemini generateContent API and updates description', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(geminiResp));
    const results = await generateDescriptions([page], 'gemini', 'gm-key');
    expect(results[0].description).toBe('Gemini description.');
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gm-key');
  });

  it('falls back to original description on Gemini error', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes('Bad Request', 400));
    const results = await generateDescriptions([page], 'gemini', 'gm-key');
    expect(results[0].description).toBe(page.description);
  });
});

describe('generateDescriptions — multiple pages', () => {
  it('processes all pages and returns same count', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes(openAIResp))
      .mockResolvedValueOnce(jsonRes(openAIResp));
    const pages = [page, { ...page, url: 'https://example.com/docs' }];
    const results = await generateDescriptions(pages, 'openai', 'key');
    expect(results).toHaveLength(2);
  });
});
