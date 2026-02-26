import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface LlmConfig {
  siteName?: string;
  siteDescription?: string;
  exclude?: string[];
  overrides?: Record<string, { title?: string; description?: string }>;
}

export async function loadConfig(configPath = 'llm.config.json'): Promise<LlmConfig> {
  const full = path.resolve(configPath);
  if (!existsSync(full)) return {};
  const raw = await readFile(full, 'utf-8');
  return JSON.parse(raw) as LlmConfig;
}
