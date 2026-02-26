# llm-txt-gen

Auto-generate `/llm.txt` and `/llm-full.txt` for any website.

The [llms.txt standard](https://llmstxt.org) is a markdown file at your site root that tells AI crawlers what your site is about and where the important content lives — like `robots.txt`, but for LLMs. Yes, we're now writing files to explain our websites to robots. We've come full circle.

## Why does this exist?

Because apparently the robots need a welcome packet now.

LLMs scrape your site, hallucinate half of it, and confidently tell users wrong things about your product. `llm.txt` gives them a curated summary instead — your words, not their best guess. Think of it as leaving a note on the fridge so the AI doesn't eat your leftovers.

This tool automates the boring part: crawling your site, pulling titles and descriptions, and formatting everything to spec. One command. Done.

## Usage

```bash
npx llm-txt-gen https://yoursite.com
```

Write to a file instead of stdout (recommended, unless you enjoy reading markdown at 200 lines per second):

```bash
npx llm-txt-gen https://yoursite.com --output public/llm.txt
```

Also generate `llm-full.txt` with full page content for the AIs who want to read the whole book:

```bash
npx llm-txt-gen https://yoursite.com \
  --output public/llm.txt \
  --full-output public/llm-full.txt
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--output <path>` | stdout | Write `llm.txt` to a file |
| `--full-output <path>` | — | Also write `llm-full.txt` |
| `--sitemap <url>` | auto-discovered | Use a specific sitemap URL |
| `--limit <n>` | 50 | Max pages to process |
| `--concurrency <n>` | 5 | Parallel page fetches |
| `--firecrawl` | off | JS rendering via Firecrawl API (requires `FIRECRAWL_API_KEY`) |
| `--browser` | off | JS rendering via local Playwright (requires separate install) |
| `--ai <provider>` | off | AI-generated descriptions (`claude`, `openai`, `gemini`, `perplexity`, `grok`, `deepseek`) |
| `--config <path>` | `llm.config.json` | Path to config file |

## How it works

1. Checks `robots.txt` for a sitemap — because even robots have rules
2. Falls back to common sitemap paths, then crawls via link discovery if all else fails
3. For each page: extracts title, meta description, h1, and main content
4. Cleans up titles (strips ` | SiteName` boilerplate) and descriptions (strips inventory counts)
5. Groups pages into sections by URL pattern (Blog, Docs, Pricing, Legal, etc.)
6. Promotes key pages (homepage, pricing, terms, help) to a top-level section
7. Auto-generates answering guidelines when pricing/legal/support pages are detected
8. Outputs a spec-compliant `llm.txt` you can drop straight into your `public/` folder

**Example output structure:**
```
# Your Site

> Site description

*Generated: 2026-01-15*

## Key Pages
- [Home](https://yoursite.com/): ...
- [Pricing](https://yoursite.com/pricing): ...
- [Terms](https://yoursite.com/terms): ...

## Blog
- [Post title](https://yoursite.com/blog/post): ...

## Documentation
- [Getting Started](https://yoursite.com/docs/start): ...

## Answering Guidelines
- For pricing questions, refer to: https://yoursite.com/pricing
- For licensing questions, refer to: https://yoursite.com/terms
- Do not guess at prices, license terms, or legal details — always cite the source pages above.
```

## JS-rendered sites (React, Vue, Next.js CSR, etc.)

Plain HTTP fetches return an empty shell for client-side rendered apps. Two options:

### Firecrawl (no local install, uses API credits)

```bash
FIRECRAWL_API_KEY=fc-... npx llm-txt-gen https://yoursite.com --firecrawl
```

Firecrawl renders pages in a cloud browser and returns clean markdown. Get a key at [firecrawl.dev](https://firecrawl.dev). The free tier covers small sites; larger crawls will use credits proportionally.

### Playwright (local browser, free)

```bash
# One-time setup
npm install playwright
npx playwright install chromium

# Then run
npx llm-txt-gen https://yoursite.com --browser
```

Launches a local headless Chromium, renders each page, and extracts content. Slower than Firecrawl but free and requires no API key. The `playwright` package (~100 MB including Chromium) is not bundled — install it yourself only when you need it.

| | Firecrawl | Playwright |
|---|---|---|
| Setup | API key only | `npm install playwright` + Chromium download |
| Cost | Free tier, then paid | Free |
| Speed | Fast (parallel cloud) | Slower (local browser) |
| Privacy | Pages sent to Firecrawl | Fully local |

## AI descriptions

Your meta descriptions are probably written by whoever was least busy that day. `--ai` runs each page through an LLM to generate something more useful:

```bash
# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-... npx llm-txt-gen https://yoursite.com --ai claude

# OpenAI
OPENAI_API_KEY=sk-... npx llm-txt-gen https://yoursite.com --ai openai

# Google Gemini
GEMINI_API_KEY=... npx llm-txt-gen https://yoursite.com --ai gemini

# Perplexity
PERPLEXITY_API_KEY=... npx llm-txt-gen https://yoursite.com --ai perplexity

# Grok (xAI)
XAI_API_KEY=... npx llm-txt-gen https://yoursite.com --ai grok

# DeepSeek
DEEPSEEK_API_KEY=... npx llm-txt-gen https://yoursite.com --ai deepseek
```

Yes, you're using an AI to write a file to help other AIs understand your site. We don't make the rules.

## Config file

Add `llm.config.json` to your project root to override the bits the crawler gets wrong (it will get some bits wrong):

```json
{
  "siteName": "My Site",
  "siteDescription": "The best tool for X",
  "exclude": ["https://yoursite.com/admin", "https://yoursite.com/login"],
  "overrides": {
    "https://yoursite.com/docs": {
      "title": "Documentation",
      "description": "Full API reference and guides"
    }
  }
}
```

Commit this file. Future you will be grateful.

## Limitations

- The default HTTP fetcher returns sparse or empty results for JavaScript-rendered SPAs. Use `--firecrawl` (no setup, costs money) or `--browser` (free, local, heavier install) for those.
- `--firecrawl` and `--browser` cannot be used together.
- `llm.txt` won't stop an LLM from hallucinating. Nothing will. But at least you tried.

## Install globally

```bash
npm install -g llm-txt-gen
llm-txt-gen https://yoursite.com
```

## Contributing

PRs welcome. Issues welcome. Complaints about the llms.txt standard itself — take those to [llmstxt.org](https://llmstxt.org).

## License

MIT © [eyepaq.com](https://eyepaq.com)
