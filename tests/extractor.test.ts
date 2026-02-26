import { describe, it, expect } from 'vitest';
import { extractPageData, getPageDescription, getPageTitle } from '../src/extractor.js';

const sampleHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Getting Started - MyDocs</title>
  <meta name="description" content="Learn how to get started with MyDocs in 5 minutes.">
</head>
<body>
  <nav>Navigation that should be removed</nav>
  <main>
    <h1>Getting Started</h1>
    <p>Welcome to MyDocs. This guide will help you get started quickly.</p>
    <p>Follow these steps to install and configure the tool.</p>
  </main>
  <footer>Footer content</footer>
  <script>console.log('should be removed')</script>
</body>
</html>
`;

describe('extractPageData', () => {
  it('extracts title from <title> tag', () => {
    const data = extractPageData('https://example.com/start', sampleHtml);
    expect(data.title).toBe('Getting Started - MyDocs');
  });

  it('extracts meta description', () => {
    const data = extractPageData('https://example.com/start', sampleHtml);
    expect(data.description).toBe('Learn how to get started with MyDocs in 5 minutes.');
  });

  it('extracts h1', () => {
    const data = extractPageData('https://example.com/start', sampleHtml);
    expect(data.h1).toBe('Getting Started');
  });

  it('extracts main content and excludes nav/footer/scripts', () => {
    const data = extractPageData('https://example.com/start', sampleHtml);
    expect(data.content).toContain('Welcome to MyDocs');
    expect(data.content).not.toContain('Navigation that should be removed');
    expect(data.content).not.toContain('Footer content');
    expect(data.content).not.toContain("console.log");
  });

  it('sets the url', () => {
    const data = extractPageData('https://example.com/start', sampleHtml);
    expect(data.url).toBe('https://example.com/start');
  });

  it('falls back to og:description when no meta description', () => {
    const html = `<html><head>
      <title>Test</title>
      <meta property="og:description" content="OG description here">
    </head><body><h1>Test</h1></body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.description).toBe('OG description here');
  });

  it('truncates content to 3000 chars', () => {
    const longContent = 'x'.repeat(5000);
    const html = `<html><head><title>T</title></head><body><main><p>${longContent}</p></main></body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.content.length).toBeLessThanOrEqual(3000);
  });

  it('returns empty string for title when no <title> tag', () => {
    const html = `<html><head></head><body><h1>Hello</h1></body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.title).toBe('');
  });

  it('trims whitespace from title and description', () => {
    const html = `<html><head>
      <title>  Padded Title  </title>
      <meta name="description" content="  Padded desc  ">
    </head><body></body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.title).toBe('Padded Title');
    expect(data.description).toBe('Padded desc');
  });

  it('uses only the first h1 when multiple are present', () => {
    const html = `<html><head><title>T</title></head><body>
      <h1>First Heading</h1>
      <h1>Second Heading</h1>
    </body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.h1).toBe('First Heading');
  });

  it('falls back to <article> for content when no <main>', () => {
    const html = `<html><head><title>T</title></head><body>
      <article>Article content here</article>
    </body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.content).toContain('Article content here');
  });

  it('falls back to [role="main"] for content', () => {
    const html = `<html><head><title>T</title></head><body>
      <div role="main">Role main content</div>
    </body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.content).toContain('Role main content');
  });

  it('falls back to body when no semantic content element exists', () => {
    const html = `<html><head><title>T</title></head><body>
      <div class="random-wrapper">Body fallback content</div>
    </body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.content).toContain('Body fallback content');
  });

  it('removes <aside> elements from content', () => {
    const html = `<html><head><title>T</title></head><body><main>
      <p>Main content</p>
      <aside>Sidebar noise</aside>
    </main></body></html>`;
    const data = extractPageData('https://example.com', html);
    expect(data.content).toContain('Main content');
    expect(data.content).not.toContain('Sidebar noise');
  });
});

describe('getPageDescription', () => {
  it('prefers description over h1', () => {
    const page = { url: 'https://x.com', title: 'Title', description: 'Desc', h1: 'H1', content: '' };
    expect(getPageDescription(page)).toBe('Desc');
  });

  it('falls back to h1 when no description', () => {
    const page = { url: 'https://x.com', title: 'Title', description: '', h1: 'H1', content: '' };
    expect(getPageDescription(page)).toBe('H1');
  });

  it('falls back to title when no description or h1', () => {
    const page = { url: 'https://x.com', title: 'Title', description: '', h1: '', content: '' };
    expect(getPageDescription(page)).toBe('Title');
  });

  it('falls back to url as last resort', () => {
    const page = { url: 'https://x.com', title: '', description: '', h1: '', content: '' };
    expect(getPageDescription(page)).toBe('https://x.com');
  });
});

describe('getPageTitle', () => {
  it('returns title when present', () => {
    const page = { url: 'https://x.com', title: 'My Title', description: '', h1: '', content: '' };
    expect(getPageTitle(page)).toBe('My Title');
  });

  it('falls back to h1', () => {
    const page = { url: 'https://x.com', title: '', description: '', h1: 'My H1', content: '' };
    expect(getPageTitle(page)).toBe('My H1');
  });

  it('falls back to url', () => {
    const page = { url: 'https://x.com/page', title: '', description: '', h1: '', content: '' };
    expect(getPageTitle(page)).toBe('https://x.com/page');
  });
});
