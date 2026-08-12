import assert from "node:assert/strict";
import { createAcademyService, type AcademySopTemplateRecord } from "./academyService";

const now = new Date("2026-08-12T09:00:00.000Z");
let saved: AcademySopTemplateRecord | null = null;
const repository: any = {
  listSopTemplates: async () => saved ? [saved] : [],
  findSopTemplateById: async (id: string) => saved?.id === id ? saved : null,
  saveSopTemplate: async (template: AcademySopTemplateRecord) => (saved = template),
};
const actor: any = { id: "u-1", name: "课程管理员", role: "admin", permissions: ["*"] };
const service = createAcademyService(repository, { now: () => now, resolveScope: async () => ({ unrestricted: true, visibleUserIds: [] }) });

const result = await service.saveSopTemplate({
  name: "线下训练营流程",
  description: "按课程实际需要配置",
  isDefault: true,
  steps: [
    {
      stepKey: "LOCK_TOPIC",
      title: "确认课程主题",
      category: "BEFORE",
      assigneeRole: "PROJECT_OWNER",
      dueAnchor: "STARTS_AT",
      dueOffsetMinutes: -2880,
      completionMode: "CONFIRM",
      requiresReview: false,
      acceptanceCriteria: "主题和目标客户已确认",
    },
    {
      stepKey: "UPLOAD_MATERIAL",
      title: "提交课程资料",
      category: "BEFORE",
      assigneeRole: "CONTENT_OWNER",
      dueAnchor: "STARTS_AT",
      dueOffsetMinutes: -1440,
      completionMode: "ATTACHMENT",
      requiresReview: true,
      acceptanceCriteria: "课件可用于授课",
    },
  ],
}, actor);

assert.equal(result.code, 0);
assert.equal(result.data?.steps.length, 2, "模板步骤数量应由配置决定");
assert.equal(result.data?.steps[0].sortOrder, 1);
assert.equal(result.data?.steps[1].completionMode, "ATTACHMENT");
assert.equal(result.data?.steps[0].requiresReview, false, "每个步骤应独立配置是否验收");
assert.equal((await service.listSopTemplates(actor)).data?.[0].name, "线下训练营流程");

console.log("academy SOP template tests passed");
