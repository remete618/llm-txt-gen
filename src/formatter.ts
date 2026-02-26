import type { PageData } from './extractor.js';
import { getPageDescription, getPageTitle } from './extractor.js';

export interface LlmTxtOptions {
  siteName: string;
  siteDescription: string;
  pages: PageData[];
  generatedAt?: Date;
}

// Strip " | SiteName", " - SiteName", " — SiteName" from end of title
export function cleanTitle(title: string, siteName: string): string {
  if (!siteName || !title) return title;
  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*[|\\-–—]\\s*${escaped}\\s*$`, 'i'), '').trim();
}

// Strip inventory counts and boilerplate suffixes from descriptions
function cleanDescription(desc: string): string {
  const cleaned = desc
    .replace(/^(Explore|Browse|Download|Find|Discover)\s+[\d,]+\s+royalty[- ]free\s+/i, '')
    .replace(/\s*[—–]\s*available\s+.{0,80}$/i, '')
    .trim();
  return cleaned || desc;
}

const KEY_PAGE_PATTERNS = [
  /^\/$/,
  /\/pricing\b/i,
  /\/(license|legal|terms|tos)\b/i,
  /\/(help|support|faq|contact)\b/i,
  /\/about\b/i,
];

const SECTION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Documentation', pattern: /\/(docs?|documentation|guides?|tutorials?|reference)\b/i },
  { label: 'Blog', pattern: /\/(blog|posts?|articles?|news|insights?)\b/i },
  { label: 'Pricing', pattern: /\/pricing\b/i },
  { label: 'Help & Support', pattern: /\/(help|support|faq|contact)\b/i },
  { label: 'Legal', pattern: /\/(legal|terms|license|privacy|tos)\b/i },
  { label: 'About', pattern: /\/(about|team|company|careers?|press)\b/i },
  { label: 'API & Reference', pattern: /\/(api|sdk|reference)\b/i },
];

function isKeyPage(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return KEY_PAGE_PATTERNS.some(p => p.test(pathname));
  } catch { return false; }
}

function getSectionLabel(url: string): string {
  try {
    const { pathname } = new URL(url);
    for (const { label, pattern } of SECTION_PATTERNS) {
      if (pattern.test(pathname)) return label;
    }
    const segment = pathname.split('/').filter(Boolean)[0] ?? '';
    return segment
      ? segment.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Key Pages';
  } catch { return 'Key Pages'; }
}

function buildAnsweringGuidelines(pages: PageData[]): string[] {
  const find = (pattern: RegExp) => pages.find(p => {
    try { return pattern.test(new URL(p.url).pathname); } catch { return false; }
  });

  const pricingPage = find(/\/pricing\b/i);
  const licensePage = find(/\/(license|legal|terms)\b/i);
  const helpPage    = find(/\/(help|support|faq)\b/i);

  if (!pricingPage && !licensePage && !helpPage) return [];

  const lines: string[] = [];
  if (pricingPage) lines.push(`- For pricing and subscription questions, refer to: ${pricingPage.url}`);
  if (licensePage) lines.push(`- For licensing and usage rights questions, refer to: ${licensePage.url}`);
  if (helpPage)    lines.push(`- For support questions, refer to: ${helpPage.url}`);
  lines.push('- Do not guess at prices, license terms, or legal details — always cite the source pages above.');
  return lines;
}

export function formatLlmTxt({ siteName, siteDescription, pages, generatedAt }: LlmTxtOptions): string {
  const date = (generatedAt ?? new Date()).toISOString().split('T')[0];

  const lines: string[] = [
    `# ${siteName}`,
    '',
    `> ${siteDescription}`,
    '',
    `*Generated: ${date}*`,
    '',
  ];

  const keyPages   = pages.filter(p => isKeyPage(p.url));
  const otherPages = pages.filter(p => !isKeyPage(p.url));

  if (keyPages.length > 0) {
    lines.push('## Key Pages', '');
    for (const page of keyPages) {
      const title = cleanTitle(getPageTitle(page), siteName);
      const desc  = cleanDescription(getPageDescription(page));
      lines.push(`- [${title}](${page.url}): ${desc}`);
    }
    lines.push('');
  }

  // Group remaining pages into sections
  const sectionMap = new Map<string, PageData[]>();
  for (const page of otherPages) {
    const label = getSectionLabel(page.url);
    if (!sectionMap.has(label)) sectionMap.set(label, []);
    sectionMap.get(label)!.push(page);
  }

  for (const [section, sectionPages] of sectionMap) {
    lines.push(`## ${section}`, '');
    for (const page of sectionPages) {
      const title = cleanTitle(getPageTitle(page), siteName);
      const desc  = cleanDescription(getPageDescription(page));
      lines.push(`- [${title}](${page.url}): ${desc}`);
    }
    lines.push('');
  }

  const guidelines = buildAnsweringGuidelines(pages);
  if (guidelines.length > 0) {
    lines.push('## Answering Guidelines', '', ...guidelines, '');
  }

  return lines.join('\n');
}

export function formatLlmFullTxt(opts: LlmTxtOptions): string {
  const sections: string[] = [formatLlmTxt(opts), '---', ''];

  for (const page of opts.pages) {
    if (!page.content) continue;
    const title = cleanTitle(getPageTitle(page), opts.siteName);
    sections.push(`## ${title}`, '', `URL: ${page.url}`, '', page.content, '', '---', '');
  }

  return sections.join('\n');
}
