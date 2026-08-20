import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
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
import { enterpriseBrainApi, settingsApi } from "../../api";
import type { EmployeeTask, TaskTemplate } from "../../types/enterpriseBrain";
import type { Position } from "../../types/position";
import useAuthStore from "../../store/useAuthStore";
import { hasPermission, PERMISSION_KEYS } from "../../shared/utils/permissions";
import {
  ModuleHeader,
  ModulePage,
  ModuleTabs,
} from "../../shared/components/ModuleShell";
import TablePagination from "../../shared/components/TablePagination";
import { useNavigate, useSearchParams } from "react-router-dom";

const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const statusMap: Record<
  EmployeeTask["status"],
  { label: string; color: "default" | "info" | "warning" | "success" }
> = {
  PENDING: { label: "待完成", color: "warning" },
  COMPLETED: { label: "待确认", color: "info" },
  CONFIRMED: { label: "已确认", color: "success" },
  RETURNED: { label: "已退回", color: "default" },
};

const isMarketingPublishTask = (task: Pick<EmployeeTask, "sourceType"> | null | undefined) =>
  task?.sourceType === "MARKETING_PUBLISH" || task?.sourceType === "ASSET_MATRIX_PUBLISH";

const taskSource = (task: EmployeeTask) =>
  isMarketingPublishTask(task) ? (
    <Button
      size="small"
      href="/marketing?tab=plans"
      sx={{ px: 0, minWidth: 0, fontSize: 12, fontWeight: 800 }}
    >
      来自内容发布计划
    </Button>
  ) : null;

const taskResourceActions = (task: EmployeeTask) => {
  if (!isMarketingPublishTask(task)) return null;
  const lines = (task.description || "").split("\n");
  const copywriting = lines
    .find((line) => line.startsWith("发布文案："))
    ?.slice(5);
  const links = lines
    .filter(
      (line) => line.startsWith("素材链接：") || line.startsWith("图片链接："),
    )
    .flatMap((line) => line.slice(5).split("、"));
  return (
    <Stack
      direction="row"
      spacing={0.5}
      useFlexGap
      flexWrap="wrap"
      sx={{ mt: 1 }}
    >
      <Button
        size="small"
        variant="outlined"
        disabled={!copywriting}
        onClick={() =>
          copywriting && void navigator.clipboard.writeText(copywriting)
        }
      >
        复制文案
      </Button>
      {links.map((link, index) => (
        <Button
          key={`${link}-${index}`}
          size="small"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          打开素材{index + 1}
        </Button>
      ))}
    </Stack>
  );
};

const TaskCenter: React.FC = () => {
  const mobile = useMediaQuery(useTheme().breakpoints.down("md"));
  const currentUser = useAuthStore((state) => state.currentUser);
  const canTeam = hasPermission(currentUser, PERMISSION_KEYS.TASK_TEAM);
  const canAssign = hasPermission(
    currentUser,
    PERMISSION_KEYS.TASK_ASSIGN,
    "write",
  );
  const canConfirm = hasPermission(
    currentUser,
    PERMISSION_KEYS.TASK_CONFIRM,
    "write",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTab = searchParams.get("tab");
  const selectedTaskId = searchParams.get("taskId") || "";

  useEffect(() => {
    if (requestedTab !== "templates") return;
    navigate("/enablement?tab=task-templates", { replace: true });
  }, [navigate, requestedTab]);
  const initialTab = requestedTab === "team" && canTeam
    ? "team"
    : requestedTab === "review"
      ? "review"
      : "mine";
  const [tab, setTab] = useState<"mine" | "team" | "review" | "templates">(
    initialTab,
  );
  const [date, setDate] = useState(() => {
    const requestedDate = searchParams.get("date") || "";
    return /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today();
  });
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const requestedPage = Number(searchParams.get("page"));
    return Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0;
  });
  const [pageSize, setPageSize] = useState(10);
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [complete, setComplete] = useState<EmployeeTask | null>(null);
  const [completeForm, setCompleteForm] = useState({
    actualValue: "",
    result: "",
    publishUrl: "",
    screenshotUrl: "",
    evidence: "",
  });
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [template, setTemplate] = useState({
    positionId: "",
    name: "",
    description: "",
    targetValue: "",
    unit: "",
    dueTime: "18:00",
    evidenceRequired: false,
  });
  const [review, setReview] = useState({
    completedSummary: "",
    problems: "",
    successCases: "",
    failureCases: "",
    customerNeeds: "",
    suggestions: "",
  });
  const [reviewSummary, setReviewSummary] = useState("");

  useEffect(() => {
    const nextRequestedTab = searchParams.get("tab");
    const nextTab = nextRequestedTab === "team" && canTeam
      ? "team"
      : nextRequestedTab === "review"
        ? "review"
        : "mine";
    const nextRequestedDate = searchParams.get("date") || "";
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(nextRequestedDate) ? nextRequestedDate : today();
    const nextRequestedPage = Number(searchParams.get("page"));
    const nextPage = Number.isInteger(nextRequestedPage) && nextRequestedPage > 0 ? nextRequestedPage - 1 : 0;
    setTab(nextTab);
    setDate(nextDate);
    setPage(nextPage);
  }, [canAssign, canTeam, searchParams]);

  const loadTasks = useCallback(async () => {
    if (tab !== "mine" && tab !== "team") return;
    const response =
      tab === "team"
        ? await enterpriseBrainApi.listTeamTasks({
            date,
            page: page + 1,
            pageSize,
          })
        : await enterpriseBrainApi.listMyTasks({
            date,
            page: page + 1,
            pageSize,
          });
    if (response.code === 0) {
      setTasks(response.data.items);
      setTotal(response.data.total);
    } else setMessage({ tone: "error", text: response.message });
  }, [date, page, pageSize, tab]);
  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);
  useEffect(() => {
    if (!selectedTaskId || !tasks.some((task) => task.id === selectedTaskId)) return;
    requestAnimationFrame(() => document.getElementById(`task-${selectedTaskId}`)?.scrollIntoView({ block: "center" }));
  }, [selectedTaskId, tasks]);
  useEffect(() => {
    if (tab !== "templates") return;
    Promise.all([
      enterpriseBrainApi.listTemplates(),
      settingsApi.fetchPositions({ isActive: true }),
    ]).then(([a, b]) => {
      if (a.code === 0) setTemplates(a.data);
      if (b.code === 0) setPositions(b.data);
    });
  }, [tab]);

  const submitComplete = async () => {
    if (!complete) return;
    if (
      isMarketingPublishTask(complete) &&
      !completeForm.publishUrl.trim() &&
      !completeForm.screenshotUrl.trim()
    ) {
      setMessage({
        tone: "error",
        text: "发布任务必须填写发布链接或发布截图链接。",
      });
      return;
    }
    const evidence = [
      completeForm.publishUrl.trim()
        ? { type: "PUBLISH_URL", content: completeForm.publishUrl.trim() }
        : null,
      completeForm.screenshotUrl.trim()
        ? { type: "SCREENSHOT_URL", content: completeForm.screenshotUrl.trim() }
        : null,
      completeForm.evidence.trim()
        ? { type: "TEXT", content: completeForm.evidence.trim() }
        : null,
    ].filter(Boolean);
    const response = await enterpriseBrainApi.completeTask(complete.id, {
      actualValue: completeForm.actualValue,
      result: completeForm.result,
      evidence,
    });
    if (response.code === 0) {
      setComplete(null);
      setMessage({ tone: "success", text: "任务已提交，等待负责人确认。" });
      await loadTasks();
    } else setMessage({ tone: "error", text: response.message });
  };
  const confirmTask = async (
    task: EmployeeTask,
    action: "CONFIRM" | "RETURN",
  ) => {
    const reason =
      action === "RETURN" ? window.prompt("请输入退回原因") || "" : "";
    if (action === "RETURN" && !reason) return;
    const response = await enterpriseBrainApi.confirmTask(task.id, {
      action,
      reason,
    });
    setMessage({
      tone: response.code === 0 ? "success" : "error",
      text:
        response.code === 0
          ? action === "CONFIRM"
            ? "任务已确认。"
            : "任务已退回。"
          : response.message,
    });
    if (response.code === 0) await loadTasks();
  };
  const submitReview = async () => {
    const response = await enterpriseBrainApi.submitReview({
      workDate: date,
      ...review,
    });
    if (response.code === 0)
      setReviewSummary(
        response.data.aiSummary ||
          "复盘已保存；当前 AI 未配置或暂不可用，原始内容不受影响。",
      );
    setMessage({
      tone: response.code === 0 ? "success" : "error",
      text:
        response.code === 0
          ? "今日复盘已保存，可重复提交更新。"
          : response.message,
    });
  };
  const saveTemplate = async () => {
    const response = await enterpriseBrainApi.saveTemplate({
      ...template,
      weekdays: [1, 2, 3, 4, 5],
      isActive: true,
    });
    if (response.code === 0) {
      setTemplateOpen(false);
      setMessage({ tone: "success", text: "任务模板已保存。" });
      const list = await enterpriseBrainApi.listTemplates();
      if (list.code === 0) setTemplates(list.data);
    } else setMessage({ tone: "error", text: response.message });
  };
  const generate = async () => {
    const response = await enterpriseBrainApi.generateTasks(date);
    setMessage({
      tone: response.code === 0 ? "success" : "error",
      text:
        response.code === 0
          ? `已生成 ${response.data.createdCount} 条，跳过 ${response.data.skippedCount} 条重复任务。`
          : response.message,
    });
  };
  const actions = (task: EmployeeTask) => (
    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
      {tab === "mine" && ["PENDING", "RETURNED"].includes(task.status) && (
        <Button
          size="small"
          onClick={() => {
            setComplete(task);
            setCompleteForm({
              actualValue: "",
              result: "",
              publishUrl: "",
              screenshotUrl: "",
              evidence: "",
            });
          }}
        >
          提交
        </Button>
      )}
      {tab === "team" && canConfirm && task.status === "COMPLETED" && (
        <>
          <Button
            size="small"
            onClick={() => void confirmTask(task, "CONFIRM")}
          >
            确认
          </Button>
          <Button
            size="small"
            color="warning"
            onClick={() => void confirmTask(task, "RETURN")}
          >
            退回
          </Button>
        </>
      )}
    </Stack>
  );

  return (
    <ModulePage sx={{ p: { xs: 2, md: 3 } }}>
      <ModuleHeader
        title="工作任务台账"
        description="从我的工作台进入具体事项，完成提交、确认和复盘；这里保留完整执行记录。"
        actions={
          <TextField
            size="small"
            type="date"
            label="工作日期"
            value={date}
            onChange={(e) => {
              const nextDate = e.target.value;
              setDate(nextDate);
              setPage(0);
              setSearchParams({ tab, date: nextDate });
            }}
            InputLabelProps={{ shrink: true }}
          />
        }
      />
      {message && (
        <Alert
          severity={message.tone}
          onClose={() => setMessage(null)}
          sx={{ mb: 2 }}
        >
          {message.text}
        </Alert>
      )}
      <ModuleTabs
        value={tab}
        onChange={(_, value) => {
          setTab(value);
          setPage(0);
          setSearchParams({ tab: value, date });
        }}
        variant="scrollable"
      >
        <Tab value="mine" label="我的任务" />
        {canTeam && <Tab value="team" label="团队执行" />}
        <Tab value="review" label="每日复盘" />
      </ModuleTabs>
      {(tab === "mine" || tab === "team") && (
        <>
          {!tasks.length ? (
            <Alert severity="info">当天暂无任务。</Alert>
          ) : mobile ? (
            <Stack spacing={1.5}>
              {tasks.map((task) => {
                const lines = (task.description || "").split("\n");
                const copy = lines
                  .find((line) => line.startsWith("发布文案："))
                  ?.slice(5);
                const links = lines
                  .filter(
                    (line) =>
                      line.startsWith("素材链接：") ||
                      line.startsWith("图片链接："),
                  )
                  .flatMap((line) => line.slice(5).split("、"));
                return (
                  <Paper id={`task-${task.id}`} key={task.id} variant="outlined" sx={{ p: 2, bgcolor: selectedTaskId === task.id ? '#F0F6FF' : undefined, borderColor: selectedTaskId === task.id ? 'primary.main' : undefined }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Box>
                        <Typography sx={{ fontWeight: 900 }}>
                          {task.title}
                        </Typography>
                        {taskSource(task)}
                        {tab === "team" && (
                          <Typography
                            variant="caption"
                            display="block"
                            color="text.secondary"
                          >
                            {task.employeeName} ·{" "}
                            {task.positionNameSnapshot || "未绑定岗位"}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        size="small"
                        color={statusMap[task.status].color}
                        label={statusMap[task.status].label}
                      />
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ mt: 1, whiteSpace: "pre-wrap" }}
                    >
                      {task.description}
                    </Typography>
                    {isMarketingPublishTask(task) ? (
                      <Stack
                        direction="row"
                        spacing={0.5}
                        useFlexGap
                        flexWrap="wrap"
                        sx={{ mt: 1 }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={!copy}
                          onClick={() =>
                            copy && void navigator.clipboard.writeText(copy)
                          }
                        >
                          复制文案
                        </Button>
                        {links.map((link, index) => (
                          <Button
                            key={`${link}-${index}`}
                            size="small"
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            打开素材{index + 1}
                          </Button>
                        ))}
                      </Stack>
                    ) : null}
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      目标 {task.targetValue ?? "—"} {task.unit || ""} · 实际{" "}
                      {task.actualValue ?? "—"} {task.unit || ""}
                    </Typography>
                    {task.returnedReason && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        {task.returnedReason}
                      </Alert>
                    )}
                    <Box sx={{ mt: 1 }}>{actions(task)}</Box>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>任务</TableCell>
                    {tab === "team" && <TableCell>员工</TableCell>}
                    <TableCell>目标</TableCell>
                    <TableCell>实际</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow id={`task-${task.id}`} key={task.id} selected={selectedTaskId === task.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          {task.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          display="block"
                          color="text.secondary"
                          sx={{ whiteSpace: "pre-wrap" }}
                        >
                          {task.description}
                        </Typography>
                        {taskSource(task)}
                        {taskResourceActions(task)}
                      </TableCell>
                      {tab === "team" && (
                        <TableCell>
                          {task.employeeName}
                          <br />
                          <Typography variant="caption" color="text.secondary">
                            {task.positionNameSnapshot}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell>
                        {task.targetValue ?? "—"} {task.unit}
                      </TableCell>
                      <TableCell>
                        {task.actualValue ?? "—"} {task.unit}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={statusMap[task.status].color}
                          label={statusMap[task.status].label}
                        />
                      </TableCell>
                      <TableCell align="right">{actions(task)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <TablePagination
            count={total}
            page={page}
            rowsPerPage={pageSize}
            onPageChange={(_, next) => {
              setPage(next);
              setSearchParams({ tab, date, page: String(next + 1) });
            }}
            onRowsPerPageChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
              setSearchParams({ tab, date, page: "1" });
            }}
            sx={{ mt: 1 }}
          />
        </>
      )}
      {tab === "review" && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              今日复盘
            </Typography>
            {reviewSummary && (
              <Alert severity="info">
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 900, mb: 0.5 }}
                >
                  AI复盘建议（需负责人验证）
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {reviewSummary}
                </Typography>
              </Alert>
            )}
            {(
              [
                "completedSummary",
                "problems",
                "successCases",
                "failureCases",
                "customerNeeds",
                "suggestions",
              ] as const
            ).map((key) => (
              <TextField
                key={key}
                label={
                  (
                    {
                      completedSummary: "今天完成",
                      problems: "遇到问题",
                      successCases: "成交/成功案例",
                      failureCases: "失败案例",
                      customerNeeds: "客户新需求",
                      suggestions: "建议优化",
                    } as const
                  )[key]
                }
                multiline
                minRows={2}
                value={review[key]}
                onChange={(e) =>
                  setReview({ ...review, [key]: e.target.value })
                }
              />
            ))}
            <Button variant="contained" onClick={() => void submitReview()}>
              保存今日复盘
            </Button>
          </Stack>
        </Paper>
      )}
      {tab === "templates" && (
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            gap={1}
          >
            <Typography variant="body2" color="text.secondary">
              工作日模板按岗位自动生成，重复生成不会产生重复任务。
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => void generate()}>
                生成当天任务
              </Button>
              <Button variant="contained" onClick={() => setTemplateOpen(true)}>
                新建模板
              </Button>
            </Stack>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2,
            }}
          >
            {templates.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
                  <Chip
                    size="small"
                    color={item.isActive ? "success" : "default"}
                    label={item.isActive ? "启用" : "停用"}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {positions.find((position) => position.id === item.positionId)
                    ?.name || item.positionId}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  目标 {item.targetValue ?? "—"} {item.unit || ""} · 截止{" "}
                  {item.dueTime || "未设置"} ·{" "}
                  {item.evidenceRequired ? "需证据" : "无需证据"}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Stack>
      )}
      <Dialog
        open={Boolean(complete)}
        onClose={() => setComplete(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              提交任务完成
            </Typography>
            {complete?.targetValue !== null && (
              <TextField
                type="number"
                label={`实际完成${complete?.unit ? `（${complete.unit}）` : ""}`}
                value={completeForm.actualValue}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    actualValue: e.target.value,
                  })
                }
              />
            )}
            <TextField
              label="完成结果"
              multiline
              minRows={3}
              value={completeForm.result}
              onChange={(e) =>
                setCompleteForm({ ...completeForm, result: e.target.value })
              }
            />
            {isMarketingPublishTask(complete) ? (
              <>
                <TextField
                  type="url"
                  label="发布链接"
                  placeholder="https://"
                  value={completeForm.publishUrl}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      publishUrl: e.target.value,
                    })
                  }
                />
                <TextField
                  type="url"
                  label="发布截图链接"
                  placeholder="请填写网盘或图床链接，服务器不保存图片"
                  value={completeForm.screenshotUrl}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      screenshotUrl: e.target.value,
                    })
                  }
                />
              </>
            ) : null}
            <TextField
              label={
                complete?.evidenceRequired
                  ? "补充说明/其他证据（发布链接或截图链接至少填一项）"
                  : "完成证据（选填）"
              }
              multiline
              minRows={2}
              value={completeForm.evidence}
              onChange={(e) =>
                setCompleteForm({ ...completeForm, evidence: e.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setComplete(null)}>取消</Button>
          <Button variant="contained" onClick={() => void submitComplete()}>
            提交
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              工作日任务模板
            </Typography>
            <TextField
              select
              label="岗位"
              value={template.positionId}
              onChange={(e) =>
                setTemplate({ ...template, positionId: e.target.value })
              }
            >
              {positions.map((position) => (
                <MenuItem key={position.id} value={position.id}>
                  {position.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="任务名称"
              value={template.name}
              onChange={(e) =>
                setTemplate({ ...template, name: e.target.value })
              }
            />
            <TextField
              label="任务说明"
              value={template.description}
              onChange={(e) =>
                setTemplate({ ...template, description: e.target.value })
              }
              multiline
              minRows={2}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                type="number"
                label="目标值（可空）"
                value={template.targetValue}
                onChange={(e) =>
                  setTemplate({ ...template, targetValue: e.target.value })
                }
              />
              <TextField
                fullWidth
                label="单位"
                value={template.unit}
                onChange={(e) =>
                  setTemplate({ ...template, unit: e.target.value })
                }
              />
              <TextField
                fullWidth
                type="time"
                label="截止时间"
                value={template.dueTime}
                onChange={(e) =>
                  setTemplate({ ...template, dueTime: e.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={template.evidenceRequired}
                  onChange={(e) =>
                    setTemplate({
                      ...template,
                      evidenceRequired: e.target.checked,
                    })
                  }
                />
              }
              label="完成时必须提交证据"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => void saveTemplate()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </ModulePage>
  );
};

export default TaskCenter;
