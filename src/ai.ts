import Anthropic from '@anthropic-ai/sdk';
import type { PageData } from './extractor.js';

export type AiProvider = 'claude' | 'openai' | 'gemini' | 'perplexity' | 'grok' | 'deepseek';

const PROVIDER_CONFIG: Record<AiProvider, { envVar: string; baseUrl?: string; model: string }> = {
  claude:     { envVar: 'ANTHROPIC_API_KEY', model: 'claude-haiku-4-5-20251001' },
  openai:     { envVar: 'OPENAI_API_KEY',    baseUrl: 'https://api.openai.com/v1',    model: 'gpt-4o-mini' },
  gemini:     { envVar: 'GEMINI_API_KEY',    model: 'gemini-2.0-flash' },
  perplexity: { envVar: 'PERPLEXITY_API_KEY', baseUrl: 'https://api.perplexity.ai',   model: 'sonar' },
  grok:       { envVar: 'XAI_API_KEY',       baseUrl: 'https://api.x.ai/v1',          model: 'grok-3-mini' },
  deepseek:   { envVar: 'DEEPSEEK_API_KEY',  baseUrl: 'https://api.deepseek.com/v1',  model: 'deepseek-chat' },
};

export function getProviderEnvVar(provider: AiProvider): string {
  return PROVIDER_CONFIG[provider].envVar;
}

export async function generateDescriptions(
  pages: PageData[],
  provider: AiProvider,
  apiKey: string,
): Promise<PageData[]> {
  const results: PageData[] = [];
  for (const page of pages) {
    const prompt = buildPrompt(page);
    try {
      const desc = await callProvider(provider, apiKey, prompt);
      results.push({ ...page, description: desc || page.description });
    } catch {
      results.push(page);
    }
  }
  return results;
}

function buildPrompt(page: PageData): string {
  return `Summarize this web page in one concise sentence (under 20 words) for an llm.txt index file.

Title: ${page.title}
H1: ${page.h1}
Meta description: ${page.description}
Content excerpt: ${page.content.slice(0, 500)}

Respond with only the one-line description.`;
}

async function callProvider(provider: AiProvider, apiKey: string, prompt: string): Promise<string> {
  const { baseUrl, model } = PROVIDER_CONFIG[provider];

  if (provider === 'claude') {
    return callClaude(prompt, apiKey, model);
  }
  if (provider === 'gemini') {
    return callGemini(prompt, apiKey, model);
  }
  return callOpenAICompat(prompt, apiKey, baseUrl!, model);
}

async function callClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 80,
    messages: [{ role: 'user', content: prompt }],
  });
  return message.content[0].type === 'text' ? message.content[0].text.trim() : '';
}

async function callOpenAICompat(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${baseUrl} error ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? '';
}

async function callGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 80 },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json() as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return data.candidates[0]?.content?.parts[0]?.text?.trim() ?? '';
}
