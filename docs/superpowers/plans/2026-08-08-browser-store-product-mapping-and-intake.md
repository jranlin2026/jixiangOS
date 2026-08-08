# Browser Store Product Mapping and Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让极享AI浏览器员工安全识别飞鸽店铺、平台商品、实付金额和付款时间，通过可管理的“店铺商品映射”关联极享OS标准产品，并在OS分配销售后按统一格式完成订单备注与绿色旗帜。

**Architecture:** 极享OS保存店铺绑定和平台商品映射，浏览器插件只上传飞鸽原始订单事实与已选店铺绑定 ID；后端根据绑定配置派生来源、店铺和标准产品，绝不信任插件提交的来源文本或OS产品名称。订单实付金额与付款时间永远使用飞鸽事实，OS产品价格只展示为参考；后端返回销售分配结果、权威入库时间和标准备注行，插件只负责在当前已校验订单中幂等合并、设置绿旗并验证页面结果。

**Tech Stack:** TypeScript、React 18、Chrome Extension Manifest V3、Express 5、Prisma 6、MySQL、Material UI、JSDOM、Node assert

## Execution record (2026-08-09)

- Tasks 1-9 were implemented and reviewed on branch `codex/ai-browser-employee-mvp` through `c927004`. The later final-fix wave closed the two previously parked Task 9 logout defects: only `code === 0` plus completed local cleanup is logout success, and any HTTP 401 is a terminal local logout shared by worker and UI. Original step checkboxes remain as authored rather than being retroactively asserted by Task 10.
- Task 10 documentation was reconciled against the final implementation, including the deliberate minimum immutable contact snapshot, controlled source/shop derivation, read-only product preview, retry/cancellation/logout behavior, and the actual single-dialog remark plus green-flag save sequence.
- The final-fix wave also made platform product name, exact non-negative paid amount and valid payment time mandatory; every completion click rereads the current order and repeats authoritative preview. Changed facts/resolution stop before writes, refresh the displayed snapshot, clear contact confirmation and require a second confirmation/click.
- `BrowserLeadSync.attemptToken` now owns each PENDING attempt. New and reclaimed attempts rotate the token; success/failure writes are conditional on `id + PENDING + token`, so stale owners cannot overwrite a new PENDING or regress SUCCEEDED.
- Mapping writes now lock the selected shop row with `FOR UPDATE` inside the same transaction and recheck the locked row's latest existence/active state before writing. Service and Prisma-adapter tests cover the contract; a live two-session MySQL lock integration is deferred and non-blocking.
- The original Task 10 commands passed before the final-fix wave. Final-fix verification adds the lock-adapter, lease-ownership, mandatory-fact, latest-preview, logout/401 and cancellation regressions listed in Task 10 Step 2; no root database test or live/destructive database integration was run.
- Final-fix database preflight exposed only `mysql / 127.0.0.1 / 3306 / jixiang_os` (no credentials). After Prisma format/validate/generate passed, the authorized `npm run db:deploy` applied `20260809020000_browser_sync_attempt_token`; all 31 local migrations are applied. No root database integration suite was run.
- No administrator mapping was created through the UI/API and no real Feige order was opened or written. The only remaining manual release gates are administrator mapping-UI acceptance and authorized real Feige mapped/unmapped paid-order acceptance; this record does not claim either passed.

## Global Constraints

- 工作目录固定为 `.worktrees/ai-browser-employee-mvp`，分支固定为 `codex/ai-browser-employee-mvp`；不得直接修改 `main`。
- 保留用户已有未提交内容：`.superpowers/sdd/2026-08-08-browser-contact-os-remark-green-flag/progress.md` 和未跟踪的 `tmp/`，不得覆盖、删除或纳入本功能提交。
- 本阶段继续由客服确认后执行；不自动发送聊天消息，不移除联系方式确认，不进入无人值守全自动化。
- 幂等键继续使用 `平台 + 店铺稳定标识 + 平台订单号`；同一订单不得重复创建线索。
- 插件不得提交或覆盖 `source`、`sourceName`、`sourceType`、OS产品名称和销售人员；这些字段必须由极享OS后端根据配置与线索流转结果生成。
- 线索来源固定显示为 `抖音电商 / 飞鸽客服`，资源归属固定为 `公司资源`；店铺绑定可停用，来源配置由系统集成自动维护并向管理员可见。
- 商品匹配优先使用平台商品 ID/SKU，其次使用当前店铺下的已确认名称别名，再次使用唯一的OS产品完全同名；禁止按价格单独匹配，禁止模糊匹配后静默选择。
- 平台实付金额和付款时间必须来自当前飞鸽订单卡；OS产品价格只用于参考和差异提示，绝不能覆盖平台实付金额。
- 平台商品名称、非负且最多两位小数的实付金额、有效付款时间是预览和入库必填事实；不完整或不唯一时失败关闭。
- 每次完成点击必须重读页面并用最新事实重新权威预览；事实、匹配或价差变化时刷新快照、清除确认，必须二次核对确认后再点击。
- 商品未匹配时仍允许录入线索，但不写 `sourceProductId/sourceProductName`，并在OS线索备注中保存 `平台商品待匹配：<原始平台商品名>`。
- 商品匹配成功时写入OS标准产品 ID 与名称，同时在同步审计记录中保留平台商品原名、平台商品 ID/SKU、匹配方式和原始实付事实。
- 订单备注固定为两行，原备注必须原样保留：第一行包含昵称、现有联系方式和销售对接人；第二行包含权威OS入库时间。格式见 Task 7。
- 销售由现有极享OS线索流转规则同步分配；有负责人写员工姓名，无负责人写 `暂未分配`。
- 自动设置的唯一旗帜是绿色；其他旗帜继续由人工处理。
- 页面、店铺、订单或商品配置出现歧义时必须安全停止并显示明确可操作提示，不得猜测点击。
- 退出成功只接受`code === 0`且本地清理完成；任意 HTTP 401 都是 worker/UI 一致的终态本地退出。
- 商品映射写入必须在同一事务内锁定店铺行并重新校验存在/active；线索同步终态回写必须持有当前`attemptToken`租约。
- 所有行为变化遵循 RED-GREEN-REFACTOR；每个任务通过聚焦测试后再运行相关全量测试并独立提交。

---

## File Structure

### Backend domain and persistence

- `prisma/schema.prisma`: 新增店铺绑定、平台商品映射、同步审计字段，以及首次成功联系人快照字段。
- `prisma/migrations/20260808090000_browser_store_product_mapping/migration.sql`: 创建新表并扩展 `browser_lead_syncs`。
- `prisma/migrations/20260809010000_browser_sync_contact_snapshot/migration.sql`: 为旧库增加可空的`contactNickname/contactPhone/contactWechat`兼容字段。
- `prisma/migrations/20260809020000_browser_sync_attempt_token/migration.sql`: 以可滚动部署的 nullable 字段和存量 UUID 回填增加单次执行租约；已部署至授权的本地`127.0.0.1/jixiang_os`。
- `server/services/browserAgent/browserCatalogTypes.ts`: 店铺、映射、解析结果和错误码的单一类型定义。
- `server/services/browserAgent/browserProductMatcher.ts`: 无数据库依赖的确定性商品匹配规则。
- `server/services/browserAgent/browserCatalogService.ts`: 店铺/映射管理、产品目录读取和运行时配置；在锁内用最新店铺状态失败关闭。
- `server/services/browserAgent/prismaBrowserCatalogRepository.ts`: Prisma 持久化和OS标准产品读取；映射写入提供同事务店铺行`FOR UPDATE`。
- `server/services/browserAgent/prismaBrowserCatalogRepository.test.ts`: 校验锁 SQL 和锁内存在/active快照传递。
- `server/services/browserAgent/browserOrderRemark.ts`: 根据联系方式、销售和权威时间生成两行订单备注。
- `server/services/browserAgent/browserLeadIntakeService.ts`: 绑定解析、商品匹配、来源派生、原始订单事实入库和清晰冲突提示。
- `server/services/browserAgent/prismaBrowserLeadSyncRepository.ts`: 保存审计字段；原子固化首次成功快照；对旧成功空快照做条件回填并重读；区分有效/回收站/不存在线索；用`attemptToken`防止失效执行者回写。
- `server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`: 验证首次成功快照不可变、旧行并发回填收敛、缺失/异常数据失败关闭及同步状态单调性。
- `server/services/browserAgent/prismaBrowserLeadSyncRepository.lease.test.ts`: 验证旧租约在新租约抢占后不得覆盖新`PENDING/SUCCEEDED`，当前 token 可正常成功/失败。
- `server/routes/browserAgentRoutes.ts`: 运行时目录和管理员店铺/映射接口。
- `server/index.ts`: 注入目录服务以及产品设置读写权限。

### OS frontend

- `src/types/browserAgent.ts`: OS设置页使用的店铺、映射、产品解析类型。
- `src/api/browserAgentConfigApi.ts`: 店铺和商品映射管理 API。
- `src/api/index.ts`: 导出新 API。
- `src/pages/Settings/BrowserAgentConfig.tsx`: 店铺绑定与平台商品映射管理页。
- `src/pages/Settings/BrowserAgentConfig.test.ts`: 表格字段、分页和关键交互静态/组件测试。
- `src/pages/Settings/index.tsx`: 在“产品设置”中增加“平台商品映射”标签页。

### Browser extension

- `apps/browser-extension/src/content/douyinFeigeAdapter.ts`: 读取店铺显示名、商品 ID/SKU、实付金额和付款时间。
- `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`: 真实飞鸽结构夹具和安全歧义测试。
- `apps/browser-extension/src/shared/contracts.ts`: 扩展运行时店铺、订单事实、商品匹配和后端备注行合同。
- `apps/browser-extension/src/background/serviceWorker.ts`: 运行时店铺目录请求和新入库合同转发。
- `apps/browser-extension/src/domain/orderCompletion.ts`: 只合并后端提供的标准备注行，不在页面端重新决定销售和时间。
- `apps/browser-extension/src/domain/orderCompletion.test.ts`: 新备注格式和幂等合并测试。
- `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`: 把后端返回的备注行传给页面完成动作。
- `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`: 店铺、匹配、入库、备注和绿旗顺序测试。
- `apps/browser-extension/src/sidepanel/main.tsx`: 绑定店铺选择、商品匹配预览、实付事实和可操作错误展示。
- `apps/browser-extension/src/sidepanel/mainAttemptCancellation.test.tsx`: 覆盖必填事实、变化后二次确认、取消所有权、`code === 0`退出和401本地登出。
- `apps/browser-extension/src/sidepanel/orderCompletionPanelState.ts`: 保存当前店铺与商品解析状态，切换会话时清空旧状态。

### Documentation

- `docs/ai-browser-employee-mvp.md`: 管理员配置、客服使用、异常处理和真实页面验收说明。
- `docs/superpowers/specs/2026-08-08-browser-contact-os-remark-green-flag-design.md`: 把旧备注格式更新为本计划确认的新格式。

---

### Task 1: 定义确定性的商品匹配领域规则

**Files:**
- Create: `server/services/browserAgent/browserCatalogTypes.ts`
- Create: `server/services/browserAgent/browserProductMatcher.ts`
- Create: `server/services/browserAgent/browserProductMatcher.test.ts`

**Interfaces:**
- Consumes: OS产品 `{ id, name, price, isActive }`、当前店铺映射、飞鸽原始商品事实。
- Produces: `normalizePlatformProductName(value)` 和 `resolveBrowserProduct(input): BrowserProductResolution`。

- [ ] **Step 1: 写失败测试，锁定匹配优先级和禁止行为**

```ts
const products = [
  { id: 'prod-taojin', name: '淘金AI', price: 299, isActive: true },
  { id: 'prod-other', name: '其他产品', price: 299, isActive: true },
];

assert.deepEqual(resolveBrowserProduct({
  facts: { platformProductId: 'DY-100', platformProductName: '淘金AI 多模态创作智能体 读书卡', paymentAmount: 299 },
  products,
  mappings: [{
    id: 'map-1', shopBindingId: 'shop-1', platformIdentityKey: 'product:DY-100',
    platformProductId: 'DY-100', platformProductName: '淘金AI 多模态创作智能体 读书卡',
    aliases: [], osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
  }],
}), {
  status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID',
  osProductId: 'prod-taojin', osProductName: '淘金AI', osReferencePrice: 299,
});

assert.equal(resolveBrowserProduct({
  facts: { platformProductName: '完全不同的名称', paymentAmount: 299 }, products, mappings: [],
}).status, 'UNMATCHED', '相同价格不能触发商品匹配');
```

测试还必须覆盖：同店铺别名匹配、唯一OS完全同名、停用映射、停用OS产品、两个映射命中不同产品时返回 `CONFIG_CONFLICT`、空商品名返回 `UNMATCHED`。

- [ ] **Step 2: 运行聚焦测试并确认失败**

Run: `npm exec -- tsx server/services/browserAgent/browserProductMatcher.test.ts`

Expected: FAIL，提示模块或导出不存在。

- [ ] **Step 3: 实现类型和纯匹配器**

```ts
export type ProductMatchMethod = 'PLATFORM_PRODUCT_ID' | 'PLATFORM_SKU_ID' | 'SHOP_ALIAS' | 'EXACT_OS_NAME';

export type BrowserProductResolution =
  | { status: 'MATCHED'; method: ProductMatchMethod; osProductId: string; osProductName: string; osReferencePrice: number }
  | { status: 'UNMATCHED'; rawProductName: string }
  | { status: 'CONFIG_CONFLICT'; message: string };

export function normalizePlatformProductName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}
```

实现顺序必须为：稳定商品ID → SKU ID → 当前店铺别名 → 唯一OS完全同名。`paymentAmount` 不参与任何选择分支，只在结果展示阶段比较参考价。

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm exec -- tsx server/services/browserAgent/browserProductMatcher.test.ts`

Expected: PASS。

Run: `npx tsc --noEmit -p tsconfig.node.json`

Expected: exit 0。

- [ ] **Step 5: 提交**

```bash
git add server/services/browserAgent/browserCatalogTypes.ts server/services/browserAgent/browserProductMatcher.ts server/services/browserAgent/browserProductMatcher.test.ts
git commit -m "feat(browser-agent): define deterministic product matching"
```

---

### Task 2: 建立店铺绑定、商品映射和同步审计数据模型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260808090000_browser_store_product_mapping/migration.sql`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

**Interfaces:**
- Consumes: Task 1 的映射类型。
- Produces: `BrowserShopBinding`、`BrowserProductMapping` 和扩展后的 `BrowserLeadSync`。

- [ ] **Step 1: 写失败的仓储测试**

测试创建同步记录时必须保存以下事实：`shopBindingId`、`shopDisplayName`、`platformProductId`、`platformSkuId`、`sourceProductName`、`matchedProductId`、`matchedProductName`、`productMatchMethod`、`sourcePaymentAmount`、`sourcePaymentAt`。测试还要断言 `markSucceeded()` 只写一次 `completedAt`，重复读取沿用原时间。

- [ ] **Step 2: 运行仓储测试并确认新字段缺失**

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Expected: FAIL，新审计字段不存在或未传给 Prisma。

- [ ] **Step 3: 增加 Prisma 模型**

在 `schema.prisma` 中增加：

```prisma
model BrowserShopBinding {
  id               String   @id @db.VarChar(64)
  platform         String   @db.VarChar(40)
  shopKey          String   @db.VarChar(120)
  platformShopId   String?  @db.VarChar(160)
  displayName      String   @db.VarChar(160)
  aliases          Json
  source           String   @default("抖音电商") @db.VarChar(80)
  sourceName       String   @default("飞鸽客服") @db.VarChar(80)
  sourceType       String   @default("公司资源") @db.VarChar(40)
  active           Boolean  @default(true)
  createdById      String   @db.VarChar(64)
  createdByName    String   @db.VarChar(100)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  productMappings  BrowserProductMapping[]

  @@unique([platform, shopKey])
  @@index([platform, platformShopId])
  @@index([active, updatedAt])
  @@map("browser_shop_bindings")
}

model BrowserProductMapping {
  id                    String   @id @db.VarChar(64)
  shopBindingId         String   @db.VarChar(64)
  platformIdentityKey   String   @db.VarChar(300)
  platformProductId     String?  @db.VarChar(200)
  platformSkuId         String?  @db.VarChar(200)
  platformProductName   String   @db.VarChar(500)
  aliases               Json
  osProductId           String   @db.VarChar(64)
  osProductName         String   @db.VarChar(200)
  active                Boolean  @default(true)
  confirmedById         String   @db.VarChar(64)
  confirmedByName       String   @db.VarChar(100)
  confirmedAt           DateTime @default(now())
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  shopBinding           BrowserShopBinding @relation(fields: [shopBindingId], references: [id], onDelete: Restrict)

  @@unique([shopBindingId, platformIdentityKey])
  @@index([shopBindingId, active, updatedAt])
  @@index([osProductId])
  @@map("browser_product_mappings")
}
```

扩展 `BrowserLeadSync`，字段名称与仓储测试完全一致；`sourcePaymentAmount` 使用 `Decimal? @db.Decimal(14, 2)`，`sourcePaymentAt` 使用 `DateTime?`，并为 `shopBindingId`、`matchedProductId` 建索引。

- [ ] **Step 4: 写等价 migration.sql 并验证 Prisma**

Run: `npx prisma format`

Run: `npx prisma validate`

Run: `npm run db:generate`

Expected: 三条命令 exit 0；migration 创建两张新表、外键、唯一键、索引，并使用 `ALTER TABLE browser_lead_syncs` 增加审计字段。

- [ ] **Step 5: 更新同步仓储并通过测试**

`reserve()` 必须接收并持久化完整订单事实。`BrowserLeadSyncRecord` 增加 `completedAt?: Date | null` 和匹配审计字段；重复订单返回原 `completedAt`，不得在每次点击时重写入库时间。

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/20260808090000_browser_store_product_mapping/migration.sql server/services/browserAgent/prismaBrowserLeadSyncRepository.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts
git commit -m "feat(browser-agent): persist shop and product mappings"
```

---

### Task 3: 实现OS店铺与商品映射管理接口

**Files:**
- Create: `server/services/browserAgent/prismaBrowserCatalogRepository.ts`
- Create: `server/services/browserAgent/browserCatalogService.ts`
- Create: `server/services/browserAgent/browserCatalogService.test.ts`
- Modify: `server/routes/browserAgentRoutes.ts`
- Modify: `server/routes/browserAgentRoutes.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: Task 1 类型、Task 2 模型、`STORAGE_KEYS.PRODUCTS` 下的OS产品记录。
- Produces: 运行时店铺目录、管理员CRUD和 `resolveForIntake(input)`。

- [ ] **Step 1: 写失败服务测试**

覆盖以下规则：

1. `listRuntimeShops()` 只返回启用店铺以及只读来源配置。
2. `createShop()` 的 `shopKey` 在 `platform` 内唯一，创建后不可修改。
3. `saveMapping()` 必须验证OS产品存在且启用，并保存产品名称快照。
4. 同一店铺的两个启用映射不得拥有相同规范化别名。
5. 删除已有审计引用的店铺或映射改为停用，不做物理删除。
6. `resolveForIntake()` 返回绑定、OS标准产品与价格差异信息；未匹配不报错。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm exec -- tsx server/services/browserAgent/browserCatalogService.test.ts`

Expected: FAIL，服务不存在。

- [ ] **Step 3: 实现仓储与服务**

OS产品读取必须查询 `BusinessRecord(domain = STORAGE_KEYS.PRODUCTS)`，使用 `recordId` 作为产品 ID，`data.name/data.price/data.isActive` 作为标准产品事实。禁止读取浏览器 `localStorage` 作为服务器权威目录。

管理员输入别名时统一调用 `normalizePlatformProductName()`；保存前扫描同店铺所有启用映射，若同一别名指向不同OS产品，返回 HTTP 409 和错误码 `PRODUCT_ALIAS_CONFLICT`。

- [ ] **Step 4: 增加路由与权限**

路由合同固定为：

```text
GET    /api/browser-agent/runtime-config
GET    /api/browser-agent/catalog
POST   /api/browser-agent/catalog/shops
PUT    /api/browser-agent/catalog/shops/:id
POST   /api/browser-agent/catalog/product-mappings
PUT    /api/browser-agent/catalog/product-mappings/:id
DELETE /api/browser-agent/catalog/product-mappings/:id
```

`runtime-config` 使用已认证权限；`catalog` 和所有变更接口使用 `PERMISSION_KEYS.SETTINGS_PRODUCTS`，GET 需要 read，POST/PUT/DELETE 需要 write。`server/index.ts` 注入 `requireBrowserCatalogRead` 和 `requireBrowserCatalogWrite`，不增加新的宽泛管理员绕过。

- [ ] **Step 5: 写路由测试并运行**

路由测试必须断言客服可以读取 `runtime-config`，无产品设置权限不能读取管理目录或修改映射，管理员可以创建/停用绑定与映射，409 错误保留结构化 `errorCode`。

Run: `npm exec -- tsx server/routes/browserAgentRoutes.test.ts`

Run: `npm exec -- tsx server/services/browserAgent/browserCatalogService.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add server/services/browserAgent/prismaBrowserCatalogRepository.ts server/services/browserAgent/browserCatalogService.ts server/services/browserAgent/browserCatalogService.test.ts server/routes/browserAgentRoutes.ts server/routes/browserAgentRoutes.test.ts server/index.ts
git commit -m "feat(browser-agent): add shop mapping administration"
```

---

### Task 4: 在极享OS增加“平台商品映射”管理页

**Files:**
- Create: `src/types/browserAgent.ts`
- Create: `src/api/browserAgentConfigApi.ts`
- Modify: `src/api/index.ts`
- Create: `src/pages/Settings/BrowserAgentConfig.tsx`
- Create: `src/pages/Settings/BrowserAgentConfig.test.ts`
- Modify: `src/pages/Settings/index.tsx`

**Interfaces:**
- Consumes: Task 3 的管理 API 和现有 `productApi.getAllProducts()`。
- Produces: 管理员可控的店铺绑定、来源展示和商品映射配置界面。

- [ ] **Step 1: 写失败的页面合同测试**

测试读取页面源码/渲染结果，断言存在以下固定字段：店铺名称、稳定店铺标识、平台店铺ID、店铺别名、来源、状态、平台商品名称、平台商品ID、SKU、OS标准产品、OS参考价、最近更新时间。断言存在总条数、页码、每页条数和跳页控件，并且桌面表格与窄屏卡片使用同一个过滤和分页结果。

- [ ] **Step 2: 运行测试确认页面不存在**

Run: `npm exec -- tsx src/pages/Settings/BrowserAgentConfig.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现API客户端和类型**

`browserAgentConfigApi` 只能调用 Task 3 的专用 API；错误响应必须保留 `errorCode` 和服务端中文 message。创建/编辑映射的输入类型固定包含：

```ts
type BrowserProductMappingInput = {
  shopBindingId: string;
  platformProductId?: string;
  platformSkuId?: string;
  platformProductName: string;
  aliases: string[];
  osProductId: string;
  active: boolean;
};
```

- [ ] **Step 4: 实现设置页**

把页面放在“产品设置 → 平台商品映射”，复用现有 MUI 设置页、`useAppFeedback()` 和统一表格样式。上半区管理店铺绑定，下半区按选中店铺管理映射；来源显示为只读 `公司资源 / 抖音电商 / 飞鸽客服`。停用店铺前弹窗说明“停用后插件不能以该店铺创建新线索，历史记录保留”。

商品下拉只显示OS启用产品，并同时显示 `淘金AI / 参考价 ¥299.00`。平台名称和别名按行编辑；价格不作为映射条件，界面不得提供“按价格自动匹配”开关。

- [ ] **Step 5: 运行页面测试、前端类型检查与构建**

Run: `npm exec -- tsx src/pages/Settings/BrowserAgentConfig.test.ts`

Run: `npx tsc -b`

Run: `npm run build`

Expected: 全部 exit 0。

- [ ] **Step 6: 提交**

```bash
git add src/types/browserAgent.ts src/api/browserAgentConfigApi.ts src/api/index.ts src/pages/Settings/BrowserAgentConfig.tsx src/pages/Settings/BrowserAgentConfig.test.ts src/pages/Settings/index.tsx
git commit -m "feat(settings): manage browser product mappings"
```

---

### Task 5: 从真实飞鸽订单读取店铺、商品身份和实付事实

**Files:**
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`
- Modify: `apps/browser-extension/src/shared/contracts.ts`

**Interfaces:**
- Consumes: 当前唯一可见活动订单卡。
- Produces: 扩展后的 `FeigePageContext`：`shopDisplayName`、`platformProductId`、`platformSkuId`、`productName`、`paymentAmount`、`paymentAt`。

- [ ] **Step 1: 增加失败的真实结构夹具**

夹具必须包含用户截图中的文案结构：

```html
<div data-testid="shop-name">极享智能体</div>
<div role="button" aria-expanded="true" data-testid="order-card">
  <span data-jx-order-status>已发货</span>
  <span data-jx-order-no>6955070819967571696</span>
  <span data-btm="d5834" data-product-id="DY-TAOJIN-100">淘金AI 多模态创作智能体 读书卡</span>
  <div>实付金额 <strong>¥299.00</strong></div>
  <div>付款时间 <strong>2026/08/08 19:34:20 (抖音月付)</strong></div>
</div>
```

断言结果为：店铺 `极享智能体`、商品名原样保留、商品 ID `DY-TAOJIN-100`、金额 `299`、付款时间 `2026-08-08T19:34:20+08:00`。

同时增加多金额、多付款时间、两张活动订单卡、金额格式无效和付款时间无效测试；歧义时对应字段为空并写入 diagnostics，不得从其他订单卡取值。

- [ ] **Step 2: 运行适配器测试确认失败**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Expected: FAIL，新字段不存在。

- [ ] **Step 3: 实现同订单卡范围内的解析**

金额解析只接受 `实付金额` 标签附近唯一的人民币数值；付款时间只接受 `付款时间` 标签附近唯一的 `YYYY/MM/DD HH:mm:ss`，并显式补上 `+08:00`。商品 ID/SKU 优先读取当前商品节点及祖先的 `data-product-id/data-item-id/data-sku-id`；没有稳定属性时保持为空，依靠店铺名称别名映射。

店铺显示名可以从明确的店铺区域读取，但不得把当前客服员工姓名、客户昵称或商品品牌误当店铺。页面无法唯一证明店铺时返回空字符串，插件失败关闭并要求刷新识别，不得按已绑定店铺猜测继续。

- [ ] **Step 4: 运行适配器测试和扩展类型检查**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Run: `npm run browser-employee:typecheck`

Expected: PASS / exit 0。

- [ ] **Step 5: 提交**

```bash
git add apps/browser-extension/src/content/douyinFeigeAdapter.ts apps/browser-extension/src/content/douyinFeigeAdapter.test.ts apps/browser-extension/src/shared/contracts.ts
git commit -m "feat(browser-extension): read feige order payment facts"
```

---

### Task 6: 用店铺绑定和商品映射驱动线索入库

**Files:**
- Modify: `server/services/browserAgent/browserLeadIntakeService.ts`
- Modify: `server/services/browserAgent/browserLeadIntakeService.test.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `shopBindingId`、飞鸽原始订单事实、Task 3 的 `resolveForIntake()`。
- Produces: 权威来源、店铺、产品、实付快照、销售分配结果和匹配审计。

- [ ] **Step 1: 写失败的入库服务测试**

至少覆盖五个案例：

1. 店铺A的长平台名称映射到 `淘金AI`，实付299，线索写OS产品 `淘金AI` 和金额299。
2. 店铺B的另一个名称也映射到同一OS产品，实付399，线索仍写产品 `淘金AI`，金额必须是399而不是OS参考价299。
3. 未匹配商品仍创建线索，产品字段为空，备注包含 `平台商品待匹配：...`。
4. 停用/不存在店铺返回 `SHOP_BINDING_UNAVAILABLE`，创建线索函数未调用。
5. 页面店铺名与绑定店铺及别名都不一致时返回 `SHOP_CONTEXT_MISMATCH`，创建线索函数未调用。

- [ ] **Step 2: 运行服务测试确认失败**

Run: `npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts`

Expected: FAIL，服务仍使用插件提交的 `shopKey/sourceProductName`。

- [ ] **Step 3: 修改入库合同**

`BrowserLeadIntakeInput` 改为：

```ts
type BrowserLeadIntakeInput = {
  platform: 'DOUYIN';
  shopBindingId: string;
  pageShopDisplayName?: string;
  platformOrderNo: string;
  contactName: string;
  contactSource: 'CHAT' | 'OFF_PLATFORM';
  contactPhone?: string;
  contactWechat?: string;
  platformProductId?: string;
  platformSkuId?: string;
  platformProductName?: string;
  paymentAmount?: number;
  paymentAt?: string;
};
```

移除由插件指定 `shopKey`、`sourceProductId/sourceProductName` 和来源文本的能力。

- [ ] **Step 4: 后端派生权威线索字段**

绑定成功后由服务写入：

```ts
source: binding.source,
sourceName: binding.sourceName,
sourceType: binding.sourceType,
sourcePlatformId: 'DOUYIN',
sourcePlatformName: '抖音',
sourceShopId: binding.shopKey,
sourceShopName: binding.displayName,
platformOrderNo: normalized.platformOrderNo,
sourcePaymentAmount: normalized.paymentAmount,
sourcePaymentAt: normalized.paymentAt,
```

匹配成功才增加 `sourceProductId: resolution.osProductId` 和 `sourceProductName: resolution.osProductName`。线索备注固定包含录入渠道、店铺和平台原商品；未匹配时追加 `平台商品待匹配：<原始名称>`，匹配成功时追加 `平台商品：<原始名称>；匹配OS产品：<标准名称>`。

- [ ] **Step 5: 保留现有销售流转并返回结果**

继续调用现有 `customerCommandService.createLead`，不得在浏览器员工服务中另写一套分配算法。使用其返回的 `assignedTo/assignedToId/intakeStatus` 写同步记录并返回插件。

Run: `npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts`

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add server/services/browserAgent/browserLeadIntakeService.ts server/services/browserAgent/browserLeadIntakeService.test.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts server/index.ts
git commit -m "feat(browser-agent): intake mapped platform products"
```

---

### Task 7: 由后端生成含销售和入库时间的统一订单备注

**Files:**
- Create: `server/services/browserAgent/browserOrderRemark.ts`
- Create: `server/services/browserAgent/browserOrderRemark.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260809010000_browser_sync_contact_snapshot/migration.sql`
- Modify: `server/services/browserAgent/browserLeadIntakeService.ts`
- Modify: `server/services/browserAgent/browserLeadIntakeService.test.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`
- Modify: `apps/browser-extension/src/domain/orderCompletion.ts`
- Modify: `apps/browser-extension/src/domain/orderCompletion.test.ts`
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Modify: `apps/browser-extension/src/shared/activeTabMessaging.test.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionPanelState.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`

**Interfaces:**
- Consumes: 同步记录中权威的联系方式快照、`assignedTo` 和首次成功 `completedAt`；旧成功行只允许受控兼容回填。
- Produces: `remarkLines: [contactLine, intakeLine]`，插件只做保留原文的幂等合并。

- [ ] **Step 1: 写后端备注生成失败测试**

固定时间 `2026-08-08T13:00:00.000Z` 必须按 `Asia/Shanghai` 输出：

```ts
assert.deepEqual(buildBrowserOrderRemark({
  nickname: '海盗船长', phone: '13800138000', wechat: 'jx888',
  assignedTo: '王小明', completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/手机号：13800138000/微信号：jx888（对接：王小明）',
  '#入OS（2026-08-08 21:00）',
]);
```

另测手机号单独、微信单独、未分配销售、昵称含首尾空格以及缺少全部联系方式时抛出中文错误。

- [ ] **Step 2: 运行测试确认失败并实现生成器**

Run: `npm exec -- tsx server/services/browserAgent/browserOrderRemark.test.ts`

Expected: FAIL。

使用 `Intl.DateTimeFormat(..., { timeZone: 'Asia/Shanghai', hour12: false })` 的 `formatToParts()` 生成固定 `YYYY-MM-DD HH:mm`，不得使用插件电脑的本地时间。

- [ ] **Step 3: 持久化不可变首次成功快照并兼容旧行**

在`BrowserLeadSync`和迁移中加入可空的`contactNickname/contactPhone/contactWechat`。新记录的`markSucceeded()`必须在同一事务内、仅当`completedAt IS NULL`时一起写入首次`completedAt`、联系人快照、`assignedTo/assignedToId`；重复成功不得覆盖第一次胜者。

迁移前已经`SUCCEEDED`但三个联系人字段全空的旧行，只能在关联线索仍有效时通过三个字段全为`NULL`的条件更新回填一次当前线索联系人，并立即重读数据库。这个兼容回填不能声称恢复历史首次成功联系方式。关联线索缺失/回收、快照残缺或格式不安全、首次成功时间缺失时，响应必须失败关闭并要求人工核对，禁止重建猜测性备注。

Run: `npx prisma validate`

Run: `npm run db:generate`

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Expected: PASS；首次写入不可变，并发旧行回填收敛到同一持久化结果。

- [ ] **Step 4: 后端响应返回权威备注行**

`BrowserLeadIntakeResult` 增加：

```ts
completedAt: string;
remarkLines: [string, string];
productResolution: BrowserProductResolution;
shop: { id: string; shopKey: string; displayName: string };
```

首次创建和`ALREADY_CREATED`都必须基于同步记录保存的`completedAt`、联系方式和销售生成同样的备注行。任何必要快照缺失、残缺、含换行或时间无效时都返回可操作错误，不向插件发送猜测结果。

- [ ] **Step 5: 修改扩展备注合并合同**

`CompleteOsOrderInput` 不再接收 phone/wechat，改为：

```ts
type CompleteOsOrderInput = {
  expectedOrderNo: string;
  expectedCustomerDisplayName: string;
  remarkLines: [string, string];
};
```

`mergeOsOrderRemark(existing, remarkLines)` 保留原备注的字符和行序，只追加缺失的完整行；同一输入重复执行结果不变。插件不得自行生成销售姓名或入库时间。

- [ ] **Step 6: 运行后端和扩展测试**

Run: `npm exec -- tsx server/services/browserAgent/browserOrderRemark.test.ts`

Run: `npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts`

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/domain/orderCompletion.test.ts`

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/20260809010000_browser_sync_contact_snapshot/migration.sql server/services/browserAgent/browserOrderRemark.ts server/services/browserAgent/browserOrderRemark.test.ts server/services/browserAgent/browserLeadIntakeService.ts server/services/browserAgent/browserLeadIntakeService.test.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts apps/browser-extension/src/domain/orderCompletion.ts apps/browser-extension/src/domain/orderCompletion.test.ts apps/browser-extension/src/shared/contracts.ts apps/browser-extension/src/shared/activeTabMessaging.test.ts apps/browser-extension/src/content/douyinFeigeAdapter.ts apps/browser-extension/src/content/douyinFeigeAdapter.test.ts apps/browser-extension/src/sidepanel/orderCompletionPanelState.test.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts
git commit -m "feat(browser-agent): standardize assigned sales remarks"
```

实际功能提交为`1c87997 feat(browser-agent): standardize assigned sales remarks`；随后`61a26b2 fix(browser-agent): stabilize authoritative order remarks`补齐单行校验、失败关闭和旧行原子回填并重读。

---

### Task 8: 区分回收站、资料冲突和可重试失败

**Files:**
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`
- Modify: `server/services/browserAgent/browserLeadIntakeService.ts`
- Modify: `server/services/browserAgent/browserLeadIntakeService.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`

**Interfaces:**
- Consumes: `LeadRecord.data.deletedAt`、已有同步记录、提交联系方式。
- Produces: 结构化冲突码和不会误操作飞鸽订单的错误结果。

- [ ] **Step 1: 写失败测试复现“OS已删除但仍失败”**

仓储夹具放入带 `data.deletedAt` 的 leadRecord，断言 `reserve()` 不再把它对账为有效 `SUCCEEDED`。服务必须返回：

```ts
{
  errorCode: 'LEAD_IN_RECYCLE_BIN',
  message: '该订单已录入极享OS，但原线索已在业务回收站。请先恢复原线索，或由管理员彻底清理该订单的同步记录后再重试；本次不会修改飞鸽订单。'
}
```

另测资料不一致返回 `ORDER_CONTACT_CONFLICT`，message 明确列出“昵称不一致/手机号不一致/微信号不一致”中的实际差异，但不在日志中输出完整联系方式。

- [ ] **Step 2: 运行测试确认当前误判**

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Run: `npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts`

Expected: 至少一个 FAIL，软删除记录被当作有效线索。

- [ ] **Step 3: 实现结构化仓储状态**

`reserve()` 的重复结果增加 `existingLeadState: 'ACTIVE' | 'RECYCLED' | 'MISSING'`。读取 `leadRecord.data.deletedAt` 时返回 `RECYCLED`，不覆盖同步记录的原完成事实，不自动创建重复线索。只有 `MISSING` 且同步状态为失败/过期处理中时允许安全重试。

- [ ] **Step 4: 工作流遇到冲突时禁止页面动作**

扩展接到 `LEAD_IN_RECYCLE_BIN`、`ORDER_CONTACT_CONFLICT`、`SHOP_CONTEXT_MISMATCH` 或 `PRODUCT_CONFIG_CONFLICT` 后，必须停留在OS阶段；断言 `completePage()` 和平台完成上报均未调用。

- [ ] **Step 5: 运行测试**

Run: `npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`

Run: `npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts`

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add server/services/browserAgent/prismaBrowserLeadSyncRepository.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts server/services/browserAgent/browserLeadIntakeService.ts server/services/browserAgent/browserLeadIntakeService.test.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts
git commit -m "fix(browser-agent): explain recycled intake conflicts"
```

---

### Task 9: 在插件中完成店铺选择、匹配预览和统一反馈

> **2026-08-09 final-fix status:** 先前的两个退出状态机 blocker 已修复并由分支测试覆盖：退出成功仅接受`code === 0`且本地清理完成；任意 HTTP 401 都会让 worker/UI 收敛到终态本地退出。这两项不再是开放发布 blocker。

**Files:**
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Modify: `apps/browser-extension/src/background/serviceWorker.ts`
- Modify: `apps/browser-extension/src/shared/workerMessaging.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionPanelState.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionPanelState.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/main.tsx`

**Interfaces:**
- Consumes: `runtime-config`、扩展后的飞鸽上下文、入库返回的商品解析与备注行。
- Produces: 客服可理解、可控且保留人工确认的一键流程。

- [ ] **Step 1: 写失败的状态与消息测试**

覆盖：切换会话清空旧商品解析；切换绑定店铺清空旧入库结果；多个店铺时未选择不能入库；页面店铺不一致时不能入库；商品名/实付/付款时间不完整时不预览也不入库；完成点击重读并重预览，事实/匹配变化时停止并要求二次确认；未匹配商品允许继续但展示警告；OS参考价与实付金额不同只提示不阻止；后端备注行原样传给 `completePage()`；退出只接受`code === 0`，401收敛为本地登出。

- [ ] **Step 2: 运行扩展测试确认失败**

Run: `npm run browser-employee:test`

Expected: 新测试 FAIL。

- [ ] **Step 3: 调整登录和店铺绑定流程**

登录表单只要求 API 地址、账号和密码。登录成功后加载 `runtime-config`：

- 只有一个启用店铺时默认选中并显示。
- 多个店铺时必须手工选择，选择结果保存为 `shopBindingId`。
- 旧配置中的自由文本 `shopKey` 只用于一次性查找同名绑定并迁移；找不到时必须重新选择，不能继续自由提交。
- 已选店铺停用后立即清除选择并阻止入库。

- [ ] **Step 4: 显示订单事实与匹配状态**

当前会话卡增加：绑定店铺、页面店铺、平台商品、匹配OS产品、匹配方式、OS参考价、平台实付金额、付款时间。显示规则固定为：

```text
平台商品：淘金AI 多模态创作智能体 读书卡
匹配产品：淘金AI
实付金额：¥299.00
匹配方式：店铺商品映射
```

未匹配显示 `匹配产品：待匹配（本次仍可录入，平台原名会写入OS备注）`。价格不同显示 `OS参考价 ¥299.00，仅供参考；本次按飞鸽实付 ¥399.00 录入`。

平台商品名称、非负且最多两位小数的实付、有效付款时间是必填事实。点击完成时再次读页面和请求权威预览；最新快照不同则替换界面预览、取消原联系方式确认，客服必须二次核对并再点击。

- [ ] **Step 5: 统一弹窗反馈**

继续使用现有 `FeedbackDialog`，禁止在面板顶部新增横幅式错误。错误弹窗标题使用“操作未完成”，正文直接显示后端可操作中文提示；成功弹窗显示线索编号、销售和“订单备注、绿色旗帜均已验证”。

- [ ] **Step 6: 运行扩展全量验证**

Run: `npm run browser-employee:test`

Run: `npm run browser-employee:typecheck`

Run: `npm run browser-employee:build`

Expected: 全部 exit 0，`apps/browser-extension/dist/manifest.json` 存在。

- [ ] **Step 7: 提交**

```bash
git add apps/browser-extension/src/shared/contracts.ts apps/browser-extension/src/background/serviceWorker.ts apps/browser-extension/src/shared/workerMessaging.test.ts apps/browser-extension/src/sidepanel/orderCompletionPanelState.ts apps/browser-extension/src/sidepanel/orderCompletionPanelState.test.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts apps/browser-extension/src/sidepanel/main.tsx
git commit -m "feat(browser-extension): preview controlled product mapping"
```

---

### Task 10: 更新操作文档并完成端到端验收

**Files:**
- Modify: `docs/ai-browser-employee-mvp.md`
- Modify: `docs/superpowers/specs/2026-08-08-browser-contact-os-remark-green-flag-design.md`
- Modify: `docs/superpowers/plans/2026-08-08-browser-store-product-mapping-and-intake.md`
- Modify only if verification finds a real mismatch: files changed in Tasks 1-9

**Interfaces:**
- Consumes: Tasks 1-9 的完整功能。
- Produces: 可重复执行的管理员配置、客服操作和发布验收流程。

- [x] **Step 1: 更新文档中的最终业务规则**

文档必须明确：

1. 管理员先创建店铺绑定，再为每个店铺维护平台商品名称/ID到OS产品的映射。
2. 同一个OS产品可以被多个店铺、多个平台名称映射。
3. 实付金额和付款时间来自飞鸽，OS价格仅供参考。
4. 未匹配商品可录入，但必须进入“待匹配”提示并保留原始名称。
5. 销售由OS线索流转分配，不由插件选择。
6. 新订单备注格式及历史原备注保留规则。
7. 回收站、资料冲突、店铺不一致和页面识别失败的处理办法。

- [x] **Step 2: 运行所有自动验证**

```bash
npx prisma validate
npm run db:generate
npm exec -- tsx server/services/browserAgent/browserProductMatcher.test.ts
npm exec -- tsx server/services/browserAgent/browserCatalogService.test.ts
npm exec -- tsx server/services/browserAgent/prismaBrowserCatalogRepository.test.ts
npm exec -- tsx server/services/browserAgent/browserOrderRemark.test.ts
npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts
npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts
npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.lease.test.ts
npm exec -- tsx server/routes/browserAgentRoutes.test.ts
npm run browser-employee:test
npm run browser-employee:typecheck
npm run browser-employee:build
npm run build
git diff --check
```

Expected: 全部 exit 0；不得为通过测试跳过失败用例或放宽安全校验。

- [ ] **Step 3: 本地迁移与管理员配置验收**

2026-08-09：脱敏预检确认目标为授权的本地`127.0.0.1/jixiang_os`后，`npm run db:deploy`已成功应用`20260809020000_browser_sync_attempt_token`。管理员配置 UI 验收仍未执行，因此本步骤保持未完成。

在本地数据库执行 `npm run db:deploy`，随后在极享OS“系统设置 → 产品设置 → 平台商品映射”创建：

```text
店铺：极享智能体
稳定标识：douyin-jixiang-intelligence
来源：公司资源 / 抖音电商 / 飞鸽客服
平台商品：淘金AI 多模态创作智能体 读书卡
OS产品：淘金AI
```

确认配置页能停用映射、拒绝别名冲突，并保留历史审计。

- [ ] **Step 4: 使用授权测试订单做真实页面验收**

2026-08-09：未获得并操作授权测试订单；本步骤保持未完成，不能用自动测试或DOM夹具替代。

按以下顺序验证，任何一步失败都停止后续写操作：

1. 打开一个已付款/已发货安全测试订单并刷新识别。
2. 确认店铺、订单号、平台商品、实付金额和付款时间与飞鸽一致。
3. 确认插件显示映射到 `淘金AI`，价格差异只提示。
4. 填写或识别客户联系方式并勾选确认。
5. 点击一键处理，确认点击时完成最新页面重读和权威重预览；可在授权测试中先制造一次事实/映射变化，确认首次停止、刷新快照并要求二次确认。随后确认OS线索的来源、店铺、订单号、标准产品、实付金额、付款时间和销售正确。
6. 确认飞鸽原备注保留，并追加：

```text
#海盗船长/手机号：13800138000/微信号：jx888（对接：王小明）
#入OS（2026-08-08 21:00）
```

7. 确认旗帜为绿色，重复点击不创建重复线索、不重复追加备注。
8. 再用未映射商品测试，确认线索成功、OS产品为空、线索备注包含平台商品待匹配，飞鸽订单仍按相同联系人格式闭环。

- [x] **Step 5: 检查分支卫生并提交文档**

Run: `git status --short`

Expected: 只出现本计划有意修改的文件，以及用户原有 `.superpowers/.../progress.md` 与未跟踪 `tmp/`；后两者不进入提交。

```bash
git add docs/ai-browser-employee-mvp.md docs/superpowers/specs/2026-08-08-browser-contact-os-remark-green-flag-design.md docs/superpowers/plans/2026-08-08-browser-store-product-mapping-and-intake.md
git commit -m "docs(browser-agent): document mapped intake workflow"
```

---

## Release Gate

自动安全约束已覆盖必填订单事实、点击时重预览/变化后二次确认、店铺行锁、`attemptToken`租约、幂等/回收站/冲突、页面未知状态、`code === 0`退出和401终态本地登出；新迁移已部署至授权本地库。数据库部署不冒充人工业务验收。

只保留以下两项手工发布门禁，当前都未宣称通过：

1. 在可安全写入的OS环境通过管理员映射 UI 完成店铺绑定和平台商品映射验收，包括停用、别名冲突、跨店复用和历史审计保留。
2. 使用明确获授权的真实飞鸽已付款/已发货订单，分别完成 mapped 和 unmapped 全链路验收，包括最新点击重预览/二次确认、OS线索/销售、原备注保留、标准两行、绿旗、重复点击幂等和真实页面成功信号。

真实 MySQL 双会话 live lock integration 可在后续受控数据库验证中补充，当前不作为第三项手工发布阻断。
