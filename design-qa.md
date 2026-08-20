# Design QA: 订单与售后截图预览

- Source visual truth: `C:\Users\jranl\AppData\Local\Temp\codex-clipboard-38826e5d-7e4b-49b2-9265-58e7cda4e5a1.png`
- Implementation screenshots:
  - `C:\Users\jranl\AppData\Local\Temp\jixiangos-order-table-links.png`
  - `C:\Users\jranl\AppData\Local\Temp\jixiangos-order-payment-preview.png`
  - `C:\Users\jranl\AppData\Local\Temp\jixiangos-order-deal-preview.png`
- Viewport: 1280 x 720
- State: 订单审核详情已打开，付款记录包含付款截图和成交路径截图。

## Full-view comparison evidence

源界面将成交路径大图固定放在付款表格下方，付款截图在表格中只显示文件名，造成两类截图的查看能力不对称。修改后两列均在表格内显示带可见性图标的文件名链接，底部重复图片区已移除，弹窗整体高度明显缩短，审核操作按钮保持可见。

## Focused comparison evidence

- Typography: 沿用现有 MUI `body2` 与弹窗标题层级，文件名过长时单行截断。
- Spacing and layout: 表格列宽和密度保持不变；大图进入独立宽弹窗，不再挤压审核详情。
- Colors and tokens: 链接使用现有 MUI primary 颜色，预览背景使用项目已有的浅灰蓝中性色。
- Image quality: 付款截图和成交路径截图均使用原始 `preview` 数据，`object-fit: contain` 保持完整比例，无裁切。
- Copy: 保留“付款截图”、“成交路径截图”、“收款凭证”和“聊天记录截图”的业务用语。

## Findings and comparison history

- Earlier P1: 付款截图无可点击入口，成交路径截图只能在详情底部查看。
  - Fix: 新增共用 `AttachmentPreviewLink` 和 `AttachmentPreviewDialog`，将两类截图入口放入表格单元格。
  - Post-fix evidence: 浏览器实际点击后，两个预览弹窗均包含一张可见原图。
- Earlier P2: 固定底部大图导致审核详情过长，主要操作需要更多滚动。
  - Fix: 移除重复的底部成交路径图片区。
  - Post-fix evidence: 付款记录与审核按钮可在同一视口内查看。

## Interaction and console checks

- 订单审核 -> 打开申请 -> 点击付款截图 -> 付款原图弹窗：passed
- 关闭付款预览 -> 点击成交路径截图 -> 成交路径原图弹窗：passed
- 售后挽回审核详情：当前本地 3 条数据均未附带截图，无法用真实附件执行点击；共用预览组件接线和回归检查已通过。
- Console: 无与本功能相关的 error/warn；仅有现存 React Router v7 future flag 警告。

## Remaining risk

售后挽回的真实截图点击验收需要一条已上传凭证的本地测试数据；不影响订单审核已完成的交互验收。

final result: passed

---

# 模块工作台统一 Design QA（2026-08-21）

## 对比目标

- Source visual truth：用户标注的财务中心问题截图，以及已确认的系统设置连续工作台样式。
- Implementation states：`/tmp/jixiangos-module-workspace/01-finance.png`、`02-settings.png`、`03-orders.png`、`04-customers.png`、`05-leads.png`、`07-refund-center.png`、`08-customer-merge.png`。
- Full-view comparison：`/tmp/jixiangos-module-workspace/09-settings-vs-finance.png`。
- Focused comparison：`/tmp/jixiangos-module-workspace/10-header-tabs-focus.png`。
- Responsive state：`/tmp/jixiangos-module-workspace/06-finance-narrow.png`，820 × 780 pixels。

## Required fidelity surfaces

- Fonts and typography：模块标题、说明文字、页签字重和选中态统一复用 `ModuleHeader` 与 `ModuleTabs`，没有引入新的字体或不一致字号。
- Spacing and layout rhythm：标题、操作区、一级页签和内容归入同一白色工作台；页签横向铺满容器，底部分隔线连续，不再出现标题与正文悬浮分离。
- Colors and visual tokens：工作台底色、边线、阴影、主色和弱文字全部复用模块令牌；紫色仅用于选中态和主要操作。
- Image quality and asset fidelity：本次没有新增图片资产；现有品牌 Logo 与图标保持清晰。
- Copy and content：各模块原有标题、说明、页签、筛选、表格与分页语义保持不变，仅统一容器关系和视觉层级。

## Findings and comparison history

1. Earlier P2：财务中心等模块的标题、页签和正文分别落在页面底色上，视觉上像三块互不关联的区域。
   - Fix：由 `ModulePage` 提供统一白色工作台，`ModuleHeader` 和 `ModuleTabs` 在容器内连续排布，页签分隔线铺满工作台宽度。
   - Post-fix evidence：系统设置与财务中心全景对照中，两侧均呈现完整连续的模块工作区。
2. Earlier P2：退款中心和重复客户治理绕过共享模块壳层，后续会继续产生页面风格漂移。
   - Fix：两个特殊页面迁移至共享 `ModulePage`、`ModuleHeader`、`ModuleTabs`；嵌入模式仍保留原业务容器行为。
   - Post-fix evidence：独立路由下标题、操作、页签和内容已与订单、财务、客户模块一致。

## Interaction, responsive, and console checks

- 财务、订单、客户、线索、系统设置、退款中心、重复客户治理均完成浏览器实页检查。
- 820 × 780 窄屏下操作区自动换行，页签保持连续，页面无整页横向溢出。
- 客户与线索表格继续保留固定表头、横向表格滚动和统一分页区，正文未覆盖页头文案。
- 浏览器控制台无本次修改引入的 error；静态契约测试和生产构建通过。

No remaining P0, P1, or P2 visual findings.

final result: passed

---

# 全局页签与应用框架 Design QA（2026-08-20）

## 对比目标

- 页签来源：`codex-clipboard-7dd81396-decf-44f0-94af-0715f0b78326.png`
- 旧模块问题参考：`codex-clipboard-e5b2fe57-0700-4c01-a293-1fdb5a714d88.png`
- 顶部栏与侧边栏来源：`codex-clipboard-9cbb2270-d4bb-4ca0-8c17-f973e27035f6.png`
- 实现页面：`/settings?group=organization`、`/finance?tab=recovery-settlement`
- 桌面验收：1280 × 800，device scale factor 1；窄屏验收：820 × 780，device scale factor 1。
- 对比证据：`/tmp/jixiangos-settings-tabs-comparison.png`、`/tmp/jixiangos-shell-comparison.png`

## 最终核对

- 字体与层级：通过。活动页签使用品牌紫和 800 字重，非活动页签与导航使用柔和灰紫，标题、说明、导航层级清楚。
- 间距与布局：通过。主 Tab 统一为 52px 高度、稳定横向间距、4px 短下划线和完整分隔线；双层 Tab 仍保持清晰层级。820px 下页签和内容不被顶部栏遮挡。
- 色彩与令牌：通过。顶部栏、侧边栏、选中态和 hover 统一复用浅紫白表面、灰紫文字、品牌紫与柔和边框/阴影。
- 图片与图标：通过。继续使用用户提供的极享OS Logo 和现有 MUI 图标库，没有用临时图形替换品牌资产。
- 文案与业务内容：通过。参考图只作为视觉来源；未复制无关功能，现有菜单、权限、业务按钮和模块文案均保留。
- 交互：通过。财务中心“提成发放”点击后 URL 更新为 `?tab=disbursement`，选中态与内容同步切换。
- 控制台：通过。无应用错误；仅存在 React Router v7 未来版本提示，不影响当前交互。

## 可接受差异

- 参考图三的语言、客户端、小程序和创作按钮不属于当前极享OS功能，本次只复用其表面色、字体层级、边框与阴影语言。
- 极享OS侧边栏保留分组折叠、权限过滤和企业版状态卡，避免为了视觉相似破坏现有信息架构。

final result: passed

---

# 可调列宽表格吸顶表头修复 Design QA（2026-08-20）

## 验收对象

- Source visual truth：`browser:Selected browser region / Comment 1`（用户标注的客户列表表头错位区域，1280 px 宽）。
- Customer implementation：`/tmp/jixiangos-customers-sticky-header-fixed.jpg`，1280 × 720，device scale factor 1。
- Lead implementation：`/tmp/jixiangos-leads-sticky-header-fixed.jpg`，1280 × 720，device scale factor 1。
- State：桌面端表格同时横向与纵向滚动；表头、左侧选择列和右侧操作列处于吸顶/冻结状态。
- Normalization：源图与实现按相同 1280 px 页面宽度、相同桌面断点和表格滚动状态对照；焦点对比仅判断表头与首行交界区，不使用整页高度差异做视觉结论。

## Findings and comparison history

1. Initial P1：可调列宽普通表头被 `ResizableHeaderCell` 的 `position: relative` 覆盖，纵向滚动后离开吸顶位置；选择列和操作列仍吸顶，造成表头断层、头像穿入表头。
2. Evidence before fix：客户表格 `scrollTop=90`、`scrollLeft=420` 时，普通表头为 `position: relative`、`y=194`，选择/操作表头为 `position: sticky`、`y=284`。
3. Fix：通用可调列宽表头在 `.MuiTableCell-stickyHeader` 状态下显式恢复 `position: sticky; top: 0; z-index: 2`，同时保留普通表格的列宽拖拽定位容器。
4. Post-fix customer evidence：同样滚动量下 10 个表头全部为 `position: sticky`且 `y=284`，选择列、普通表头、操作列同一高度。
5. Post-fix lead evidence：`scrollTop=80`、`scrollLeft=258` 时 9 个表头全部为 `position: sticky`且 `y=280`。
6. Scope audit：代码扫描确认同时使用 `ResizableHeaderCell` 和 `stickyHeader` 的业务页只有客户列表与线索列表；修复位于通用组件，后续新增同类表格自动获得正确行为。导入对话框等其他 `stickyHeader` 表格不使用该可调列宽组件，未受此缺陷影响。

## Required fidelity surfaces

- Fonts and typography：表头文字字体、字重、行高和截断策略未改变；滚动后文字不再消失。
- Spacing and layout rhythm：表头、选择列、操作列保持同一 y 轴和原有列宽；分页仍固定在工作区底部。
- Colors and visual tokens：继续使用原有表头底色、分隔线和语义状态色，没有新增视觉语言。
- Image quality and asset fidelity：本次不涉及新图像资产；客户头像清晰度和裁切未改变，且不再穿透表头。
- Copy and content：所有表头、数据、操作与分页文案未改动。
- Accessibility and interactions：列宽拖拽手柄仍保留 `role="separator"` 和 aria label；横纵滚动、冻结列和分页交互正常。

## Verification

- Browser page identity / meaningful DOM / framework overlay：passed。
- Customer horizontal + vertical scroll assertion：passed。
- Lead horizontal + vertical scroll assertion：passed。
- Console：无应用错误；仅有已知 React Router v7 future-flag warnings。
- `npx tsx src/shared/components/ResizableTable.test.ts`：passed。
- `npx tsc -b --pretty false`：passed。
- `npm run build`：passed；仅保留既有 chunk-size warning。

final result: passed

---

# 全局导航、系统设置与列表滚动 Design QA（2026-08-20）

## Source and implementation

- Source visual truth: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-381f8f8c-02eb-4226-a592-95ed961e6fcb.png`
- Settings source truth: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-625ee5eb-2c8d-417b-bd20-5ae3573648f5.png`
- List implementation: `.codex_tmp/ui-audit-20260820/03-leads-workspace-final.png`
- Settings implementation: `.codex_tmp/ui-audit-20260820/04-settings-navigation-final.png`
- Side-by-side list comparison: `.codex_tmp/ui-audit-20260820/06-list-source-vs-final.png`
- Side-by-side settings comparison: `.codex_tmp/ui-audit-20260820/07-settings-source-vs-final.png`
- Source list pixels: 3414 × 1772, normalized from the supplied high-density capture to a 1718 × 896 CSS-scale reference.
- List implementation: 1720 × 900 pixels and CSS viewport, DPR 1.
- Settings source crop: 598 × 958 pixels; settings implementation: 1280 × 720 pixels. The settings comparison focuses on navigation hierarchy rather than equal full-page framing.
- State: authenticated super administrator; lead list first page; product settings group selected.

## Full-view comparison evidence

- The desktop shell keeps one opaque 64px global header. Page title and action copy no longer pass underneath or remain visible through the header.
- The global header now owns search, help, notifications and the only desktop account menu; `下载浏览器员工` remains a contextual lead-page action.
- The desktop sidebar no longer repeats the user avatar, name, notification, password and logout controls. The enterprise state is reduced to one compact row.
- The list page keeps the module title and page actions above a fixed-height data workspace. Filters and pagination stay outside the independently scrolling table body.
- `系统设置` is restored as its own expandable navigation group with seven visible entries, matching the supplied hierarchy.

## Focused comparison evidence

- Typography: existing system font stack, weights and purple hierarchy are preserved; no new wrapping or truncation is visible in the header or setting labels.
- Spacing/layout: the 64px header, compact enterprise row, fixed list card, and restored setting group reduce redundant vertical space while preserving the supplied page density.
- Colors/tokens: all new surfaces reuse the existing purple, ink, muted, line and subtle tokens; the header is intentionally opaque white to eliminate text ghosting.
- Image quality: the supplied official purple logo remains unchanged and renders sharply; no placeholder or code-drawn image assets were introduced.
- Copy/content: all seven setting labels and existing page-specific actions remain intact. Account menu exposes `修改密码` and `退出登录`.

## Findings and comparison history

- Earlier P1: the semi-transparent sticky header covered page title and action copy during scrolling.
  - Fix: the app shell now separates the fixed header from the scroll outlet, uses an opaque header, and gives list pages an internal table scroll area.
  - Post-fix evidence: table scrollTop reaches 29.5 while the page remains at scrollY 0 and `线索管理` remains at y=88.
- Earlier P1: six system-setting groups were unreachable because the sidebar had one merged entry and the settings page had no group switcher.
  - Fix: restored seven sidebar entries with deep links and added a permission-filtered in-page group tablist.
  - Post-fix evidence: all seven group tabs render; clicking `客户设置` changes the URL to `?group=leadCustomer` and marks the tab selected.
- Earlier P2: desktop account and notification controls appeared in both the global header and sidebar footer.
  - Fix: desktop sidebar account controls were removed; the header has one account menu. The mobile drawer retains its compact account controls.
  - Post-fix evidence: desktop DOM contains one visible `打开账号菜单`, and the header contains no global `下载浏览器员工` label.

No remaining P0, P1, or P2 visual findings.

## Interaction and console checks

- System setting group deep links and selected state: passed.
- Header account menu -> 修改密码 / 退出登录 entries: passed.
- Table body independent scroll while title remains stationary: passed.
- Lead and settings console errors: none.
- Targeted navigation and app-shell tests: passed.
- TypeScript project build: passed.

## Follow-up polish

- P3: the settings page intentionally exposes the seven groups both in the desktop sidebar and in a compact page tablist. This duplicate is retained as a mobile/deep-link fallback and can later collapse to a select menu below the medium breakpoint if more setting groups are added.

final result: passed

---

# 极享OS 2.0 线索、订单与财务中心 Design QA

## 视觉依据与验证环境

- Source visual truth：`/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-d56f7ebc-2ead-4d3f-adb9-e8d66ad71ea9.png`
- 线索桌面实现：`.codex_tmp/design-qa-20260820/leads-desktop-final.png`
- 线索移动实现：`.codex_tmp/design-qa-20260820/leads-mobile-final.png`
- 订单桌面实现：`.codex_tmp/design-qa-20260820/orders-desktop-final.png`
- 订单移动实现：`.codex_tmp/design-qa-20260820/orders-mobile-final.png`
- 财务流水桌面实现：`.codex_tmp/design-qa-20260820/finance-flow-desktop-final.png`
- 财务流水移动实现：`.codex_tmp/design-qa-20260820/finance-flow-mobile-final.png`
- 订单分账实现：`.codex_tmp/design-qa-20260820/finance-settlement-desktop-final.png`
- 同屏对照：`.codex_tmp/design-qa-20260820/leads-comparison-final.png`、`.codex_tmp/design-qa-20260820/orders-comparison-final.png`、`.codex_tmp/design-qa-20260820/finance-flow-comparison-final.png`
- 桌面 CSS 视口与实现像素：1600 × 900，device scale factor 1。
- 移动 CSS 视口与实现像素：390 × 844，device scale factor 1。
- 参考图按比例归一化为 1600 × 900 后与实现并排，浏览器外壳不参与比较。
- State：已登录系统管理员；线索列表、订单列表、财务收支流水和订单分账均展示本地真实业务数据。

## Full-view comparison evidence

- 三个模块沿用参考图的白色内容画布、浅紫页面底色、紫色主操作、轻边框圆角卡片、紧凑筛选栏和统一分页节奏。
- 线索和订单在 1600 × 900 首屏完整展示核心列与操作列，没有横向滚动遮挡主要操作。
- 财务中心保留自己的核账指标、流水详情和多工作区信息架构，但颜色、圆角、层级、按钮和表格密度已经服从同一设计系统。
- 390 × 844 下，桌面表格切换为同一页数据的业务卡片；筛选、总数、页码、每页条数和跳页仍复用同一查询与分页状态。

## Focused comparison evidence

- Typography：页标题、说明、标签页、表头、卡片标题和小型状态标签使用现有系统中文字体栈；加粗层级、行高、截断和长订单号省略均可读。
- Spacing and layout rhythm：模块页头、操作区、筛选区、数据区和分页形成与参考图一致的纵向节奏；桌面操作列保持可见，移动卡片使用 12–16 px 内部节奏。
- Colors and tokens：主色统一为 `#7447F5`，页面底色、浅紫选中态、边框和阴影复用新版主题；收入、支出、确认和异常仍保留业务语义色。
- Image quality：本轮三个列表没有新增业务图片需求；品牌 Logo 和图标继续使用仓库现有清晰资产与 MUI 图标，没有占位图或代码绘制资产。
- Copy and content：保留线索分配、订单审核、退款/分账、财务核账等现有业务用语与动作，不以参考图示例内容替换真实字段。

## Findings and comparison history

1. Earlier P2：线索首版仍读取旧列宽状态，表格宽度为 1501 px，核心区域出现横向滚动。
   - Fix：收敛默认核心列、缩短列宽并升级列宽缓存版本；停掉热更新服务后重新启动，确保新默认状态不被旧内存回写。
   - Post-fix evidence：`leads-desktop-final.png` 中筛选、八个核心业务列、操作列和统一分页均在首屏完整可见。
2. Earlier P2：订单移动卡片的“查看”按钮被长订单号挤压为两行。
   - Fix：订单标题区域允许收缩并省略，查看按钮设置固定最小宽度和禁止收缩。
   - Post-fix evidence：`orders-mobile-final.png` 中“查看”保持单行，订单号正常省略，状态和金额区域未被挤压。
3. Earlier P2：财务子页面仍有大量旧蓝色硬编码，与新版紫色工作台形成明显视觉漂移。
   - Fix：统一财务、订单分账、售后挽回分账和提成发放的强调色、墨色、边框色和浅色背景；收支流水补充移动卡片呈现。
   - Post-fix evidence：`finance-flow-comparison-final.png` 与 `finance-settlement-desktop-final.png` 显示同一紫色设计语言，收入/支出语义色仍准确区分。

No remaining P0, P1, or P2 visual findings.

## Interaction and console checks

- 线索移动卡片 -> 查看 -> 详情弹窗 -> 关闭：passed。
- 订单移动卡片 -> 查看 -> 详情弹窗 -> 关闭：passed。
- 财务流水 -> 选择第二条流水 -> 右侧详情同步切换：passed。
- 全新浏览器标签打开最终线索页面后检查 console errors：none。
- `npm run build`：passed。
- 线索、订单、财务相关定向静态和 API 测试：passed。

## Follow-up polish

- P3：现有仓库品牌 Logo 为蓝紫渐变，而参考图 Logo 更偏纯紫；继续保留正式品牌资产，避免为了截图一致性修改品牌标识。

final result: passed
---

# Device Internet Account Drill-down Design QA

- Source visual truth: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-7b1abc52-f1f3-4be7-863d-802f2fa13f8f.png`
- Desktop table capture: `/tmp/jixiangos-device-account-qa-lDVR6B/device-account-column-desktop.jpeg`
- Desktop drawer capture: `/tmp/jixiangos-device-account-qa-lDVR6B/device-account-drawer-desktop.jpeg`
- Desktop viewport: 1318 x 768 pixels
- State: one device with one Instagram account connected through `loginDeviceIds`.

## Findings

No remaining P0, P1, or P2 visual findings.

- The ambiguous `账号数` header is now `互联网账号`; an empty relationship is shown as `未配置`, while a populated relationship is a blue count action.
- The right drawer keeps the device table visible as context and uses the existing product tokens, local platform logo component, status chips, compact relationship metadata, and unified pagination.
- The drawer contains no passwords or sensitive reveal actions. It presents only operational account identity, current user, type, control state, and navigation.
- `查看详情` transitions to the existing account detail dialog without stacking overlays. Closing detail restores the device-account drawer and its pagination state.
- The drawer uses 760 px on desktop, 680 px on tablet, and full width below the small breakpoint. Account metadata collapses from three columns to one column on narrow screens.
- `前往互联网账号管理` opens the account table with an explicit login-device filter chip, so users can continue managing the same relationship set without a hidden filter.

## Interaction checks

- [x] Device account count opens the relationship drawer
- [x] Drawer data is fetched with an exact `loginDeviceId` filter
- [x] Drawer count, page, page size, and jump-to-page use the unified pagination component
- [x] Account detail opens without a nested drawer/dialog stack
- [x] Closing account detail restores the drawer
- [x] Empty device relationships remain non-clickable
- [x] Production build and targeted relationship tests pass

final result: passed

---

# 极享商学院 V2 独立模块 Design QA

## 视觉依据与验证环境

- 原型目录：`docs/assets/academy-v2/`
- 核心对比页：`01-operations-workbench.png`、`02-course-plan.png`、`03-course-library.png`、`04-session-operations.png`、`05-student-conversion.png`、`06-business-review.png`
- 原型尺寸：1487 × 1058。
- 实现验证地址：`http://127.0.0.1:3003/academy`
- 桌面验证视口：1487 × 1058，DPR 1。
- 窄屏验证视口：664 × 917，DPR 1。
- 实现使用本地真实测试数据；原型中的丰富课程、学员和经营数字仅用于视觉结构参考，没有写入或伪造到业务数据。

## 结构与视觉对齐结果

- 商学院已经从企业标准中心中独立出来，并形成运营工作台、课程计划、课程库、场次运营、学员与转化、经营复盘六个一级工作区。
- 页面外壳统一复用极享OS现有的 `ModulePage`、`ModuleHeader` 和 `ModuleTabs`；移除原型中重复的通知、头像和学院管理员信息，仅保留模块标题、说明、横向主导航与满宽业务工作区。
- 运营工作台实现周课程日历、准备度风险、转化漏斗和我的待办；课程计划实现周排期与任务双栏；课程库实现课程列表与版本详情双栏。
- 场次运营实现九阶段执行链、当前任务表、场次控制台和操作日志；学员转化实现筛选、漏斗、学员表和右侧过程面板；经营复盘实现完整筛选、指标、对比、经营结论和改进行动。
- Academy 工作区显式退出全局表格列宽拖拽增强，避免紧凑表格被强制扩到 980px 产生非原型横向滚动。
- 窄屏下主导航可横向滚动，周日历保留横移操作，卡片与关键按钮没有被裁切或脱离视口。

## 同尺寸对比与迭代记录

1. 第一轮发现页面仍受 `maxWidth` 和 `xl` 断点约束，内容区明显窄于原型。修复为满宽布局，并将核心双栏提前到 `lg`，所有网格列使用 `minmax(0, ...)`。
2. 第二轮补齐周次控制、筛选区、指标卡、右侧业务侧栏及页面底部数据更新时间；学院页头不复制原型的独立账号区，服从极享OS全局导航与统一模块页头。
3. 第三轮发现全局列宽增强会给商学院紧凑表格设置 980px 最小宽度。增加局部 opt-out 后，课程库、风险表、任务表和复盘行动表在桌面视口内完整显示。
4. 对课程计划、场次执行和学员转化分别以 1487 × 1058 同尺寸打开原型与实现检查。剩余主要差异来自测试数据量，而非页面结构、间距、层级或交互缺失。

## 交互与响应式验证

- 六个主导航页可正常切换并保持统一学院外壳。
- 664 × 917 窄屏复核通过：极享OS全局顶栏下只出现一次标准模块标题与说明，不再重复显示用户身份；主导航保持可横向滚动。
- 场次列表可进入执行详情，执行阶段、任务、控制台与日志正常展示。
- 学员列表可打开过程侧栏，筛选、漏斗和下一步动作区正常展示。
- 课程计划日历、课程库详情和经营复盘筛选在真实数据下正常展示。
- 664px 窄屏下页面可读，主导航与周日历使用明确的横向滚动语义，页面本身无异常横向溢出。

## 非阻塞差异

- P3：当前本地仅有一门课程、一个场次和一个学员，因此部分表格和指标区留白多于原型。随着真实业务数据进入，页面密度会自然接近原型；不应以伪造数据填充。

final result: passed
---

# Design QA — 客户合并字段批注修订

- Source visual truth: browser annotations `browser:负责人`, `browser:邮箱 未填写 来自 1112`, and `browser:Selected browser region` from `http://127.0.0.1:3002/customers?tab=active`.
- Before screenshot: `.artifacts/customer-merge-before-annotation.png`
- Implementation screenshots:
  - `.artifacts/customer-merge-dialog.png`
  - `.artifacts/customer-merge-source-fields.png`
- Side-by-side comparison: `.artifacts/customer-merge-annotation-comparison.png`
- Viewport: 929 × 919
- State: 2 位客户已选择，线索来源已切换到客户 2223，合并影响预检已通过但未执行最终合并。

## Full-view comparison evidence

- “负责人”已改为“销售负责人”，与客户模块业务用语一致。
- 基本信息中不再出现邮箱，字段密度降低且没有留下空白行。
- 来源与备注区域只保留“线索来源”和“备注”，不再暴露资源归属、来源名称、来源账号。

## Focused comparison evidence

- 线索来源一行显示组合后的业务值“个人线索-BOSS”，并明确来自客户 2223。
- 选择线索来源时，内部来源明细会随所选客户同步，用户无需分别决定多个来源字段。
- 字体、间距、边框、圆角、颜色和下拉控件继续复用现有 MUI 设计体系；本次没有新增或替换图像资产。

## Findings and comparison history

- Earlier P1: 客户合并弹窗暴露已下线的邮箱字段。
  - Fix: 从前后端可合并字段中移除邮箱，并在实际合并时清理主档案残留邮箱值。
  - Post-fix evidence: 弹窗文本和 DOM 均无邮箱行。
- Earlier P1: 来源信息拆成线索来源、资源归属、来源名称、来源账号四行，用户无法理解差异。
  - Fix: UI 只保留一个线索来源选择，展示父子来源组合值；后台同步所选客户的来源上下文。
  - Post-fix evidence: 来源区域只剩“线索来源”和“备注”，切换后显示“个人线索-BOSS”。
- Earlier P2: “负责人”与客户模块其他位置的“销售负责人”用语不一致。
  - Fix: 统一为“销售负责人”。
  - Post-fix evidence: 客户归属首行显示“销售负责人”。

## Interaction and console checks

- 批量操作 -> 合并客户 -> 打开弹窗：passed
- 切换线索来源到另一位客户：passed
- 合并影响预检：passed
- 最终确认合并：未点击，测试数据未修改
- Console errors: none

final result: passed
---

# Design QA — 客户合并弹窗

## Source and implementation

- Reference: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-79af50e6-44cc-44f3-b4f0-445a57b2002c.png`
- Implementation: `.artifacts/customer-merge-dialog.png`
- Side-by-side comparison: `.artifacts/customer-merge-comparison.png`
- Verified URL: `http://127.0.0.1:3002/customers?tab=active`
- Viewport: 1280 × 720

## Comparison findings

- The implementation preserves the reference workflow: selected-customer summary, main customer selection, grouped final-field decisions, and a fixed action footer.
- The visual language intentionally follows the existing 极享OS MUI system instead of copying the reference product's green styling.
- Each supported merge field has an explicit source selector and identifies which customer supplied the selected value.
- Selectable fields cover ownership, progress, customer level, contact details, company, industry, city, source attribution, and remarks.
- Tags and associated business records are clearly separated as automatically merged content.
- The existing two-phase safety contract is visible in the same dialog: impact precheck first, final merge confirmation second.
- The dialog remains within the customer list route and leaves the cross-page batch selection intact.

## Interaction verification

- Selected two customers and opened “批量操作 → 合并客户”.
- Confirmed the URL did not change and the merge dialog opened in place.
- Switched the final customer-name field from customer `1112` to customer `2223`.
- Ran the impact precheck and confirmed association counts rendered.
- Confirmed the final “确认合并” action appeared only after a successful precheck.
- Did not execute the final merge, so test customer data was not changed.

## Review history

1. Initial build placed all field decisions and safety checks inside one modal.
2. Browser verification confirmed the field selector state change and precheck transition.
3. Side-by-side review found no blocking layout, spacing, cropping, or hierarchy issues.

final result: passed

---

# Order application design QA

## Evidence

- Source visual truth: `/Users/nge/.codex/generated_images/019f999c-681e-72c3-948c-bae066ac4282/exec-b4e792f6-6e45-412a-baf0-65cee36e25b0.png`
- Browser-rendered implementation: `/Users/nge/.codex/visualizations/2026/07/25/019f999c-681e-72c3-948c-bae066ac4282/order-application-final-solid.png`
- Narrow-screen implementation: `/Users/nge/.codex/visualizations/2026/07/25/019f999c-681e-72c3-948c-bae066ac4282/order-application-narrow-newest.png`
- Combined comparison: `/Users/nge/.codex/visualizations/2026/07/25/019f999c-681e-72c3-948c-bae066ac4282/order-application-design-qa-final.png`
- Source pixels: 971 x 1620.
- Implementation pixels and CSS viewport: 1440 x 1000 at 1x density; narrow viewport 768 x 1000 at 1x density.
- State: new order application, all four sections expanded, empty customer/product/payment values. The source uses populated sample data, so data-dependent chips and rows were compared as component treatments rather than content equality.
- Normalization: the full-view comparison uses the corresponding upper content region from both artifacts, normalized to 940 px height. Browser chrome is excluded.

## Fidelity review

- Typography: system Chinese UI font, weights, line height and hierarchy match the existing OS and the reference. Long labels use the existing truncation behavior.
- Spacing and layout: header, applicant strip, four cards, compact product table and fixed summary footer reproduce the reference rhythm without the previous oversized whitespace.
- Colors and tokens: white surfaces, pale blue section headers, blue primary actions and semantic status colors use existing MUI/system tokens.
- Image and asset quality: this form has no non-standard raster assets. Existing icon components remain sharp and consistent.
- Copy and content: all existing business fields and submit semantics are preserved. “保存草稿” is intentionally absent by explicit product decision; notes are merged into “订单信息”, and “付款信息” is renamed “收款与凭证”.

Focused comparison was performed on the applicant strip, section headers, product table and sticky footer because these carry the main fidelity risk. No additional image-focused region was needed because the screen contains no photography or branded raster art.

## Comparison history

1. P2: the product table retained a forced wide minimum and hid late columns at the narrow breakpoint. Fix: removed the forced minimum, switched to fixed proportional columns and tightened cell padding. Post-fix evidence: narrow-screen capture above; the table remains horizontally scrollable only when content requires it, while persistent actions remain visible.
2. P2: step markers were outlined while the source used solid blue markers. Fix: added an opt-in `solidStep` treatment and enabled it only for the order form. Post-fix browser computed styles are blue `rgb(37, 99, 235)` with white text.
3. Intentional difference: source mock contained two “保存草稿” actions. Both are omitted per the user's final scope decision.

## Interaction and runtime checks

- Opened the order application from the order list.
- Verified all four sections, the sticky totals and the single submit action.
- Triggered an invalid submit and verified the app-style “订单申请无法提交” dialog.
- Checked desktop and narrow viewports.
- Checked browser console errors: none.

## Follow-up polish

- P3: a future phone-specific renderer could replace the horizontally scrollable product table with product cards below 600 px. This is not blocking the current desktop/tablet modal.

final result: passed

---

## 资产管理字段与表单重构（2026-08-18）

# Asset form redesign QA

- Source visual truth: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-4f878044-9953-470c-acd1-dfbda58359fb.png`
- Implementation: `http://127.0.0.1:3002/assets?tab=devices`
- Desktop screenshot: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/jixiangos-asset-device-form-desktop.png`
- Mobile screenshot: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/jixiangos-asset-device-form-mobile-fixed.png`
- Combined comparison: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/jixiangos-asset-form-comparison.png`
- Viewports: desktop 1440 x 1000 CSS px; mobile 390 x 844 CSS px; device scale factor 1.
- Pixel dimensions: source 2070 x 1714; desktop implementation 1440 x 1000; mobile implementation 390 x 844. The source was proportionally normalized to 1440 px wide for the combined comparison.
- State: create-device dialog open; all four sections expanded. The source is the system visual-language reference, while asset-specific fields intentionally differ.

## Full-view comparison evidence

The combined image confirms the implementation reuses the reference hierarchy: white modal shell, title/subtitle header, pale-blue numbered accordion headers, two-column desktop field grid, scrollable content, and fixed footer actions. Typography, blue/gray tokens, borders, radii, and density align with the existing system components.

## Focused comparison evidence

A separate crop was not needed because section headings, controls, borders, and footer actions remain legible in the 1440 px combined comparison. The mobile capture separately proves the responsive one-column state.

## Findings and comparison history

1. Initial P2: at 390 x 844 the dialog left narrow margins that exposed the underlying navigation, instead of behaving as a mobile full-screen form.
   - Fix: added the system theme breakpoint and enabled `fullScreen` below `sm`.
   - Post-fix evidence: the revised mobile screenshot fills the complete viewport, keeps the header and footer fixed, and scrolls only the form body.

No actionable P0/P1/P2 findings remain.

## Required fidelity surfaces

- Fonts and typography: passed; existing MUI/system font stack, weights, hierarchy, wrapping, and compact labels are consistent with the reference.
- Spacing and layout rhythm: passed; numbered sections, two-column desktop grid, one-column mobile grid, radii, shadows, and vertical rhythm are consistent.
- Colors and visual tokens: passed; pale-blue section headers, blue step badges/actions, white surfaces, muted summaries, and gray dividers use existing system components/tokens.
- Image quality and asset fidelity: passed; the target contains no content imagery requiring generation. Existing product logo and MUI icons are preserved.
- Copy and content: passed; asset-specific section titles and helper copy are concise and use the approved domain terminology.

## Browser verification

- Page identity and non-blank content: passed.
- Framework overlay: none.
- Console: no application errors; only two pre-existing React Router v7 future-flag warnings.
- Primary interaction: changing communication mode from `无SIM` to `双卡` displayed both `IMEI 1` and `IMEI 2` fields.
- Additional interactions: phone and internet-account tabs opened their respective four-section create forms with the expected headings.

final result: passed

---

# Internet Account Detail Design QA

- Source visual truth: `/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-ca4c864a-2638-4dc1-849f-38c3de98be0b.png`
- Desktop implementation: `/tmp/jixiangos-account-detail-qa-20260819/account-detail-redesign.png`
- Desktop lower sections: `/tmp/jixiangos-account-detail-qa-20260819/account-detail-redesign-lower.png`
- Identity relationship section: `/tmp/jixiangos-account-detail-qa-20260819/account-detail-redesign-relations.png`
- Mobile implementation: `/tmp/jixiangos-account-detail-qa-20260819/account-detail-redesign-mobile-fixed.png`
- Side-by-side comparison: `/tmp/jixiangos-account-detail-qa-20260819/design-qa-account-detail-comparison.png`
- Desktop viewport: 1028 x 863 CSS px, device scale factor 1
- Mobile viewport: 390 x 844 CSS px, device scale factor 1
- Source pixels: 1060 x 837
- Desktop implementation pixels: 1028 x 863
- Comparison normalization: source scaled to 1028 px wide and centered on a 1028 x 864 white canvas; implementation padded from 1028 x 863 to 1028 x 864; canvases were placed side by side.
- State: Internet account detail dialog with a realistic Instagram account, populated ownership/business fields, and empty phone/device/identity bindings.

## Findings

No remaining P0, P1, or P2 visual findings.

- Fonts and typography: existing JixiangOS typography and weights are preserved. The account name, section titles, field labels, values, and status chips now have a clear hierarchy without changing the product font stack.
- Spacing and layout rhythm: the former single dense field block is replaced by a 56 px summary mark and semantic cards with consistent 12-20 px internal rhythm. The 1040 px desktop dialog and one-column mobile layout do not clip persistent actions.
- Colors and visual tokens: existing shell ink, muted text, lines, link blue, and semantic status tones are reused. No new visual language was introduced.
- Image quality and asset fidelity: the existing local platform brand component renders the correct Instagram, Apple, and Google marks sharply at their intended sizes. No runtime image links or placeholder assets were added.
- Copy and content: labels match the selected information architecture: account identity, login and security, bindings, ownership and use, business and status, and directional identity-account relationships. Empty values use explicit states instead of hyphens.
- Interaction checks: edit and close actions remained available; linked operational identifiers retain copy controls; sensitive real-name/password controls retain permission-gated reveal behavior; the dialog scrolls while its header/footer stay visible.
- Console check: one notification-bell `Failed to fetch` error occurred because the visual QA preview intentionally ran without the backend API. It is outside the asset detail implementation and did not affect the tested dialog.

Focused-region comparison was required because the full dialog scrolls. Separate captures verified the binding, ownership, business, purpose/remark, and identity relationship sections.

## Comparison History

1. First desktop pass: no actionable desktop layout mismatch. Semantic grouping, status hierarchy, and explicit empty states were all visible.
2. First mobile pass: P2 header action wrapped vertically at 390 px because the full edit label competed with the title and close button.
3. Fix: mobile edit action now uses its icon-only presentation, the title uses an 18 px non-wrapping style, and desktop keeps the full button label.
4. Post-fix mobile capture: header title, edit action, and close action fit one row; no clipping or vertical label remains.

## Implementation Checklist

- [x] Account summary with brand, login identifier, status, control, type, account number, and current user
- [x] Semantic detail sections
- [x] Multi-device and identity-provider relationship cards
- [x] Directional upstream/downstream identity account groups
- [x] Purpose and remark long-text layout
- [x] Desktop and mobile dialog behavior
- [x] Permission-sensitive reveal controls preserved

## Follow-up Polish

No P3 item is required for this release.

final result: passed

---

# 极享OS 2.0 UI 改版设计 QA

## 验收对象

- 首页参考图：`/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-1d04d967-718c-4809-bdd9-50e91be3a849.png`
- 客户列表参考图：`/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-d56f7ebc-2ead-4d3f-adb9-e8d66ad71ea9.png`
- 本地实现：`http://127.0.0.1:3000/`
- 桌面视口：1600 × 900
- 移动视口：390 × 844

## 视觉证据

- 首页桌面对照：`.codex_tmp/design-qa-20260820/home-comparison-v2.png`
- 客户列表桌面对照：`.codex_tmp/design-qa-20260820/customers-comparison.png`
- 首页移动端：`.codex_tmp/design-qa-20260820/home-mobile.png`
- 客户列表移动端：`.codex_tmp/design-qa-20260820/customers-mobile.png`
- 参考图和实现截图按相同桌面视口归一化，并排对照检查信息密度、布局层级、留白、圆角、边框、颜色和主要操作位置。

## 对照修正记录

1. 首页首版缺少参考图右侧信息轨道；第二版补齐今日摘要、快捷操作和范围指标，并收紧主内容网格。
2. 首页主视觉由内置图像生成能力产出真实紫色 3D 结算素材，替代占位绘制；客户待办空状态同样使用真实图片资产。
3. 客户列表首版列宽沿用旧本地缓存，平台购买产品列被操作列挤压；将默认列宽总量收紧并升级列宽缓存版本，确保新布局生效。
4. 客户列表移动端改为卡片呈现，但复用同一筛选结果、总数和分页状态，避免桌面与移动端数据语义分叉。
5. 侧栏、顶部搜索、页面背景、按钮、卡片、状态色和圆角统一为参考图的紫色轻量工作台语言。

## 交互与状态

- 顶部全局搜索支持点击和 `Cmd/Ctrl + K` 聚焦。
- 侧栏分组、首页快捷入口、客户列表视图设置、批量任务、导入、导出、新增和重置操作均保留真实交互入口。
- 客户列表桌面表格支持选择、列宽调整、固定操作列和统一分页；移动端卡片保留查看入口和相同分页语义。
- 已检查桌面与移动端首屏，无内容溢出、断裂、遮挡或不可读文本。

## 工程验证

- `npm run build`：通过。
- 客户列表呈现、列配置、筛选工具栏，侧栏导航和首页业务模型定向测试：通过。
- 生产构建仅保留既有的大包体提示，无类型错误或构建错误。

## 严重度结论

- P0：0
- P1：0
- P2：0
- P3：0；品牌 Logo 已按 2026-08-20 用户提供的新紫色资产更新。

final result: passed

---

# 极享OS 紫色 Logo 替换 Design QA

- Source visual truth：`/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-c91b706e-5f3d-4cd3-97bd-6b81ecc264db.png`
- 原始归档：`public/assets/brand/jixiangos-logo-purple-source.png`，1254 × 1254 RGBA。
- 运行时品牌资产：`public/jixiang-os-logo.png`，512 × 512 RGBA；只做方形裁切、尺寸优化和白底透明化，没有重绘造型或改变原始颜色。
- Desktop implementation：`.codex_tmp/design-qa-20260820/logo-desktop-final-v2.png`，1600 × 900，device scale factor 1。
- Mobile implementation：`.codex_tmp/design-qa-20260820/logo-mobile-final.png`，390 × 844，device scale factor 1。
- Focused comparison：`.codex_tmp/design-qa-20260820/logo-comparison-final.png`。
- State：已登录线索列表；桌面侧栏和手机顶栏均显示新版 Logo。登录页、浏览器员工连接页和 favicon 继续引用同一个 `/jixiang-os-logo.png`，因此同步更新。

## Full-view comparison evidence

- 新紫色标识在桌面 42 px 和移动端顶栏尺寸下轮廓完整，六边形、内部白色路径和圆点均清晰可辨。
- Logo 与“极享OS 2.0 / 员工工作台”文字保持原有对齐、间距和品牌层级，没有改变导航布局。
- 透明背景避免源图白色方块在登录页和浅紫页面背景上形成边界。

## Focused fidelity review

- Typography：品牌文字未改动，继续使用系统字体、字重和行高。
- Spacing/layout：桌面 42 px 品牌位和移动顶栏原尺寸保持不变，没有挤压标题或菜单按钮。
- Colors/tokens：保留源图淡紫到深紫的渐变与柔光边缘，和新版 `#7447F5` 主色协调。
- Image quality：运行时使用 512 px RGBA PNG，在 42–56 px 显示位仍有充分像素密度；无锯齿、白边或压缩块。
- Copy/content：品牌名称仍为“极享OS 2.0”，没有把图中不存在的文字写入图片。

## Findings

No P0, P1, P2, or P3 findings remain.

## Verification

- 桌面侧栏：passed。
- 手机顶栏：passed。
- 同屏源图/实现对照：passed。
- 新 Logo 没有新增交互，也未改变导航点击区域。

final result: passed

---

# 参考站视觉令牌同步 Design QA

- Reference source：`https://agent2.taojinshidai.com/#/`，在用户已登录的 Chrome 中只读审查。
- Reference states：`/tmp/jixiangos-reference-audit/01-home.png`、`02-works.png`、`03-create.png`。
- Local states：`/tmp/jixiangos-reference-audit/04-settings-after.png`、`05-finance-after.png`、`06-orders-after.png`。
- Scope：应用底色、顶部栏、侧边栏、模块标题、主次按钮、输入框聚焦态、卡片、表格表头和分页色彩；不改业务结构和数据语义。

## 视觉结论

- 页面底色统一为 `#F2F2F7`，正文统一为 `#1F2937`，弱文字和边线改为中性灰，减少原先偏粉紫的泛色。
- 主操作色统一为 `#7C3AED`；紫色只用于主按钮、选中态、链接和聚焦反馈，避免大面积抢夺表格内容层级。
- 顶部栏和侧栏改为近白半层级表面，保留极弱阴影；侧栏选中项增加窄紫色竖线，提升长菜单中的定位效率。
- 主模块页签继续使用已确认的下划线方案；参考站的分段胶囊仅用于局部切换，不强行替换系统一级导航。
- 卡片、输入框、按钮圆角和焦点环统一；高密度业务表格继续保持紧凑行高、固定表头与统一分页语义。

## 交互与回归

- 系统设置：一级与二级页签、组织树、成员表格和统一分页均正常。
- 财务中心：高密度售后挽回分账表格无断裂，筛选器和状态色仍可辨。
- 订单管理：订单列表无溢出；点击“订单审核台”后 URL 更新为 `?tab=review`，选中态正确。
- Chrome 控制台无新增 error；仅保留既有 React Router v7 future-flag warning。
- `moduleNavigationVisualContract.test.ts`、`appShellResponsive.test.ts`、`uiPolishStatic.test.ts` 和 `npm run build` 均通过。

## Findings

No P0, P1, P2, or P3 findings remain.

final result: passed

---

# 订单与线索列表统一 Design QA（2026-08-21）

## Comparison target

- Source visual truth：`/var/folders/x4/fnz851dj7rv2p9y0_1zx4gx40000gn/T/codex-clipboard-10955cbe-8e1c-4388-99ff-be7dcd9afcd7.png`，用户指定的图二订单审核台标准。
- Live canonical state：`/tmp/jixiangos-list-standard-review.png`，1410 × 918 pixels，CSS viewport 1410 × 918，device scale factor 1。
- Order implementation：`/tmp/jixiangos-list-standard-orders.png`，1410 × 918 pixels，同视口、同登录状态。
- Lead implementation：`/tmp/jixiangos-list-standard-leads.png`，1410 × 918 pixels，同视口、同登录状态。
- Mobile states：`/tmp/jixiangos-list-standard-orders-mobile.png`、`/tmp/jixiangos-list-standard-leads-mobile.png`，390 × 844 pixels。
- Full comparison：`/tmp/jixiangos-list-standard-review-vs-orders.png`。
- Focused comparison：`/tmp/jixiangos-list-standard-focus.png`，依次为订单审核台、订单列表、线索列表的筛选和表格区域。

## Required fidelity surfaces

- Fonts and typography：标题、页签、筛选控件、表头和数据行继续使用系统字体与现有字重；没有新增字号或换行规则。
- Spacing and layout rhythm：删除订单列表和线索列表额外的内层卡片、阴影、边框和内边距，统一为“筛选区 → 表格 → 分页”的连续结构；订单日期浮动标签保留 12px 顶部安全间距。
- Colors and visual tokens：表格边线、圆角、表头底色、分页底色和工作台背景复用 `ModuleShell` 令牌；没有引入新的颜色体系。
- Image quality and asset fidelity：本次不涉及图片资产；按钮继续使用现有 MUI 图标，没有替换品牌资源。
- Copy and content：订单和线索的字段、筛选项、操作、状态标签、移动端卡片、总数及分页语义均保持原样。

## Findings and comparison history

1. Earlier P2：订单列表和线索列表额外包裹一层带圆角、阴影和边框的白色卡片，与订单审核台的直接列表结构形成两套 UI。
   - Fix：新增共享 `ModuleListSurface`、`moduleListTablePaperSx` 和 `moduleListPaginationSx`，两个列表统一接入图二结构。
   - Post-fix evidence：全景与聚焦对照中，三个页面均直接排列筛选区、表格和分页；不再出现重复白色内卡片。
2. Earlier P2：订单列表原内卡片裁切环境依赖顶部间距，初次移除卡片时回归测试指出日期浮动标签可能贴边。
   - Fix：保留订单筛选区 `pt: 1.5`，只移除重复卡片视觉，不移除日期标签安全间距。
   - Post-fix evidence：1410 × 918 桌面截图中“付款开始/付款结束”标签完整显示。

## Interaction, responsive, and console checks

- 订单列表 → 订单审核台 → 订单列表页签切换：URL 与选中态同步，passed。
- 390 × 844：订单和线索均使用移动卡片，`scrollWidth = clientWidth = 390`，无整页横向溢出，passed。
- 桌面表格、冻结操作列、状态标签和统一分页保持可见，passed。
- Browser console：0 error。
- `moduleListVisualStandard.test.ts`、`moduleNavigationVisualContract.test.ts`、`orderFilterToolbarLayout.test.ts` 和 `npm run build` 均通过。

No remaining P0, P1, or P2 visual findings.

final result: passed
