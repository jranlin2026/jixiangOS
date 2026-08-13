import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const academy = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../../types/academy.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../../api/academyApi.ts", import.meta.url), "utf8");
const picker = readFileSync(new URL("../../shared/components/BusinessAttachmentPicker.tsx", import.meta.url), "utf8");
const plans = readFileSync(new URL("./AcademyPlans.tsx", import.meta.url), "utf8");

assert.match(types, /AcademySessionTask[\s\S]*attachments\??: BusinessAttachment\[\]/, "SOP任务应返回已关联的交付附件");
assert.match(api, /addTaskAttachment/, "上传文件后应通过商学院API关联到SOP任务");
assert.match(api, /removeTaskAttachment/, "删除交付文件应同步解除SOP任务关联");
assert.ok((academy.match(/<BusinessAttachmentPicker/g) || []).length >= 3, "课程资产、本人待办和SOP提交都应复用统一附件组件");
assert.match(academy, /title="任务交付文件"/, "本人待办抽屉应展示交付文件");
assert.match(academy, /title="交付证据"/, "课程安排SOP任务对话框应展示交付证据");
assert.match(academy, /完成说明可填写网盘或在线文档链接/, "当现有附件组件不直接托管链接时应给出清晰引导");
assert.match(academy, /单个文件不超过20MB/, "交付文件文案应与后端20MB限制一致");
assert.doesNotMatch(academy, /任务交付文件[\s\S]{0,300}视频/, "任务交付证据不应误导员工上传视频");
assert.match(academy, /activeTaskEvidenceIdRef\.current !== taskId/, "快速切换任务时旧附件请求不应覆盖当前任务");
const bindTaskEvidence = academy.slice(
  academy.indexOf("const bindTaskEvidence = async"),
  academy.indexOf("const removeTaskEvidence = async"),
);
assert.ok(bindTaskEvidence.length > 0, "应定义任务交付文件关联流程");
assert.ok(
  bindTaskEvidence.indexOf("if (activeTaskEvidenceIdRef.current !== taskId) return false;") <
    bindTaskEvidence.indexOf("academyApi.addTaskAttachment"),
  "旧任务上传完成后不得把当前任务附件错误绑定到旧任务",
);
assert.match(academy, /setTaskEvidenceAttachments\(\[\]\);[\s\S]{0,100}setTaskEvidenceLoading/, "加载新任务前应先清空上一个任务的证据");
assert.match(academy, /负责人完成说明/, "管理者验收时应同时查看完成说明和交付文件");
assert.match(academy, /taskRequiresEvidence\(task\) &&[\s\S]{0,80}!taskEvidenceAttachmentsRef\.current\.length/, "任务提交时应以最新附件集合执行必传门禁");
assert.match(academy, /taskRequiresEvidence\(workbenchTask\) &&[\s\S]{0,80}!taskEvidenceAttachments\.length/, "配置为附件交付的步骤没有文件时不应允许提交");
assert.match(academy, /setTaskEvidenceUploading/, "页面应感知交付文件的上传状态，避免上传途中提交任务");
assert.match(academy, /taskEvidenceUploading \|\|/, "任务提交按钮应在交付文件上传过程中禁用");
assert.match(academy, /taskAction\.task\.assigneeUserId === currentUser\?\.id/, "管理者验收时不得替负责人上传或删除交付文件");
assert.match(academy, /taskRequiresEvidence\(taskAction\.task\)/, "课程安排中配置为附件交付的步骤也应执行文件必传门禁");
assert.match(academy, /catch \{[\s\S]{0,220}交付文件加载失败/, "任务附件网络请求异常时应提示并恢复可操作状态");
assert.match(picker, /const countUnit = imagesOnly \? '张' : '个文件'/, "非图片附件数量应使用文件单位，不应显示为张");
assert.match(picker, /onUploadingChange\?/, "统一附件组件应向业务表单暴露上传状态");
assert.match(picker, /!disabled && \([\s\S]{0,500}选择文件/, "只读验收态不应出现上传入口");
assert.doesNotMatch(plans, /提交验收|>开始<|>通过<|>驳回</, "课程安排详情应只展示SOP进度，不再承载任务操作");
assert.match(academy, /task\.assigneeUserId === currentUser\?\.id &&\s*task\.status === "PENDING"/, "旧详情任务入口也只能由负责人本人开始");
assert.match(academy, /task\.assigneeUserId === currentUser\?\.id &&\s*task\.status === "IN_PROGRESS"/, "旧详情任务入口也只能由负责人本人提交验收");
assert.doesNotMatch(academy, /canSession && task\.status === "IN_PROGRESS"/, "SESSION管理员不得代替负责人提交任务");

console.log("academy task evidence static tests passed");
