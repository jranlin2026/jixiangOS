# Enablement Today Action Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible-first “今日行动” home to the existing enablement module, with a seven-day journey, demo tasks, AI mentor and enterprise-knowledge entry points, plus a permission-gated management-view switch.

**Architecture:** Keep the slice frontend-only. Put typed, explicitly demo-only content in one data module, render it through a focused `EnablementHome` component, and integrate it as the default enablement tab without changing existing knowledge or publishing APIs. Reuse the current authentication store and permission helpers for the management-view entry.

**Tech Stack:** React 18, TypeScript, MUI 6, React Router search parameters, Node `assert` tests through `tsx`.

## Global Constraints

- The default enablement view is “我的学习”; management data never takes over the employee first screen.
- Only users with `ENABLEMENT_REVIEW` or `ENABLEMENT_PUBLISH` permission see the management-view switch.
- All new learning, task and management numbers are visibly marked `演示数据`.
- Existing enterprise knowledge continues to use the real API and remains reachable from the home.
- Do not add or modify database tables, API routes, AI calls, learning records, or the knowledge publication lifecycle.
- Desktop uses a two-column task area; mobile collapses to one column with no horizontal overflow at 390 px.
- Preserve `.local/` and `.recovery/` and do not stage them.

---

### Task 1: Define the Demo Home Contract

**Files:**
- Create: `src/pages/Enablement/todayActionData.ts`
- Test: `src/pages/Enablement/todayActionData.test.ts`

**Interfaces:**
- Consumes: no production service or store.
- Produces: `EnablementDay`, `EnablementTask`, `EnablementManagementItem`, `TODAY_ACTION_DEMO`, and `getEnablementHomePresentation(canManage: boolean)`.

- [ ] **Step 1: Write the failing executable contract test**

```ts
// src/pages/Enablement/todayActionData.test.ts
import assert from 'node:assert/strict';
import {
  TODAY_ACTION_DEMO,
  getEnablementHomePresentation,
} from './todayActionData';

assert.equal(TODAY_ACTION_DEMO.demo, true);
assert.equal(TODAY_ACTION_DEMO.currentDay, 3);
assert.equal(TODAY_ACTION_DEMO.days.length, 7);
assert.equal(TODAY_ACTION_DEMO.days.filter((day) => day.status === 'done').length, 2);
assert.equal(TODAY_ACTION_DEMO.days.filter((day) => day.status === 'current').length, 1);
assert.equal(TODAY_ACTION_DEMO.tasks.length, 3);
assert.equal(TODAY_ACTION_DEMO.managementItems.length, 3);
assert.equal(getEnablementHomePresentation(false).showManagementSwitch, false);
assert.equal(getEnablementHomePresentation(true).showManagementSwitch, true);
assert.equal(getEnablementHomePresentation(true).managementCount, 5);
```

- [ ] **Step 2: Run the test and verify the missing module fails**

Run:

```bash
pnpm exec tsx src/pages/Enablement/todayActionData.test.ts
```

Expected: exit non-zero with `Cannot find module './todayActionData'`.

- [ ] **Step 3: Create the typed demo contract**

```ts
// src/pages/Enablement/todayActionData.ts
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
```

- [ ] **Step 4: Run the contract test**

Run:

```bash
pnpm exec tsx src/pages/Enablement/todayActionData.test.ts
```

Expected: exit 0 with no assertion output.

- [ ] **Step 5: Commit the contract**

```bash
git add src/pages/Enablement/todayActionData.ts src/pages/Enablement/todayActionData.test.ts
git commit -m "feat: define enablement today action demo"
```

---

### Task 2: Render and Integrate the Today Action Home

**Files:**
- Create: `src/pages/Enablement/EnablementHome.tsx`
- Modify: `src/pages/Enablement/index.tsx`
- Modify: `src/api/enablementModuleStatic.test.ts`

**Interfaces:**
- Consumes: `TODAY_ACTION_DEMO`, `getEnablementHomePresentation`, `hasPermission`, `PERMISSION_KEYS`, and `useSearchParams`.
- Produces: `EnablementHome({ canManage, onOpenKnowledge })`, the default `home` enablement tab, and `view=learning|management` URL state.

- [ ] **Step 1: Extend the static test before implementation**

Append to `src/api/enablementModuleStatic.test.ts`:

```ts
const home = readFileSync(join(process.cwd(), 'src/pages/Enablement/EnablementHome.tsx'), 'utf8');
const todayActionData = readFileSync(join(process.cwd(), 'src/pages/Enablement/todayActionData.ts'), 'utf8');

assert.match(page, /value:\s*'home',\s*label:\s*'今日行动'/);
assert.match(page, /activeTab === 'home'/);
assert.match(home, /演示数据/);
assert.match(home, /继续今天的学习/);
assert.match(home, /7天上岗地图/);
assert.match(home, /今天的任务/);
assert.match(home, /AI导师/);
assert.match(home, /管理视角/);
assert.match(home, /onOpenKnowledge/);
assert.match(todayActionData, /currentDay:\s*3/);
assert.doesNotMatch(`${home}\n${todayActionData}`, /fetch\(|backendRequest|localStorage|AppStorage|BusinessRecord/);
```

- [ ] **Step 2: Run the static test and verify the missing component fails**

Run:

```bash
pnpm exec tsx src/api/enablementModuleStatic.test.ts
```

Expected: exit non-zero because `EnablementHome.tsx` does not exist.

- [ ] **Step 3: Create `EnablementHome.tsx`**

Implement one focused component with these exact public props and state:

```tsx
type EnablementHomeProps = {
  canManage: boolean;
  canOpenKnowledge: boolean;
  onOpenKnowledge: () => void;
};

const EnablementHome: React.FC<EnablementHomeProps> = ({ canManage, canOpenKnowledge, onOpenKnowledge }) => {
  const [view, setView] = useState<'learning' | 'management'>('learning');
  const presentation = getEnablementHomePresentation(canManage);
  const data = TODAY_ACTION_DEMO;
};
```

The returned MUI hierarchy must be complete and ordered as follows:

1. A responsive header with `data.dateLabel · 我的赋能工作台`, `早上好，今天继续成长`, a visible warning-tone `演示数据` chip, and the permission-gated exclusive toggle.
2. When `view === 'management'`, render the module-scope `ManagementDemo` with all `data.managementItems`, a total of five actions, red/amber/blue status cues, and a button that returns to `learning`.
3. Otherwise render a blue-gradient focus `Paper` containing `第${data.currentDay}天`, the topic, duration, next step, and a real `继续今天的学习` button. Clicking the demo button toggles an inline `Alert` that says `演示完成：正式学习记录将在后续接入。`; it must not call an API.
4. Render a white `Paper` titled `7天上岗地图`; map all seven days and style `done` green, `current` blue, and `locked` gray. Each cell shows the day number and short label.
5. Render a responsive CSS grid with `gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.3fr) minmax(280px, .7fr)' }`. The left `Paper` is titled `今天的任务` and maps all three tasks. The right stack contains a dark `AI导师` card with the sample question `销售与交付应该怎么交接？` and, only when `canOpenKnowledge`, an outlined `查找企业知识` button wired to `onOpenKnowledge`.

Keep `ManagementDemo` at module scope. Use `moduleTokens`; use one blue gradient only on the focus card; set every grid child to `minWidth: 0`; use `{ xs: 2, md: 2.5 }` padding; and use visible keyboard focus styles on clickable cards and buttons.

- [ ] **Step 4: Integrate the default home tab in `index.tsx`**

Change the tab union and tab construction to:

```tsx
type EnablementTab = 'home' | 'knowledge' | 'publishing';

const canReadKnowledge = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE);
const canManage = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_REVIEW)
  || hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_PUBLISH);

const tabs: Array<{ value: EnablementTab; label: string }> = [
  { value: 'home', label: '今日行动' },
  ...(canReadKnowledge ? [{ value: 'knowledge' as const, label: '企业知识' }] : []),
  ...(canManage ? [{ value: 'publishing' as const, label: '发布管理' }] : []),
];
```

Parse only known tabs, default to `home`, and render:

```tsx
{activeTab === 'home' ? (
  <EnablementHome
    canManage={canManage}
    canOpenKnowledge={canReadKnowledge}
    onOpenKnowledge={() => setSearchParams({ tab: 'knowledge' })}
  />
) : activeTab === 'knowledge' ? (
  <KnowledgeCenter />
) : (
  <PublishingCenter />
)}
```

When `canReadKnowledge` is false, the component hides the knowledge button. Do not navigate an unauthorized user to a hidden tab.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec tsx src/pages/Enablement/todayActionData.test.ts
pnpm exec tsx src/api/enablementModuleStatic.test.ts
pnpm exec tsx src/api/enablementPermissionModel.test.ts
```

Expected: all three commands exit 0.

- [ ] **Step 6: Build and browser-verify the visible slice**

Run:

```bash
pnpm build
```

Expected: TypeScript and Vite build exit 0.

Start the existing local services and verify in the browser:

1. `/enablement` defaults to “今日行动”.
2. Admin sees “我的学习/管理视角” and can switch both ways.
3. “查找企业知识” opens the existing real knowledge list.
4. “演示数据” is visible.
5. At 390 × 844, seven days and task content do not create horizontal overflow.
6. Existing knowledge and publishing tabs still load without console errors.

- [ ] **Step 7: Commit the visible slice**

```bash
git add src/pages/Enablement/EnablementHome.tsx src/pages/Enablement/index.tsx src/pages/Enablement/todayActionData.ts src/pages/Enablement/todayActionData.test.ts src/api/enablementModuleStatic.test.ts
git commit -m "feat: add enablement today action home"
```

## Completion Gate

- [ ] The home is the default enablement view.
- [ ] The visible hierarchy matches the approved visual design.
- [ ] Demo data is explicit and makes no backend writes.
- [ ] The management switch is permission-gated.
- [ ] Existing enterprise knowledge and publishing behavior remain unchanged.
- [ ] Focused tests and production build pass.
- [ ] Desktop and 390 px mobile browser checks pass.
