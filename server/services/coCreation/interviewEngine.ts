import type { AiChatMessage } from '../aiChatClient';

export type InterviewPhase =
  | 'ROLE_SCENARIO'
  | 'REAL_PROBLEM'
  | 'CURRENT_WORKFLOW'
  | 'IMPACT'
  | 'DESIRED_OUTCOME'
  | 'DATA_PERMISSION'
  | 'EVIDENCE'
  | 'ACCEPTANCE';

export type InterviewTurn = {
  reply: string;
  phase: InterviewPhase;
  completeness: number;
  extractedFacts: string[];
  hypotheses: string[];
  briefReady: boolean;
};

export function buildInterviewMessages(input: {
  title: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): AiChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是极享OS的“AI需求追问官”，帮助不懂产品经理的员工说清真实工作问题。
核心规则：
1. 一次只问一个问题，并附一条简短的“你可以这样回答”示例。
2. 先弄清岗位、真实场景、当前流程、卡点、频率、影响、期望结果、数据权限、证据和验收方法。
3. 不要直接设计功能，不接受“我想要一个按钮”作为真实需求，要追问按钮背后的工作问题。
4. 区分员工陈述、可核实证据和AI假设；AI假设不得写成已确认事实。
5. 只返回严格JSON，不要Markdown，不要在reply中连续提出多个问题。
返回结构：
{"reply":"一个问题和推荐回答格式","phase":"ROLE_SCENARIO|REAL_PROBLEM|CURRENT_WORKFLOW|IMPACT|DESIRED_OUTCOME|DATA_PERMISSION|EVIDENCE|ACCEPTANCE","completeness":0,"extractedFacts":[],"hypotheses":[],"briefReady":false}`,
    },
    {
      role: 'user',
      content: `候选需求标题：${input.title}\n请根据以下访谈历史提出最需要补齐的一个问题。`,
    },
    ...input.messages,
  ];
}

function jsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced?.[1] || trimmed;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseInterviewTurn(text: string): InterviewTurn {
  const parsed = jsonObject(text);
  if (!parsed) {
    return {
      reply: text.trim() || '请讲一个最近发生的真实工作场景。你可以这样回答：我在【什么时候】需要【做什么】，当时卡在【哪里】。',
      phase: 'ROLE_SCENARIO',
      completeness: 0,
      extractedFacts: [],
      hypotheses: [],
      briefReady: false,
    };
  }

  const phases: InterviewPhase[] = [
    'ROLE_SCENARIO', 'REAL_PROBLEM', 'CURRENT_WORKFLOW', 'IMPACT',
    'DESIRED_OUTCOME', 'DATA_PERMISSION', 'EVIDENCE', 'ACCEPTANCE',
  ];
  const phase = phases.includes(parsed.phase as InterviewPhase)
    ? parsed.phase as InterviewPhase
    : 'ROLE_SCENARIO';
  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    reply: String(parsed.reply || '').trim() || '请讲一个最近发生的真实例子。',
    phase,
    completeness: Math.max(0, Math.min(100, Number(parsed.completeness) || 0)),
    extractedFacts: strings(parsed.extractedFacts),
    hypotheses: strings(parsed.hypotheses),
    briefReady: parsed.briefReady === true,
  };
}
