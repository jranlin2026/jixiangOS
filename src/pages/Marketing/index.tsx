import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import GroupWorkOutlinedIcon from "@mui/icons-material/GroupWorkOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { useSearchParams } from "react-router-dom";
import { assetApi, marketingApi } from "../../api";
import type {
  AssetInternetAccount,
} from "../../types/asset";
import type {
  MarketingAccountGroup,
  MarketingContent,
  MarketingContentInput,
  MarketingContentType,
  MarketingPublishPlan,
  MarketingPublishPlanStats,
} from "../../types/marketing";
import useAuthStore from "../../store/useAuthStore";
import { hasPermission, PERMISSION_KEYS } from "../../shared/utils/permissions";
import {
  ModuleHeader,
  ModulePage,
  ModuleTabs,
  ModuleToolbar,
} from "../../shared/components/ModuleShell";
import TablePagination from "../../shared/components/TablePagination";
import ProtectedFormDialog from "../../shared/components/ProtectedFormDialog";
import useAppFeedback from "../../shared/hooks/useAppFeedback";
import {
  expandMarketingAccountSelection,
  filterSupplementalMarketingAccounts,
} from "../../domain/marketing/marketingContent";

type MarketingTab = "contents" | "calendar" | "groups" | "plans";
type PageState = { page: number; pageSize: number; total: number };

const contentTypeMeta: Record<
  MarketingContentType,
  { label: string; color: string }
> = {
  MOMENTS: { label: "朋友圈", color: "#12B76A" },
  SHORT_VIDEO: { label: "短视频", color: "#7F56D9" },
  GRAPHIC: { label: "图文", color: "#1E6BFF" },
};
const statusMeta: Record<
  MarketingContent["status"],
  { label: string; color: "default" | "warning" | "info" | "success" | "error" }
> = {
  DRAFT: { label: "草稿", color: "default" },
  PENDING_REVIEW: { label: "待审核", color: "warning" },
  APPROVED: { label: "可发布", color: "success" },
  REJECTED: { label: "已驳回", color: "error" },
  RETIRED: { label: "已停用", color: "default" },
};
const platforms = ["微信", "视频号", "抖音", "小红书", "快手", "企业微信"];
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const tomorrowLocal = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
const emptyPage: PageState = { page: 1, pageSize: 10, total: 0 };
const emptyContent = (): MarketingContentInput => ({
  title: "",
  contentType: "MOMENTS",
  theme: "",
  platforms: ["微信"],
  copywriting: "",
  imageLinks: [],
  videoUrl: "",
  coverUrl: "",
  plannedAt: "",
  expiresAt: "",
  visibility: "ALL",
  usageNotes: "",
});

const MarketingCenter: React.FC = () => {
  const mobile = useMediaQuery(useTheme().breakpoints.down("md"));
  const {
    alert: showFeedback,
    confirm,
    dialog: feedbackDialog,
  } = useAppFeedback();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canWriteContent = hasPermission(
    currentUser,
    PERMISSION_KEYS.MARKETING_CONTENT,
    "write",
  );
  const canReview = hasPermission(
    currentUser,
    PERMISSION_KEYS.MARKETING_REVIEW,
    "write",
  );
  const canPublish = hasPermission(
    currentUser,
    PERMISSION_KEYS.MARKETING_PUBLISH,
    "write",
  );
  const canManageGroups = hasPermission(
    currentUser,
    PERMISSION_KEYS.MARKETING_GROUPS,
    "write",
  );
  const rawRequestedTab = searchParams.get("tab");
  const requestedTab = (rawRequestedTab === "tasks" ? "plans" : rawRequestedTab) as MarketingTab | null;
  const activeTab: MarketingTab = [
    "contents",
    "calendar",
    "groups",
    "plans",
  ].includes(requestedTab || "")
    ? requestedTab!
    : "contents";

  const [contents, setContents] = useState<MarketingContent[]>([]);
  const [approvedContents, setApprovedContents] = useState<MarketingContent[]>(
    [],
  );
  const [groups, setGroups] = useState<MarketingAccountGroup[]>([]);
  const [accounts, setAccounts] = useState<AssetInternetAccount[]>([]);
  const [tasks, setTasks] = useState<MarketingPublishPlan[]>([]);
  const [stats, setStats] = useState<MarketingPublishPlanStats | null>(null);
  const [pagination, setPagination] = useState<PageState>(emptyPage);
  const [groupPagination, setGroupPagination] = useState<PageState>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<
    "content" | "group" | "publish" | "reject" | ""
  >("");
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [contentType, setContentType] = useState("");
  const [platform, setPlatform] = useState("");
  const [plannedDate, setPlannedDate] = useState(today());

  const [contentDialog, setContentDialog] = useState<{
    open: boolean;
    id?: string;
    values: MarketingContentInput;
  }>({ open: false, values: emptyContent() });
  const [groupDialog, setGroupDialog] = useState<{
    open: boolean;
    id?: string;
    name: string;
    platform: string;
    tags: string;
    accountIds: string[];
    remark: string;
  }>({
    open: false,
    name: "",
    platform: "微信",
    tags: "",
    accountIds: [],
    remark: "",
  });
  const [publishDialog, setPublishDialog] = useState<{
    open: boolean;
    contentId: string;
    title: string;
    dueAt: string;
    plannedAt: string;
    groupIds: string[];
    accountIds: string[];
    remark: string;
  }>({
    open: false,
    contentId: "",
    title: "",
    dueAt: tomorrowLocal(),
    plannedAt: "",
    groupIds: [],
    accountIds: [],
    remark: "",
  });
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    item?: MarketingContent;
    comment: string;
  }>({ open: false, comment: "" });

  const loadContents = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const result = await marketingApi.listContents({
      search,
      status,
      contentType,
      platform,
      plannedDate: activeTab === "calendar" ? plannedDate : "",
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (result.code === 0) {
      setContents(result.data.items);
      setPagination((current) => ({
        ...current,
        total: result.data.pagination.total,
      }));
    } else setLoadError(result.message);
    setLoading(false);
  }, [
    activeTab,
    contentType,
    pagination.page,
    pagination.pageSize,
    plannedDate,
    platform,
    search,
    status,
  ]);

  const loadReferenceData = useCallback(async () => {
    setLoadError("");
    const [contentResult, groupResult, accountResult] = await Promise.all([
      marketingApi.listContents({ status: "APPROVED", page: 1, pageSize: 100 }),
      marketingApi.listGroups(),
      assetApi.fetchInternetAccounts({ page: 1, pageSize: 100 }),
    ]);
    if (contentResult.code === 0) setApprovedContents(contentResult.data.items);
    if (groupResult.code === 0) setGroups(groupResult.data);
    if (accountResult.code === 0) setAccounts(accountResult.data.items);
    const failed = [contentResult, groupResult, accountResult].find(
      (result) => result.code !== 0,
    );
    if (failed) setLoadError(failed.message);
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [taskResult, statsResult] = await Promise.all([
      marketingApi.listPublishPlans({
        search,
        platform,
        page: pagination.page,
        pageSize: pagination.pageSize,
      }),
      marketingApi.fetchPublishPlanStats(),
    ]);
    if (taskResult.code === 0) {
      setTasks(taskResult.data.items);
      setPagination((current) => ({
        ...current,
        total: taskResult.data.pagination.total,
      }));
    } else setLoadError(taskResult.message);
    if (statsResult.code === 0) setStats(statsResult.data);
    setLoading(false);
  }, [pagination.page, pagination.pageSize, platform, search]);

  useEffect(() => {
    if (activeTab === "contents" || activeTab === "calendar")
      void loadContents();
    if (activeTab === "groups") void loadReferenceData();
    if (activeTab === "plans")
      void Promise.all([loadReferenceData(), loadTasks()]);
  }, [activeTab, loadContents, loadReferenceData, loadTasks]);

  useEffect(() => {
    if (
      searchParams.get("create") === "1" &&
      activeTab === "plans" &&
      canPublish
    ) {
      setPublishDialog((current) => ({ ...current, open: true }));
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, canPublish, searchParams, setSearchParams]);

  useEffect(() => {
    if (rawRequestedTab !== "tasks") return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "plans");
    setSearchParams(next, { replace: true });
  }, [rawRequestedTab, searchParams, setSearchParams]);

  const selectTab = (tab: MarketingTab) => {
    setPagination(emptyPage);
    setSearch("");
    setStatus("");
    setContentType("");
    setPlatform("");
    setSearchParams({ tab });
  };

  const saveContent = async () => {
    setSubmitting("content");
    const result = contentDialog.id
      ? await marketingApi.updateContent(contentDialog.id, contentDialog.values)
      : await marketingApi.createContent(contentDialog.values);
    setSubmitting("");
    if (result.code !== 0) {
      await showFeedback(result.message, "保存失败");
      return;
    }
    setContentDialog({ open: false, values: emptyContent() });
    await showFeedback(
      contentDialog.id ? "内容版本已更新" : "营销内容草稿已创建",
      "保存成功",
    );
    await loadContents();
  };

  const transition = async (
    item: MarketingContent,
    action: "SUBMIT" | "APPROVE" | "REJECT" | "RETIRE",
  ) => {
    if (action === "REJECT") {
      setRejectDialog({ open: true, item, comment: "" });
      return;
    }
    const comment = "";
    const result = await marketingApi.transitionContent(
      item.id,
      action,
      comment,
    );
    await showFeedback(
      result.code === 0 ? "内容状态已更新" : result.message,
      result.code === 0 ? "操作成功" : "操作失败",
    );
    if (result.code === 0) await loadContents();
  };

  const editContent = (item: MarketingContent) =>
    setContentDialog({
      open: true,
      id: item.id,
      values: {
        title: item.title,
        contentType: item.contentType,
        theme: item.theme,
        platforms: item.platforms,
        copywriting: item.copywriting,
        imageLinks: item.imageLinks,
        videoUrl: item.videoUrl || "",
        coverUrl: item.coverUrl || "",
        plannedAt: item.plannedAt?.slice(0, 16) || "",
        expiresAt: item.expiresAt?.slice(0, 10) || "",
        visibility: item.visibility,
        departmentId: item.departmentId,
        department: item.department,
        ownerId: item.ownerId,
        owner: item.owner,
        usageNotes: item.usageNotes || "",
      },
    });

  const saveGroup = async () => {
    setSubmitting("group");
    const result = await marketingApi.saveGroup(groupDialog.id, {
      name: groupDialog.name,
      platform: groupDialog.platform,
      tags: groupDialog.tags
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      accountIds: groupDialog.accountIds,
      remark: groupDialog.remark,
    });
    setSubmitting("");
    if (result.code !== 0) {
      await showFeedback(result.message, "保存失败");
      return;
    }
    setGroupDialog({
      open: false,
      name: "",
      platform: "微信",
      tags: "",
      accountIds: [],
      remark: "",
    });
    await showFeedback("账号组已保存", "保存成功");
    await loadReferenceData();
  };

  const selectedContent = approvedContents.find(
    (item) => item.id === publishDialog.contentId,
  );
  const applicableGroups = groups.filter(
    (group) =>
      !selectedContent || selectedContent.platforms.includes(group.platform),
  );
  const applicableAccounts = filterSupplementalMarketingAccounts(
    accounts.filter(
      (account) =>
        !selectedContent || selectedContent.platforms.includes(account.platform),
    ),
    publishDialog.groupIds,
    groups,
  );
  const selectedAccountIds = expandMarketingAccountSelection(
    publishDialog.accountIds,
    publishDialog.groupIds,
    groups,
  );

  const createPublishPlan = async () => {
    if (!selectedContent) {
      await showFeedback("请选择审核通过的内容", "创建失败");
      return;
    }
    if (!selectedAccountIds.length) {
      await showFeedback("请选择账号组或发布账号", "创建失败");
      return;
    }
    const selectedGroups = groups.filter((group) =>
      publishDialog.groupIds.includes(group.id),
    );
    setSubmitting("publish");
    const result = await marketingApi.createPublishPlan({
      title: publishDialog.title || selectedContent.title,
      dueAt: new Date(publishDialog.dueAt).toISOString(),
      plannedAt: publishDialog.plannedAt
        ? new Date(publishDialog.plannedAt).toISOString()
        : selectedContent.plannedAt,
      contentId: selectedContent.id,
      contentTitle: selectedContent.title,
      contentVersion: selectedContent.version,
      contentType: selectedContent.contentType,
      contentPlatforms: selectedContent.platforms,
      videoUrl: selectedContent.videoUrl,
      copywriting: selectedContent.copywriting,
      imageLinks: selectedContent.imageLinks,
      groupNames: selectedGroups.map((group) => group.name),
      accountIds: selectedAccountIds,
      remark: publishDialog.remark,
    });
    setSubmitting("");
    if (result.code !== 0) {
      await showFeedback(result.message, "创建失败");
      return;
    }
    setPublishDialog({
      open: false,
      contentId: "",
      title: "",
      dueAt: tomorrowLocal(),
      plannedAt: "",
      groupIds: [],
      accountIds: [],
      remark: "",
    });
    await showFeedback(
      `发布计划已生成 ${result.data.targets.length} 个账号的执行任务`,
      "计划创建成功",
    );
    await loadTasks();
  };

  const contentActions = (item: MarketingContent) => (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
      {canWriteContent && ["DRAFT", "REJECTED"].includes(item.status) ? (
        <Button size="small" onClick={() => editContent(item)}>
          编辑
        </Button>
      ) : null}
      {canWriteContent && ["DRAFT", "REJECTED"].includes(item.status) ? (
        <Button size="small" onClick={() => void transition(item, "SUBMIT")}>
          提交审核
        </Button>
      ) : null}
      {canReview && item.status === "PENDING_REVIEW" ? (
        <>
          <Button
            size="small"
            color="success"
            onClick={() => void transition(item, "APPROVE")}
          >
            通过
          </Button>
          <Button
            size="small"
            color="warning"
            onClick={() => void transition(item, "REJECT")}
          >
            驳回
          </Button>
        </>
      ) : null}
      {canWriteContent && item.status === "APPROVED" ? (
        <Button
          size="small"
          color="warning"
          onClick={() => void transition(item, "RETIRE")}
        >
          停用
        </Button>
      ) : null}
    </Stack>
  );

  const contentRows = () => (
    <>
      {mobile ? (
        <Stack spacing={1.5}>
          {contents.map((item) => (
            <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" gap={1}>
                <Box>
                  <Typography sx={{ fontWeight: 850 }}>{item.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.theme || item.copywriting || "暂无摘要"}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color={statusMeta[item.status].color}
                  label={statusMeta[item.status].label}
                />
              </Stack>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {contentTypeMeta[item.contentType].label} ·{" "}
                {item.platforms.join("、")} · v{item.version}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                计划{" "}
                {item.plannedAt
                  ? new Date(item.plannedAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })
                  : "未安排"}{" "}
                · 负责人 {item.owner || "-"}
              </Typography>
              <Box sx={{ mt: 1 }}>{contentActions(item)}</Box>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead>
              <TableRow>
                {[
                  "内容标题",
                  "类型",
                  "适用平台",
                  "计划时间",
                  "负责人",
                  "版本",
                  "状态",
                  "操作",
                ].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {contents.map((item) => (
                <TableRow hover key={item.id}>
                  <TableCell sx={{ minWidth: 260 }}>
                    <Typography sx={{ fontWeight: 850 }}>
                      {item.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", maxWidth: 360 }}
                      noWrap
                    >
                      {item.theme || item.copywriting || "暂无摘要"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={contentTypeMeta[item.contentType].label}
                      sx={{ color: contentTypeMeta[item.contentType].color }}
                    />
                  </TableCell>
                  <TableCell>
                    {item.platforms.map((value) => (
                      <Chip
                        key={value}
                        size="small"
                        label={value}
                        variant="outlined"
                        sx={{ mr: 0.5 }}
                      />
                    ))}
                  </TableCell>
                  <TableCell>
                    {item.plannedAt
                      ? new Date(item.plannedAt).toLocaleString("zh-CN", {
                          hour12: false,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>{item.owner || "-"}</TableCell>
                  <TableCell>v{item.version}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={statusMeta[item.status].color}
                      label={statusMeta[item.status].label}
                    />
                  </TableCell>
                  <TableCell>{contentActions(item)}</TableCell>
                </TableRow>
              ))}
              {!contents.length ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    align="center"
                    sx={{ py: 8, color: "text.secondary" }}
                  >
                    {loading
                      ? "正在加载…"
                      : activeTab === "calendar"
                        ? "当天暂无安排内容"
                        : "暂无营销内容"}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!contents.length ? (
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            textAlign: "center",
            color: "text.secondary",
            display: { md: "none" },
          }}
        >
          {loading
            ? "正在加载…"
            : activeTab === "calendar"
              ? "当天暂无安排内容"
              : "暂无营销内容"}
        </Paper>
      ) : null}
      <TablePagination
        count={pagination.total}
        page={pagination.page - 1}
        rowsPerPage={pagination.pageSize}
        onPageChange={(_, page) =>
          setPagination((current) => ({ ...current, page: page + 1 }))
        }
        onRowsPerPageChange={(event) =>
          setPagination({
            page: 1,
            pageSize: Number(event.target.value),
            total: pagination.total,
          })
        }
      />
    </>
  );

  const visibleGroups = groups.slice(
    (groupPagination.page - 1) * groupPagination.pageSize,
    groupPagination.page * groupPagination.pageSize,
  );
  const editGroup = (group: MarketingAccountGroup) =>
    setGroupDialog({
      open: true,
      id: group.id,
      name: group.name,
      platform: group.platform,
      tags: group.tags.join("，"),
      accountIds: group.accountIds,
      remark: group.remark || "",
    });
  const deleteGroup = async (group: MarketingAccountGroup) => {
    if (
      !(await confirm(`确认删除账号组“${group.name}”吗？`, "删除账号组", {
        confirmText: "删除",
      }))
    )
      return;
    const result = await marketingApi.deleteGroup(group.id);
    await showFeedback(
      result.code === 0 ? "账号组已删除" : result.message,
      result.code === 0 ? "删除成功" : "删除失败",
    );
    if (result.code === 0) await loadReferenceData();
  };
  const groupActions = (group: MarketingAccountGroup) =>
    canManageGroups ? (
      <Stack direction="row">
        <Button size="small" onClick={() => editGroup(group)}>
          编辑
        </Button>
        <Button
          size="small"
          color="error"
          onClick={() => void deleteGroup(group)}
        >
          删除
        </Button>
      </Stack>
    ) : null;
  const renderGroups = () => (
    <>
      {mobile ? (
        <Stack spacing={1.5}>
          {visibleGroups.map((group) => (
            <Paper key={group.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography sx={{ fontWeight: 850 }}>{group.name}</Typography>
                <Chip size="small" label={group.platform} />
              </Stack>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {group.accountIds.length} 个账号 ·{" "}
                {group.tags.join("、") || "无标签"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {group.accountIds
                  .map(
                    (id) =>
                      accounts.find((account) => account.id === id)
                        ?.accountName || id,
                  )
                  .join("、")}
              </Typography>
              {groupActions(group)}
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {["账号组", "平台", "标签", "账号数量", "包含账号", "操作"].map(
                  (label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell sx={{ fontWeight: 850 }}>{group.name}</TableCell>
                  <TableCell>{group.platform}</TableCell>
                  <TableCell>{group.tags.join("、") || "-"}</TableCell>
                  <TableCell>{group.accountIds.length}</TableCell>
                  <TableCell sx={{ maxWidth: 420 }}>
                    {group.accountIds
                      .map(
                        (id) =>
                          accounts.find((account) => account.id === id)
                            ?.accountName || id,
                      )
                      .join("、")}
                  </TableCell>
                  <TableCell>{groupActions(group)}</TableCell>
                </TableRow>
              ))}
              {!groups.length ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ py: 8, color: "text.secondary" }}
                  >
                    暂无账号组
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}{" "}
      {!groups.length && mobile ? (
        <Paper
          variant="outlined"
          sx={{ p: 5, textAlign: "center", color: "text.secondary" }}
        >
          暂无账号组
        </Paper>
      ) : null}
      <TablePagination
        count={groups.length}
        page={groupPagination.page - 1}
        rowsPerPage={groupPagination.pageSize}
        onPageChange={(_, page) =>
          setGroupPagination((current) => ({
            ...current,
            page: page + 1,
            total: groups.length,
          }))
        }
        onRowsPerPageChange={(event) =>
          setGroupPagination({
            page: 1,
            pageSize: Number(event.target.value),
            total: groups.length,
          })
        }
      />
    </>
  );

  const copyWriting = async (copywriting?: string) => {
    if (!copywriting) return;
    try {
      await navigator.clipboard.writeText(copywriting);
      await showFeedback("发布文案已复制到剪贴板", "复制成功");
    } catch {
      await showFeedback("浏览器未允许访问剪贴板，请手动复制文案", "复制失败");
    }
  };
  const planWorkDate = (plannedAt?: string) => (
    plannedAt
      ? new Date(plannedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })
      : today()
  );
  const executionLedgerLink = (task: MarketingPublishPlan, employeeTaskId?: string) => {
    const params = new URLSearchParams({ tab: "team", date: planWorkDate(task.plannedAt) });
    if (employeeTaskId) params.set("taskId", employeeTaskId);
    return `/tasks?${params.toString()}`;
  };
  const renderTasks = () => (
    <>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        {[
          ["目标账号", stats?.totalTargets || 0],
          ["待确认", stats?.awaitingConfirmationTargets || 0],
          ["已确认", stats?.confirmedTargets || 0],
          ["未提交", stats?.pendingTargets || 0],
          ["提交率", `${stats?.completionRate || 0}%`],
        ].map(([label, value]) => (
          <Paper variant="outlined" key={label} sx={{ p: 1.5, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              {value}
            </Typography>
          </Paper>
        ))}
      </Stack>
      {stats?.byDepartment?.length ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
          <Typography sx={{ fontWeight: 900, mb: 1 }}>部门执行进度</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {stats.byDepartment.map((item) => (
              <Chip
                key={item.department}
                label={`${item.department || "未归属部门"} ${item.completed}/${item.total}${item.overdue ? ` · 逾期${item.overdue}` : ""}`}
                color={
                  item.overdue
                    ? "warning"
                    : item.completed === item.total
                      ? "success"
                      : "default"
                }
                variant="outlined"
              />
            ))}
          </Stack>
        </Paper>
      ) : null}
      {mobile ? (
        <Stack spacing={1.5}>
          {tasks.map((task) => (
            <Paper key={task.id} variant="outlined" sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 850 }}>{task.title}</Typography>
              <Typography variant="body2">
                {task.contentTitle || "历史临时内容"}
                {task.contentVersion ? ` · v${task.contentVersion}` : ""}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {task.targets.length} 个账号 ·{" "}
                {task.targets
                  .map((target) => `${target.platform}/${target.accountName}`)
                  .join("、")}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                <Button
                  size="small"
                  disabled={!task.copywriting}
                  onClick={() => void copyWriting(task.copywriting)}
                >
                  复制文案
                </Button>
                {task.videoUrl ? (
                  <Button
                    size="small"
                    href={task.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    视频
                  </Button>
                ) : null}
                {task.imageLinks?.[0] ? (
                  <Button
                    size="small"
                    href={task.imageLinks[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    图片
                  </Button>
                ) : null}
                <Button size="small" href={executionLedgerLink(task, task.targets[0]?.employeeTaskId)}>
                  查看执行台账
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead>
              <TableRow>
                {[
                  "发布计划",
                  "内容版本",
                  "账号组",
                  "目标账号",
                  "执行状态",
                  "计划/截止",
                  "素材",
                  "执行入口",
                ].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell sx={{ fontWeight: 850 }}>{task.title}</TableCell>
                  <TableCell>
                    {task.contentTitle || "历史临时内容"}
                    {task.contentVersion ? ` · v${task.contentVersion}` : ""}
                  </TableCell>
                  <TableCell>{task.groupNames?.join("、") || "-"}</TableCell>
                  <TableCell sx={{ maxWidth: 380 }}>
                    {task.targets
                      .map(
                        (target) =>
                          `${target.platform}/${target.accountName}（${target.assignee}）`,
                      )
                      .join("、")}
                  </TableCell>
                  <TableCell>
                    {task.targets.map((target) => (
                      <Chip
                        key={target.id}
                        size="small"
                        sx={{ mr: 0.5, mb: 0.5 }}
                        label={
                          (
                            {
                              pending: "待执行",
                              completed: "待确认",
                              confirmed: "已确认",
                              returned: "已退回",
                            } as const
                          )[target.status]
                        }
                      />
                    ))}
                  </TableCell>
                  <TableCell>
                    {task.plannedAt
                      ? new Date(task.plannedAt).toLocaleString("zh-CN", {
                          hour12: false,
                        })
                      : "-"}
                    <br />
                    <Typography variant="caption">
                      截止{" "}
                      {new Date(task.dueAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row">
                      <Button
                        size="small"
                        disabled={!task.copywriting}
                        onClick={() => void copyWriting(task.copywriting)}
                      >
                        复制文案
                      </Button>
                      {task.videoUrl ? (
                        <Button
                          size="small"
                          href={task.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          视频
                        </Button>
                      ) : null}
                      {task.imageLinks?.[0] ? (
                        <Button
                          size="small"
                          href={task.imageLinks[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          图片
                        </Button>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5} alignItems="flex-start">
                      {task.targets.map((target) => (
                        <Button key={target.id} size="small" href={executionLedgerLink(task, target.employeeTaskId)}>
                          {target.accountName}
                        </Button>
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!tasks.length ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    align="center"
                    sx={{ py: 8, color: "text.secondary" }}
                  >
                    暂无发布计划
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}{" "}
      {!tasks.length && mobile ? (
        <Paper
          variant="outlined"
          sx={{ p: 5, textAlign: "center", color: "text.secondary" }}
        >
          暂无发布计划
        </Paper>
      ) : null}
      <TablePagination
        count={pagination.total}
        page={pagination.page - 1}
        rowsPerPage={pagination.pageSize}
        onPageChange={(_, page) =>
          setPagination((current) => ({ ...current, page: page + 1 }))
        }
        onRowsPerPageChange={(event) =>
          setPagination({
            page: 1,
            pageSize: Number(event.target.value),
            total: pagination.total,
          })
        }
      />
    </>
  );

  return (
    <ModulePage sx={{ p: { xs: 2, md: 3 } }}>
      <ModuleHeader
        title="内容运营"
        description="统一管理内容、排期、账号分组与发布计划；执行任务按计划日期进入员工工作台。"
        actions={
          activeTab === "contents" && canWriteContent ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                setContentDialog({ open: true, values: emptyContent() })
              }
            >
              新建内容
            </Button>
          ) : activeTab === "groups" && canManageGroups ? (
            <Button
              variant="contained"
              startIcon={<GroupWorkOutlinedIcon />}
              onClick={() =>
                setGroupDialog({
                  open: true,
                  name: "",
                  platform: "微信",
                  tags: "",
                  accountIds: [],
                  remark: "",
                })
              }
            >
              新建账号组
            </Button>
          ) : activeTab === "plans" && canPublish ? (
            <Button
              variant="contained"
              startIcon={<SendOutlinedIcon />}
              onClick={() =>
                setPublishDialog((current) => ({ ...current, open: true }))
              }
            >
              创建发布计划
            </Button>
          ) : undefined
        }
      />
      {loadError ? (
        <Alert
          severity="error"
          sx={{ mb: 1.5 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() =>
                void (activeTab === "plans"
                  ? Promise.all([loadReferenceData(), loadTasks()])
                  : activeTab === "groups"
                    ? loadReferenceData()
                    : loadContents())
              }
            >
              重试
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}
      <ModuleTabs
        value={activeTab}
        onChange={(_, value) => selectTab(value)}
        variant="scrollable"
      >
        <Tab
          value="contents"
          icon={<ContentCopyOutlinedIcon />}
          iconPosition="start"
          label="内容库"
        />
        <Tab
          value="calendar"
          icon={<CalendarMonthOutlinedIcon />}
          iconPosition="start"
          label="内容日历"
        />
        <Tab
          value="groups"
          icon={<GroupWorkOutlinedIcon />}
          iconPosition="start"
          label="账号分组"
        />
        <Tab
          value="plans"
          icon={<SendOutlinedIcon />}
          iconPosition="start"
          label="发布计划"
        />
      </ModuleTabs>
      {activeTab === "contents" ||
      activeTab === "calendar" ||
      activeTab === "plans" ? (
        <ModuleToolbar sx={{ mb: 1.5 }}>
          <TextField
            size="small"
            placeholder={
              activeTab === "plans"
                ? "搜索计划、账号、执行人"
                : "搜索标题、主题、文案或负责人"
            }
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            sx={{ width: { xs: "100%", md: 330 } }}
          />
          {activeTab !== "plans" ? (
            <>
              <TextField
                select
                size="small"
                label="内容类型"
                value={contentType}
                onChange={(event) => {
                  setContentType(event.target.value);
                  setPagination((current) => ({ ...current, page: 1 }));
                }}
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="">全部</MenuItem>
                {Object.entries(contentTypeMeta).map(([value, meta]) => (
                  <MenuItem key={value} value={value}>
                    {meta.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="状态"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPagination((current) => ({ ...current, page: 1 }));
                }}
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="">全部</MenuItem>
                {Object.entries(statusMeta).map(([value, meta]) => (
                  <MenuItem key={value} value={value}>
                    {meta.label}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : null}
          <TextField
            select
            size="small"
            label="平台"
            value={platform}
            onChange={(event) => {
              setPlatform(event.target.value);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">全部</MenuItem>
            {platforms.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          {activeTab === "calendar" ? (
            <TextField
              size="small"
              type="date"
              label="计划日期"
              value={plannedDate}
              onChange={(event) => {
                setPlannedDate(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              InputLabelProps={{ shrink: true }}
            />
          ) : null}
        </ModuleToolbar>
      ) : null}
      {activeTab === "contents" || activeTab === "calendar"
        ? contentRows()
        : activeTab === "groups"
          ? renderGroups()
          : renderTasks()}

      <ProtectedFormDialog
        open={contentDialog.open}
        onClose={() =>
          setContentDialog({ open: false, values: emptyContent() })
        }
        submitting={submitting === "content"}
        resetKey={`${contentDialog.open}:${contentDialog.id || "new"}`}
        fullWidth
        maxWidth="md"
      >
        {({ requestClose }) => (
          <>
            <DialogTitle>
              {contentDialog.id ? "编辑营销内容" : "新建营销内容"}
            </DialogTitle>
            <DialogContent dividers>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 1.5,
                  pt: 0.5,
                }}
              >
                <TextField
                  required
                  label="内容标题"
                  value={contentDialog.values.title}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: { ...current.values, title: event.target.value },
                    }))
                  }
                />
                <TextField
                  select
                  required
                  label="内容类型"
                  value={contentDialog.values.contentType}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        contentType: event.target.value as MarketingContentType,
                      },
                    }))
                  }
                >
                  {Object.entries(contentTypeMeta).map(([value, meta]) => (
                    <MenuItem key={value} value={value}>
                      {meta.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="内容主题"
                  value={contentDialog.values.theme || ""}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: { ...current.values, theme: event.target.value },
                    }))
                  }
                />
                <FormControl>
                  <InputLabel>适用平台</InputLabel>
                  <Select
                    multiple
                    label="适用平台"
                    value={contentDialog.values.platforms}
                    onChange={(event) =>
                      setContentDialog((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          platforms:
                            typeof event.target.value === "string"
                              ? event.target.value.split(",")
                              : event.target.value,
                        },
                      }))
                    }
                    renderValue={(values) => values.join("、")}
                  >
                    {platforms.map((value) => (
                      <MenuItem key={value} value={value}>
                        <Checkbox
                          checked={contentDialog.values.platforms.includes(
                            value,
                          )}
                        />
                        <ListItemText primary={value} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="发布文案"
                  multiline
                  minRows={5}
                  value={contentDialog.values.copywriting || ""}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        copywriting: event.target.value,
                      },
                    }))
                  }
                  sx={{ gridColumn: "1 / -1" }}
                />
                <TextField
                  label="图片链接（每行一个）"
                  multiline
                  minRows={3}
                  value={(contentDialog.values.imageLinks || []).join("\n")}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        imageLinks: event.target.value
                          .split("\n")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                />
                <TextField
                  label="视频/网盘链接"
                  value={contentDialog.values.videoUrl || ""}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        videoUrl: event.target.value,
                      },
                    }))
                  }
                  helperText="当前服务器不保存视频文件，请填写外部链接"
                />
                <TextField
                  type="datetime-local"
                  label="计划发布时间"
                  value={contentDialog.values.plannedAt || ""}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        plannedAt: event.target.value,
                      },
                    }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  type="date"
                  label="有效期至"
                  value={contentDialog.values.expiresAt || ""}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        expiresAt: event.target.value,
                      },
                    }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="使用说明/禁用说明"
                  multiline
                  minRows={2}
                  value={contentDialog.values.usageNotes || ""}
                  onChange={(event) =>
                    setContentDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        usageNotes: event.target.value,
                      },
                    }))
                  }
                  sx={{ gridColumn: "1 / -1" }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button
                disabled={submitting === "content"}
                onClick={() => void requestClose()}
              >
                取消
              </Button>
              <Button
                variant="contained"
                disabled={
                  submitting === "content" ||
                  !contentDialog.values.title ||
                  !contentDialog.values.platforms.length
                }
                onClick={() => void saveContent()}
              >
                保存草稿
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={groupDialog.open}
        onClose={() =>
          setGroupDialog({
            open: false,
            name: "",
            platform: "微信",
            tags: "",
            accountIds: [],
            remark: "",
          })
        }
        submitting={submitting === "group"}
        resetKey={`${groupDialog.open}:${groupDialog.id || "new"}`}
        fullWidth
        maxWidth="sm"
      >
        {({ requestClose }) => (
          <>
            <DialogTitle>
              {groupDialog.id ? "编辑账号组" : "新建账号组"}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                <TextField
                  required
                  label="账号组名称"
                  placeholder="例如：全员朋友圈"
                  value={groupDialog.name}
                  onChange={(event) =>
                    setGroupDialog((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <TextField
                  select
                  required
                  label="平台"
                  value={groupDialog.platform}
                  onChange={(event) =>
                    setGroupDialog((current) => ({
                      ...current,
                      platform: event.target.value,
                      accountIds: [],
                    }))
                  }
                >
                  {platforms.map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControl required>
                  <InputLabel>包含账号</InputLabel>
                  <Select
                    multiple
                    label="包含账号"
                    value={groupDialog.accountIds}
                    onChange={(event) =>
                      setGroupDialog((current) => ({
                        ...current,
                        accountIds:
                          typeof event.target.value === "string"
                            ? event.target.value.split(",")
                            : event.target.value,
                      }))
                    }
                    renderValue={(values) => `已选择 ${values.length} 个账号`}
                  >
                    {accounts
                      .filter(
                        (account) => account.platform === groupDialog.platform,
                      )
                      .map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          <Checkbox
                            checked={groupDialog.accountIds.includes(
                              account.id,
                            )}
                          />
                          <ListItemText
                            primary={account.accountName}
                            secondary={
                              account.currentUser
                                ? `${account.currentUser} / ${account.department || "-"}`
                                : "缺少主要使用人"
                            }
                          />
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
                <TextField
                  label="标签（逗号分隔）"
                  placeholder="销售部，福建区域"
                  value={groupDialog.tags}
                  onChange={(event) =>
                    setGroupDialog((current) => ({
                      ...current,
                      tags: event.target.value,
                    }))
                  }
                />
                <TextField
                  label="备注"
                  multiline
                  minRows={2}
                  value={groupDialog.remark}
                  onChange={(event) =>
                    setGroupDialog((current) => ({
                      ...current,
                      remark: event.target.value,
                    }))
                  }
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button
                disabled={submitting === "group"}
                onClick={() => void requestClose()}
              >
                取消
              </Button>
              <Button
                variant="contained"
                disabled={
                  submitting === "group" ||
                  !groupDialog.name ||
                  !groupDialog.accountIds.length
                }
                onClick={() => void saveGroup()}
              >
                保存账号组
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={publishDialog.open}
        onClose={() =>
          setPublishDialog((current) => ({ ...current, open: false }))
        }
        submitting={submitting === "publish"}
        resetKey={String(publishDialog.open)}
        fullWidth
        maxWidth="md"
      >
        {({ requestClose }) => (
          <>
            <DialogTitle>创建发布计划</DialogTitle>
            <DialogContent dividers>
              <Alert severity="info" sx={{ mb: 1.5 }}>
                发布计划只能选择审核通过的内容；系统会按计划发布日期生成执行任务，并进入账号主要使用人的工作台。
              </Alert>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 1.5,
                }}
              >
                <TextField
                  select
                  required
                  label="选择营销内容"
                  value={publishDialog.contentId}
                  onChange={(event) => {
                    const item = approvedContents.find(
                      (content) => content.id === event.target.value,
                    );
                    setPublishDialog((current) => ({
                      ...current,
                      contentId: event.target.value,
                      title: item?.title || current.title,
                      plannedAt: item?.plannedAt?.slice(0, 16) || "",
                      groupIds: [],
                      accountIds: [],
                    }));
                  }}
                  sx={{ gridColumn: "1 / -1" }}
                >
                  {approvedContents.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {contentTypeMeta[item.contentType].label} · {item.title} ·
                      v{item.version}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  required
                  label="任务标题"
                  value={publishDialog.title}
                  onChange={(event) =>
                    setPublishDialog((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <TextField
                  required
                  type="datetime-local"
                  label="截止时间"
                  value={publishDialog.dueAt}
                  onChange={(event) =>
                    setPublishDialog((current) => ({
                      ...current,
                      dueAt: event.target.value,
                    }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  required
                  type="datetime-local"
                  label="计划发布时间"
                  value={publishDialog.plannedAt}
                  onChange={(event) =>
                    setPublishDialog((current) => ({
                      ...current,
                      plannedAt: event.target.value,
                    }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <FormControl>
                  <InputLabel>账号组</InputLabel>
                  <Select
                    multiple
                    label="账号组"
                    value={publishDialog.groupIds}
                    onChange={(event) => {
                      const groupIds =
                        typeof event.target.value === "string"
                          ? event.target.value.split(",")
                          : event.target.value;
                      const groupedAccountIds = new Set(
                        groups
                          .filter((group) => groupIds.includes(group.id))
                          .flatMap((group) => group.accountIds),
                      );
                      setPublishDialog((current) => ({
                        ...current,
                        groupIds,
                        accountIds: current.accountIds.filter(
                          (accountId) => !groupedAccountIds.has(accountId),
                        ),
                      }));
                    }}
                    renderValue={(values) => `已选择 ${values.length} 个账号组`}
                  >
                    {applicableGroups.map((group) => (
                      <MenuItem key={group.id} value={group.id}>
                        <Checkbox
                          checked={publishDialog.groupIds.includes(group.id)}
                        />
                        <ListItemText
                          primary={`${group.platform} / ${group.name}`}
                          secondary={`${group.accountIds.length} 个账号`}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl sx={{ gridColumn: "1 / -1" }}>
                  <InputLabel>补充发布账号</InputLabel>
                  <Select
                    multiple
                    label="补充发布账号"
                    value={publishDialog.accountIds}
                    onChange={(event) =>
                      setPublishDialog((current) => ({
                        ...current,
                        accountIds:
                          typeof event.target.value === "string"
                            ? event.target.value.split(",")
                            : event.target.value,
                      }))
                    }
                    renderValue={(values) => `补充选择 ${values.length} 个账号`}
                  >
                    {applicableAccounts.map((account) => (
                      <MenuItem
                        key={account.id}
                        value={account.id}
                        disabled={!account.currentUser}
                      >
                        <Checkbox
                          checked={publishDialog.accountIds.includes(
                            account.id,
                          )}
                        />
                        <ListItemText
                          primary={`${account.platform} / ${account.accountName}`}
                          secondary={
                            account.currentUser
                              ? `${account.currentUser} / ${account.department || "-"}`
                              : "缺少主要使用人，不能派发"
                          }
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, gridColumn: "1 / -1", bgcolor: "#F8FAFC" }}
                >
                  <Typography sx={{ fontWeight: 850 }}>
                    预计派发 {selectedAccountIds.length} 个账号
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedContent
                      ? `${selectedContent.platforms.join("、")} · ${contentTypeMeta[selectedContent.contentType].label} · v${selectedContent.version}`
                      : "请先选择内容"}
                  </Typography>
                </Paper>
                <TextField
                  label="执行备注"
                  multiline
                  minRows={2}
                  value={publishDialog.remark}
                  onChange={(event) =>
                    setPublishDialog((current) => ({
                      ...current,
                      remark: event.target.value,
                    }))
                  }
                  sx={{ gridColumn: "1 / -1" }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button
                disabled={submitting === "publish"}
                onClick={() => void requestClose()}
              >
                取消
              </Button>
              <Button
                variant="contained"
                disabled={
                  submitting === "publish" ||
                  !selectedContent ||
                  !publishDialog.title ||
                  !publishDialog.plannedAt ||
                  !publishDialog.dueAt ||
                  !selectedAccountIds.length
                }
                onClick={() => void createPublishPlan()}
              >
                创建并派发员工任务
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={rejectDialog.open}
        onClose={() => setRejectDialog({ open: false, comment: "" })}
        submitting={submitting === "reject"}
        resetKey={`${rejectDialog.open}:${rejectDialog.item?.id || ""}`}
        fullWidth
        maxWidth="xs"
      >
        {({ requestClose }) => (
          <>
            <DialogTitle>驳回营销内容</DialogTitle>
            <DialogContent dividers>
              <TextField
                autoFocus
                fullWidth
                required
                multiline
                minRows={3}
                label="驳回原因"
                value={rejectDialog.comment}
                onChange={(event) =>
                  setRejectDialog((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
              />
            </DialogContent>
            <DialogActions>
              <Button
                disabled={submitting === "reject"}
                onClick={() => void requestClose()}
              >
                取消
              </Button>
              <Button
                variant="contained"
                color="warning"
                disabled={
                  submitting === "reject" || !rejectDialog.comment.trim()
                }
                onClick={async () => {
                  if (!rejectDialog.item) return;
                  setSubmitting("reject");
                  const result = await marketingApi.transitionContent(
                    rejectDialog.item.id,
                    "REJECT",
                    rejectDialog.comment,
                  );
                  setSubmitting("");
                  if (result.code === 0)
                    setRejectDialog({ open: false, comment: "" });
                  await showFeedback(
                    result.code === 0 ? "内容已驳回" : result.message,
                    result.code === 0 ? "操作成功" : "操作失败",
                  );
                  if (result.code === 0) await loadContents();
                }}
              >
                确认驳回
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      {feedbackDialog}
    </ModulePage>
  );
};

export default MarketingCenter;
