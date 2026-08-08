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
