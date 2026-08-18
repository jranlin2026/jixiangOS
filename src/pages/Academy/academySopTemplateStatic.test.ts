import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/Academy/index.tsx"), "utf8");

assert.match(source, /课程流程设置/, "课程安排必须提供课程流程配置入口");
assert.doesNotMatch(source, /SOP模板设置/, "页面不应继续使用难理解的SOP模板名称");
assert.match(source, /流程列表/, "打开课程流程设置必须先展示流程列表");
assert.match(source, /academy-sop-template-list/, "流程列表必须复用系统统一表格样式");
assert.match(source, /新建课程流程/, "流程列表右上角必须提供新建入口");
assert.match(source, /设为默认流程/, "启用的课程流程必须能在列表中设为默认流程");
assert.match(source, /编辑流程[\s\S]*停用流程[\s\S]*启用流程[\s\S]*删除流程/, "流程操作必须提供编辑、启停和删除图标");
assert.match(source, /deleteSopTemplate/, "模板删除必须通过受保护的服务接口执行");
assert.match(source, /流程阶段/, "模板步骤必须可配置课前、课中和课后阶段");
assert.match(source, /是否必做/, "模板步骤必须可配置是否为开课必做项");
assert.match(source, /直接确认[\s\S]*填写说明[\s\S]*上传附件[\s\S]*检查确认/, "步骤完成方式必须由模板决定");
assert.match(source, /moveSopStage/, "课程流程必须支持以环节为单位调整真实执行顺序");
assert.match(source, /在当前环节添加并行任务/, "同一环节必须支持配置多项同步执行任务");
assert.match(source, /visibleSessionOwnerFields/, "创建课程安排必须按模板实际角色分配负责人");
assert.match(source, /workbenchTask\.completionMode === "ATTACHMENT"/, "只有附件型任务才能展示上传入口");
assert.match(source, /closeSopSettings/, "模板抽屉必须保护未保存编辑");
assert.match(source, /课程执行流程 \*/, "新建课程安排必须明确选择本次流程");
assert.doesNotMatch(source, /保存后将生成固定|固定九节点/, "页面不得继续承诺写死流程");

assert.match(
  source,
  /key=\{step\.id \|\| step\.stepKey\}/,
  "步骤卡必须使用不随输入内容变化的稳定标识，避免每输入一字就失去焦点",
);
assert.doesNotMatch(
  source,
  /title: event\.target\.value,[\s\S]{0,180}stepKey:/,
  "修改步骤名称时不得同时改变步骤标识",
);

console.log("academy SOP template static tests passed");
