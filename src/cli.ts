#!/usr/bin/env node
import { Command } from 'commander';
import { writeFile } from 'fs/promises';
import { discoverSitemapUrl, fetchSitemap } from './sitemap.js';
import { crawlSite, fetchPage } from './crawler.js';
import { extractPageData } from './extractor.js';
import { formatLlmTxt, formatLlmFullTxt } from './formatter.js';
import { generateDescriptions, getProviderEnvVar } from './ai.js';
import type { AiProvider } from './ai.js';
import { crawlWithFirecrawl } from './firecrawl.js';
import { fetchPagesWithBrowser } from './playwright.js';
import { loadConfig } from './config.js';
import type { LlmConfig } from './config.js';
import type { PageData } from './extractor.js';

const AI_PROVIDERS: AiProvider[] = ['claude', 'openai', 'gemini', 'perplexity', 'grok', 'deepseek'];

const program = new Command();

program
  .name('llm-txt-gen')
  .description('Auto-generate /llm.txt and /llm-full.txt for any website')
  .version('0.1.0')
  .argument('<url>', 'Website URL to generate llm.txt for')
  .option('--sitemap <url>', 'Use a specific sitemap URL instead of auto-discovery')
  .option('--output <path>', 'Write llm.txt to this path (default: stdout)')
  .option('--full-output <path>', 'Also write llm-full.txt to this path')
  .option('--limit <n>', 'Max number of pages to process', '50')
  .option('--concurrency <n>', 'Number of pages to fetch in parallel', '5')
  .option('--firecrawl', 'Use Firecrawl to render JS-heavy pages (requires FIRECRAWL_API_KEY)')
  .option('--browser', 'Use local Playwright browser to render JS-heavy pages (requires playwright)')
  .option(`--ai <provider>`, `Use AI to generate descriptions. Provider: ${AI_PROVIDERS.join(', ')}`)
  .option('--config <path>', 'Path to llm.config.json', 'llm.config.json')
  .action(async (url: string, opts: {
    sitemap?: string;
    output?: string;
    fullOutput?: string;
    limit: string;
    concurrency: string;
    firecrawl?: boolean;
    browser?: boolean;
    ai?: string;
    config: string;
  }) => {
    try {
      await run(url, opts);
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

program.parse();

async function run(
  url: string,
  opts: {
    sitemap?: string;
    output?: string;
    fullOutput?: string;
    limit: string;
    concurrency: string;
    firecrawl?: boolean;
    browser?: boolean;
    ai?: string;
    config: string;
  },
) {
  const limit = parseInt(opts.limit, 10);
  const concurrency = parseInt(opts.concurrency, 10);
  const config: LlmConfig = await loadConfig(opts.config);

  const baseUrl = url.startsWith('http') ? url : `https://${url}`;
  const origin = new URL(baseUrl).origin;

  if (opts.firecrawl && opts.browser) {
    console.error('Error: --firecrawl and --browser cannot be used together');
    process.exit(1);
  }

  console.error(`Generating llm.txt for ${baseUrl}...`);

  const excluded = new Set(config.exclude ?? []);
  let validPages: PageData[];

  if (opts.firecrawl) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.error('Error: --firecrawl requires FIRECRAWL_API_KEY env var');
      process.exit(1);
    }
    console.error('Using Firecrawl (JS rendering enabled)...');
    const rawPages = await crawlWithFirecrawl(baseUrl, apiKey, limit);
    validPages = rawPages
      .filter(p => !excluded.has(p.url))
      .map(p => {
        const override = config.overrides?.[p.url];
        return override ? { ...p, ...override } : p;
      });
    console.error(`Fetched ${validPages.length} pages via Firecrawl.`);

  } else if (opts.browser) {
    const urls = await discoverUrls(baseUrl, opts.sitemap, limit, excluded);
    console.error(`Rendering ${urls.length} pages with Playwright...`);
    const pages = await fetchPagesWithBrowser(urls, concurrency, (ok) => {
      process.stderr.write(ok ? '.' : 'x');
    });
    process.stderr.write('\n');
    validPages = pages
      .filter((p): p is PageData => p !== null)
      .map(p => {
        const override = config.overrides?.[p.url];
        return override ? { ...p, ...override } : p;
      });

  } else {
    const urls = await discoverUrls(baseUrl, opts.sitemap, limit, excluded);
    console.error(`Processing ${urls.length} pages...`);
    const pages = await processInBatches(
      urls,
      concurrency,
      async (pageUrl): Promise<PageData | null> => {
        try {
          const html = await fetchPage(pageUrl);
          const data = extractPageData(pageUrl, html);
          const override = config.overrides?.[pageUrl];
          if (override) Object.assign(data, override);
          process.stderr.write('.');
          return data;
        } catch {
          process.stderr.write('x');
          return null;
        }
      },
    );
    process.stderr.write('\n');
    validPages = pages.filter((p): p is PageData => p !== null);
  }

  // Optionally enhance descriptions with AI
  let finalPages = validPages;
  if (opts.ai) {
    const provider = opts.ai as AiProvider;
    if (!AI_PROVIDERS.includes(provider)) {
      console.error(`Error: unknown AI provider "${provider}". Choose from: ${AI_PROVIDERS.join(', ')}`);
      process.exit(1);
    }
    const envVar = getProviderEnvVar(provider);
    const apiKey = process.env[envVar];
    if (!apiKey) {
      console.error(`Warning: --ai ${provider} requires ${envVar} env var. Skipping AI step.`);
    } else {
      console.error(`Generating descriptions with ${provider} for ${validPages.length} pages...`);
      finalPages = await generateDescriptions(validPages, provider, apiKey);
    }
  }

  // Determine site name and description
  const homePage =
    finalPages.find(p => {
      try { return new URL(p.url).pathname === '/'; } catch { return false; }
    }) ?? finalPages[0];

  const siteName = config.siteName ?? homePage?.title ?? new URL(baseUrl).hostname;
  const siteDescription =
    config.siteDescription ?? homePage?.description ?? `Website at ${origin}`;

  // Format and output
  const llmTxt = formatLlmTxt({ siteName, siteDescription, pages: finalPages });

  if (opts.output) {
    await writeFile(opts.output, llmTxt, 'utf-8');
    console.error(`Written to ${opts.output}`);
  } else {
    process.stdout.write(llmTxt);
  }

  if (opts.fullOutput) {
    const llmFullTxt = formatLlmFullTxt({ siteName, siteDescription, pages: finalPages });
    await writeFile(opts.fullOutput, llmFullTxt, 'utf-8');
    console.error(`Full content written to ${opts.fullOutput}`);
  }
}

async function discoverUrls(
  baseUrl: string,
  sitemapOpt: string | undefined,
  limit: number,
  excluded: Set<string>,
): Promise<string[]> {
  let sitemapEntries;
  if (sitemapOpt) {
    console.error(`Using sitemap: ${sitemapOpt}`);
    sitemapEntries = await fetchSitemap(sitemapOpt, limit);
  } else {
    console.error('Discovering sitemap...');
    const sitemapUrl = await discoverSitemapUrl(baseUrl);
    if (sitemapUrl) {
      console.error(`Found sitemap: ${sitemapUrl}`);
      sitemapEntries = await fetchSitemap(sitemapUrl, limit);
    } else {
      console.error('No sitemap found, crawling site...');
      sitemapEntries = await crawlSite(baseUrl, limit);
    }
  }
  return sitemapEntries.filter(e => !excluded.has(e.url)).slice(0, limit).map(e => e.url);
}

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}
