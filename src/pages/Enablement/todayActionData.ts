export type EnablementDayStatus = 'done' | 'current' | 'locked';

export type EnablementDay = {
  day: number;
  label: string;
  status: EnablementDayStatus;
};

export type EnablementTask = {
  id: 'course' | 'practice' | 'mentor';
  marker: string;
  title: string;
  meta: string;
  done: boolean;
};

export type EnablementManagementItem = {
  id: string;
  title: string;
  meta: string;
  tone: 'blue' | 'amber' | 'red';
  count: number;
};

export const TODAY_ACTION_DEMO = {
  demo: true,
  dateLabel: '7月11日',
  currentDay: 3,
  completedDays: 2,
  topic: '认识部门、岗位与协作关系',
  duration: '预计35分钟',
  nextStep: '完成课程与练习后进入第4天',
  days: [
    { day: 1, label: '公司认知', status: 'done' },
    { day: 2, label: '产品价值', status: 'done' },
    { day: 3, label: '协作关系', status: 'current' },
    { day: 4, label: '业务闭环', status: 'locked' },
    { day: 5, label: '制度安全', status: 'locked' },
    { day: 6, label: 'OS与AI', status: 'locked' },
    { day: 7, label: '考试实战', status: 'locked' },
  ] satisfies EnablementDay[],
  tasks: [
    { id: 'course', marker: '课', title: '学习《极享部门协作关系》', meta: '20分钟 · 必修', done: false },
    { id: 'practice', marker: '练', title: '完成5道阶段练习', meta: '约10分钟 · 完成课程后解锁', done: false },
    { id: 'mentor', marker: '问', title: '向AI导师提一个工作问题', meta: '基于正式公司知识回答', done: false },
  ] satisfies EnablementTask[],
  managementItems: [
    { id: 'supervisor', title: '新人等待主管确认', meta: '其中1项已逾期', tone: 'red', count: 2 },
    { id: 'review', title: '公司知识等待审核', meta: '来自销售与交付部门', tone: 'blue', count: 2 },
    { id: 'overdue', title: '学习进度需要跟进', meta: '超过计划时间', tone: 'amber', count: 1 },
  ] satisfies EnablementManagementItem[],
} as const;

export const getEnablementHomePresentation = (canManage: boolean) => ({
  showManagementSwitch: canManage,
  managementCount: canManage
    ? TODAY_ACTION_DEMO.managementItems.reduce((sum, item) => sum + item.count, 0)
    : 0,
});
