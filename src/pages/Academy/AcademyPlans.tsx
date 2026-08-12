import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import TablePagination from "../../shared/components/TablePagination";
import SystemDataTable from "../../shared/components/SystemDataTable";
import type {
  AcademyEngagement,
  AcademySession,
  AcademySessionDetail,
  AcademySessionStatus,
  AcademySessionTask,
  SaveAcademyReviewInput,
} from "../../types/academy";
import {
  getAcademyTaskStep,
  getSessionNextStep,
  sortAcademyTasks,
} from "./academyMvpModel";

const colors = {
  blue: "#0868F7",
  blueSoft: "#EEF5FF",
  ink: "#17233D",
  muted: "#68758C",
  line: "#D9E2EF",
  soft: "#F7F9FC",
  green: "#13A66A",
  greenSoft: "#EAF9F1",
  amber: "#D97706",
  amberSoft: "#FFF6E8",
  red: "#E5484D",
  redSoft: "#FFF0F0",
};

const statusLabel: Record<string, string> = {
  PLANNED: "已排期",
  READY: "待开课",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  PENDING: "待处理",
  SUBMITTED: "待验收",
  DONE: "已完成",
  REJECTED: "验收驳回",
  BLOCKED: "受阻",
  SKIPPED: "已跳过",
  CONFIRMED: "已确认",
  ATTENDED: "已到课",
};

const deliveryModeLabel: Record<string, string> = {
  OFFLINE: "线下授课",
  LIVE: "直播授课",
  ONLINE: "线上会议",
};

const panelSx = {
  borderRadius: 1.5,
  borderColor: colors.line,
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.03)",
  bgcolor: "#fff",
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";

const shortDate = (date: Date) =>
  `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

const progressFor = (detail?: AcademySessionDetail) => {
  const total = detail?.tasks.length || 0;
  const done = detail?.tasks.filter((task) => task.status === "DONE").length || 0;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
};

const riskFor = (detail?: AcademySessionDetail) => {
  if (!detail) return { label: "待加载", color: colors.muted, bgcolor: colors.soft };
  if (detail.tasks.some((task) => task.status === "BLOCKED" || task.status === "REJECTED"))
    return { label: "有风险", color: colors.red, bgcolor: colors.redSoft };
  const overdue = detail.tasks.some(
    (task) => task.dueAt && new Date(task.dueAt) < new Date() && task.status !== "DONE",
  );
  if (overdue) return { label: "已逾期", color: colors.amber, bgcolor: colors.amberSoft };
  return { label: "正常", color: colors.green, bgcolor: colors.greenSoft };
};

export const getArrangementNextAction = (
  session: AcademySession,
  detail?: AcademySessionDetail,
) => {
  if (session.status === "PLANNED") {
    const beforeTasks = detail?.tasks.filter((task) => task.category === "BEFORE" && task.isRequired) || [];
    const ready = beforeTasks.length > 0 && beforeTasks.every((task) => task.status === "DONE");
    return ready
      ? { label: "确认开课", nextStatus: "READY" as AcademySessionStatus, tab: 0 }
      : { label: "完善SOP流程", tab: 0 };
  }
  if (session.status === "READY")
    return { label: "进入课程执行", nextStatus: "IN_PROGRESS" as AcademySessionStatus, tab: 0 };
  if (session.status === "IN_PROGRESS")
    return { label: "完成课程并填写结果", nextStatus: "COMPLETED" as AcademySessionStatus, tab: 2 };
  if (session.status === "COMPLETED")
    return detail?.review
      ? { label: "查看复盘结果", tab: 2 }
      : { label: "填写复盘结果", tab: 2 };
  return { label: "查看取消记录", tab: 0 };
};

type PlansProps = {
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  detailErrors: Record<string, string>;
  onCreate: (date?: Date) => void;
  canCreate: boolean;
  canManageTasks: boolean;
  currentUserId: string;
  canManageExecution: boolean;
  canManageSales: boolean;
  canReview: boolean;
  requestedSessionId?: string;
  onRequestConsumed: () => void;
  onNeedDetail: (id: string) => void;
  onReloadDetail: (id: string) => void;
  onSelectSession: (id: string) => void;
  onTaskAction: (task: AcademySessionTask, status: AcademySessionTask["status"]) => void;
  onAddLearner: (sessionId: string) => void;
  onEditLearner: (engagement: AcademyEngagement) => void;
  onFollowUpLearner: (engagement: AcademyEngagement) => void;
  onLinkOrder: (engagement: AcademyEngagement) => void;
  onChangeStatus: (session: AcademySession, status: AcademySessionStatus) => void;
  reviewForm: SaveAcademyReviewInput;
  onReviewFormChange: (value: SaveAcademyReviewInput) => void;
  onSaveReview: () => void;
  saving: boolean;
};

export const Plans: React.FC<PlansProps> = ({
  sessions,
  details,
  detailErrors,
  onCreate,
  canCreate,
  canManageTasks,
  currentUserId,
  canManageExecution,
  canManageSales,
  canReview,
  requestedSessionId,
  onRequestConsumed,
  onNeedDetail,
  onReloadDetail,
  onSelectSession,
  onTaskAction,
  onAddLearner,
  onEditLearner,
  onFollowUpLearner,
  onLinkOrder,
  onChangeStatus,
  reviewForm,
  onReviewFormChange,
  onSaveReview,
  saving,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detailTab, setDetailTab] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);
  const [customerPageSize, setCustomerPageSize] = useState(10);
  const [customerSearch, setCustomerSearch] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const { monday, sunday, weekSessions, weekDays } = useMemo(() => {
    const mondayDate = new Date();
    const weekday = mondayDate.getDay() || 7;
    mondayDate.setDate(mondayDate.getDate() - weekday + 1 + weekOffset * 7);
    mondayDate.setHours(0, 0, 0, 0);
    const nextMonday = new Date(mondayDate);
    nextMonday.setDate(mondayDate.getDate() + 7);
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 6);
    const items = sessions
      .filter((item) => {
        const startsAt = new Date(item.startsAt);
        return startsAt >= mondayDate && startsAt < nextMonday;
      })
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    return {
      monday: mondayDate,
      sunday: sundayDate,
      weekSessions: items,
      weekDays: Array.from({ length: 7 }, (_, index) => {
        const date = new Date(mondayDate);
        date.setDate(mondayDate.getDate() + index);
        return date;
      }),
    };
  }, [sessions, weekOffset]);

  useEffect(() => {
    weekSessions.forEach((item) => {
      if (!details[item.id] && !detailErrors[item.id]) onNeedDetail(item.id);
    });
  }, [detailErrors, details, onNeedDetail, weekSessions]);

  useEffect(() => setPage(0), [search, status]);

  useEffect(() => {
    if (!requestedSessionId || !sessions.some((item) => item.id === requestedSessionId)) return;
    setSelectedId(requestedSessionId);
    setDetailTab(0);
    if (!details[requestedSessionId]) onNeedDetail(requestedSessionId);
    onRequestConsumed();
  }, [details, onNeedDetail, onRequestConsumed, requestedSessionId, sessions]);

  const filtered = sessions.filter((item) => {
    const matchesSearch = `${item.title}${item.course?.title || ""}${item.venue}${item.facilitatorUserName || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesSearch && (status === "ALL" || item.status === status);
  });
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [maxPage, page]);
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);
  useEffect(() => {
    paged.forEach((item) => {
      if (!details[item.id] && !detailErrors[item.id]) onNeedDetail(item.id);
    });
  }, [detailErrors, details, onNeedDetail, page, pageSize, search, sessions, status]);
  const riskCount = weekSessions.filter(
    (item) => details[item.id] && riskFor(details[item.id]).label !== "正常",
  ).length;
  const metrics = [
    ["本周课程", `${weekSessions.length} 场`],
    ["风险课程", `${riskCount} 场`],
    ["待复盘", `${weekSessions.filter((item) => item.status === "COMPLETED" && !details[item.id]?.review).length} 场`],
  ];

  const selected = sessions.find((item) => item.id === selectedId) || null;
  const selectedDetail = selected ? details[selected.id] : undefined;
  const selectedDetailError = selected ? detailErrors[selected.id] : undefined;
  const selectedProgress = progressFor(selectedDetail);
  const selectedRisk = riskFor(selectedDetail);
  const selectedAction = selected ? getArrangementNextAction(selected, selectedDetail) : null;
  const selectedNextStep = selectedDetail ? getSessionNextStep(selectedDetail) : null;
  const activeReviewForm: SaveAcademyReviewInput = reviewForm.sessionId === selectedId
    ? reviewForm
    : {
        sessionId: selectedId,
        summary: "",
        issues: "",
        improvements: "",
        metrics: {},
        actionItems: [],
      };

  const openDetail = (item: AcademySession, tab = 0) => {
    setSelectedId(item.id);
    setDetailTab(tab);
    onSelectSession(item.id);
    if (!details[item.id]) onNeedDetail(item.id);
  };

  const runPrimaryAction = () => {
    if (!selected || !selectedAction) return;
    if (selectedAction.nextStatus) {
      if (!canManageTasks) return;
      onChangeStatus(selected, selectedAction.nextStatus);
    }
    setDetailTab(selectedAction.tab);
  };

  const engagementMetrics = selectedDetail
    ? {
        invited: selectedDetail.engagements.length,
        confirmed: selectedDetail.engagements.filter((item) => item.invitationStatus === "CONFIRMED").length,
        attended: selectedDetail.engagements.filter((item) => item.attendanceStatus === "ATTENDED").length,
        hot: selectedDetail.engagements.filter((item) => item.courseAssessment === "A").length,
      }
    : { invited: 0, confirmed: 0, attended: 0, hot: 0 };
  const customerRows = (selectedDetail?.engagements || []).filter((item) =>
    item.participantName.toLowerCase().includes(customerSearch.toLowerCase()),
  );
  const pagedCustomerRows = customerRows.slice(
    customerPage * customerPageSize,
    customerPage * customerPageSize + customerPageSize,
  );
  useEffect(() => { setCustomerPage(0); }, [customerSearch]);

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.3 }}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}><Stack direction="row" spacing={0.5}><Button size="small" variant={viewMode === "calendar" ? "contained" : "outlined"} onClick={() => setViewMode("calendar")}>周历</Button><Button size="small" variant={viewMode === "list" ? "contained" : "outlined"} onClick={() => setViewMode("list")}>列表</Button></Stack>{canCreate && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => onCreate()}>新建课程安排</Button>}</Stack></Paper>
      {viewMode === "calendar" && <Paper variant="outlined" sx={{ ...panelSx, p: 1.5, overflow: "hidden" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography sx={{ fontWeight: 900, fontSize: 16, color: colors.ink }}>本周课程安排</Typography>
            <Typography fontSize={13} color="text.secondary">{shortDate(monday)} ～ {shortDate(sunday)}</Typography>
            <IconButton size="small" aria-label="上一周" onClick={() => setWeekOffset((value) => value - 1)} sx={{ border: `1px solid ${colors.line}`, borderRadius: 1 }}><ChevronLeftIcon fontSize="small" /></IconButton>
            <Button size="small" variant="outlined" onClick={() => setWeekOffset(0)}>本周</Button>
            <IconButton size="small" aria-label="下一周" onClick={() => setWeekOffset((value) => value + 1)} sx={{ border: `1px solid ${colors.line}`, borderRadius: 1 }}><ChevronRightIcon fontSize="small" /></IconButton>
          </Stack>
        </Stack>
        <Box sx={{ mt: 1.3, overflowX: "auto" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(160px, 1fr))", minWidth: 1120, border: `1px solid ${colors.line}`, borderRadius: 1.2, overflow: "hidden" }}>
            {weekDays.map((date, index) => {
              const items = weekSessions.filter((item) => new Date(item.startsAt).toDateString() === date.toDateString());
              return (
                <Box key={date.toISOString()} sx={{ minHeight: 250, p: 1.2, bgcolor: items.length ? "#F4F8FF" : "#fff", borderRight: index < 6 ? `1px solid ${colors.line}` : 0 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={0.8} alignItems="center"><Typography fontWeight={900} color={items.length ? colors.blue : colors.ink} fontSize={13.5}>周{"一二三四五六日"[index]}</Typography><Typography fontSize={12.5} color="text.secondary">{String(date.getMonth() + 1).padStart(2, "0")}-{String(date.getDate()).padStart(2, "0")}</Typography></Stack>
                    {canCreate && <IconButton size="small" aria-label="当天新增课程安排" onClick={() => onCreate(date)}><AddIcon fontSize="small" /></IconButton>}
                  </Stack>
                  {items.length ? <Stack spacing={1} sx={{ mt: 1.2 }}>{items.map((item) => <Box key={item.id} role={item.canOpenDetail === false ? undefined : "button"} tabIndex={item.canOpenDetail === false ? undefined : 0} onClick={item.canOpenDetail === false ? undefined : () => openDetail(item)} onKeyDown={item.canOpenDetail === false ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(item); } }} sx={{ p: 1.2, borderRadius: 1, bgcolor: "#fff", border: "1px solid #C9DBFF", cursor: item.canOpenDetail === false ? "default" : "pointer", "&:hover": item.canOpenDetail === false ? undefined : { borderColor: colors.blue, boxShadow: "0 4px 12px rgba(8,104,247,.1)" } }}><Typography variant="body2" fontWeight={900} noWrap>{item.title}</Typography><Typography variant="caption" color="text.secondary">{formatTime(item.startsAt)} · {deliveryModeLabel[item.deliveryMode] || item.deliveryMode}</Typography><Stack direction="row" spacing={0.6} sx={{ mt: 1 }}><Chip size="small" label={statusLabel[item.status] || item.status} /><Chip size="small" label={`${progressFor(details[item.id]).percent}%`} sx={{ bgcolor: colors.blueSoft, color: colors.blue }} /></Stack></Box>)}</Stack> : <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 9, textAlign: "center" }}>暂无安排</Typography>}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Paper>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 1.2 }}>
        {metrics.map(([label, value], index) => <Paper key={label} variant="outlined" sx={{ ...panelSx, p: 1.5 }}><Typography fontSize={12.5} color="text.secondary">{label}</Typography><Typography sx={{ mt: 0.6, fontWeight: 900, fontSize: 20, color: index === 1 && riskCount ? colors.red : colors.ink }}>{value}</Typography></Paper>)}
      </Box>

      {viewMode === "list" && <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} spacing={1} sx={{ p: 1.5, borderBottom: `1px solid ${colors.line}` }}>
          <Box><Typography fontWeight={900}>全部课程安排</Typography><Typography fontSize={12.5} color="text.secondary">统一查看进度、风险、经营目标和下一步动作</Typography></Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField size="small" placeholder="搜索课程、安排、地点或负责人" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 0.7, color: "#98A2B3", fontSize: 20 }} /> }} />
            <TextField select size="small" label="状态" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 140 }}><MenuItem value="ALL">全部</MenuItem><MenuItem value="PLANNED">已排期</MenuItem><MenuItem value="READY">待开课</MenuItem><MenuItem value="IN_PROGRESS">进行中</MenuItem><MenuItem value="COMPLETED">已完成</MenuItem><MenuItem value="CANCELLED">已取消</MenuItem></TextField>
          </Stack>
        </Stack>
        <Typography fontSize={13} color="text.secondary" sx={{ px: 1.5, py: 1 }}>共 {filtered.length} 条</Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <SystemDataTable tableId="academy-course-arrangements" sx={{ minWidth: 1380 }}>
            <TableHead><TableRow><TableCell>日期与时间</TableCell><TableCell>课程安排</TableCell><TableCell>授课方式</TableCell><TableCell>主讲人</TableCell><TableCell>运营负责人</TableCell><TableCell>经营目标</TableCell><TableCell>执行进度</TableCell><TableCell>风险 / 状态</TableCell><TableCell>下一步</TableCell></TableRow></TableHead>
            <TableBody>
              {paged.map((item) => {
                const progress = progressFor(details[item.id]);
                const risk = riskFor(details[item.id]);
                const action = getArrangementNextAction(item, details[item.id]);
                return <TableRow key={item.id} hover={item.canOpenDetail !== false} onClick={item.canOpenDetail === false ? undefined : () => openDetail(item)} sx={{ cursor: item.canOpenDetail === false ? "default" : "pointer" }}><TableCell>{new Date(item.startsAt).toLocaleDateString("zh-CN")}<Typography fontSize={12} color="text.secondary">{formatTime(item.startsAt)}–{formatTime(item.endsAt)}</Typography></TableCell><TableCell sx={{ fontWeight: 850 }}>{item.title}<Typography fontSize={12} color="text.secondary">{item.course?.title || "课程待关联"}</Typography></TableCell><TableCell>{deliveryModeLabel[item.deliveryMode] || item.deliveryMode}<Typography fontSize={12} color="text.secondary">{item.deliveryMode === "ONLINE" ? item.meetingUrl || "链接待填" : item.venue || "地点待填"}</Typography></TableCell><TableCell>{item.lecturerUserName || "待确定"}</TableCell><TableCell>{item.facilitatorUserName || "待分配"}</TableCell><TableCell>邀约 {item.inviteTarget || 0} · 到课 {item.attendanceTarget || 0}<Typography fontSize={12} color="text.secondary">成交 {item.dealTarget || 0} · ¥{Number(item.targetRevenue || 0).toLocaleString("zh-CN")}</Typography></TableCell><TableCell sx={{ minWidth: 130 }}><Stack spacing={0.5}><Typography fontSize={12}>{progress.done}/{progress.total}（{progress.percent}%）</Typography><LinearProgress variant="determinate" value={progress.percent} /></Stack></TableCell><TableCell><Stack direction="row" spacing={0.5}><Chip size="small" label={risk.label} sx={{ bgcolor: risk.bgcolor, color: risk.color }} /><Chip size="small" label={statusLabel[item.status] || item.status} /></Stack></TableCell><TableCell onClick={(event) => event.stopPropagation()}>{item.canOpenDetail !== false && <Button size="small" onClick={() => openDetail(item, action.tab)}>{action.label}</Button>}</TableCell></TableRow>;
              })}
              {!paged.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><Typography fontWeight={850}>当前筛选暂无课程安排</Typography><Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>调整筛选条件或新建课程安排</Typography></TableCell></TableRow>}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination count={filtered.length} page={page} rowsPerPage={pageSize} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} />
      </Paper>}

      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelectedId("")} PaperProps={{ role: "dialog", "aria-modal": true, "aria-label": "课程安排详情", sx: { width: { xs: "100%", md: 820, xl: 920 }, maxWidth: "100vw", bgcolor: colors.soft } }}>
        {selected && <Stack sx={{ minHeight: "100%" }}>
          <Paper square elevation={0} sx={{ position: "sticky", top: 0, zIndex: 2, px: { xs: 1.5, md: 2 }, py: 1.5, borderBottom: `1px solid ${colors.line}` }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box minWidth={0}><Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap"><Typography fontSize={20} fontWeight={950}>{selected.title}</Typography><Chip size="small" label={statusLabel[selected.status] || selected.status} /></Stack><Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>{selected.course?.title || "课程待关联"} · {formatDateTime(selected.startsAt)}</Typography></Box>
              <Tooltip title="关闭课程安排详情"><IconButton aria-label="关闭课程安排详情" onClick={() => setSelectedId("")}><CloseIcon /></IconButton></Tooltip>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mt: 1.4 }}>
              <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={selectedRisk.label} sx={{ bgcolor: selectedRisk.bgcolor, color: selectedRisk.color }} /><Typography fontSize={12.5} color="text.secondary">执行进度 {selectedProgress.percent}%</Typography></Stack>
              {selectedAction && <Button variant="contained" disabled={saving || Boolean(selectedAction.nextStatus && !canManageTasks)} startIcon={selected.status === "READY" ? <PlayCircleOutlineIcon /> : selected.status === "COMPLETED" ? <InsightsOutlinedIcon /> : <TaskAltOutlinedIcon />} onClick={runPrimaryAction}>{selectedAction.label}</Button>}
            </Stack>
          </Paper>
          <Tabs value={detailTab} onChange={(_, value: number) => setDetailTab(value)} variant="scrollable" allowScrollButtonsMobile sx={{ bgcolor: "#fff", borderBottom: `1px solid ${colors.line}`, px: 1 }}><Tab label="SOP流程" /><Tab label={`客户推进（${engagementMetrics.invited}）`} /><Tab label="复盘结果" /></Tabs>
          <Box sx={{ p: { xs: 1.25, md: 2 }, flex: 1 }}>
            {!selectedDetail && !selectedDetailError && <Stack alignItems="center" spacing={1} sx={{ py: 8 }}><CircularProgress size={28} /><Typography color="text.secondary">正在加载课程安排详情…</Typography></Stack>}
            {!selectedDetail && selectedDetailError && <Stack alignItems="center" spacing={1.2} sx={{ py: 8 }}><Typography fontWeight={900}>课程安排详情加载失败</Typography><Typography fontSize={12.5} color="text.secondary">{selectedDetailError}</Typography><Button variant="outlined" onClick={() => onReloadDetail(selected.id)}>重新加载</Button></Stack>}
            {selectedDetail && detailTab === 0 && <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={950}>SOP流程</Typography><Typography fontSize={12.5} color="text.secondary">T-5 到 T+3 的单场课程执行表</Typography></Box><Typography fontSize={22} fontWeight={950} color={colors.blue}>{selectedProgress.percent}%</Typography></Stack><LinearProgress variant="determinate" value={selectedProgress.percent} sx={{ mt: 1.4, height: 8, borderRadius: 4 }} />{selectedNextStep && <Box sx={{ mt: 1.5, p: 1.3, borderRadius: 1, bgcolor: colors.blueSoft }}><Typography fontSize={12} color="text.secondary">当前下一步</Typography><Typography fontWeight={900}>{selectedNextStep.step.timeLabel} {selectedNextStep.step.label} · {selectedNextStep.task.assigneeUserName || "待分配"}</Typography></Box>}</Paper>
              <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}><TableContainer><SystemDataTable tableId="academy-arrangement-sop-flow" sx={{ minWidth: 760 }}><TableHead><TableRow><TableCell>时间</TableCell><TableCell>流程节点</TableCell><TableCell>负责人</TableCell><TableCell>完成标准</TableCell><TableCell>截止时间</TableCell><TableCell>状态</TableCell><TableCell>操作</TableCell></TableRow></TableHead><TableBody>{sortAcademyTasks(selectedDetail.tasks).map((task) => { const step = getAcademyTaskStep(task.templateKey); const isAssignee = task.assigneeUserId === currentUserId; return <TableRow key={task.id}><TableCell><Typography fontWeight={950} color={colors.blue}>{step.timeLabel}</Typography></TableCell><TableCell sx={{ fontWeight: 850 }}>{step.label}</TableCell><TableCell>{task.assigneeUserName || "待分配"}</TableCell><TableCell>{task.acceptanceCriteria || "完成后由负责人确认"}</TableCell><TableCell>{formatDateTime(task.dueAt)}</TableCell><TableCell><Chip size="small" label={statusLabel[task.status] || task.status} /></TableCell><TableCell><Stack direction="row" spacing={0.5}>{task.status === "PENDING" && isAssignee && <Button size="small" onClick={() => onTaskAction(task, "IN_PROGRESS")}>开始</Button>}{task.status === "IN_PROGRESS" && task.assigneeUserId === currentUserId && <Button size="small" onClick={() => onTaskAction(task, "SUBMITTED")}>提交验收</Button>}{task.status === "SUBMITTED" && canManageTasks && <><Button size="small" color="success" onClick={() => onTaskAction(task, "DONE")}>通过</Button><Button size="small" color="error" onClick={() => onTaskAction(task, "REJECTED")}>驳回</Button></>}</Stack></TableCell></TableRow>; })}</TableBody></SystemDataTable></TableContainer></Paper>
            </Stack>}
            {selectedDetail && detailTab === 1 && <Stack spacing={1.5}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>{[["确认", engagementMetrics.confirmed], ["到课", engagementMetrics.attended], ["完成评估", selectedDetail.engagements.filter((item) => Boolean(item.courseAssessment)).length]].map(([label, value]) => <Paper key={label} variant="outlined" sx={{ ...panelSx, p: 1.3 }}><Typography fontSize={12} color="text.secondary">{label}</Typography><Typography fontSize={22} fontWeight={950}>{value}</Typography></Paper>)}</Box>
              <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}><Box sx={{ p: 1.4, borderBottom: `1px solid ${colors.line}` }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between"><Box><Typography fontWeight={950}>客户推进表</Typography><Typography fontSize={12.5} color="text.secondary">邀约、到课、ABC分层、跟进和订单在同一页完成</Typography></Box><Stack direction="row" spacing={1}><TextField size="small" placeholder="搜索客户" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />{canManageSales && <Button size="small" variant="contained" onClick={() => onAddLearner(selected.id)}>从我的客户添加</Button>}</Stack></Stack></Box><TableContainer><SystemDataTable tableId="academy-arrangement-customer-progress" sx={{ minWidth: 1040 }}><TableHead><TableRow><TableCell>客户</TableCell><TableCell>销售负责人</TableCell><TableCell>邀约</TableCell><TableCell>到课</TableCell><TableCell>ABC</TableCell><TableCell>跟进</TableCell><TableCell>下次跟进</TableCell><TableCell>订单</TableCell><TableCell>操作</TableCell></TableRow></TableHead><TableBody>{pagedCustomerRows.map((item) => <TableRow key={item.id}><TableCell sx={{ fontWeight: 800 }}>{item.participantName}</TableCell><TableCell>{item.ownerUserName || "待分配"}</TableCell><TableCell>{statusLabel[item.invitationStatus] || item.invitationStatus}</TableCell><TableCell>{statusLabel[item.attendanceStatus] || item.attendanceStatus}</TableCell><TableCell><Chip size="small" label={item.courseAssessment || "待分层"} /></TableCell><TableCell>{statusLabel[item.followUpStatus] || item.followUpStatus}</TableCell><TableCell>{formatDateTime(item.nextFollowUpAt)}</TableCell><TableCell>{item.orderNo || "待关联"}</TableCell><TableCell><Stack direction="row" spacing={0.5}>{canManageExecution && <Button size="small" onClick={() => onEditLearner(item)}>记录到课</Button>}{canManageSales && <Button size="small" onClick={() => onFollowUpLearner(item)}>快速跟进</Button>}{canManageSales && !item.orderNo && <Button size="small" onClick={() => onLinkOrder(item)}>关联订单</Button>}</Stack></TableCell></TableRow>)}{!customerRows.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5 }}>暂无客户，请从本人CRM可见客户中添加</TableCell></TableRow>}</TableBody></SystemDataTable></TableContainer><TablePagination count={customerRows.length} page={customerPage} rowsPerPage={customerPageSize} onPageChange={(_, next) => setCustomerPage(next)} onRowsPerPageChange={(event) => { setCustomerPageSize(Number(event.target.value)); setCustomerPage(0); }} /></Paper>
            </Stack>}
            {selectedDetail && detailTab === 2 && <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}><Typography fontWeight={950}>课程结果·目标与实际</Typography><Box sx={{ mt: 1.3, display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1 }}>{[["邀约", selected.inviteTarget || 0, engagementMetrics.invited], ["确认", selected.registrationTarget || 0, engagementMetrics.confirmed], ["到课", selected.attendanceTarget || 0, engagementMetrics.attended], ["A类客户", selected.consultationTarget || 0, engagementMetrics.hot]].map(([label, target, actual]) => <Box key={label} sx={{ p: 1.2, bgcolor: colors.soft, borderRadius: 1 }}><Typography fontSize={12} color="text.secondary">{label}</Typography><Typography fontSize={18} fontWeight={950}>{actual} <Typography component="span" fontSize={11.5} color="text.secondary">/ 目标 {target}</Typography></Typography></Box>)}</Box></Paper>
              <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}><Typography fontWeight={950}>课程结论与改进</Typography><Stack spacing={1.2} sx={{ mt: 1.3 }}><TextField label="做得好的" multiline minRows={2} disabled={!canReview} value={activeReviewForm.summary} onChange={(event) => onReviewFormChange({ ...activeReviewForm, summary: event.target.value })} /><TextField label="未达标原因" multiline minRows={2} disabled={!canReview} value={activeReviewForm.issues} onChange={(event) => onReviewFormChange({ ...activeReviewForm, issues: event.target.value })} /><TextField label="下一场改进动作" multiline minRows={2} disabled={!canReview} value={activeReviewForm.improvements} onChange={(event) => onReviewFormChange({ ...activeReviewForm, improvements: event.target.value })} />{canReview && <Button variant="contained" startIcon={<EventAvailableOutlinedIcon />} disabled={saving || reviewForm.sessionId !== selected.id} onClick={onSaveReview}>{saving ? "保存中…" : "保存课程结果"}</Button>}</Stack></Paper>
            </Stack>}
          </Box>
        </Stack>}
      </Drawer>
    </Stack>
  );
};
