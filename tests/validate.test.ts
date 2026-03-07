import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateUrl } from '../src/validate.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function htmlResponse(status = 200, url = 'https://example.com', contentType = 'text/html') {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Map([['content-type', contentType]]),
  };
}

describe('validateUrl', () => {
  it('returns origin for a valid URL', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse());
    const origin = await validateUrl('https://example.com');
    expect(origin).toBe('https://example.com');
  });

  it('rejects unsupported protocols', async () => {
    await expect(validateUrl('ftp://example.com')).rejects.toThrow('Unsupported protocol "ftp:"');
  });

  it('rejects file:// protocol', async () => {
    await expect(validateUrl('file:///etc/passwd')).rejects.toThrow('Unsupported protocol "file:"');
  });

  it('rejects URLs with credentials', async () => {
    await expect(validateUrl('https://user:pass@example.com')).rejects.toThrow('URLs with credentials are not supported');
  });

  it('rejects URLs with username only', async () => {
    await expect(validateUrl('https://user@example.com')).rejects.toThrow('URLs with credentials are not supported');
  });

  it('throws on DNS/network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(validateUrl('https://notarealdomain12345.xyz')).rejects.toThrow(
      'Could not connect to notarealdomain12345.xyz',
    );
  });

  it('throws on HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(500));
    await expect(validateUrl('https://example.com')).rejects.toThrow(
      'Received HTTP 500 from https://example.com. The server is returning an error.',
    );
  });

  it('throws on HTTP 503', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(503));
    await expect(validateUrl('https://example.com')).rejects.toThrow(
      'Received HTTP 503 from https://example.com. The server is returning an error.',
    );
  });

  it('throws on HTTP 404', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(404));
    await expect(validateUrl('https://example.com')).rejects.toThrow(
      'Received HTTP 404 from https://example.com. The site may require authentication or the URL may be wrong.',
    );
  });

  it('throws on HTTP 403', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(403));
    await expect(validateUrl('https://example.com')).rejects.toThrow(
      'Received HTTP 403 from https://example.com. The site may require authentication or the URL may be wrong.',
    );
  });

  it('warns on cross-origin redirect but returns redirected origin', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(htmlResponse(200, 'https://other.com/page'));
    const origin = await validateUrl('https://example.com');
    expect(origin).toBe('https://other.com');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('redirected to https://other.com'),
    );
    warnSpy.mockRestore();
  });

  it('does not warn on same-origin redirect', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(htmlResponse(200, 'https://example.com/home'));
    const origin = await validateUrl('https://example.com');
    expect(origin).toBe('https://example.com');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns on non-HTML content type but does not throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(htmlResponse(200, 'https://example.com', 'application/json'));
    const origin = await validateUrl('https://example.com');
    expect(origin).toBe('https://example.com');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('application/json'),
    );
    warnSpy.mockRestore();
  });

  it('passes timeout and User-Agent to fetch', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse());
    await validateUrl('https://example.com');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com');
    expect((options.headers as Record<string, string>)['User-Agent']).toContain('llm-txt-gen');
    expect(options.signal).toBeDefined();
  });
});
