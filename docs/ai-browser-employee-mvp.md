# 极享AI浏览器员工 MVP

## 目标

第一版只支持抖店飞鸽客服的固定工作流：

1. 识别当前客户、平台订单号、商品和聊天消息。
2. 把常用话术填入飞鸽回复框，由客服确认后发送。
3. 从客户消息中提取手机号或微信，或由客服补录站外获取的联系方式。
4. 以“平台 + 店铺 + 订单号”作为幂等键，向极享OS创建线索。
5. 线索创建成功后，尝试提交抖店订单备注；失败时保留可重试的备注文本。

插件不会自动发送客服消息，也不会在页面结构未识别时盲目点击。录线索和写备注前都会重新核对当前订单号，客服还必须勾选确认联系方式属于当前订单。

## 代码边界

- `apps/browser-extension`：独立 Manifest V3 Chrome 插件，独立安装、测试和打包。
- `server/services/browserAgent`：幂等线索入库和订单备注回执。
- `server/routes/browserAgentRoutes.ts`：浏览器员工专用路由。
- `browser_lead_syncs`：保存跨系统同步状态、平台商品名称和操作留痕，不重复保存客户手机号。

插件不直接写数据库。线索创建继续调用极享OS的 `customerCommandService.createLead`，因此保留原有的权限、联系方式校验、查重、线索来源和销售分配规则。

## 本地构建

```bash
npm --prefix apps/browser-extension install
npm run browser-employee:test
npm run browser-employee:typecheck
npm run browser-employee:build
```

构建产物位于：

```text
apps/browser-extension/dist
```

Chrome 本地加载：

1. 打开 `chrome://extensions`。
2. 打开“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `apps/browser-extension/dist`。
5. 打开抖店飞鸽页面，点击插件图标打开右侧面板。

## 极享OS连接

本地默认 API 地址：

```text
http://127.0.0.1:3001/api
```

开发环境允许本地加载的 Chrome 插件访问 API。生产环境必须把已发布插件的精确 origin 加到 `CORS_ORIGINS`：

```env
CORS_ORIGINS="https://os.example.com,chrome-extension://<32位插件ID>"
```

登录密码不持久化。登录后的会话 token 保存在 `chrome.storage.session`，关闭浏览器会话后失效。除本机回环地址外，插件拒绝使用 HTTP 发送账号、密码和 token。

## 飞鸽页面适配

页面实现集中在：

```text
apps/browser-extension/src/content/douyinFeigeAdapter.ts
```

适配器只暴露三个页面能力：

- `readContext()`
- `fillReply(text)`
- `fillOrderRemark(text)`

当前选择器包含测试钩子和保守的语义候选项。首次真实试运行需要根据企业实际飞鸽页面确认：

- 客户昵称元素
- 平台订单号元素
- 商品名称元素
- 客户/客服消息方向
- 回复输入框
- 订单备注输入框与保存按钮
- iframe 或 Shadow DOM 情况

未识别时插件会显示诊断结果并停止执行。

## 线索与通知

插件不指定销售，由极享OS线索流转配置决定负责人。

当前主工作区存在尚未提交的通知基础功能。该功能合并后，线索创建会在同一条线索分配流程中通知销售、提醒确认并跟踪首次跟进。浏览器插件不需要重复实现通知。

## 已知限制

1. 未用真实飞鸽页面完成选择器校准，因此当前不能宣称真实页面操作已通过。
2. 订单备注必须同时找到备注框和保存按钮，否则只提供备注文本和重试入口。当前点击保存后标记为“已提交待确认”，在真实页面成功信号完成校准前不会误报“已保存”。
3. 线索入库依赖极享OS已配置的线索来源、销售参与人员和分配规则。
4. 线索创建与同步状态更新之间若发生中断，会用唯一外部录入键对账原线索；未创建线索的超时任务会在十分钟后释放重试，避免重复和永久卡死。
