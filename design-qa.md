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
