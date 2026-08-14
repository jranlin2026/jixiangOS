import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import type { AcademyCourse } from "../../types/academy";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const academyModule = await vite.ssrLoadModule("/src/pages/Academy/index.tsx");
const CourseWorkspace = Reflect.get(academyModule, "CourseWorkspace") as React.ComponentType<any> | undefined;
const CourseDetailWorkspace = Reflect.get(academyModule, "CourseDetailWorkspace") as React.ComponentType<any> | undefined;
const CourseDetailDrawer = Reflect.get(academyModule, "CourseDetailDrawer") as React.ComponentType<any> | undefined;
const CourseAssetFiles = Reflect.get(academyModule, "CourseAssetFiles") as React.ComponentType<any> | undefined;

assert.equal(typeof CourseWorkspace, "function", "课程列表应作为可验证的独立工作台组件");
assert.equal(typeof CourseDetailWorkspace, "function", "课程详情内容应作为可复用工作台");
assert.equal(typeof CourseDetailDrawer, "function", "课程详情应使用右侧抽屉，不替换当前列表页");
assert.equal(typeof CourseAssetFiles, "function", "课程资产应提供可查看和下载的独立文件列表");

const academySource = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const attachmentLinksSource = readFileSync(new URL("../../shared/components/BusinessAttachmentLinks.tsx", import.meta.url), "utf8");
assert.match(
  academySource,
  /<CourseDetailDrawer\s+open=\{Boolean\(detailCourse\)\}/,
  "课程列表工作台应常驻并挂载右侧详情抽屉",
);
assert.doesNotMatch(
  academySource,
  /if \(detailCourse\) \{\s*return \(/,
  "打开课程详情时不应使用条件返回替换课程列表",
);
assert.match(academySource, /role: "dialog"/, "课程详情抽屉应具有对话框语义");
assert.match(academySource, /"aria-label": "课程详情"/, "课程详情抽屉应具有可访问名称");

const course: AcademyCourse = {
  id: "course-1",
  code: "AC-202608-ABC123",
  title: "AI实战",
  category: "公开课",
  summary: "用AI改造真实业务",
  targetAudience: "实体店老板",
  customerProblem: "不会使用AI做增长",
  coreViewpoint: "从真实问题开始",
  conversionProductId: "product-1",
  conversionProductName: "IP口播智能体",
  defaultDurationMinutes: 120,
  objectives: [],
  status: "DRAFT",
  ownerUserName: "系统管理员",
  ownerUserId: "user-1",
  lecturerUserId: "user-2",
  lecturerUserName: "林恩典",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const noOp = () => undefined;
const commonProps = {
  sessions: [],
  assets: {},
  assetLoadingCourseIds: new Set<string>(),
  assetLoadErrors: {},
  categories: [],
  canManage: true,
  onCreate: noOp,
  onSettings: noOp,
  onView: noOp,
  onEdit: noOp,
  onUploadAsset: noOp,
  onReloadAssets: noOp,
  onStatusChange: noOp,
  onCreateSession: noOp,
  statusChangingCourseIds: new Set<string>(),
};

const renderInRouter = (element: React.ReactElement) => renderToStaticMarkup(
  React.createElement(MemoryRouter, null, element),
);

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (String(args[0] || "").includes("useLayoutEffect does nothing on the server")) return;
  originalConsoleError(...args);
};

const assetFilesMarkup = renderInRouter(React.createElement(CourseAssetFiles!, {
  attachments: [{
    id: "attachment-1",
    name: "课程课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 1024,
    category: "academy-course-asset",
    uploadedById: "user-1",
    uploadedByName: "系统管理员",
    uploadedAt: "2026-08-14T00:00:00.000Z",
  }],
}));

assert.match(assetFilesMarkup, /查看附件 课程课件\.pptx/, "课程资产文件应提供明确的查看入口");
assert.match(assetFilesMarkup, /下载附件 课程课件\.pptx/, "课程资产文件应提供明确的下载入口");
const previewWindowIndex = attachmentLinksSource.indexOf("window.open('', '_blank')");
assert.notEqual(previewWindowIndex, -1, "附件查看应同步创建预览窗口");
assert.ok(
  previewWindowIndex < attachmentLinksSource.indexOf("await businessAttachmentApi.fetchBlob"),
  "附件查看必须在异步读取前同步打开窗口，避免被浏览器拦截",
);

const listMarkup = renderInRouter(React.createElement(CourseWorkspace!, {
    ...commonProps,
    items: [course],
  }));

assert.ok(
  listMarkup.indexOf("课程编码") < listMarkup.lastIndexOf("课程名称"),
  "课程编码应作为首列，课程名称应独立为第二列",
);
assert.match(listMarkup, /aria-label="查看课程 AI实战"/, "查看操作应使用可识别的图标按钮");
assert.match(listMarkup, /aria-label="编辑课程 AI实战"/, "编辑操作应使用可识别的图标按钮");
assert.match(listMarkup, /aria-label="发布课程 AI实战"/, "课程状态操作应根据当前状态显示图标按钮");

const detailMarkup = renderInRouter(React.createElement(CourseDetailWorkspace!, {
  course,
  sessions: [],
  assets: [],
  canManage: true,
  statusChanging: false,
  onBack: noOp,
  onEdit: noOp,
  onUploadAsset: noOp,
  onStatusChange: noOp,
  onCreateSession: noOp,
}));

const loadingAssetMarkup = renderInRouter(React.createElement(CourseDetailWorkspace!, {
  course,
  sessions: [],
  assets: [],
  assetsLoading: true,
  canManage: true,
  statusChanging: false,
  onBack: noOp,
  onEdit: noOp,
  onUploadAsset: noOp,
  onStatusChange: noOp,
  onCreateSession: noOp,
}));

const assetErrorMarkup = renderInRouter(React.createElement(CourseDetailWorkspace!, {
  course,
  sessions: [],
  assets: [],
  assetsLoading: false,
  assetsError: "课程资产加载失败",
  canManage: true,
  statusChanging: false,
  onBack: noOp,
  onEdit: noOp,
  onUploadAsset: noOp,
  onReloadAssets: noOp,
  onStatusChange: noOp,
  onCreateSession: noOp,
}));

console.error = originalConsoleError;

assert.match(detailMarkup, /关闭课程详情/, "抽屉详情应提供明确的关闭入口");
assert.match(detailMarkup, /新建课程安排/, "课程详情主操作应与课程排期统一命名");
assert.match(detailMarkup, /课程内容/, "详情工作台应展示课程内容页签");
assert.match(detailMarkup, /课程资产（0）/, "详情工作台应显示资产数量");
assert.match(detailMarkup, /场次记录（0）/, "详情工作台应显示场次数量");
assert.match(detailMarkup, /完善课程内容/, "空的课程内容应提供可执行的下一步");
assert.match(loadingAssetMarkup, /正在加载课程资产/, "资产请求完成前应显示加载状态");
assert.doesNotMatch(loadingAssetMarkup, /当前还没有上传文件/, "资产加载中不应误报为空数据");
assert.match(assetErrorMarkup, /重新加载课程资产/, "资产加载失败时应提供重试入口");
assert.doesNotMatch(assetErrorMarkup, />上传</, "资产加载失败时不应开放上传操作");
assert.ok((academySource.match(/<CourseAssetFiles/g) || []).length >= 2, "课程详情与上传弹窗都应展示可查看和下载的已关联文件");

console.log("academy course workspace view tests passed");
await vite.close();
