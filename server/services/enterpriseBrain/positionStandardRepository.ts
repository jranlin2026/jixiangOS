export type PositionFact = { id: string; name: string; isActive: boolean };
export type KnowledgeVersionFact = {
  id: string;
  title: string;
  status: string;
  effectiveAt: Date | null;
  expiresAt: Date | null;
};

export type PositionStandardVersionRecord = {
  id: string;
  standardId: string;
  versionNumber: number;
  status: string;
  title: string;
  mission: string;
  goals: string[];
  dailyActions: string[];
  kpis: string[];
  workflow: string[];
  speechTemplates: string[];
  faq: string[];
  effectiveAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
};

export type PositionStandardDetailRecord = {
  id: string;
  positionId: string;
  positionName: string;
  title: string;
  currentVersionId: string | null;
  version: PositionStandardVersionRecord;
  resources: Array<{ knowledgeVersionId: string; title: string }>;
};

export type SavePositionStandardDraftRecord = {
  positionId: string;
  title: string;
  mission: string;
  goals: string[];
  dailyActions: string[];
  kpis: string[];
  workflow: string[];
  speechTemplates: string[];
  faq: string[];
  knowledgeVersionIds: string[];
  effectiveAt: Date | null;
  actorId: string;
  actorName: string;
};

export interface PositionStandardRepository {
  findPosition(id: string): Promise<PositionFact | null>;
  findKnowledgeVersions(ids: string[]): Promise<KnowledgeVersionFact[]>;
  saveDraftAtomic(input: SavePositionStandardDraftRecord): Promise<PositionStandardDetailRecord | null>;
  findVersion(id: string): Promise<PositionStandardVersionRecord | null>;
  publishAtomic(versionId: string, actor: { id: string; name: string }, now: Date): Promise<PositionStandardDetailRecord | null>;
  findCurrentByPosition(positionId: string, now: Date): Promise<PositionStandardDetailRecord | null>;
  listWorkspace(): Promise<PositionStandardDetailRecord[]>;
}

type MemoryInput = {
  positions?: PositionFact[];
  knowledgeVersions?: KnowledgeVersionFact[];
};

export function createMemoryPositionStandardRepository(input: MemoryInput = {}): PositionStandardRepository {
  const positions = new Map((input.positions || []).map((item) => [item.id, item]));
  const knowledge = new Map((input.knowledgeVersions || []).map((item) => [item.id, item]));
  const standards = new Map<string, { id: string; positionId: string; title: string; currentVersionId: string | null }>();
  const versions = new Map<string, PositionStandardVersionRecord>();
  const resources = new Map<string, string[]>();

  const detail = (standard: { id: string; positionId: string; title: string; currentVersionId: string | null }, version: PositionStandardVersionRecord) => ({
    id: standard.id,
    positionId: standard.positionId,
    positionName: positions.get(standard.positionId)?.name || '',
    title: version.title,
    currentVersionId: standard.currentVersionId,
    version,
    resources: (resources.get(version.id) || []).map((id) => ({ knowledgeVersionId: id, title: knowledge.get(id)?.title || '' })),
  });

  return {
    async findPosition(id) { return positions.get(id) || null; },
    async findKnowledgeVersions(ids) { return ids.flatMap((id) => knowledge.get(id) ? [knowledge.get(id)!] : []); },
    async saveDraftAtomic(draft) {
      let standard = [...standards.values()].find((item) => item.positionId === draft.positionId);
      if (!standard) {
        standard = { id: `standard-${standards.size + 1}`, positionId: draft.positionId, title: draft.title, currentVersionId: null };
        standards.set(standard.id, standard);
      } else {
        standard.title = draft.title;
      }
      const versionNumber = Math.max(0, ...[...versions.values()].filter((item) => item.standardId === standard!.id).map((item) => item.versionNumber)) + 1;
      const version: PositionStandardVersionRecord = {
        id: `standard-version-${versions.size + 1}`,
        standardId: standard.id,
        versionNumber,
        status: 'DRAFT',
        title: draft.title,
        mission: draft.mission,
        goals: draft.goals,
        dailyActions: draft.dailyActions,
        kpis: draft.kpis,
        workflow: draft.workflow,
        speechTemplates: draft.speechTemplates,
        faq: draft.faq,
        effectiveAt: draft.effectiveAt,
        publishedAt: null,
        createdAt: new Date(),
      };
      versions.set(version.id, version);
      resources.set(version.id, [...draft.knowledgeVersionIds]);
      return detail(standard, version);
    },
    async findVersion(id) { return versions.get(id) || null; },
    async publishAtomic(versionId, _actor, now) {
      const version = versions.get(versionId);
      if (!version || version.status !== 'DRAFT') return null;
      const standard = standards.get(version.standardId);
      if (!standard) return null;
      [...versions.values()].filter((item) => item.standardId === standard.id && item.status === 'CURRENT').forEach((item) => { item.status = 'RETIRED'; });
      version.status = 'CURRENT';
      version.publishedAt = now;
      standard.currentVersionId = version.id;
      standard.title = version.title;
      return detail(standard, version);
    },
    async findCurrentByPosition(positionId, now) {
      const standard = [...standards.values()].find((item) => item.positionId === positionId);
      if (!standard?.currentVersionId) return null;
      const version = versions.get(standard.currentVersionId);
      if (!version || version.status !== 'CURRENT' || (version.effectiveAt && version.effectiveAt > now)) return null;
      return detail(standard, version);
    },
    async listWorkspace() {
      return [...standards.values()].flatMap((standard) => {
        const candidates = [...versions.values()].filter((item) => item.standardId === standard.id).sort((a, b) => b.versionNumber - a.versionNumber);
        return candidates[0] ? [detail(standard, candidates[0])] : [];
      });
    },
  };
}
