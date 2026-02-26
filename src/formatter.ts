import type { PageData } from './extractor.js';
import { getPageDescription, getPageTitle } from './extractor.js';

export interface LlmTxtOptions {
  siteName: string;
  siteDescription: string;
  pages: PageData[];
}

export function formatLlmTxt({ siteName, siteDescription, pages }: LlmTxtOptions): string {
  const lines: string[] = [
    `# ${siteName}`,
    '',
    `> ${siteDescription}`,
    '',
    '## Key Pages',
    '',
  ];

  for (const page of pages) {
    const title = getPageTitle(page);
    const desc = getPageDescription(page);
    lines.push(`- [${title}](${page.url}): ${desc}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function formatLlmFullTxt(opts: LlmTxtOptions): string {
  const sections: string[] = [formatLlmTxt(opts), '---', ''];

  for (const page of opts.pages) {
    if (!page.content) continue;
    sections.push(`## ${getPageTitle(page)}`);
    sections.push('');
    sections.push(`URL: ${page.url}`);
    sections.push('');
    sections.push(page.content);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  return sections.join('\n');
}
