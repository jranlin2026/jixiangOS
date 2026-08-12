import type {
  AcademySessionDetail,
  AcademySessionTask,
} from "../../types/academy";

export interface AcademyPrivateAccess {
  plan: boolean;
  course: boolean;
  session: boolean;
  engagement: boolean;
  review: boolean;
}

export const getAcademyPrivateLoadPlan = (access: AcademyPrivateAccess) => ({
  dashboard: Object.values(access).some(Boolean),
  courses: access.course || access.plan || access.session,
  sessions: access.plan || access.session || access.engagement || access.review,
  categories: access.course,
});

export const taskRequiresEvidence = (templateKey: string) => [
  "COURSE_DEVELOPMENT",
  "COURSE_PACKAGING",
  "CONTENT",
  "ASSETS",
].includes(templateKey);

export interface AcademyTaskStep {
  order: number;
  timeLabel: string;
  label: string;
}

const fixedSteps: Record<string, AcademyTaskStep> = {
  COURSE_CONFIRMATION: { order: 0, timeLabel: "T-5", label: "课程确定" },
  COURSE_DEVELOPMENT: { order: 1, timeLabel: "T-4", label: "课程研发" },
  COURSE_PACKAGING: { order: 2, timeLabel: "T-3", label: "课程包装" },
  CUSTOMER_INVITATION: { order: 3, timeLabel: "T-2", label: "客户邀约" },
  PRECLASS_GATE: { order: 4, timeLabel: "T-1", label: "开课关卡" },
  COURSE_DELIVERY: { order: 5, timeLabel: "T日", label: "课程执行" },
  CUSTOMER_SEGMENTATION: { order: 6, timeLabel: "T+0.5小时", label: "客户分层" },
  DEAL_FOLLOW_UP: { order: 7, timeLabel: "T+1", label: "成交跟进" },
  COURSE_REVIEW: { order: 8, timeLabel: "T+3", label: "复盘优化" },
};

const legacySteps: Record<string, AcademyTaskStep> = {
  PLANNING: fixedSteps.COURSE_CONFIRMATION,
  CONTENT: fixedSteps.COURSE_DEVELOPMENT,
  ASSETS: fixedSteps.COURSE_PACKAGING,
  INVITATION: fixedSteps.CUSTOMER_INVITATION,
  PRECHECK: fixedSteps.PRECLASS_GATE,
  DELIVERY: fixedSteps.COURSE_DELIVERY,
  SEGMENTATION: fixedSteps.CUSTOMER_SEGMENTATION,
  FOLLOW_UP: fixedSteps.DEAL_FOLLOW_UP,
  REVIEW: fixedSteps.COURSE_REVIEW,
};

export const getAcademyTaskStep = (templateKey: string): AcademyTaskStep =>
  fixedSteps[templateKey] || legacySteps[templateKey] || {
    order: 99,
    timeLabel: "其他",
    label: "其他任务",
  };

export const sortAcademyTasks = (tasks: AcademySessionTask[]) =>
  [...tasks].sort((left, right) => {
    const byStep = getAcademyTaskStep(left.templateKey).order
      - getAcademyTaskStep(right.templateKey).order;
    if (byStep) return byStep;
    return +(new Date(left.dueAt || 0)) - +(new Date(right.dueAt || 0));
  });

export const getSessionNextStep = (
  detail: AcademySessionDetail,
  now = new Date(),
) => {
  const pending = sortAcademyTasks(detail.tasks).filter(
    (task) => !["DONE", "SKIPPED"].includes(task.status),
  );
  const overdue = pending
    .filter((task) => task.dueAt && new Date(task.dueAt) < now)
    .sort((left, right) => +(new Date(left.dueAt || 0)) - +(new Date(right.dueAt || 0)));
  const task = overdue[0] || pending
    .sort((left, right) => +(new Date(left.dueAt || 0)) - +(new Date(right.dueAt || 0)))[0];
  return task ? { task, step: getAcademyTaskStep(task.templateKey) } : null;
};

export const getMyAcademyTodos = (
  details: AcademySessionDetail[],
  currentUserId: string,
) => details
  .flatMap((detail) => detail.tasks
    .filter((task) => task.assigneeUserId === currentUserId && !["DONE", "SKIPPED"].includes(task.status))
    .map((task) => ({ detail, task, step: getAcademyTaskStep(task.templateKey) })))
  .sort((left, right) => +(new Date(left.task.dueAt || 0)) - +(new Date(right.task.dueAt || 0)));
