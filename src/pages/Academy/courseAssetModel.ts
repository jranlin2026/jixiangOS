import type { AcademyAssetType } from "../../types/academy";

export type CourseAssetInputConfig = {
  label: string;
  text?: {
    label: string;
    placeholder: string;
    required: boolean;
  };
  url?: {
    label: string;
    placeholder: string;
  };
  attachment: {
    title: string;
    description: string;
    required: boolean;
  };
};

const configs: Record<AcademyAssetType, CourseAssetInputConfig> = {
  PPT: {
    label: "课件 PPT",
    attachment: {
      title: "课件文件 *",
      description: "上传当前可用的 PPT 或 PDF 课件，最多 20 个文件。",
      required: true,
    },
  },
  SCRIPT: {
    label: "逐字稿",
    text: {
      label: "逐字稿内容",
      placeholder: "可直接粘贴逐字稿，也可仅上传文档……",
      required: false,
    },
    attachment: {
      title: "逐字稿文件（可选）",
      description: "如果逐字稿已经整理为 Word、PDF 或其他文档，可直接上传。",
      required: false,
    },
  },
  CASE: {
    label: "课程案例",
    text: {
      label: "案例内容",
      placeholder: "记录案例背景、问题、做法和结果……",
      required: false,
    },
    attachment: {
      title: "案例附件（可选）",
      description: "可补充案例截图、数据文档或完整案例材料。",
      required: false,
    },
  },
  POSTER: {
    label: "宣传海报",
    text: {
      label: "宣传文案（可选）",
      placeholder: "记录海报标题、朋友圈文案或发布说明……",
      required: false,
    },
    attachment: {
      title: "海报图片 *",
      description: "上传可用的宣传海报或封面图。",
      required: true,
    },
  },
  INVITATION: {
    label: "邀约话术",
    text: {
      label: "话术内容 *",
      placeholder: "直接填写销售可复制使用的邀约话术……",
      required: true,
    },
    attachment: {
      title: "参考附件（可选）",
      description: "如果有话术示例、图片或其他参考材料，可选择上传。",
      required: false,
    },
  },
  REPLAY: {
    label: "直播回放",
    url: {
      label: "回放链接",
      placeholder: "https://",
    },
    attachment: {
      title: "回放文件（可选）",
      description: "可填写回放链接，或直接上传 MP4 回放文件。",
      required: false,
    },
  },
};

export const getCourseAssetInputConfig = (assetType: AcademyAssetType) => configs[assetType];

export const canSaveCourseAssetDraft = (
  assetType: AcademyAssetType,
  input: { contentText: string; externalUrl: string; attachmentCount: number },
) => {
  const hasText = Boolean(input.contentText.trim());
  const hasUrl = Boolean(input.externalUrl.trim());
  const hasAttachment = input.attachmentCount > 0;
  if (assetType === "PPT" || assetType === "POSTER") return hasAttachment;
  if (assetType === "INVITATION") return hasText;
  if (assetType === "REPLAY") return hasUrl || hasAttachment;
  return hasText || hasAttachment;
};

export const getRemainingCourseAssetAttachmentSlots = (existingCount: number) =>
  Math.max(0, 20 - Math.max(0, Math.floor(existingCount)));
