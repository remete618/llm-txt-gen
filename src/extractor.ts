import * as cheerio from 'cheerio';

export interface PageData {
  url: string;
  title: string;
  description: string;
  h1: string;
  content: string;
}

export function extractPageData(url: string, html: string): PageData {
  const $ = cheerio.load(html);

  $('script, style, noscript, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

  const title = $('title').text().trim();
  const description = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  ).trim();
  const h1 = $('h1').first().text().trim();

  const mainEl = $('main, article, [role="main"], .content, #content, .main, #main, .post, .article');
  const textSource = mainEl.length > 0 ? mainEl.first() : $('body');
  const content = textSource.text().replace(/\s+/g, ' ').trim().slice(0, 3000);

  return { url, title, description, h1, content };
}

export function getPageDescription(page: PageData): string {
  return page.description || page.h1 || page.title || page.url;
}

export function getPageTitle(page: PageData): string {
  return page.title || page.h1 || page.url;
}
