import type { ID, Timestamp } from './common';

export type AIBusinessCardSubjectType = 'lead' | 'customer';

export interface AIBusinessCardSource {
  title: string;
  url: string;
  summary?: string;
}

export interface AIBusinessCard {
  id: ID;
  subjectType: AIBusinessCardSubjectType;
  subjectId: ID;
  subjectName: string;
  company?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  industry?: string;
  city?: string;
  externalSummary: string;
  demandInsights: string[];
  matchedProducts: string[];
  talkTracks: string[];
  riskAlerts: string[];
  sources: AIBusinessCardSource[];
  isFallback: boolean;
  generatedAt: Timestamp;
}

export interface AIBusinessCardInput {
  subjectType: AIBusinessCardSubjectType;
  subjectId: ID;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  industry?: string;
  city?: string;
  tags?: string[];
  notes?: string;
}
