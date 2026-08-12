import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/Academy/index.tsx"), "utf8");

assert.match(source, /SOP模板设置/, "课程库必须提供SOP模板配置入口");
assert.match(source, /模板列表/, "打开SOP模板设置必须先展示模板列表");
assert.match(source, /academy-sop-template-list/, "模板列表必须复用系统统一表格样式");
assert.match(source, /新建SOP模板/, "模板列表右上角必须提供新建入口");
assert.match(source, /编辑模板[\s\S]*停用模板[\s\S]*启用模板[\s\S]*删除模板/, "模板操作必须提供编辑、启停和删除图标");
assert.match(source, /deleteSopTemplate/, "模板删除必须通过受保护的服务接口执行");
assert.match(source, /流程阶段/, "模板步骤必须可配置课前、课中和课后阶段");
assert.match(source, /是否必做/, "模板步骤必须可配置是否为开课必做项");
assert.match(source, /直接确认[\s\S]*填写说明[\s\S]*上传附件[\s\S]*检查确认/, "步骤完成方式必须由模板决定");
assert.match(source, /moveSopStep/, "模板步骤必须支持调整顺序");
assert.match(source, /visibleSessionOwnerFields/, "创建课程安排必须按模板实际角色分配负责人");
assert.match(source, /workbenchTask\.completionMode === "ATTACHMENT"/, "只有附件型任务才能展示上传入口");
assert.match(source, /closeSopSettings/, "模板抽屉必须保护未保存编辑");
assert.match(source, /执行SOP模板 \*/, "新建课程必须明确绑定模板");
assert.doesNotMatch(source, /保存后将生成固定|固定九节点/, "页面不得继续承诺写死流程");

console.log("academy SOP template static tests passed");
