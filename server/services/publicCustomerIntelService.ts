export type CustomerIntelInput = {
  subjectType: 'lead' | 'customer';
  subjectId: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  industry?: string;
  city?: string;
  tags?: string[];
  notes?: string;
};

export type PublicSearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

const MAX_QUERIES = 6;
const MAX_RESULTS = 8;

function cleanText(value?: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractBusinessKeywords(notes?: string): string {
  const text = cleanText(notes);
  if (!text) return '';
  const matched = [
    'AI获客',
    'OEM贴牌',
    'OEM',
    '贴牌',
    '获客',
    '私域',
    '短视频',
    '直播',
    '代理',
    '加盟',
    '数字化',
    '企业运营',
  ].filter((keyword) => text.includes(keyword));
  const keywords = matched.filter((keyword) => !matched.some((item) => item !== keyword && item.includes(keyword)));
  return unique(keywords).slice(0, 3).join(' ');
}

export function buildCustomerSearchQueries(input: CustomerIntelInput): string[] {
  const company = cleanText(input.company);
  const name = cleanText(input.name);
  const city = cleanText(input.city);
  const industry = cleanText(input.industry);
  const wechat = cleanText(input.wechat);
  const notesKeywords = extractBusinessKeywords(input.notes);
  const tags = unique(input.tags || []).slice(0, 2).join(' ');

  const queries = [
    company && [company, city, industry].filter(Boolean).join(' '),
    company && name && `${company} ${name}`,
    company && notesKeywords && `${company} ${notesKeywords}`,
    wechat && company && `${wechat} ${company}`,
    company && `${company} 官网`,
    company && tags && `${company} ${tags}`,
    !company && [name, city, industry].filter(Boolean).join(' '),
  ];

  return unique(queries.filter(Boolean) as string[]).slice(0, MAX_QUERIES);
}

function extractDuckDuckGoUrl(href: string): string {
  const decoded = decodeHtml(href);
  try {
    const url = new URL(decoded, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    return decoded;
  }
}

export function parseDuckDuckGoHtml(html: string): PublicSearchResult[] {
  const results: PublicSearchResult[] = [];
  const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html))) {
    const [, href, titleHtml] = match;
    const afterTitle = html.slice(match.index + match[0].length, match.index + match[0].length + 1200);
    const snippetMatch = afterTitle.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || afterTitle.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const title = stripTags(titleHtml);
    const url = extractDuckDuckGoUrl(href);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : '';
    if (title && url && !url.includes('duckduckgo.com')) {
      results.push({ title, url, snippet });
    }
  }

  const byUrl = new Map<string, PublicSearchResult>();
  results.forEach((result) => {
    if (!byUrl.has(result.url)) byUrl.set(result.url, result);
  });
  return Array.from(byUrl.values()).slice(0, MAX_RESULTS);
}

export async function searchPublicCustomerIntel(
  input: CustomerIntelInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ queries: string[]; results: PublicSearchResult[] }> {
  const queries = buildCustomerSearchQueries(input);
  const results: PublicSearchResult[] = [];

  for (const query of queries.slice(0, 3)) {
    try {
      const url = `https://html.duckduckgo.com/html/?${new URLSearchParams({ q: query }).toString()}`;
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JixiangOS/1.0; +https://github.com/jranlin2026/jixiangOS)',
        },
      });
      if (!response.ok) continue;
      results.push(...parseDuckDuckGoHtml(await response.text()));
    } catch {
      // Public search is an enhancement; DeepSeek can still work from CRM fields.
    }
    if (results.length >= MAX_RESULTS) break;
  }

  const byUrl = new Map<string, PublicSearchResult>();
  results.forEach((result) => {
    if (!byUrl.has(result.url)) byUrl.set(result.url, result);
  });

  return { queries, results: Array.from(byUrl.values()).slice(0, MAX_RESULTS) };
}

export function buildCustomerIntelPrompt(
  input: CustomerIntelInput,
  queries: string[],
  results: PublicSearchResult[],
): string {
  return `请为销售生成“AI客户情报名片”。只返回严格 JSON，不要 Markdown。

客户资料：
${JSON.stringify(input, null, 2)}

本次联网搜索关键词：
${JSON.stringify(queries, null, 2)}

联网公开信息：
${JSON.stringify(results, null, 2)}

请把“公开资料事实”和“AI销售推断”分清楚。没有证据的内容必须标注为推断，不要编造客户身份、隐私或未公开信息。

返回 JSON 字段：
{
  "externalSummary": "客户公开画像摘要，80-160字",
  "publicFacts": ["从公开信息中可以确认的事实"],
  "demandInsights": ["基于客户资料和公开信息的需求推断"],
  "matchedProducts": ["适合推荐的产品或方案"],
  "talkTracks": ["微信开场", "电话开场", "追问清单", "下一步推进话术"],
  "riskAlerts": ["信息不足、证据弱、需要销售确认的风险"],
  "confidence": 0.72,
  "sources": [{"title":"来源标题","url":"https://example.com","summary":"来源摘要"}]
}`;
}
