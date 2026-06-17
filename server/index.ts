import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const port = Number(process.env.AI_PROXY_PORT || 3001);
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function jsonFromText<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced?.[1] || trimmed;
  try {
    return JSON.parse(raw) as T;
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY), model });
});

app.post('/api/ai/query', async (req, res) => {
  const client = getClient();
  if (!client) {
    res.status(503).json({ code: -1, message: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const query = String(req.body?.query || '').trim();
  if (!query) {
    res.status(400).json({ code: -1, message: 'query is required' });
    return;
  }

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: '你是销售型公司内部管理系统的经营分析助手。请用中文给出简洁结论和可执行建议。',
        },
        {
          role: 'user',
          content: `问题：${query}\n请返回 JSON：{"content":"简短回答","results":[{"type":"TEXT","title":"标题","content":"内容"},{"type":"SUGGESTION","title":"建议","content":"说明","suggestions":["建议1"]}]}`,
        },
      ],
    } as any);
    const text = (response as any).output_text || '';
    const parsed = jsonFromText<{ content: string; results: unknown[] }>(text);
    res.json({ code: 0, data: parsed || { content: text, results: [{ type: 'TEXT', title: 'AI 分析', content: text }] }, message: 'success' });
  } catch (error) {
    res.status(500).json({ code: -1, message: error instanceof Error ? error.message : 'OpenAI request failed' });
  }
});

app.post('/api/ai/business-card', async (req, res) => {
  const client = getClient();
  if (!client) {
    res.status(503).json({ code: -1, message: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const input = req.body || {};
  if (!input.name || !input.subjectId || !input.subjectType) {
    res.status(400).json({ code: -1, message: 'name, subjectId and subjectType are required' });
    return;
  }

  try {
    const response = await client.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: [
        {
          role: 'system',
          content: '你是销售情报助手。只返回严格 JSON，不要 Markdown。互联网信息不足时明确说明，并给出销售可用推断。',
        },
        {
          role: 'user',
          content: `请为销售生成AI客户名片。客户资料：${JSON.stringify(input)}。
返回 JSON 字段：
{
  "externalSummary": "外部信息摘要",
  "demandInsights": ["需求推断"],
  "matchedProducts": ["匹配产品"],
  "talkTracks": ["沟通话术"],
  "riskAlerts": ["风险提醒"],
  "sources": [{"title":"来源标题","url":"https://...","summary":"摘要"}]
}`,
        },
      ],
    } as any);

    const text = (response as any).output_text || '';
    const parsed = jsonFromText<any>(text) || {};
    res.json({
      code: 0,
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        subjectName: input.name,
        company: input.company,
        phone: input.phone,
        email: input.email,
        wechat: input.wechat,
        industry: input.industry,
        city: input.city,
        externalSummary: parsed.externalSummary || text || '未获得外部摘要',
        demandInsights: Array.isArray(parsed.demandInsights) ? parsed.demandInsights : [],
        matchedProducts: Array.isArray(parsed.matchedProducts) ? parsed.matchedProducts : [],
        talkTracks: Array.isArray(parsed.talkTracks) ? parsed.talkTracks : [],
        riskAlerts: Array.isArray(parsed.riskAlerts) ? parsed.riskAlerts : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        isFallback: false,
        generatedAt: new Date().toISOString(),
      },
      message: 'success',
    });
  } catch (error) {
    res.status(500).json({ code: -1, message: error instanceof Error ? error.message : 'OpenAI request failed' });
  }
});

app.listen(port, () => {
  console.log(`AI proxy listening on http://localhost:${port}`);
});
