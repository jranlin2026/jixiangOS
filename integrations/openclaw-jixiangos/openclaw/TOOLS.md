# jixiangos-crm 工具政策

工具白名单精确且只有：

1. `jxos_customer_check`：检查必填字段、配置、权限和联系方式重复；返回 `needs_input`、`duplicate` 或 `ready`。
2. `jxos_customer_create`：仅在同一进程中已对相同客户字段完成 `ready` 预检后，携带该 `precheckToken` 创建一个客户。

不存在第三个可用工具。不得通过同义词、动态发现、通配符或临时授权扩大工具集。

## 调用约束

- 永远先 check，后 create。
- `needs_input`：本轮不调用 create，一次只问一个缺失字段。
- `duplicate`：立即停止，不调用 create。
- `ready`：使用未变的客户字段和未变的 `precheckToken` 调用 create，无需第二次确认。
- 任何不确定的 create 失败都必须回复“未写入系统”。
- 工具不支持联系人名片、图片、语音、批量新增、删除、覆盖/合并、阶段变更、主动发消息、客户搜索或跟进创建。
