export interface ParakhWebResearchSource {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

export interface ParakhWebResearchResponse {
  available: boolean;
  provider: 'searxng' | 'google-news-rss' | null;
  results: ParakhWebResearchSource[];
  reason?: 'disabled' | 'not_configured' | 'unavailable' | 'no_results';
}

const MAX_RESULTS = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 5500;
const cache = new Map<string, { expiresAt: number; response: ParakhWebResearchResponse }>();

export function shouldUseParakhWebResearch(message: string): boolean {
  // Keep evergreen study topics such as current ratio/current account out of web search,
  // but route attempt-sensitive tax thresholds, rates and numbered statutory provisions
  // to current primary-source research in English and Hindi.
  return /\b(latest|currently|today|yesterday|recent|newest|newly announced|updated?|amendment|notification|circular|announcement|press release|union budget|exam results?|admit card|exam date|registration date|last date|deadline|due date|cut[- ]?off|repo rate|policy rate|interest rate|tax rate|tax slab|income[- ]tax slab|gst rate|registration threshold|deduction limit|tax threshold|gst threshold|section\s+\d+[A-Z]?|rule\s+\d+[A-Z]?|current (?:rate|threshold|limit|slab|tax|gst|income tax|due date|filing deadline|interest|penalty|policy|notification|rule|amendment|syllabus|exam date|version|status|information|update)|as of 20\d{2}|20\d{2}|browse|web search|search the internet|internet se|online source|latest update)\b/i.test(String(message || ''))
    || /(?:वर्तमान|आज की|नवीनतम)\s*(?:जीएसटी|GST|आयकर|कर|दर|सीमा|स्लैब|ब्याज|अंतिम तारीख|संशोधन|अधिसूचना)|(?:जीएसटी|GST|आयकर)\s*(?:दर|स्लैब|सीमा|अंतिम तारीख)|धारा\s*\d+|नियम\s*\d+/u.test(String(message || ''));
}

export function sanitiseParakhSearchQuery(message: string): string {
  return String(message || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, ' ')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, ' ')
    .replace(/\b(?:student id|user id|roll no|registration no|phone|mobile)\s*[:#-]?\s*[A-Z0-9/-]+\b/gi, ' ')
    .replace(/\b[0-9a-f]{24,}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function enrichWithOfficialDomains(query: string): string {
  if (/\b(icai|ca exam|chartered accountant|admit card|exam form|examination|syllabus|attempt|registration)\b/i.test(query)) {
    return 'site:icai.org OR site:icai-cds.org ' + query;
  }
  if (/\b(gst|income tax|taxation|cbic|input tax credit|direct tax)\b|जीएसटी|आयकर|कर/i.test(query)) {
    return 'site:incometax.gov.in OR site:cbic.gov.in OR site:gst.gov.in ' + query;
  }
  if (/\b(rbi|repo rate|banking|sebi|securities|monetary policy)\b/i.test(query)) {
    return 'site:rbi.org.in OR site:sebi.gov.in ' + query;
  }
  if (/\b(company law|mca|companies act|llp|corporate affairs)\b|कंपनी अधिनियम|कंपनी कानून/i.test(query)) {
    return 'site:mca.gov.in ' + query;
  }
  return query;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function cleanText(value: unknown, maxLength = 420): string {
  return decodeXml(String(value || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeExternalUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1') return null;
    if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
  return match ? cleanText(match[1]) : '';
}

export function parseGoogleNewsRss(xml: string): ParakhWebResearchSource[] {
  const items = String(xml || '').match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, MAX_RESULTS).flatMap((item) => {
    const title = readTag(item, 'title');
    const url = safeExternalUrl(readTag(item, 'link'));
    const description = readTag(item, 'description');
    const publishedAt = readTag(item, 'pubDate') || null;
    if (!title || !url) return [];
    return [{ title, url, snippet: cleanText(description) || title, publishedAt }];
  });
}

export function parseSearxngResults(payload: unknown): ParakhWebResearchSource[] {
  const results = payload && typeof payload === 'object'
    ? (payload as { results?: unknown }).results
    : null;
  if (!Array.isArray(results)) return [];
  return results.slice(0, MAX_RESULTS).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const title = cleanText(record.title, 180);
    const url = safeExternalUrl(record.url);
    if (!title || !url) return [];
    return [{
      title,
      url,
      snippet: cleanText(record.content || record.snippet) || title,
      publishedAt: cleanText(record.publishedDate, 80) || null,
    }];
  });
}

async function fetchWithTimeout(url: URL, accept: string): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: accept,
      'User-Agent': 'PARAKH-CA-Learning-Companion/1.0 (+https://caexamcheckerai.com)',
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Search provider returned HTTP ' + response.status);
  return response.text();
}

export async function searchParakhWebResearch(message: string): Promise<ParakhWebResearchResponse> {
  if (process.env.PARAKH_WEB_RESEARCH_ENABLED === 'false') {
    return { available: false, provider: null, results: [], reason: 'disabled' };
  }

  const safeQuery = sanitiseParakhSearchQuery(message);
  if (safeQuery.length < 3) return { available: false, provider: null, results: [], reason: 'no_results' };
  const query = enrichWithOfficialDomains(safeQuery);
  const cached = cache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const configuredEndpoint = String(process.env.PARAKH_WEB_SEARCH_ENDPOINT || '').trim();
  const provider: 'searxng' | 'google-news-rss' = configuredEndpoint ? 'searxng' : 'google-news-rss';

  try {
    let results: ParakhWebResearchSource[] = [];
    if (configuredEndpoint) {
      const endpoint = new URL(configuredEndpoint);
      if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
        throw new Error('PARAKH_WEB_SEARCH_ENDPOINT must use HTTP or HTTPS.');
      }
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('format', 'json');
      endpoint.searchParams.set('language', 'en-IN');
      endpoint.searchParams.set('safesearch', '1');
      const payload = await fetchWithTimeout(endpoint, 'application/json');
      results = parseSearxngResults(JSON.parse(payload));
    } else {
      const endpoint = new URL('https://news.google.com/rss/search');
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('hl', 'en-IN');
      endpoint.searchParams.set('gl', 'IN');
      endpoint.searchParams.set('ceid', 'IN:en');
      const payload = await fetchWithTimeout(endpoint, 'application/rss+xml, application/xml, text/xml');
      results = parseGoogleNewsRss(payload);
    }

    const response: ParakhWebResearchResponse = {
      available: results.length > 0,
      provider,
      results,
      reason: results.length ? undefined : 'no_results',
    };
    cache.set(query, { expiresAt: Date.now() + CACHE_TTL_MS, response });
    return response;
  } catch (error) {
    console.warn('[PARAKH] Web research is temporarily unavailable:', error);
    return { available: false, provider, results: [], reason: 'unavailable' };
  }
}

export function buildParakhWebResearchMessage(
  language: 'english' | 'hinglish' | 'hindi',
  resultCount: number,
): string {
  if (language === 'hinglish') {
    return 'Bhai, maine web par ' + resultCount + ' relevant result(s) find kiye hain. Neeche titles, available snippets aur source links diye hain. Ye search-result excerpts hain, full official document ka substitute nahi—especially ICAI, Law aur Tax updates ke liye source open karke effective date aur exact wording verify karna.';
  }
  if (language === 'hindi') {
    return 'वेब पर ' + resultCount + ' relevant result(s) मिले हैं। नीचे titles, उपलब्ध snippets और source links दिए हैं। ये search-result excerpts हैं, पूरे official document का विकल्प नहीं—विशेषकर ICAI, Law और Tax updates के लिए source खोलकर effective date और exact wording verify करें।';
  }
  return 'I found ' + resultCount + ' relevant web result(s). The titles, available snippets and source links are below. These are search-result excerpts, not a substitute for the full official document; verify the effective date and exact wording in the primary source, especially for ICAI, Law and Tax updates.';
}
