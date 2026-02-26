import { extractPageData } from './extractor.js';
import type { PageData } from './extractor.js';

export async function fetchPagesWithBrowser(
  urls: string[],
  concurrency: number,
  onProgress?: (success: boolean) => void,
): Promise<(PageData | null)[]> {
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    throw new Error(
      'Playwright not installed. Run:\n  npm install playwright\n  npx playwright install chromium',
    );
  }

  const browser = await pw.chromium.launch({ headless: true });
  const results: (PageData | null)[] = new Array(urls.length).fill(null);

  try {
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (url, j) => {
          const page = await browser.newPage();
          try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            const html = await page.content();
            results[i + j] = extractPageData(url, html);
            onProgress?.(true);
          } catch {
            onProgress?.(false);
          } finally {
            await page.close();
          }
        }),
      );
    }
  } finally {
    await browser.close();
  }

  return results;
}
