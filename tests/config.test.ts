import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../src/config.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'llm-txt-gen-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns empty object when file does not exist', async () => {
    const config = await loadConfig(join(tempDir, 'nonexistent.json'));
    expect(config).toEqual({});
  });

  it('parses siteName and siteDescription', async () => {
    const configPath = join(tempDir, 'llm.config.json');
    await writeFile(configPath, JSON.stringify({ siteName: 'My Site', siteDescription: 'The best site' }));
    const config = await loadConfig(configPath);
    expect(config.siteName).toBe('My Site');
    expect(config.siteDescription).toBe('The best site');
  });

  it('parses exclude list', async () => {
    const configPath = join(tempDir, 'llm.config.json');
    await writeFile(configPath, JSON.stringify({
      exclude: ['https://example.com/admin', 'https://example.com/login'],
    }));
    const config = await loadConfig(configPath);
    expect(config.exclude).toEqual(['https://example.com/admin', 'https://example.com/login']);
  });

  it('parses per-page overrides', async () => {
    const configPath = join(tempDir, 'llm.config.json');
    await writeFile(configPath, JSON.stringify({
      overrides: {
        'https://example.com/docs': { title: 'Documentation', description: 'Full API reference' },
      },
    }));
    const config = await loadConfig(configPath);
    expect(config.overrides?.['https://example.com/docs']).toEqual({
      title: 'Documentation',
      description: 'Full API reference',
    });
  });

  it('returns empty object for empty JSON object', async () => {
    const configPath = join(tempDir, 'llm.config.json');
    await writeFile(configPath, '{}');
    const config = await loadConfig(configPath);
    expect(config).toEqual({});
  });

  it('handles partial config (only some fields set)', async () => {
    const configPath = join(tempDir, 'llm.config.json');
    await writeFile(configPath, JSON.stringify({ siteName: 'Only Name' }));
    const config = await loadConfig(configPath);
    expect(config.siteName).toBe('Only Name');
    expect(config.siteDescription).toBeUndefined();
    expect(config.exclude).toBeUndefined();
  });
});
