import { describe, it, expect } from 'vitest';
import { formatLlmTxt, formatLlmFullTxt } from '../src/formatter.js';
import type { PageData } from '../src/extractor.js';

const pages: PageData[] = [
  {
    url: 'https://example.com/',
    title: 'Example Home',
    description: 'The best example website',
    h1: 'Welcome to Example',
    content: 'This is the home page content.',
  },
  {
    url: 'https://example.com/about',
    title: 'About Us',
    description: 'Learn about our team',
    h1: 'About',
    content: 'We are a team of developers.',
  },
];

describe('formatLlmTxt', () => {
  it('starts with site name as h1', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toMatch(/^# Example\n/);
  });

  it('includes site description as blockquote', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A great site', pages });
    expect(output).toContain('> A great site');
  });

  it('includes Key Pages section', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('## Key Pages');
  });

  it('lists each page as a markdown link with description', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('[Example Home](https://example.com/)');
    expect(output).toContain('The best example website');
    expect(output).toContain('[About Us](https://example.com/about)');
    expect(output).toContain('Learn about our team');
  });

  it('handles empty pages list', () => {
    const output = formatLlmTxt({ siteName: 'MySite', siteDescription: 'Desc', pages: [] });
    expect(output).toMatch(/^# MySite/);
    expect(output).toContain('> Desc');
    expect(output).toContain('## Key Pages');
  });

  it('uses h1 as description when meta description is empty', () => {
    const pageWithNoDesc: PageData[] = [
      { url: 'https://x.com/', title: 'Home', description: '', h1: 'Welcome Home', content: '' },
    ];
    const output = formatLlmTxt({ siteName: 'X', siteDescription: 'Site', pages: pageWithNoDesc });
    expect(output).toContain('Welcome Home');
  });

  it('output ends with a newline', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output.endsWith('\n')).toBe(true);
  });

  it('each page entry follows the exact format: - [title](url): description', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('- [Example Home](https://example.com/): The best example website');
  });

  it('does not add a colon at end of description', () => {
    const output = formatLlmTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).not.toMatch(/:\s*\n- /);
  });
});

describe('formatLlmFullTxt', () => {
  it('includes the base llm.txt content', () => {
    const output = formatLlmFullTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('# Example');
    expect(output).toContain('## Key Pages');
  });

  it('includes full page content sections', () => {
    const output = formatLlmFullTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('This is the home page content.');
    expect(output).toContain('We are a team of developers.');
  });

  it('separates sections with ---', () => {
    const output = formatLlmFullTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('---');
  });

  it('includes URL reference for each page section', () => {
    const output = formatLlmFullTxt({ siteName: 'Example', siteDescription: 'A site', pages });
    expect(output).toContain('URL: https://example.com/');
    expect(output).toContain('URL: https://example.com/about');
  });

  it('skips pages with no content in full section', () => {
    const mixed: PageData[] = [
      { url: 'https://x.com/', title: 'Home', description: 'Desc', h1: 'H', content: '' },
      { url: 'https://x.com/docs', title: 'Docs', description: 'D', h1: 'D', content: 'Docs content here.' },
    ];
    const output = formatLlmFullTxt({ siteName: 'X', siteDescription: 'S', pages: mixed });
    expect(output).toContain('Docs content here.');
    expect(output).not.toMatch(/URL: https:\/\/x\.com\/\n\n\n/);
  });
});
