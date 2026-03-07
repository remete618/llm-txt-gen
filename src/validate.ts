export async function validateUrl(baseUrl: string): Promise<string> {
  const parsed = new URL(baseUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol "${parsed.protocol}" — use http:// or https://`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not supported');
  }

  let res: Response;
  try {
    res = await fetch(baseUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'llm-txt-gen/0.1 (+https://github.com/remete618/llm-txt-gen)' },
    });
  } catch {
    throw new Error(`Could not connect to ${parsed.hostname}. Check the domain and try again.`);
  }

  if (res.status >= 500) {
    throw new Error(`Received HTTP ${res.status} from ${baseUrl}. The server is returning an error.`);
  }
  if (res.status >= 400) {
    throw new Error(`Received HTTP ${res.status} from ${baseUrl}. The site may require authentication or the URL may be wrong.`);
  }

  const finalUrl = res.url;
  const finalOrigin = new URL(finalUrl).origin;
  if (finalOrigin !== parsed.origin) {
    console.warn(`Warning: ${baseUrl} redirected to ${finalOrigin}. Proceeding with redirected domain.`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    console.warn(`Warning: ${baseUrl} returned Content-Type "${contentType}" instead of text/html.`);
  }

  return finalOrigin;
}
