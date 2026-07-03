# 资产管理模块后续开发跟进

> 日期：2026-07-03  
> 模块：极享OS / 资产管理  
> 当前阶段：前端 mock 业务闭环已打通，待进入真实业务能力补齐与后端落库阶段。

## 当前状态

已完成：

- 一级模块入口：`/assets`
- 7 个工作区：资产总览、设备资产、手机号资产、互联网账号、风险提醒、操作日志、离职回收
- 三类资产 mock 数据与前端 API
- 设备、手机号、互联网账号新增/编辑表单
- 设备 IMEI 唯一校验
- 手机号绑定设备、卡槽冲突校验、设备最多绑定 2 个手机号
- 账号绑定/解绑手机号
- 平台 + 登录账号唯一校验
- 未绑定手机号账号自动生成风险
- 离职待回收账号自动生成回收任务
- 操作日志写入
- 风险解决/忽略
- 离职回收标记已回收
- CSV 导出

当前仍是前端 localStorage mock 业务闭环，不是后端数据库正式落库。

## 下一阶段目标

下一阶段目标不是继续堆页面，而是把资产管理做成可实际运营的闭环：

```text
录入资产 -> 维护绑定关系 -> 查看敏感字段 -> 审计记录 -> 风险处理 -> 离职回收 -> 导入导出
```

## P0：补齐可用闭环

### 1. 敏感字段查看与审计

范围：

- IMEI
- 手机完整号码
- 登录账号
- 绑定邮箱

功能要求：

- 默认展示脱敏值。
- 有权限用户可点击查看明文。
- 查看前出现确认提示。
- 查看后写入操作日志。
- 无权限用户不显示查看入口。

验收标准：

```text
Given 用户拥有“资产管理/查看敏感字段”权限
When 用户点击手机号完整号码的“查看”
Then 系统展示完整号码，并新增一条“查看敏感字段”操作日志
```

```text
Given 用户没有“资产管理/查看敏感字段”权限
When 用户进入资产详情
Then 系统只展示脱敏字段，不展示查看明文入口
```

### 2. CSV 导入闭环

范围：

- 设备资产导入
- 手机号资产导入
- 互联网账号导入

功能要求：

- 支持下载模板。
- 支持上传 CSV。
- 返回成功数、失败数。
- 展示失败行与失败原因。
- 支持下载失败行 CSV。
- 成功导入的数据写入操作日志。

验收标准：

```text
Given 用户上传包含重复 IMEI 的设备 CSV
When 系统处理导入
Then 重复行导入失败，失败原因显示“IMEI已存在”，其他合法行正常入库
```

```text
Given 用户上传账号 CSV 且某些账号未绑定手机号
When 导入成功
Then 未绑定手机号账号入库，并在风险提醒中生成“未绑定手机号账号”风险
```

### 3. 资产详情信息强化

功能要求：

- 设备详情展示卡槽手机号。
- 设备详情展示绑定账号列表。
- 手机号详情展示所属设备和绑定账号。
- 账号详情展示绑定手机号与可追溯设备。
- 关联字段都可以点击进入对应资产上下文。

验收标准：

```text
Given 设备 DEV-023 绑定了手机号和账号
When 用户打开设备详情
Then 详情区展示卡槽手机号、绑定账号数量和账号列表
```

## P1：权限与数据范围

### 4. 角色权限接入

建议权限：

- 资产管理
- 资产管理/资产总览
- 资产管理/设备资产
- 资产管理/手机号资产
- 资产管理/互联网账号
- 资产管理/风险提醒
- 资产管理/操作日志
- 资产管理/离职回收
- 资产管理/查看敏感字段
- 资产管理/导入导出

角色建议：

| 角色 | 权限 |
| --- | --- |
| 超级管理员 | 全部 |
| 运营管理员 | 资产写权限、风险、离职回收、导入导出 |
| 老板 | 总览、风险、只读台账 |
| 财务 | 与费用、账号回收相关的只读/处理权限 |
| 审计员 | 操作日志、敏感字段查看记录 |
| 普通员工 | 本人相关资产只读 |

验收标准：

```text
Given 普通员工登录
When 进入资产管理
Then 只能看到本人相关资产，不能新增、导入、导出或查看敏感字段
```

### 5. 操作权限落到按钮级

功能要求：

- 新增资产需要写权限。
- 编辑资料需要写权限。
- 导入导出需要导入导出权限。
- 风险解决/忽略需要风险处理权限。
- 离职回收需要离职回收权限。

## P2：后端正式落库

### 6. Prisma/MySQL 数据模型

核心表：

- `asset_devices`
- `asset_phone_numbers`
- `asset_internet_accounts`
- `asset_risks`
- `asset_operation_logs`
- `asset_offboarding_tasks`

关键约束：

- `asset_devices.imei` 唯一
- `asset_phone_numbers.phone_number` 唯一
- `asset_phone_numbers.device_id + slot_type` 唯一
- `asset_internet_accounts.platform + login_account` 唯一
- 账号 `phone_id` 可为空
- 删除资产优先软删除、停用、注销，不物理删除

### 7. 后端 API

建议接口：

```text
GET /api/assets/dashboard
GET /api/assets/devices
POST /api/assets/devices
PATCH /api/assets/devices/:id
GET /api/assets/phones
POST /api/assets/phones
PATCH /api/assets/phones/:id
GET /api/assets/accounts
POST /api/assets/accounts
PATCH /api/assets/accounts/:id
GET /api/assets/:type/:id/detail
GET /api/assets/risks
PATCH /api/assets/risks/:id/status
GET /api/assets/logs
GET /api/assets/offboarding
POST /api/assets/offboarding/:id/recover
POST /api/assets/sensitive/reveal
POST /api/assets/import
GET /api/assets/export
```

验收标准：

```text
Given 后端 API 启用
When 用户新增互联网账号
Then 数据写入数据库，并可刷新页面后继续看到
```

## P3：运营增强

### 8. 批量操作

功能：

- 批量停用设备
- 批量停用手机号
- 批量注销账号
- 批量分配负责人
- 批量导出选中项

### 9. 资产费用视图

功能：

- 按部门统计资产月费用。
- 按平台统计账号费用。
- 展示即将到期账号。
- 与财务中心后续形成费用核对入口。

### 10. 资产变更历史

功能：

- 字段级变更记录。
- 展示旧值、新值、操作人、操作时间。
- 可在详情区查看最近变更。

## 当前建议开发顺序

1. 敏感字段查看与审计
2. CSV 导入模板与失败行反馈
3. 详情区关联信息强化
4. 按钮级权限控制
5. Prisma/MySQL 后端落库
6. 批量操作与费用视图

## 暂不做

- 不做复杂 OA 审批流。
- 不做大型风控规则引擎。
- 不做移动端 App。
- 不做多租户 SaaS。
- 不把资产管理并入系统设置。

