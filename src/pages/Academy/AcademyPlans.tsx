import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import SearchIcon from "@mui/icons-material/Search";
import TablePagination from "../../shared/components/TablePagination";
import SystemDataTable from "../../shared/components/SystemDataTable";
import type {
  AcademySession,
  AcademySessionDetail,
  AcademySessionStatus,
  SaveAcademyReviewInput,
} from "../../types/academy";

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

const shortDate = (date: Date) =>
  `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";

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
    return detail?.review ? { label: "查看复盘结果", tab: 2 } : { label: "填写复盘结果", tab: 2 };
  return { label: "查看取消记录", tab: 0 };
};

type PlansProps = {
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  detailErrors: Record<string, string>;
  onCreate: (date?: Date) => void;
  canCreate: boolean;
  canReview: boolean;
  requestedSessionId?: string;
  onRequestConsumed: () => void;
  onNeedDetail: (id: string) => void;
  onReloadDetail: (id: string) => void;
  onSelectSession: (id: string) => void;
  reviewForm: SaveAcademyReviewInput;
  onSaveReview: (value: SaveAcademyReviewInput) => Promise<boolean>;
  saving: boolean;
};

export const Plans: React.FC<PlansProps> = ({
  sessions,
  details,
  detailErrors,
  onCreate,
  canCreate,
  canReview,
  requestedSessionId,
  onRequestConsumed,
  onNeedDetail,
  onReloadDetail,
  onSelectSession,
  reviewForm,
  onSaveReview,
  saving,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [bucket, setBucket] = useState<"UPCOMING" | "COMPLETED">("UPCOMING");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customerPage, setCustomerPage] = useState(0);
  const [customerPageSize, setCustomerPageSize] = useState(10);
  const [customerSearch, setCustomerSearch] = useState("");
  const [editingReview, setEditingReview] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<SaveAcademyReviewInput | null>(null);

  const { monday, sunday, weekSessions, weekDays } = useMemo(() => {
    const mondayDate = new Date();
    const weekday = mondayDate.getDay() || 7;
    mondayDate.setDate(mondayDate.getDate() - weekday + 1 + weekOffset * 7);
    mondayDate.setHours(0, 0, 0, 0);
    const nextMonday = new Date(mondayDate);
    nextMonday.setDate(mondayDate.getDate() + 7);
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 6);
    return {
      monday: mondayDate,
      sunday: sundayDate,
      weekSessions: sessions
        .filter((item) => {
          const startsAt = new Date(item.startsAt);
          return startsAt >= mondayDate && startsAt < nextMonday;
        })
        .sort((left, right) => +new Date(left.startsAt) - +new Date(right.startsAt)),
      weekDays: Array.from({ length: 7 }, (_, index) => {
        const date = new Date(mondayDate);
        date.setDate(mondayDate.getDate() + index);
        return date;
      }),
    };
  }, [sessions, weekOffset]);

  useEffect(() => setPage(0), [search, bucket]);
  const filtered = sessions.filter((item) => {
    const matchesSearch = `${item.title}${item.course?.title || ""}${item.venue}${item.facilitatorUserName || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesBucket = bucket === "COMPLETED"
      ? item.status === "COMPLETED"
      : ["PLANNED", "READY"].includes(item.status);
    return matchesSearch && matchesBucket;
  });
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  useEffect(() => { if (page > maxPage) setPage(maxPage); }, [maxPage, page]);
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);
  useEffect(() => {
    paged.forEach((item) => {
      if (!details[item.id] && !detailErrors[item.id]) onNeedDetail(item.id);
    });
  }, [bucket, detailErrors, details, onNeedDetail, page, pageSize, search, sessions]);

  useEffect(() => {
    if (!requestedSessionId || !sessions.some((item) => item.id === requestedSessionId)) return;
    setSelectedId(requestedSessionId);
    setEditingReview(false);
    setReviewDraft(null);
    if (!details[requestedSessionId]) onNeedDetail(requestedSessionId);
    onRequestConsumed();
  }, [details, onNeedDetail, onRequestConsumed, requestedSessionId, sessions]);

  const selected = sessions.find((item) => item.id === selectedId) || null;
  const selectedDetail = selected ? details[selected.id] : undefined;
  const selectedDetailError = selected ? detailErrors[selected.id] : undefined;
  const activeReviewForm: SaveAcademyReviewInput = reviewForm.sessionId === selectedId
    ? reviewForm
    : { sessionId: selectedId, summary: "", issues: "", improvements: "", metrics: {}, actionItems: [] };
  const engagementMetrics = selectedDetail
    ? {
        invited: selectedDetail.engagements.length,
        confirmed: selectedDetail.engagements.filter((item) => item.invitationStatus === "CONFIRMED").length,
        attended: selectedDetail.engagements.filter((item) => item.attendanceStatus === "ATTENDED").length,
        hot: selectedDetail.engagements.filter((item) => item.courseAssessment === "A").length,
        deals: selectedDetail.engagements.filter((item) => Boolean(item.orderNo)).length,
      }
    : { invited: 0, confirmed: 0, attended: 0, hot: 0, deals: 0 };
  const customerRows = (selectedDetail?.engagements || []).filter((item) =>
    item.participantName.toLowerCase().includes(customerSearch.toLowerCase()),
  );
  const pagedCustomerRows = customerRows.slice(
    customerPage * customerPageSize,
    customerPage * customerPageSize + customerPageSize,
  );
  useEffect(() => setCustomerPage(0), [customerSearch]);

  const openDetail = (item: AcademySession) => {
    setSelectedId(item.id);
    setEditingReview(false);
    setReviewDraft(null);
    onSelectSession(item.id);
    if (!details[item.id]) onNeedDetail(item.id);
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
        <Box>
          <Typography fontSize={18} fontWeight={950}>课程安排</Typography>
          <Typography fontSize={12.5} color="text.secondary">安排未来课程，查看已完结课程的客户结果与复盘</Typography>
        </Box>
        {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={() => onCreate()}>新建课程安排</Button>}
      </Stack>

      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5, overflow: "hidden" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontSize={16} fontWeight={950}>本周课程安排</Typography>
            <Typography fontSize={12.5} color="text.secondary">{shortDate(monday)} ～ {shortDate(sunday)}</Typography>
            <IconButton size="small" aria-label="上一周" onClick={() => setWeekOffset((value) => value - 1)} sx={{ border: `1px solid ${colors.line}`, borderRadius: 1 }}><ChevronLeftIcon fontSize="small" /></IconButton>
            <Button size="small" variant="outlined" onClick={() => setWeekOffset(0)}>本周</Button>
            <IconButton size="small" aria-label="下一周" onClick={() => setWeekOffset((value) => value + 1)} sx={{ border: `1px solid ${colors.line}`, borderRadius: 1 }}><ChevronRightIcon fontSize="small" /></IconButton>
          </Stack>
          <Typography fontSize={12.5} color="text.secondary">本周共 {weekSessions.length} 场</Typography>
        </Stack>
        <Box sx={{ mt: 1.3, overflowX: "auto" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(150px, 1fr))", minWidth: 1050, border: `1px solid ${colors.line}`, borderRadius: 1.2, overflow: "hidden" }}>
            {weekDays.map((date, index) => {
              const items = weekSessions.filter((item) => new Date(item.startsAt).toDateString() === date.toDateString());
              return <Box key={date.toISOString()} sx={{ minHeight: 190, p: 1.1, bgcolor: items.length ? "#F4F8FF" : "#fff", borderRight: index < 6 ? `1px solid ${colors.line}` : 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Stack direction="row" spacing={0.7}><Typography fontWeight={900} fontSize={13}>周{"一二三四五六日"[index]}</Typography><Typography fontSize={12} color="text.secondary">{String(date.getMonth() + 1).padStart(2, "0")}-{String(date.getDate()).padStart(2, "0")}</Typography></Stack>{canCreate && <IconButton size="small" aria-label="当天新增课程安排" onClick={() => onCreate(date)}><AddIcon fontSize="small" /></IconButton>}</Stack>
                {items.length ? <Stack spacing={0.8} sx={{ mt: 1 }}>{items.map((item) => { const canOpen = item.canOpenDetail !== false && ["PLANNED", "READY", "COMPLETED"].includes(item.status); return <Box key={item.id} role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined} aria-label={canOpen ? `查看课程安排 ${item.title}` : undefined} onClick={canOpen ? () => openDetail(item) : undefined} onKeyDown={canOpen ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(item); } } : undefined} sx={{ p: 1, borderRadius: 1, bgcolor: "#fff", border: "1px solid #C9DBFF", cursor: canOpen ? "pointer" : "default", "&:focus-visible": { outline: `2px solid ${colors.blue}` } }}><Typography fontSize={12.5} fontWeight={900} noWrap>{item.title}</Typography><Typography fontSize={11.5} color="text.secondary">{formatTime(item.startsAt)} · {deliveryModeLabel[item.deliveryMode] || item.deliveryMode}</Typography><Chip size="small" label={statusLabel[item.status] || item.status} sx={{ mt: 0.7 }} /></Box>; })}</Stack> : <Typography fontSize={12} color="text.secondary" textAlign="center" sx={{ mt: 7 }}>暂无安排</Typography>}
              </Box>;
            })}
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.2 }}>
        {[
          { key: "UPCOMING", label: "待开课安排", helper: "设置时间、讲师和课程负责人", count: sessions.filter((item) => ["PLANNED", "READY"].includes(item.status)).length },
          { key: "COMPLETED", label: "已完结课程", helper: "查看客户结果、经营数据和复盘", count: sessions.filter((item) => item.status === "COMPLETED").length },
        ].map((item) => <Paper component="button" type="button" aria-pressed={bucket === item.key} key={item.key} variant="outlined" onClick={() => setBucket(item.key as "UPCOMING" | "COMPLETED")} sx={{ ...panelSx, p: 1.6, textAlign: "left", cursor: "pointer", borderColor: bucket === item.key ? colors.blue : colors.line, bgcolor: bucket === item.key ? colors.blueSoft : "#fff" }}><Stack direction="row" justifyContent="space-between"><Box><Typography fontWeight={950}>{item.label}</Typography><Typography fontSize={12.5} color="text.secondary">{item.helper}</Typography></Box><Typography fontSize={24} fontWeight={950} color={bucket === item.key ? colors.blue : colors.ink}>{item.count}</Typography></Stack></Paper>)}
      </Box>

      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} spacing={1} sx={{ p: 1.5, borderBottom: `1px solid ${colors.line}` }}>
          <Box><Typography fontWeight={900}>{bucket === "UPCOMING" ? "待开课安排" : "已完结课程"}</Typography><Typography fontSize={12.5} color="text.secondary">{bucket === "UPCOMING" ? "点击一行查看课程安排信息；进行中课程统一到我的工作台推进" : "点击一行查看客户结果、课程数据和复盘"}</Typography></Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField size="small" placeholder="搜索课程、安排、地点或负责人" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 0.7, color: "#98A2B3", fontSize: 20 }} /> }} />
          </Stack>
        </Stack>
        <Typography fontSize={13} color="text.secondary" sx={{ px: 1.5, py: 1 }}>共 {filtered.length} 条</Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <SystemDataTable tableId="academy-course-arrangements" sx={{ minWidth: 1280 }}>
            <TableHead><TableRow><TableCell>{bucket === "COMPLETED" ? "完结时间" : "开课时间"}</TableCell><TableCell>课程安排</TableCell><TableCell>授课方式</TableCell><TableCell>主讲人</TableCell><TableCell>运营负责人</TableCell><TableCell>经营目标</TableCell><TableCell>{bucket === "COMPLETED" ? "课程结果" : "状态"}</TableCell><TableCell>{bucket === "COMPLETED" ? "复盘状态" : "操作"}</TableCell></TableRow></TableHead>
            <TableBody>
              {paged.map((item) => {
                const detail = details[item.id];
                const deals = detail?.engagements.filter((engagement) => Boolean(engagement.orderNo)).length || 0;
                return <TableRow key={item.id} hover={item.canOpenDetail !== false} role={item.canOpenDetail === false ? undefined : "button"} tabIndex={item.canOpenDetail === false ? undefined : 0} aria-label={item.canOpenDetail === false ? undefined : `查看课程安排 ${item.title}`} onClick={item.canOpenDetail === false ? undefined : () => openDetail(item)} onKeyDown={item.canOpenDetail === false ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(item); } }} sx={{ cursor: item.canOpenDetail === false ? "default" : "pointer", "&:focus-visible": { outline: `2px solid ${colors.blue}`, outlineOffset: -2 } }}><TableCell>{new Date(item.startsAt).toLocaleDateString("zh-CN")}<Typography fontSize={12} color="text.secondary">{formatTime(item.startsAt)}–{formatTime(item.endsAt)}</Typography></TableCell><TableCell sx={{ fontWeight: 850 }}>{item.title}<Typography fontSize={12} color="text.secondary">{item.course?.title || "课程待关联"}</Typography></TableCell><TableCell>{deliveryModeLabel[item.deliveryMode] || item.deliveryMode}<Typography fontSize={12} color="text.secondary">{item.deliveryMode === "ONLINE" ? "线上" : item.venue || "地点待填"}</Typography></TableCell><TableCell>{item.lecturerUserName || "待确定"}</TableCell><TableCell>{item.facilitatorUserName || "待分配"}</TableCell><TableCell>邀约 {item.inviteTarget || 0} · 到课 {item.attendanceTarget || 0}<Typography fontSize={12} color="text.secondary">成交 {item.dealTarget || 0} · ¥{Number(item.targetRevenue || 0).toLocaleString("zh-CN")}</Typography></TableCell><TableCell>{bucket === "COMPLETED" ? `到课 ${detail?.engagements.filter((engagement) => engagement.attendanceStatus === "ATTENDED").length || 0} · 成交 ${deals}` : <Chip size="small" label={statusLabel[item.status] || item.status} />}</TableCell><TableCell>{bucket === "COMPLETED" ? <Chip size="small" label={detail?.review ? "已复盘" : "待复盘"} color={detail?.review ? "success" : "warning"} /> : <Typography fontSize={12.5} color="primary" fontWeight={800}>查看安排</Typography>}</TableCell></TableRow>;
              })}
              {!paged.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}><Typography fontWeight={850}>当前筛选暂无课程安排</Typography><Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>调整筛选条件或新建课程安排</Typography></TableCell></TableRow>}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination count={filtered.length} page={page} rowsPerPage={pageSize} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} />
      </Paper>

      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelectedId("")} PaperProps={{ role: "dialog", "aria-modal": true, "aria-label": "课程安排详情", sx: { width: { xs: "100%", md: 860, xl: 960 }, maxWidth: "100vw", bgcolor: colors.soft } }}>
        {selected && <Stack sx={{ minHeight: "100%" }}>
          <Paper square elevation={0} sx={{ position: "sticky", top: 0, zIndex: 2, px: { xs: 1.5, md: 2 }, py: 1.5, borderBottom: `1px solid ${colors.line}` }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box minWidth={0}><Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap"><Typography fontSize={20} fontWeight={950}>{selected.title}</Typography><Chip size="small" label={statusLabel[selected.status] || selected.status} /></Stack><Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>{selected.course?.title || "课程待关联"} · {formatDateTime(selected.startsAt)}</Typography></Box>
              <Tooltip title="关闭课程安排详情"><IconButton aria-label="关闭课程安排详情" onClick={() => setSelectedId("")}><CloseIcon /></IconButton></Tooltip>
            </Stack>
          </Paper>
          <Box sx={{ p: { xs: 1.25, md: 2 }, flex: 1 }}>
            {!selectedDetail && !selectedDetailError && <Stack alignItems="center" spacing={1} sx={{ py: 8 }}><CircularProgress size={28} /><Typography color="text.secondary">正在加载课程安排详情…</Typography></Stack>}
            {!selectedDetail && selectedDetailError && <Stack alignItems="center" spacing={1.2} sx={{ py: 8 }}><Typography fontWeight={900}>课程安排详情加载失败</Typography><Typography fontSize={12.5} color="text.secondary">{selectedDetailError}</Typography><Button variant="outlined" onClick={() => onReloadDetail(selected.id)}>重新加载</Button></Stack>}
            {selectedDetail && <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                <Typography fontWeight={950}>{selected.status === "COMPLETED" ? "课程结果概览" : "课程安排信息"}</Typography>
                <Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.3 }}>{selected.status === "COMPLETED" ? "课程已完结，下方查看客户结果和复盘" : "进行中课程的SOP进度与任务操作统一到“我的工作台”完成"}</Typography>
                <Box sx={{ mt: 1.4, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1 }}>
                  {[["开课时间", formatDateTime(selected.startsAt)], ["授课方式", deliveryModeLabel[selected.deliveryMode] || selected.deliveryMode], ["主讲人", selected.lecturerUserName || "待确定"], ["项目负责人", selected.facilitatorUserName || "待分配"]].map(([label, value]) => <Box key={label} sx={{ p: 1.2, bgcolor: colors.soft, borderRadius: 1 }}><Typography fontSize={11.5} color="text.secondary">{label}</Typography><Typography fontSize={13.5} fontWeight={850} sx={{ mt: 0.3 }}>{value}</Typography></Box>)}
                </Box>
              </Paper>

              {selected.status === "COMPLETED" && <>
              <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                <Typography fontWeight={950}>课程数据</Typography>
                <Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.3 }}>数据来自“邀约跟进”，本页仅用于查看</Typography>
                <Box sx={{ mt: 1.3, display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(5, 1fr)" }, gap: 1 }}>
                  {[["邀约", engagementMetrics.invited], ["确认", engagementMetrics.confirmed], ["到课", engagementMetrics.attended], ["A类客户", engagementMetrics.hot], ["成交", engagementMetrics.deals]].map(([label, value]) => <Box key={label} sx={{ p: 1.25, bgcolor: colors.soft, borderRadius: 1 }}><Typography fontSize={12} color="text.secondary">{label}</Typography><Typography fontSize={22} fontWeight={950}>{value}</Typography></Box>)}
                </Box>
              </Paper>

              <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} sx={{ p: 1.4, borderBottom: `1px solid ${colors.line}` }}><Box><Typography fontWeight={950}>客户数据明细</Typography><Typography fontSize={12.5} color="text.secondary">仅展示结果，销售操作请到“邀约跟进”完成</Typography></Box><TextField size="small" placeholder="搜索客户" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /></Stack>
                <TableContainer><SystemDataTable tableId="academy-arrangement-customer-progress" sx={{ minWidth: 820 }}><TableHead><TableRow><TableCell>客户</TableCell><TableCell>销售负责人</TableCell><TableCell>邀约</TableCell><TableCell>到课</TableCell><TableCell>ABC</TableCell><TableCell>跟进</TableCell><TableCell>下次跟进</TableCell><TableCell>订单</TableCell></TableRow></TableHead><TableBody>{pagedCustomerRows.map((item) => <TableRow key={item.id}><TableCell sx={{ fontWeight: 800 }}>{item.participantName}</TableCell><TableCell>{item.ownerUserName || "待分配"}</TableCell><TableCell>{statusLabel[item.invitationStatus] || item.invitationStatus}</TableCell><TableCell>{statusLabel[item.attendanceStatus] || item.attendanceStatus}</TableCell><TableCell><Chip size="small" label={item.courseAssessment || "待分层"} /></TableCell><TableCell>{statusLabel[item.followUpStatus] || item.followUpStatus}</TableCell><TableCell>{formatDateTime(item.nextFollowUpAt)}</TableCell><TableCell>{item.orderNo || "待关联"}</TableCell></TableRow>)}{!customerRows.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5 }}>当前课程暂无客户数据</TableCell></TableRow>}</TableBody></SystemDataTable></TableContainer>
                <TablePagination count={customerRows.length} page={customerPage} rowsPerPage={customerPageSize} onPageChange={(_, next) => setCustomerPage(next)} onRowsPerPageChange={(event) => { setCustomerPageSize(Number(event.target.value)); setCustomerPage(0); }} />
              </Paper>

              <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={950}>复盘记录</Typography><Typography fontSize={12.5} color="text.secondary">记录本场结论，供下一场课程直接参考</Typography></Box>{canReview && !editingReview && <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => { setReviewDraft({ ...activeReviewForm }); setEditingReview(true); }}>编辑复盘</Button>}</Stack>
                {editingReview && reviewDraft ? <Stack spacing={1.2} sx={{ mt: 1.4 }}><TextField label="做得好的" multiline minRows={2} value={reviewDraft.summary} onChange={(event) => setReviewDraft({ ...reviewDraft, summary: event.target.value })} /><TextField label="未达标原因" multiline minRows={2} value={reviewDraft.issues} onChange={(event) => setReviewDraft({ ...reviewDraft, issues: event.target.value })} /><TextField label="下一场改进动作" multiline minRows={2} value={reviewDraft.improvements} onChange={(event) => setReviewDraft({ ...reviewDraft, improvements: event.target.value })} /><Stack direction="row" justifyContent="flex-end" spacing={1}><Button onClick={() => { setEditingReview(false); setReviewDraft(null); }}>取消</Button><Button variant="contained" startIcon={<EventAvailableOutlinedIcon />} disabled={saving} onClick={async () => { if (await onSaveReview(reviewDraft)) { setEditingReview(false); setReviewDraft(null); } }}>{saving ? "保存中…" : "保存复盘"}</Button></Stack></Stack> : <Box sx={{ mt: 1.4, display: "grid", gap: 1.1 }}>{[["做得好的", selectedDetail.review?.summary], ["未达标原因", selectedDetail.review?.issues], ["下一场改进动作", selectedDetail.review?.improvements]].map(([label, value]) => <Box key={label} sx={{ p: 1.3, borderRadius: 1, bgcolor: colors.soft }}><Typography fontSize={11.5} color="text.secondary" fontWeight={800}>{label}</Typography><Typography fontSize={13.5} sx={{ mt: 0.4, whiteSpace: "pre-wrap" }}>{value || "暂未填写"}</Typography></Box>)}</Box>}
              </Paper>
              </>}
            </Stack>}
          </Box>
        </Stack>}
      </Drawer>
    </Stack>
  );
};
