# 极享OS AI共创中心 MVP 设计

日期：2026-07-11

状态：第一阶段已实现并完成本地验证

## 目标

员工从真实工作问题发起AI访谈，系统使用现有系统设置中的DeepSeek配置逐问逐答，形成候选需求简报；主管确认事实，管理者批准进入需求验证，验证负责人记录计划与结论。

## 产品边界

- 第一道管理决策只批准进入需求验证，不代表批准开发。
- AI不能确认事实、批准验证或批准立项。
- 员工陈述、AI假设、主管确认事实和验证证据分开保存。
- 第一阶段支持文本访谈；语音、附件、自动PRD、自动开发与部署暂不包含。

## 技术边界

- `/co-creation` 为独立前端路由，按提交、主管确认、管理决策、需求验证四类权限显示工作台。
- `/api/co-creation` 为独立服务端接口，所有状态转换由当前登录用户和服务端权限控制。
- `CoCreationRequest`、`CoCreationMessage`、`CoCreationBrief`、`CoCreationValidation`、`CoCreationEvent` 是MySQL权威记录。
- `aiChatClient` 统一读取 `AiProviderConfig`，复用系统设置的DeepSeek地址、模型、启用状态和API Key；Key不进入浏览器和业务数据。

## 状态

```text
DRAFT -> INTERVIEWING -> EMPLOYEE_CONFIRMATION -> FACT_CONFIRMATION
-> MANAGEMENT_REVIEW -> VALIDATION_APPROVED -> VALIDATING -> PROJECT_DECISION
-> APPROVED / DEFERRED / MERGED / REJECTED
```

## 验证结果

- Prisma迁移成功应用到本地 `jixiang_os`。
- 96个测试文件通过。
- TypeScript与Vite生产构建通过。
- 桌面端和390×844移动端页面正常渲染。
- 创建需求交互成功。
- 未配置DeepSeek Key时页面明确提示到系统设置配置，没有静默降级或泄露密钥。

