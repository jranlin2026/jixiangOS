import assert from "node:assert/strict";
import {
  canSaveCourseAssetDraft,
  getRemainingCourseAssetAttachmentSlots,
  getCourseAssetInputConfig,
} from "./courseAssetModel";

const invitation = getCourseAssetInputConfig("INVITATION");
assert.equal(invitation.text?.required, true, "邀约话术应以文案为必填主体");
assert.equal(invitation.attachment.required, false, "邀约话术附件只能作为可选参考");
assert.equal(canSaveCourseAssetDraft("INVITATION", {
  contentText: "老板您好，邀请您参加AI实战课。",
  externalUrl: "",
  attachmentCount: 0,
}), true);
assert.equal(canSaveCourseAssetDraft("INVITATION", {
  contentText: "",
  externalUrl: "",
  attachmentCount: 1,
}), false, "仅上传附件不能代替邀约话术文案");

assert.equal(canSaveCourseAssetDraft("SCRIPT", {
  contentText: "逐字稿正文",
  externalUrl: "",
  attachmentCount: 0,
}), true, "逐字稿允许纯文案");
assert.equal(canSaveCourseAssetDraft("SCRIPT", {
  contentText: "",
  externalUrl: "",
  attachmentCount: 1,
}), true, "逐字稿也允许上传文档");

assert.equal(canSaveCourseAssetDraft("PPT", {
  contentText: "版本说明",
  externalUrl: "",
  attachmentCount: 0,
}), false, "PPT 必须上传文件");
assert.equal(canSaveCourseAssetDraft("PPT", {
  contentText: "",
  externalUrl: "",
  attachmentCount: 1,
}), true);

const replay = getCourseAssetInputConfig("REPLAY");
assert.equal(replay.url?.label, "回放链接");
assert.equal(canSaveCourseAssetDraft("REPLAY", {
  contentText: "",
  externalUrl: "https://example.com/replay",
  attachmentCount: 0,
}), true, "直播回放允许只填链接");
assert.equal(canSaveCourseAssetDraft("REPLAY", {
  contentText: "",
  externalUrl: "",
  attachmentCount: 1,
}), true, "直播回放也允许直接上传文件");

assert.equal(getRemainingCourseAssetAttachmentSlots(0), 20);
assert.equal(getRemainingCourseAssetAttachmentSlots(18), 2);
assert.equal(getRemainingCourseAssetAttachmentSlots(20), 0, "旧附件必须占用每类资产的20个上限");
assert.equal(getRemainingCourseAssetAttachmentSlots(25), 0);

console.log("academy course asset model tests passed");
