import { randomUUID } from 'node:crypto';
import type {
  PositionStandardDetailRecord,
  PositionStandardRepository,
  PositionStandardVersionRecord,
} from './positionStandardRepository';

type Client = {
  $transaction<T>(callback: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' }): Promise<T>;
  position: any;
  knowledgeVersion: any;
  positionStandard: any;
  positionStandardVersion: any;
};

const list = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const asDate = (value: unknown): Date | null => value ? new Date(value as string) : null;

function mapVersion(row: any): PositionStandardVersionRecord {
  return {
    id: row.id,
    standardId: row.standardId,
    versionNumber: row.versionNumber,
    status: row.status,
    title: row.title,
    mission: row.mission,
    goals: list(row.goals),
    dailyActions: list(row.dailyActions),
    kpis: list(row.kpis),
    workflow: list(row.workflow),
    speechTemplates: list(row.speechTemplates),
    faq: list(row.faq),
    effectiveAt: asDate(row.effectiveAt),
    publishedAt: asDate(row.publishedAt),
    createdAt: new Date(row.createdAt),
  };
}

function mapDetail(row: any, selectedVersion?: any): PositionStandardDetailRecord {
  const version = selectedVersion || row.versions?.[0];
  return {
    id: row.id,
    positionId: row.positionId,
    positionName: row.position?.name || '',
    title: version.title || row.title,
    currentVersionId: row.currentVersionId || null,
    version: mapVersion(version),
    resources: (version.resources || []).map((resource: any) => ({
      knowledgeVersionId: resource.knowledgeVersionId,
      title: resource.knowledgeVersion?.document?.title || '',
    })),
  };
}

const include = {
  position: { select: { name: true } },
  versions: {
    orderBy: { versionNumber: 'desc' },
    include: { resources: { include: { knowledgeVersion: { include: { document: { select: { title: true } } } } } } },
  },
};

export function createPrismaPositionStandardRepository(prisma: Client): PositionStandardRepository {
  return {
    async findPosition(id) {
      return prisma.position.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
    },
    async findKnowledgeVersions(ids) {
      if (!ids.length) return [];
      const rows = await prisma.knowledgeVersion.findMany({
        where: { id: { in: ids } },
        include: { document: { select: { title: true } } },
      });
      return rows.map((row: any) => ({
        id: row.id,
        title: row.document?.title || '',
        status: row.status,
        effectiveAt: asDate(row.effectiveAt),
        expiresAt: asDate(row.expiresAt),
      }));
    },
    async saveDraftAtomic(input) {
      try {
        return await prisma.$transaction(async (tx) => {
          let standard = await tx.positionStandard.findUnique({ where: { positionId: input.positionId } });
          if (!standard) {
            standard = await tx.positionStandard.create({
              data: {
                id: `standard-${randomUUID()}`,
                positionId: input.positionId,
                title: input.title,
                createdById: input.actorId,
                createdByName: input.actorName,
              },
            });
          }
          const latest = await tx.positionStandardVersion.findFirst({
            where: { standardId: standard.id },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          const version = await tx.positionStandardVersion.create({
            data: {
              id: `standard-version-${randomUUID()}`,
              standardId: standard.id,
              versionNumber: (latest?.versionNumber || 0) + 1,
              status: 'DRAFT',
              title: input.title,
              mission: input.mission,
              goals: input.goals,
              dailyActions: input.dailyActions,
              kpis: input.kpis,
              workflow: input.workflow,
              speechTemplates: input.speechTemplates,
              faq: input.faq,
              effectiveAt: input.effectiveAt,
              createdById: input.actorId,
              createdByName: input.actorName,
              resources: {
                create: input.knowledgeVersionIds.map((knowledgeVersionId) => ({
                  id: `standard-resource-${randomUUID()}`,
                  knowledgeVersionId,
                })),
              },
            },
            include: { resources: { include: { knowledgeVersion: { include: { document: { select: { title: true } } } } } } },
          });
          const full = await tx.positionStandard.findUnique({ where: { id: standard.id }, include });
          return full ? mapDetail(full, version) : null;
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        if (['P2002', 'P2034'].includes(String((error as any)?.code || ''))) return null;
        throw error;
      }
    },
    async findVersion(id) {
      const row = await prisma.positionStandardVersion.findUnique({ where: { id } });
      return row ? mapVersion(row) : null;
    },
    async publishAtomic(versionId, actor, now) {
      return prisma.$transaction(async (tx) => {
        const version = await tx.positionStandardVersion.findUnique({ where: { id: versionId } });
        if (!version || version.status !== 'DRAFT') return null;
        if (version.effectiveAt && new Date(version.effectiveAt) > now) return null;
        await tx.positionStandardVersion.updateMany({
          where: { standardId: version.standardId, status: 'CURRENT' },
          data: { status: 'RETIRED' },
        });
        await tx.positionStandardVersion.update({
          where: { id: versionId },
          data: { status: 'CURRENT', publishedAt: now, publishedById: actor.id, publishedByName: actor.name },
        });
        const standard = await tx.positionStandard.update({
          where: { id: version.standardId },
          data: { currentVersionId: versionId, title: version.title },
          include,
        });
        const published = standard.versions.find((item: any) => item.id === versionId);
        return published ? mapDetail(standard, published) : null;
      }, { isolationLevel: 'Serializable' });
    },
    async findCurrentByPosition(positionId, now) {
      const row = await prisma.positionStandard.findUnique({ where: { positionId }, include });
      if (!row?.currentVersionId) return null;
      const version = row.versions.find((item: any) => item.id === row.currentVersionId);
      if (!version || version.status !== 'CURRENT' || (version.effectiveAt && new Date(version.effectiveAt) > now)) return null;
      return mapDetail(row, version);
    },
    async listWorkspace() {
      const rows = await prisma.positionStandard.findMany({ include, orderBy: { updatedAt: 'desc' } });
      return rows.flatMap((row: any) => row.versions[0] ? [mapDetail(row, row.versions[0])] : []);
    },
  };
}
