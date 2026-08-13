import type {
  AcademyMyTask,
  AcademyPublicCalendarItem,
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
    (task) => !["DONE", "SKIPPED"].includes(task.status),
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
    .filter((task) => task.assigneeUserId === currentUserId && !["DONE", "SKIPPED"].includes(task.status))
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
  const done = tasks.filter((task) => task.status === "DONE").length;
  return {
    category,
    label,
    done,
    total: tasks.length,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
});
