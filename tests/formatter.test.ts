import { describe, it, expect } from 'vitest';
import { formatLlmTxt, formatLlmFullTxt, cleanTitle } from '../src/formatter.js';
import type { PageData } from '../src/extractor.js';

const FIXED_DATE = new Date('2026-01-15');

const pages: PageData[] = [
  {
    url: 'https://example.com/',
    title: 'Example Home | Example',
    description: 'The best example website',
    h1: 'Welcome',
    content: 'Home page content.',
  },
  {
    url: 'https://example.com/pricing',
    title: 'Pricing Plans | Example',
    description: 'Affordable plans for every team',
    h1: 'Pricing',
    content: 'Plan content.',
  },
  {
    url: 'https://example.com/blog/hello',
    title: 'Hello World | Example',
    description: 'Our first blog post',
    h1: 'Hello World',
    content: 'Blog content here.',
  },
  {
    url: 'https://example.com/docs/start',
    title: 'Getting Started | Example',
    description: 'How to get started quickly',
    h1: 'Getting Started',
    content: 'Docs content.',
  },
  {
    url: 'https://example.com/legal/terms',
    title: 'Terms of Service | Example',
    description: 'Our terms and conditions',
    h1: 'Terms',
    content: 'Legal content.',
  },
];

const opts = { siteName: 'Example', siteDescription: 'A great site', pages, generatedAt: FIXED_DATE };

describe('cleanTitle', () => {
  it('strips " | SiteName" suffix', () => {
    expect(cleanTitle('About Us | Example', 'Example')).toBe('About Us');
  });

  it('strips " - SiteName" suffix', () => {
    expect(cleanTitle('About Us - Example', 'Example')).toBe('About Us');
  });

  it('strips " — SiteName" suffix (em dash)', () => {
    expect(cleanTitle('Pricing — Example', 'Example')).toBe('Pricing');
  });

  it('is case-insensitive for site name', () => {
    expect(cleanTitle('Docs | EXAMPLE', 'Example')).toBe('Docs');
  });

  it('leaves title unchanged when no site name suffix', () => {
    expect(cleanTitle('Getting Started', 'Example')).toBe('Getting Started');
  });

  it('returns original title if siteName is empty', () => {
    expect(cleanTitle('My Page | Something', '')).toBe('My Page | Something');
  });
});

describe('formatLlmTxt — structure', () => {
  it('starts with site name as h1', () => {
    const out = formatLlmTxt(opts);
    expect(out).toMatch(/^# Example\n/);
  });

  it('includes site description as blockquote', () => {
    expect(formatLlmTxt(opts)).toContain('> A great site');
  });

  it('includes generated date', () => {
    expect(formatLlmTxt(opts)).toContain('Generated: 2026-01-15');
  });

  it('output ends with a newline', () => {
    expect(formatLlmTxt(opts).endsWith('\n')).toBe(true);
  });
});

describe('formatLlmTxt — title cleanup', () => {
  it('strips " | SiteName" from page titles', () => {
    const out = formatLlmTxt(opts);
    expect(out).toContain('[Example Home]');
    expect(out).not.toContain('[Example Home | Example]');
  });

  it('strips " | SiteName" from all section titles', () => {
    const out = formatLlmTxt(opts);
    expect(out).not.toMatch(/\| Example\]/);
  });
});

describe('formatLlmTxt — section grouping', () => {
  it('puts homepage in Key Pages', () => {
    const out = formatLlmTxt(opts);
    const keySection = out.split('##').find(s => s.startsWith(' Key Pages'));
    expect(keySection).toContain('example.com/');
  });

  it('puts pricing page in Key Pages', () => {
    const out = formatLlmTxt(opts);
    const keySection = out.split('##').find(s => s.startsWith(' Key Pages'));
    expect(keySection).toContain('example.com/pricing');
  });

  it('puts blog post in Blog section', () => {
    const out = formatLlmTxt(opts);
    expect(out).toContain('## Blog');
    const blogSection = out.split('##').find(s => s.startsWith(' Blog'));
    expect(blogSection).toContain('example.com/blog/hello');
  });

  it('puts docs page in Documentation section', () => {
    const out = formatLlmTxt(opts);
    expect(out).toContain('## Documentation');
    const docsSection = out.split('##').find(s => s.startsWith(' Documentation'));
    expect(docsSection).toContain('example.com/docs/start');
  });

  it('puts legal/terms page in Key Pages (not a separate section)', () => {
    const out = formatLlmTxt(opts);
    const keySection = out.split('##').find(s => s.startsWith(' Key Pages'));
    expect(keySection).toContain('example.com/legal/terms');
  });
});

describe('formatLlmTxt — description cleanup', () => {
  it('strips inventory count patterns from descriptions', () => {
    const stockPages: PageData[] = [{
      url: 'https://example.com/vectors',
      title: 'Logo Vectors | Example',
      description: 'Explore 7,195,729 royalty-free logo vector graphics for commercial use',
      h1: 'Logo Vectors',
      content: '',
    }];
    const out = formatLlmTxt({ ...opts, pages: stockPages });
    expect(out).not.toContain('7,195,729');
    expect(out).toContain('logo vector graphics');
  });

  it('strips trailing boilerplate after em dash', () => {
    const stockPages: PageData[] = [{
      url: 'https://example.com/icons',
      title: 'Icon Vectors',
      description: 'Millions of icons — available in multiple formats only at Example',
      h1: 'Icons',
      content: '',
    }];
    const out = formatLlmTxt({ ...opts, pages: stockPages });
    expect(out).toContain('Millions of icons');
    expect(out).not.toContain('available in multiple formats');
  });
});

describe('formatLlmTxt — answering guidelines', () => {
  it('adds answering guidelines when pricing and legal pages are present', () => {
    const out = formatLlmTxt(opts);
    expect(out).toContain('## Answering Guidelines');
  });

  it('includes pricing URL in guidelines', () => {
    const out = formatLlmTxt(opts);
    const guideSection = out.split('##').find(s => s.startsWith(' Answering Guidelines'));
    expect(guideSection).toContain('example.com/pricing');
  });

  it('includes do-not-guess rule', () => {
    const out = formatLlmTxt(opts);
    expect(out).toContain('Do not guess');
  });

  it('omits answering guidelines when no special pages found', () => {
    const plainPages: PageData[] = [{
      url: 'https://example.com/about',
      title: 'About',
      description: 'About us',
      h1: 'About',
      content: '',
    }];
    const out = formatLlmTxt({ ...opts, pages: plainPages });
    expect(out).not.toContain('## Answering Guidelines');
  });
});

describe('formatLlmTxt — edge cases', () => {
  it('handles empty pages list', () => {
    const out = formatLlmTxt({ ...opts, pages: [] });
    expect(out).toContain('# Example');
    expect(out).toContain('> A great site');
  });

  it('uses first path segment as section label for unknown URL patterns', () => {
    const unknownPages: PageData[] = [{
      url: 'https://example.com/royalty-free-vectors/logo-vectors',
      title: 'Logo Vectors',
      description: 'Logo vector graphics',
      h1: 'Logo Vectors',
      content: '',
    }];
    const out = formatLlmTxt({ ...opts, pages: unknownPages });
    expect(out).toContain('## Royalty Free Vectors');
  });
});

describe('formatLlmFullTxt', () => {
  it('includes the base llm.txt content', () => {
    const out = formatLlmFullTxt(opts);
    expect(out).toContain('# Example');
  });

  it('includes full page content', () => {
    const out = formatLlmFullTxt(opts);
    expect(out).toContain('Home page content.');
    expect(out).toContain('Blog content here.');
  });

  it('separates sections with ---', () => {
    expect(formatLlmFullTxt(opts)).toContain('---');
  });

  it('includes URL reference for each page section', () => {
    const out = formatLlmFullTxt(opts);
    expect(out).toContain('URL: https://example.com/');
    expect(out).toContain('URL: https://example.com/blog/hello');
  });

  it('cleans titles in full content sections', () => {
    const out = formatLlmFullTxt(opts);
    expect(out).not.toMatch(/## .+\| Example/);
  });

  it('skips pages with no content in full section', () => {
    const mixed: PageData[] = [
      { url: 'https://x.com/', title: 'Home', description: 'Desc', h1: 'H', content: '' },
      { url: 'https://x.com/docs', title: 'Docs', description: 'D', h1: 'D', content: 'Docs content here.' },
    ];
    const out = formatLlmFullTxt({ ...opts, pages: mixed });
    expect(out).toContain('Docs content here.');
  });
});
