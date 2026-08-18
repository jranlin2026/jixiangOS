import type {
  AcademyMyTask,
  AcademyPublicCalendarItem,
  AcademySessionDetail,
  AcademySessionTask,
  AcademySopTemplateStep,
} from "../../types/academy";

export const normalizeAcademySopStages = (
  input: AcademySopTemplateStep[],
): AcademySopTemplateStep[] => {
  const stageOrders = new Map<string, number>();
  let nextStageOrder = 0;
  return input.map((step, index) => {
    const stageKey = step.stageKey || step.stepKey;
    if (!stageOrders.has(stageKey)) stageOrders.set(stageKey, ++nextStageOrder);
    return {
      ...step,
      stageKey,
      stageName: step.stageName || step.title || `环节 ${stageOrders.get(stageKey)}`,
      stageOrder: stageOrders.get(stageKey)!,
      sortOrder: index + 1,
    };
  });
};

export const moveAcademySopStage = (
  input: AcademySopTemplateStep[],
  stageKey: string,
  direction: -1 | 1,
) => {
  const stageKeys = [...new Set(input.map((step) => step.stageKey || step.stepKey))];
  const currentCategory = input.find((step) => (step.stageKey || step.stepKey) === stageKey)?.category;
  const categoryStageKeys = stageKeys.filter((key) => input.find((step) => (step.stageKey || step.stepKey) === key)?.category === currentCategory);
  const categoryIndex = categoryStageKeys.indexOf(stageKey);
  const categoryTarget = categoryIndex + direction;
  if (categoryIndex < 0 || categoryTarget < 0 || categoryTarget >= categoryStageKeys.length) return normalizeAcademySopStages(input);
  const targetStageKey = categoryStageKeys[categoryTarget];
  const index = stageKeys.indexOf(stageKey);
  const target = stageKeys.indexOf(targetStageKey);
  [stageKeys[index], stageKeys[target]] = [stageKeys[target], stageKeys[index]];
  const byStage = new Map(stageKeys.map((key) => [key, input.filter((step) => (step.stageKey || step.stepKey) === key)]));
  return normalizeAcademySopStages(stageKeys.flatMap((key) => byStage.get(key) || []));
};

export const splitAcademySopTaskToStage = (
  input: AcademySopTemplateStep[],
  taskIndex: number,
  stageKey: string,
  stageName: string,
) => {
  const selected = input[taskIndex];
  if (!selected) return normalizeAcademySopStages(input);
  const originalStageKey = selected.stageKey || selected.stepKey;
  const remaining = input.filter((_, index) => index !== taskIndex);
  const lastOriginalIndex = remaining.reduce(
    (last, step, index) => (step.stageKey || step.stepKey) === originalStageKey ? index : last,
    -1,
  );
  const nextTask = { ...selected, stageKey, stageName };
  remaining.splice(lastOriginalIndex + 1, 0, nextTask);
  return normalizeAcademySopStages(remaining);
};

export const changeAcademySopStageCategory = (
  input: AcademySopTemplateStep[],
  stageKey: string,
  category: AcademySopTemplateStep["category"],
) => {
  const categoryRank: Record<AcademySopTemplateStep["category"], number> = { BEFORE: 0, DURING: 1, AFTER: 2 };
  const stageKeys = [...new Set(input.map((step) => step.stageKey || step.stepKey))];
  const byStage = new Map(stageKeys.map((key) => [key, input
    .filter((step) => (step.stageKey || step.stepKey) === key)
    .map((step) => key === stageKey ? { ...step, category } : step)]));
  const orderedKeys = stageKeys
    .map((key, index) => ({ key, index, category: byStage.get(key)?.[0]?.category || "BEFORE" }))
    .sort((left, right) => categoryRank[left.category] - categoryRank[right.category] || left.index - right.index)
    .map((item) => item.key);
  return normalizeAcademySopStages(orderedKeys.flatMap((key) => byStage.get(key) || []));
};

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
  templates: access.course || access.plan || access.session,
});

export const taskRequiresEvidence = (task: Pick<AcademySessionTask, "templateKey" | "completionMode"> | string) => {
  if (typeof task !== "string") return task.completionMode === "ATTACHMENT";
  return ["COURSE_DEVELOPMENT", "COURSE_PACKAGING", "CONTENT", "ASSETS"].includes(task);
};

export interface AcademyTaskStep {
  order: number;
  timeLabel: string;
  label: string;
}

export const getAcademyTaskStep = (templateKey: string): AcademyTaskStep =>
  ({ order: 99, timeLabel: "未排序", label: templateKey || "任务" });

export const sortAcademyTasks = (tasks: AcademySessionTask[]) =>
  [...tasks].sort((left, right) => {
    const configuredOrder = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
    if (configuredOrder) return configuredOrder;
    return +(new Date(left.dueAt || 0)) - +(new Date(right.dueAt || 0));
  });

export const getSessionNextStep = (
  detail: AcademySessionDetail,
  now = new Date(),
) => {
  const pending = sortAcademyTasks(detail.tasks).filter(
    (task) => task.isUnlocked !== false && !["DONE", "SKIPPED"].includes(task.status),
  );
  const overdue = pending
    .filter((task) => task.dueAt && new Date(task.dueAt) < now)
    .sort((left, right) => +(new Date(left.dueAt || 0)) - +(new Date(right.dueAt || 0)));
  const task = overdue[0] || pending
    .sort((left, right) => +(new Date(left.dueAt || 0)) - +(new Date(right.dueAt || 0)))[0];
  return task ? { task, step: { order: Number(task.sortOrder || 99), timeLabel: task.sortOrder ? `第${task.sortOrder}步` : "未排序", label: task.title } } : null;
};

export const getMyAcademyTodos = (
  details: AcademySessionDetail[],
  currentUserId: string,
) => details
  .flatMap((detail) => detail.tasks
    .filter((task) => task.assigneeUserId === currentUserId && task.isUnlocked !== false && !["DONE", "SKIPPED"].includes(task.status))
    .map((task) => ({ detail, task, step: { order: Number(task.sortOrder || 99), timeLabel: task.sortOrder ? `第${task.sortOrder}步` : "未排序", label: task.title } })))
  .sort((left, right) => +(new Date(left.task.dueAt || 0)) - +(new Date(right.task.dueAt || 0)));

const actionableTaskStatuses = new Set(["PENDING", "IN_PROGRESS", "REJECTED", "BLOCKED"]);

export const getAcademyPriorityTask = (
  tasks: AcademyMyTask[],
  now = new Date(),
) => [...tasks]
  .filter((task) => actionableTaskStatuses.has(task.status))
  .sort((left, right) => {
    const priority = (task: AcademyMyTask) => {
      if (["REJECTED", "BLOCKED"].includes(task.status)) return 0;
      if (task.dueAt && new Date(task.dueAt) < now) return 1;
      return 2;
    };
    return priority(left) - priority(right) || +(new Date(left.dueAt || 8640000000000000)) - +(new Date(right.dueAt || 8640000000000000));
  })[0] || null;

export const getAcademyWorkbenchSummary = ({
  openTaskTotal,
  reviewTaskTotal,
  sessions,
  now = new Date(),
}: {
  openTaskTotal: number;
  reviewTaskTotal: number;
  sessions: Array<Pick<AcademyPublicCalendarItem, "startsAt" | "status">>;
  now?: Date;
}) => ({
  openTaskTotal,
  reviewTaskTotal,
  todayCourseTotal: sessions.filter(
    (session) => new Date(session.startsAt).toDateString() === now.toDateString(),
  ).length,
  activeCourseTotal: sessions.filter((session) => session.status === "IN_PROGRESS").length,
});

export const getCoursePhaseProgress = (
  course: Pick<AcademyPublicCalendarItem, "tasks">,
) => ([
  ["BEFORE", "课前准备"],
  ["DURING", "课程执行"],
  ["AFTER", "课后跟进"],
] as const).map(([category, label]) => {
  const tasks = course.tasks.filter((task) => task.category === category);
  const requiredTasks = tasks.filter((task) => task.isRequired);
  const progressTasks = requiredTasks.length ? requiredTasks : tasks;
  const done = progressTasks.filter((task) => task.status === "DONE").length;
  return {
    category,
    label,
    done,
    total: progressTasks.length,
    percent: progressTasks.length ? Math.round((done / progressTasks.length) * 100) : 0,
  };
});

export interface AcademyCourseStageProgress {
  key: string;
  name: string;
  order: number;
  category: "BEFORE" | "DURING" | "AFTER";
  isUnlocked: boolean;
  done: number;
  total: number;
  requiredDone: number;
  requiredTotal: number;
  tasks: AcademyPublicCalendarItem["tasks"];
}

export const getCourseStageProgress = (
  course: Pick<AcademyPublicCalendarItem, "tasks">,
): AcademyCourseStageProgress[] => {
  const stages = new Map<string, AcademyCourseStageProgress>();
  course.tasks.forEach((task, index) => {
    const key = task.stageKey || task.templateKey || `${task.category}-${task.stepNumber || index + 1}`;
    const existing = stages.get(key);
    if (existing) {
      existing.tasks.push(task);
      existing.total += 1;
      existing.done += task.status === "DONE" ? 1 : 0;
      if (task.isRequired) {
        existing.requiredTotal += 1;
        existing.requiredDone += task.status === "DONE" ? 1 : 0;
      }
      existing.isUnlocked = existing.isUnlocked || task.isUnlocked !== false;
      return;
    }
    stages.set(key, {
      key,
      name: task.stageName || task.title,
      order: Number(task.stageOrder || task.stepNumber || index + 1),
      category: task.category,
      isUnlocked: task.isUnlocked !== false,
      done: task.status === "DONE" ? 1 : 0,
      total: 1,
      requiredDone: task.isRequired && task.status === "DONE" ? 1 : 0,
      requiredTotal: task.isRequired ? 1 : 0,
      tasks: [task],
    });
  });
  return [...stages.values()].sort((left, right) => left.order - right.order);
};
