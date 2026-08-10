import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  DialogActions,
  DialogContent,
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
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import InsightsIcon from "@mui/icons-material/Insights";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useLocation, useNavigate } from "react-router-dom";
import { academyApi, customerApi } from "../../api";
import type {
  AcademyCourse,
  AcademyDashboard,
  AcademyEngagement,
  AcademySession,
  AcademySessionDetail,
  AcademySessionTask,
  CreateAcademyCourseInput,
  CreateAcademySessionInput,
  SaveAcademyEngagementInput,
  SaveAcademyReviewInput,
} from "../../types/academy";
import type { Customer } from "../../types/customer";
import { ROUTES } from "../../shared/utils/constants";
import { hasPermission, PERMISSION_KEYS } from "../../shared/utils/permissions";
import useAuthStore from "../../store/useAuthStore";
import useAppFeedback from "../../shared/hooks/useAppFeedback";
import ProtectedFormDialog from "../../shared/components/ProtectedFormDialog";
import DialogCloseTitle from "../../shared/components/DialogCloseTitle";
import TablePagination from "../../shared/components/TablePagination";
import SystemDataTable from "../../shared/components/SystemDataTable";
import {
  ModuleHeader,
  ModulePage,
  ModuleTabs,
} from "../../shared/components/ModuleShell";

const palette = {
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
  purple: "#7457E8",
};

const panelSx = {
  borderRadius: 1.5,
  borderColor: palette.line,
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.03)",
  bgcolor: "#fff",
};

type AcademyView =
  | "overview"
  | "courses"
  | "plans"
  | "sessions"
  | "engagements"
  | "handoffs"
  | "reviews";
const viewPath: Record<AcademyView, string> = {
  overview: ROUTES.ACADEMY,
  courses: `${ROUTES.ACADEMY}/courses`,
  plans: `${ROUTES.ACADEMY}/plans`,
  sessions: `${ROUTES.ACADEMY}/sessions`,
  engagements: `${ROUTES.ACADEMY}/engagements`,
  handoffs: `${ROUTES.ACADEMY}/handoffs`,
  reviews: `${ROUTES.ACADEMY}/reviews`,
};
const navItems: Array<{ value: AcademyView; label: string }> = [
  { value: "overview", label: "运营工作台" },
  { value: "courses", label: "课程资产" },
  { value: "plans", label: "课程排期" },
  { value: "sessions", label: "场次执行" },
  { value: "engagements", label: "邀约与学员" },
  { value: "handoffs", label: "转化与交接" },
  { value: "reviews", label: "经营复盘" },
];

const emptyCourse: CreateAcademyCourseInput = {
  code: "",
  title: "",
  category: "",
  summary: "",
  defaultDurationMinutes: 120,
  objectives: [],
};
const emptySession: CreateAcademySessionInput = {
  courseId: "",
  title: "",
  startsAt: "",
  endsAt: "",
  venue: "",
  capacity: 30,
};
const emptyEngagement: SaveAcademyEngagementInput = {
  sessionId: "",
  participantKey: "",
  participantName: "",
  invitationStatus: "PENDING",
  attendanceStatus: "UNKNOWN",
  followUpStatus: "PENDING",
};
const emptyReview: SaveAcademyReviewInput = {
  sessionId: "",
  summary: "",
  issues: "",
  improvements: "",
  metrics: {},
  actionItems: [],
};

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
const statusLabel: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "已发布",
  ARCHIVED: "已归档",
  PLANNED: "筹备中",
  READY: "已就绪",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  PENDING: "待处理",
  DONE: "已完成",
  BLOCKED: "受阻",
  SKIPPED: "已跳过",
  CONFIRMED: "已确认",
  DECLINED: "已拒绝",
  ATTENDED: "已到课",
  ABSENT: "未到课",
  UNKNOWN: "未确认",
};
const statusColor = (status: string) =>
  status === "DONE" || status === "COMPLETED" || status === "ACTIVE"
    ? "success"
    : status === "BLOCKED" || status === "CANCELLED"
      ? "error"
      : status === "READY"
        ? "info"
        : "warning";

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  helper: string;
  color: string;
  icon: React.ReactNode;
}> = ({ label, value, helper, color, icon }) => (
  <Paper variant="outlined" sx={{ ...panelSx, p: 1.7, minWidth: 0 }}>
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Box minWidth={0}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography
          sx={{ mt: 0.3, fontWeight: 900, fontSize: 24, color: palette.ink }}
        >
          {value}
        </Typography>
      </Box>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 1.2,
          display: "grid",
          placeItems: "center",
          bgcolor: `${color}12`,
          color,
        }}
      >
        {icon}
      </Box>
    </Stack>
    <Typography variant="caption" color="text.secondary">
      {helper}
    </Typography>
  </Paper>
);

const SectionTitle: React.FC<{
  title: string;
  helper?: string;
  action?: React.ReactNode;
}> = ({ title, helper, action }) => (
  <Stack
    direction={{ xs: "column", sm: "row" }}
    justifyContent="space-between"
    alignItems={{ sm: "center" }}
    spacing={1}
  >
    <Box>
      <Typography sx={{ fontWeight: 900, fontSize: 16, color: palette.ink }}>
        {title}
      </Typography>
      {helper && (
        <Typography variant="body2" color="text.secondary">
          {helper}
        </Typography>
      )}
    </Box>
    {action}
  </Stack>
);

const Academy: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const [dashboard, setDashboard] = useState<AcademyDashboard>({
    activeCourses: 0,
    upcomingSessions: 0,
    sessionsNeedingAttention: 0,
    pendingFollowUps: 0,
  });
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [sessions, setSessions] = useState<AcademySession[]>([]);
  const [details, setDetails] = useState<Record<string, AcademySessionDetail>>(
    {},
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [detail, setDetail] = useState<AcademySessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseOpen, setCourseOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [sessionForm, setSessionForm] = useState(emptySession);
  const [engagementForm, setEngagementForm] = useState(emptyEngagement);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const view: AcademyView = location.pathname.endsWith("/plans")
    ? "plans"
    : location.pathname.endsWith("/courses")
      ? "courses"
      : location.pathname.endsWith("/sessions")
        ? "sessions"
        : location.pathname.endsWith("/engagements")
          ? "engagements"
          : location.pathname.endsWith("/handoffs")
            ? "handoffs"
          : location.pathname.endsWith("/reviews")
            ? "reviews"
            : "overview";

  const canPlan = hasPermission(
    currentUser,
    PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
    "write",
  );
  const canCourse = hasPermission(
    currentUser,
    PERMISSION_KEYS.ACADEMY_COURSE_MANAGE,
    "write",
  );
  const canSession = hasPermission(
    currentUser,
    PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
    "write",
  );
  const canEngagement = hasPermission(
    currentUser,
    PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
    "write",
  );
  const canReview = hasPermission(
    currentUser,
    PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE,
    "write",
  );
  const visibleNavItems = navItems.filter((item) => {
    if (item.value === "overview")
      return hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_VIEW);
    if (item.value === "plans")
      return hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE);
    if (item.value === "courses")
      return hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE);
    if (item.value === "sessions")
      return hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE);
    if (item.value === "engagements" || item.value === "handoffs")
      return hasPermission(
        currentUser,
        PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
      );
    return hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE);
  });
  const selectedDetail = details[selectedSessionId];

  useEffect(() => {
    if (visibleNavItems.some((item) => item.value === view)) return;
    const fallback = visibleNavItems[0];
    if (fallback) navigate(viewPath[fallback.value], { replace: true });
  }, [navigate, view, visibleNavItems]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    const [dashboardResponse, courseResponse, sessionResponse] =
      await Promise.all([
        academyApi.getDashboard(),
        academyApi.listCourses({ page: 1, pageSize: 100 }),
        academyApi.listSessions({ page: 1, pageSize: 100 }),
      ]);
    setLoading(false);
    if (dashboardResponse.code !== 0)
      return alert(dashboardResponse.message, "商学院数据加载失败");
    if (courseResponse.code !== 0)
      return alert(courseResponse.message, "课程库加载失败");
    if (sessionResponse.code !== 0)
      return alert(sessionResponse.message, "场次加载失败");
    setDashboard(dashboardResponse.data);
    setCourses(courseResponse.data.items);
    setSessions(sessionResponse.data.items);
    if (!selectedCourseId && courseResponse.data.items[0])
      setSelectedCourseId(courseResponse.data.items[0].id);
    if (!selectedSessionId && sessionResponse.data.items[0])
      setSelectedSessionId(sessionResponse.data.items[0].id);
  }, [alert, selectedCourseId, selectedSessionId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);
  useEffect(() => {
    setPage(0);
    setSearch("");
    setDetail(null);
  }, [view]);

  const loadDetail = useCallback(
    async (sessionId: string, open = false) => {
      const response = await academyApi.getSessionDetail(sessionId);
      if (response.code !== 0)
        return alert(response.message, "场次详情加载失败");
      setDetails((current) => ({ ...current, [sessionId]: response.data }));
      if (open) setDetail(response.data);
    },
    [alert],
  );

  useEffect(() => {
    if (
      (view === "engagements" || view === "handoffs" || view === "reviews") &&
      selectedSessionId &&
      !details[selectedSessionId]
    )
      void loadDetail(selectedSessionId);
  }, [details, loadDetail, selectedSessionId, view]);
  useEffect(() => {
    if (
      (view !== "engagements" && view !== "handoffs") ||
      !canEngagement ||
      customers.length
    ) return;
    void customerApi
      .fetchCustomers({ page: 1, pageSize: 100 })
      .then((response) => {
        if (response.code === 0) setCustomers(response.data.items);
      });
  }, [canEngagement, customers.length, view]);
  useEffect(() => {
    if (!selectedDetail) return;
    const review = selectedDetail.review;
    setReviewForm({
      sessionId: selectedDetail.id,
      summary: review?.summary || "",
      issues: review?.issues || "",
      improvements: review?.improvements || "",
      metrics: review?.metrics || {},
      actionItems: review?.actionItems || [],
    });
  }, [selectedDetail]);

  const filteredCourses = useMemo(
    () =>
      courses.filter((item) =>
        `${item.code}${item.title}${item.category}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [courses, search],
  );
  const filteredSessions = useMemo(
    () =>
      sessions.filter((item) =>
        `${item.title}${item.course?.title || ""}${item.venue}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search, sessions],
  );
  const pagedCourses = filteredCourses.slice(
    page * pageSize,
    page * pageSize + pageSize,
  );
  const pagedSessions = filteredSessions.slice(
    page * pageSize,
    page * pageSize + pageSize,
  );
  const weekSessions = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    return [...sessions]
      .filter((item) => {
        const startsAt = new Date(item.startsAt);
        return startsAt >= monday && startsAt < nextMonday;
      })
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  }, [sessions]);
  const selectedEngagements = selectedDetail?.engagements || [];
  const confirmed = selectedEngagements.filter(
    (item) => item.invitationStatus === "CONFIRMED",
  ).length;
  const attended = selectedEngagements.filter(
    (item) => item.attendanceStatus === "ATTENDED",
  ).length;
  const hot = selectedEngagements.filter(
    (item) => item.courseAssessment === "A",
  ).length;

  const saveCourse = async () => {
    setSaving(true);
    const response = await academyApi.createCourse(courseForm);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "课程创建失败");
    setCourseOpen(false);
    setCourseForm(emptyCourse);
    await loadBase();
  };
  const saveSession = async () => {
    setSaving(true);
    const response = await academyApi.createSession(sessionForm);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "场次创建失败");
    setSessionOpen(false);
    setSessionForm(emptySession);
    await loadBase();
  };
  const changeCourseStatus = async (
    course: AcademyCourse,
    status: AcademyCourse["status"],
  ) => {
    setSaving(true);
    const response = await academyApi.changeCourseStatus(course.id, status);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "课程状态更新失败");
    await loadBase();
  };
  const updateTask = async (task: AcademySessionTask) => {
    const response = await academyApi.updateTask(task.id, {
      status: task.status === "DONE" ? "PENDING" : "DONE",
    });
    if (response.code !== 0) return alert(response.message, "任务状态更新失败");
    if (detail) await loadDetail(detail.id, true);
  };
  const saveEngagement = async () => {
    setSaving(true);
    const response = await academyApi.saveEngagement(engagementForm);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "学员记录保存失败");
    setEngagementOpen(false);
    setEngagementForm(emptyEngagement);
    await loadDetail(selectedSessionId);
  };
  const saveReview = async () => {
    setSaving(true);
    const response = await academyApi.saveReview(reviewForm);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "复盘保存失败");
    await loadDetail(selectedSessionId);
  };

  if (detail) {
    const completed = detail.tasks.filter(
      (task) => task.status === "DONE",
    ).length;
    const progress = detail.tasks.length
      ? Math.round((completed / detail.tasks.length) * 100)
      : 0;
    const stages = [
      "课程规划",
      "内容研发",
      "素材准备",
      "客户邀约",
      "开课准备",
      "课堂执行",
      "课后分层",
      "销售跟进",
      "课程复盘",
    ];
    const activeStage = Math.min(
      8,
      detail.tasks.length
        ? Math.floor((completed / detail.tasks.length) * 9)
        : 0,
    );
    const blockedTasks = detail.tasks.filter(
      (task) => task.status === "BLOCKED",
    );
    return (
      <ModulePage>
        <ModuleHeader
          title="极享商学院"
          description="连接课程资产、课程排期、场次执行、学员邀约、转化交接与经营复盘。"
        />
        <ModuleTabs
          value={view}
          onChange={(_, value: AcademyView) => navigate(viewPath[value])}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {visibleNavItems.map((item) => (
            <Tab key={item.value} value={item.value} label={item.label} />
          ))}
        </ModuleTabs>
        <Stack spacing={1.5} sx={{ width: "100%" }}>
          <Paper variant="outlined" sx={{ ...panelSx, p: 1.6 }}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              justifyContent="space-between"
              alignItems={{ lg: "center" }}
              spacing={2}
            >
              <Stack direction="row" spacing={1.2} alignItems="flex-start">
                <IconButton
                  size="small"
                  onClick={() => setDetail(null)}
                  sx={{ mt: 0.2 }}
                >
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ fontWeight: 950, fontSize: 20 }}>
                      {detail.title}
                    </Typography>
                    <Chip
                      size="small"
                      label={`V${detail.courseVersionId ? "1.0" : "1.0"}`}
                      sx={{
                        height: 22,
                        bgcolor: palette.blueSoft,
                        color: palette.blue,
                      }}
                    />
                  </Stack>
                  <Typography
                    color="text.secondary"
                    fontSize={12.5}
                    sx={{ mt: 0.5 }}
                  >
                    {detail.course?.title} · {formatDate(detail.startsAt)} ·{" "}
                    {detail.venue || "未填写场地"} · 负责人{" "}
                    {detail.facilitatorUserName || "待分配"} · 学员{" "}
                    {detail.engagements.length}/{detail.capacity}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label={statusLabel[detail.status] || detail.status}
                  color={statusColor(detail.status)}
                />
                <Button variant="contained">提交开课确认</Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(9, minmax(92px, 1fr))",
                overflowX: "auto",
                pb: 0.5,
              }}
            >
              {stages.map((stage, index) => (
                <Stack
                  key={stage}
                  alignItems="center"
                  sx={{ minWidth: 92, position: "relative" }}
                >
                  {index < stages.length - 1 && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: 12,
                        left: "50%",
                        width: "100%",
                        height: 2,
                        bgcolor: index < activeStage ? palette.blue : "#D7DFEA",
                      }}
                    />
                  )}
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      zIndex: 1,
                      bgcolor: index <= activeStage ? palette.blue : "#fff",
                      color: index <= activeStage ? "#fff" : palette.muted,
                      border: `2px solid ${index <= activeStage ? palette.blue : "#C9D2DF"}`,
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {index < activeStage ? "✓" : index + 1}
                  </Box>
                  <Typography
                    fontSize={12}
                    fontWeight={index === activeStage ? 900 : 700}
                    color={index === activeStage ? palette.blue : palette.ink}
                    sx={{ mt: 0.7 }}
                  >
                    {stage}
                  </Typography>
                </Stack>
              ))}
            </Box>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ sm: "center" }}
              sx={{ mt: 1.5, pt: 1.3, borderTop: `1px solid ${palette.line}` }}
            >
              <Typography fontSize={13} fontWeight={800}>
                整体就绪度：{progress}%
              </Typography>
              <LinearProgress
                value={progress}
                variant="determinate"
                sx={{ height: 7, borderRadius: 4, flex: 1, minWidth: 180 }}
              />
              {blockedTasks.length > 0 && (
                <Typography fontSize={12.5} color={palette.red}>
                  存在 {blockedTasks.length} 项阻塞风险，建议优先处理
                </Typography>
              )}
            </Stack>
          </Paper>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(0, 1.8fr) minmax(330px, .7fr)",
              },
              gap: 1.5,
            }}
          >
            <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
              <SectionTitle
                title={`当前阶段任务（${stages[activeStage]}）`}
                helper="任务状态直接驱动场次准备度与开课门禁"
              />
              <TableContainer sx={{ mt: 1.2 }}>
                <SystemDataTable tableId="academy-session-execution-tasks">
                  <TableHead>
                    <TableRow>
                      <TableCell>任务</TableCell>
                      <TableCell>负责人</TableCell>
                      <TableCell>协作人</TableCell>
                      <TableCell>截止时间</TableCell>
                      <TableCell>验收标准</TableCell>
                      <TableCell>风险</TableCell>
                      <TableCell>状态</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.tasks.map((task) => (
                      <TableRow key={task.id} hover>
                        <TableCell sx={{ fontWeight: 800 }}>
                          {task.title}
                          {task.isRequired ? " *" : ""}
                        </TableCell>
                        <TableCell>
                          {task.completedByName ||
                            detail.facilitatorUserName ||
                            "待分配"}
                        </TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>
                          {task.note || "完成后由负责人确认"}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={task.status === "BLOCKED" ? "高" : "低"}
                            sx={{
                              height: 21,
                              bgcolor:
                                task.status === "BLOCKED"
                                  ? palette.redSoft
                                  : palette.greenSoft,
                              color:
                                task.status === "BLOCKED"
                                  ? palette.red
                                  : palette.green,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            clickable={canSession}
                            onClick={() => canSession && void updateTask(task)}
                            label={statusLabel[task.status] || task.status}
                            sx={{
                              height: 22,
                              bgcolor:
                                task.status === "DONE"
                                  ? palette.greenSoft
                                  : task.status === "BLOCKED"
                                    ? palette.redSoft
                                    : palette.blueSoft,
                              color:
                                task.status === "DONE"
                                  ? palette.green
                                  : task.status === "BLOCKED"
                                    ? palette.red
                                    : palette.blue,
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </SystemDataTable>
              </TableContainer>
            </Paper>
            <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
                <SectionTitle title="场次控制台" />
                <Typography
                  fontSize={12.5}
                  color="text.secondary"
                  sx={{ mt: 1.2 }}
                >
                  就绪度阈值
                </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mt: 0.6 }}
                >
                  <Typography
                    fontSize={24}
                    fontWeight={950}
                    color={progress >= 90 ? palette.green : palette.blue}
                  >
                    {progress}%
                  </Typography>
                  <Box flex={1}>
                    <LinearProgress
                      value={progress}
                      variant="determinate"
                      sx={{ height: 7, borderRadius: 4 }}
                    />
                  </Box>
                </Stack>
                <Divider sx={{ my: 1.4 }} />
                <Typography fontSize={13} fontWeight={900}>
                  风险概览（{blockedTasks.length}）
                </Typography>
                <Stack spacing={0.8} sx={{ mt: 0.8 }}>
                  {blockedTasks.slice(0, 3).map((task) => (
                    <Box
                      key={task.id}
                      sx={{ p: 1, borderRadius: 1, bgcolor: palette.redSoft }}
                    >
                      <Typography fontSize={12.5} fontWeight={800}>
                        {task.title}
                      </Typography>
                    </Box>
                  ))}
                  {!blockedTasks.length && (
                    <Typography fontSize={12.5} color={palette.green}>
                      当前无阻塞风险
                    </Typography>
                  )}
                </Stack>
                <Divider sx={{ my: 1.4 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Box>
                    <Typography fontSize={11.5} color="text.secondary">
                      邀约人数
                    </Typography>
                    <Typography fontWeight={900}>
                      {detail.engagements.length}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography fontSize={11.5} color="text.secondary">
                      报名人数
                    </Typography>
                    <Typography fontWeight={900}>
                      {
                        detail.engagements.filter(
                          (item) => item.invitationStatus === "CONFIRMED",
                        ).length
                      }
                    </Typography>
                  </Box>
                  <Box>
                    <Typography fontSize={11.5} color="text.secondary">
                      到课人数
                    </Typography>
                    <Typography fontWeight={900}>
                      {
                        detail.engagements.filter(
                          (item) => item.attendanceStatus === "ATTENDED",
                        ).length
                      }
                    </Typography>
                  </Box>
                </Stack>
                <Button fullWidth variant="contained" sx={{ mt: 1.5 }}>
                  提交开课确认
                </Button>
              </Paper>
              <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
                <SectionTitle title="场次负责人" />
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1 }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      bgcolor: palette.blueSoft,
                      color: palette.blue,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                    }}
                  >
                    {(detail.facilitatorUserName || "待").slice(0, 1)}
                  </Box>
                  <Box>
                    <Typography fontSize={13.5} fontWeight={900}>
                      {detail.facilitatorUserName || "待分配"}
                    </Typography>
                    <Typography fontSize={11.5} color="text.secondary">
                      课程执行负责人
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          </Box>

          <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
            <SectionTitle
              title="操作日志（最新）"
              action={
                <Button size="small">
                  查看全部日志 <ChevronRightIcon fontSize="small" />
                </Button>
              }
            />
            <TableContainer sx={{ mt: 1 }}>
              <SystemDataTable tableId="academy-session-change-history">
                <TableHead>
                  <TableRow>
                    <TableCell>变更内容</TableCell>
                    <TableCell>操作人</TableCell>
                    <TableCell>操作时间</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.tasks
                    .filter((task) => task.completedAt)
                    .slice(0, 5)
                    .map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          {task.title} → {statusLabel[task.status]}
                        </TableCell>
                        <TableCell>
                          {task.completedByName || "系统记录"}
                        </TableCell>
                        <TableCell>{formatDate(task.completedAt)}</TableCell>
                      </TableRow>
                    ))}
                  {!detail.tasks.some((task) => task.completedAt) && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                        暂无操作日志
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </SystemDataTable>
            </TableContainer>
          </Paper>
        </Stack>
        {feedbackDialog}
      </ModulePage>
    );
  }

  return (
    <ModulePage>
      <ModuleHeader
        title="极享商学院"
        description="连接课程资产、课程排期、场次执行、学员邀约、转化交接与经营复盘。"
      />
      <ModuleTabs
        value={view}
        onChange={(_, value: AcademyView) => navigate(viewPath[value])}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {visibleNavItems.map((item) => (
          <Tab key={item.value} value={item.value} label={item.label} />
        ))}
      </ModuleTabs>
      <Stack spacing={1.5} sx={{ width: "100%" }}>
        {loading && <LinearProgress />}

        {view === "overview" && (
          <Overview
            dashboard={dashboard}
            sessions={weekSessions}
            details={details}
            onOpen={(id) => void loadDetail(id, true)}
            onViewPlans={() => navigate(viewPath.plans)}
            onViewSessions={() => navigate(viewPath.sessions)}
          />
        )}
        {view === "plans" && (
          <Plans
            sessions={sessions}
            details={details}
            onCreate={() => setSessionOpen(true)}
            canCreate={canPlan}
            onViewAll={() => navigate(viewPath.sessions)}
            onNeedDetail={loadDetail}
          />
        )}
        {view === "courses" && (
          <CourseWorkspace
            items={pagedCourses}
            sessions={sessions}
            total={filteredCourses.length}
            selectedId={selectedCourseId}
            onSelect={setSelectedCourseId}
            search={search}
            onSearch={setSearch}
            canManage={canCourse}
            onCreate={() => setCourseOpen(true)}
            onStatusChange={(course, status) =>
              void changeCourseStatus(course, status)
            }
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(value) => {
              setPageSize(value);
              setPage(0);
            }}
          />
        )}
        {view === "sessions" && (
          <>
            <SectionTitle
              title="场次执行"
              helper="按场次推进课前准备、现场执行、课后跟进和复盘门禁。"
              action={
                <TextField
                  size="small"
                  placeholder="搜索场次、课程或场地"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              }
            />
            <SessionTable
              items={pagedSessions}
              onOpen={(id) => void loadDetail(id, true)}
            />
            <TablePagination
              count={filteredSessions.length}
              page={page}
              rowsPerPage={pageSize}
              onPageChange={(_, next) => setPage(next)}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            />
          </>
        )}
        {view === "engagements" && (
          <EngagementWorkspace
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={(id) => {
              setSelectedSessionId(id);
              void loadDetail(id);
            }}
            detail={selectedDetail}
            canManage={canEngagement}
            onAdd={() => {
              setEngagementForm({
                ...emptyEngagement,
                sessionId: selectedSessionId,
              });
              setEngagementOpen(true);
            }}
          />
        )}
        {view === "handoffs" && (
          <HandoffWorkspace
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={(id) => {
              setSelectedSessionId(id);
              void loadDetail(id);
            }}
            detail={selectedDetail}
            onGoCustomers={() => navigate(ROUTES.CUSTOMERS)}
            onGoOrders={() => navigate(ROUTES.ORDERS)}
          />
        )}
        {view === "reviews" && (
          <Reviews
            sessions={sessions}
            details={details}
            selectedId={selectedSessionId}
            onSelect={(id) => {
              setSelectedSessionId(id);
              void loadDetail(id);
            }}
            confirmed={confirmed}
            attended={attended}
            hot={hot}
            canEdit={canReview}
            form={reviewForm}
            onFormChange={setReviewForm}
            onSave={() => void saveReview()}
            saving={saving}
          />
        )}
      </Stack>

      <ProtectedFormDialog
        open={courseOpen}
        onClose={() => setCourseOpen(false)}
        submitting={saving}
        fullWidth
        maxWidth="md"
        resetKey={String(courseOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              新建课程
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <TextField
                  label="课程编码 *"
                  value={courseForm.code}
                  onChange={(event) => {
                    markDirty();
                    setCourseForm({ ...courseForm, code: event.target.value });
                  }}
                />
                <TextField
                  label="课程名称 *"
                  value={courseForm.title}
                  onChange={(event) => {
                    markDirty();
                    setCourseForm({ ...courseForm, title: event.target.value });
                  }}
                />
                <TextField
                  label="课程分类 *"
                  placeholder="公开课 / 训练营 / 内训"
                  value={courseForm.category}
                  onChange={(event) => {
                    markDirty();
                    setCourseForm({
                      ...courseForm,
                      category: event.target.value,
                    });
                  }}
                />
                <TextField
                  label="课程定位与简介"
                  multiline
                  minRows={3}
                  value={courseForm.summary}
                  onChange={(event) => {
                    markDirty();
                    setCourseForm({
                      ...courseForm,
                      summary: event.target.value,
                    });
                  }}
                />
                <TextField
                  label="默认时长（分钟）*"
                  type="number"
                  value={courseForm.defaultDurationMinutes}
                  onChange={(event) => {
                    markDirty();
                    setCourseForm({
                      ...courseForm,
                      defaultDurationMinutes: Number(event.target.value),
                    });
                  }}
                />
                <TextField
                  label="课程目标（每行一条）"
                  multiline
                  minRows={3}
                  value={courseForm.objectives.join("\n")}
                  onChange={(event) => {
                    markDirty();
                    setCourseForm({
                      ...courseForm,
                      objectives: event.target.value
                        .split("\n")
                        .filter(Boolean),
                    });
                  }}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={
                  saving || !courseForm.code.trim() || !courseForm.title.trim()
                }
                onClick={() => void saveCourse()}
              >
                保存课程草稿
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <ProtectedFormDialog
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        submitting={saving}
        fullWidth
        maxWidth="md"
        resetKey={String(sessionOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              新建课程场次
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <TextField
                  select
                  label="课程 *"
                  value={sessionForm.courseId}
                  onChange={(event) => {
                    markDirty();
                    setSessionForm({
                      ...sessionForm,
                      courseId: event.target.value,
                    });
                  }}
                >
                  {courses
                    .filter((item) => item.status === "ACTIVE")
                    .map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.code} · {item.title}
                      </MenuItem>
                    ))}
                </TextField>
                <TextField
                  label="场次名称 *"
                  value={sessionForm.title}
                  onChange={(event) => {
                    markDirty();
                    setSessionForm({
                      ...sessionForm,
                      title: event.target.value,
                    });
                  }}
                />
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="开始时间 *"
                    InputLabelProps={{ shrink: true }}
                    value={sessionForm.startsAt}
                    onChange={(event) => {
                      markDirty();
                      setSessionForm({
                        ...sessionForm,
                        startsAt: event.target.value,
                      });
                    }}
                  />
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="结束时间 *"
                    InputLabelProps={{ shrink: true }}
                    value={sessionForm.endsAt}
                    onChange={(event) => {
                      markDirty();
                      setSessionForm({
                        ...sessionForm,
                        endsAt: event.target.value,
                      });
                    }}
                  />
                </Stack>
                <TextField
                  label="场地 / 直播间"
                  value={sessionForm.venue}
                  onChange={(event) => {
                    markDirty();
                    setSessionForm({
                      ...sessionForm,
                      venue: event.target.value,
                    });
                  }}
                />
                <TextField
                  label="计划容量 *"
                  type="number"
                  value={sessionForm.capacity}
                  onChange={(event) => {
                    markDirty();
                    setSessionForm({
                      ...sessionForm,
                      capacity: Number(event.target.value),
                    });
                  }}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={
                  saving || !sessionForm.courseId || !sessionForm.title.trim()
                }
                onClick={() => void saveSession()}
              >
                创建场次并生成任务
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <ProtectedFormDialog
        open={engagementOpen}
        onClose={() => setEngagementOpen(false)}
        submitting={saving}
        fullWidth
        maxWidth="sm"
        resetKey={String(engagementOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              添加场次学员
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <TextField
                  select
                  label="CRM客户 *"
                  value={engagementForm.customerId || ""}
                  onChange={(event) => {
                    markDirty();
                    const customer = customers.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!customer) return;
                    setEngagementForm({
                      ...engagementForm,
                      customerId: customer.id,
                      participantKey: `customer:${customer.id}`,
                      participantName: customer.name,
                    });
                  }}
                >
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.name} · {customer.company || "未填写公司"} ·{" "}
                      {customer.owner || "待分配"}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="邀约状态"
                  value={engagementForm.invitationStatus}
                  onChange={(event) => {
                    markDirty();
                    setEngagementForm({
                      ...engagementForm,
                      invitationStatus: event.target.value,
                    });
                  }}
                >
                  <MenuItem value="PENDING">待邀约</MenuItem>
                  <MenuItem value="INVITED">已邀约</MenuItem>
                  <MenuItem value="CONFIRMED">已确认</MenuItem>
                  <MenuItem value="DECLINED">已拒绝</MenuItem>
                </TextField>
                <TextField
                  multiline
                  minRows={2}
                  label="邀约备注"
                  value={engagementForm.notes || ""}
                  onChange={(event) => {
                    markDirty();
                    setEngagementForm({
                      ...engagementForm,
                      notes: event.target.value,
                    });
                  }}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={saving || !engagementForm.customerId}
                onClick={() => void saveEngagement()}
              >
                加入场次
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      {feedbackDialog}
    </ModulePage>
  );
};

const Overview: React.FC<{
  dashboard: AcademyDashboard;
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  onOpen: (id: string) => void;
  onViewPlans: () => void;
  onViewSessions: () => void;
}> = ({ dashboard, sessions, details, onOpen, onViewPlans, onViewSessions }) => {
  const engagementList = Object.values(details).flatMap(
    (item) => item.engagements,
  );
  const funnel = [
    { label: "邀约（人）", value: engagementList.length },
    {
      label: "确认（人）",
      value: engagementList.filter(
        (item) => item.invitationStatus === "CONFIRMED",
      ).length,
    },
    {
      label: "到课（人）",
      value: engagementList.filter(
        (item) => item.attendanceStatus === "ATTENDED",
      ).length,
    },
    {
      label: "咨询（人）",
      value: engagementList.filter((item) =>
        ["A", "B"].includes(item.courseAssessment || ""),
      ).length,
    },
    { label: "成交金额（元）", value: 0 },
  ];
  const monday = new Date();
  const weekday = monday.getDay() || 7;
  monday.setDate(monday.getDate() - weekday + 1);
  monday.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const daySessions = sessions.filter((session) => {
      const sessionDate = new Date(session.startsAt);
      return sessionDate.toDateString() === date.toDateString();
    });
    return { date, sessions: daySessions };
  });
  const allTasks = Object.values(details).flatMap((item) =>
    item.tasks.map((task) => ({ ...task, sessionTitle: item.title })),
  );
  const riskTasks = allTasks
    .filter((task) => task.status === "BLOCKED" || task.status === "PENDING")
    .slice(0, 3);
  const todoTasks = allTasks
    .filter((task) => task.status !== "DONE")
    .slice(0, 6);
  return (
    <>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ md: "center" }}
          spacing={1}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.2}
            flexWrap="wrap"
          >
            <Typography
              sx={{ fontWeight: 900, fontSize: 16, color: palette.ink }}
            >
              本周课程计划
            </Typography>
            <Typography fontSize={13} color="text.secondary">
              {monday.toLocaleDateString("zh-CN")} ～{" "}
              {weekDays[6].date.toLocaleDateString("zh-CN")}
            </Typography>
            <IconButton
              size="small"
              sx={{ border: `1px solid ${palette.line}`, borderRadius: 1 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Button size="small" variant="outlined" sx={{ minWidth: 60 }}>
              本周
            </Button>
            <IconButton
              size="small"
              sx={{ border: `1px solid ${palette.line}`, borderRadius: 1 }}
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Button size="small" variant="outlined" onClick={onViewSessions}>
            查看全部场次
          </Button>
        </Stack>
        <Box
          sx={{
            mt: 1.3,
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(145px, 1fr))",
            overflowX: "auto",
            border: `1px solid ${palette.line}`,
            borderRadius: 1.2,
          }}
        >
          {weekDays.map(({ date, sessions: daySessions }, index) => (
            <Box
              key={date.toISOString()}
              sx={{
                minHeight: 220,
                p: 1.25,
                borderRight: index < 6 ? `1px solid ${palette.line}` : 0,
                bgcolor: daySessions.length ? "#F5F9FF" : "#fff",
                minWidth: 145,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography
                  fontWeight={900}
                  fontSize={14}
                >{`周${"一二三四五六日"[index]}`}</Typography>
                <Typography
                  color="text.secondary"
                  fontSize={13}
                >{`${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`}</Typography>
              </Stack>
              {daySessions.length ? (
                daySessions.map((session) => (
                  <Stack key={session.id} spacing={0.55} sx={{ mt: 1.2 }}>
                    <Typography
                      color={palette.blue}
                      fontWeight={900}
                      fontSize={13}
                    >
                      • 有课程
                    </Typography>
                    <Typography fontSize={13}>
                      {new Date(session.startsAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      –
                      {new Date(session.endsAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Typography>
                    <Typography
                      fontWeight={900}
                      fontSize={13.5}
                      sx={{ lineHeight: 1.4 }}
                    >
                      {session.title}
                    </Typography>
                    <Typography fontSize={12.5} color="text.secondary">
                      负责人：{session.facilitatorUserName || "待分配"}
                    </Typography>
                    <Chip
                      size="small"
                      label={statusLabel[session.status] || session.status}
                      sx={{
                        alignSelf: "flex-start",
                        height: 22,
                        bgcolor: palette.greenSoft,
                        color: palette.green,
                        fontWeight: 800,
                      }}
                    />
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => onOpen(session.id)}
                      sx={{ mt: 0.5 }}
                    >
                      进入场次
                    </Button>
                  </Stack>
                ))
              ) : (
                <Typography
                  color="#98A2B3"
                  fontSize={13}
                  sx={{ mt: 8, textAlign: "center" }}
                >
                  暂无安排
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1fr) minmax(0, 1.1fr)",
          },
          gap: 1.5,
        }}
      >
        <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
          <SectionTitle
            title="准备度风险预警"
            helper={`${Math.max(dashboard.sessionsNeedingAttention, riskTasks.length)} 项需关注`}
          />
          <TableContainer sx={{ mt: 1 }}>
            <SystemDataTable
              tableId="academy-overview-risk-alerts"
              sx={{
                width: "100%",
                minWidth: "0 !important",
                tableLayout: "fixed",
                "& .MuiTableCell-root": {
                  px: 0.75,
                  py: 0.85,
                  fontSize: 12,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "30%" }}>风险事项</TableCell>
                  <TableCell sx={{ width: "25%" }}>关联场次</TableCell>
                  <TableCell sx={{ width: "15%" }}>风险</TableCell>
                  <TableCell sx={{ width: "17%" }}>负责人</TableCell>
                  <TableCell sx={{ width: "13%" }}>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {riskTasks.map((task, index) => (
                  <TableRow key={task.id}>
                    <TableCell>{task.title}</TableCell>
                    <TableCell>{task.sessionTitle}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={index ? "中" : "高"}
                        sx={{
                          height: 21,
                          bgcolor: index ? palette.amberSoft : palette.redSoft,
                          color: index ? palette.amber : palette.red,
                        }}
                      />
                    </TableCell>
                    <TableCell>{task.completedByName || "待分配"}</TableCell>
                    <TableCell
                      sx={{
                        color:
                          task.status === "BLOCKED"
                            ? palette.red
                            : palette.blue,
                      }}
                    >
                      {statusLabel[task.status]}
                    </TableCell>
                  </TableRow>
                ))}
                {!riskTasks.length && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      暂无风险项
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SystemDataTable>
          </TableContainer>
        <Button size="small" sx={{ mt: 0.7 }} onClick={onViewPlans}>
          查看全部风险 <ChevronRightIcon fontSize="small" />
        </Button>
        </Paper>
        <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
          <SectionTitle
            title="本周转化漏斗概览"
            helper="按当前有权查看的场次统计"
            action={
              <Button size="small">
                查看转化分析 <ChevronRightIcon fontSize="small" />
              </Button>
            }
          />
          <Box
            sx={{
              mt: 1.3,
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                md: "repeat(5, 1fr)",
              },
              border: `1px solid ${palette.line}`,
              borderRadius: 1.2,
              overflow: "hidden",
            }}
          >
            {funnel.map((item, index) => (
              <Box
                key={item.label}
                sx={{
                  px: 1.5,
                  py: 1.8,
                  borderRight:
                    index < funnel.length - 1 ? `1px solid ${palette.line}` : 0,
                  bgcolor: index === funnel.length - 1 ? "#F8FBFF" : "#fff",
                }}
              >
                <Typography color="text.secondary" fontSize={12}>
                  {item.label}
                </Typography>
                <Typography fontSize={22} fontWeight={950} sx={{ mt: 0.5 }}>
                  {index === funnel.length - 1
                    ? `¥${Number(item.value).toLocaleString()}`
                    : item.value}
                </Typography>
                <Typography
                  fontSize={11.5}
                  color={palette.green}
                  sx={{ mt: 0.3 }}
                >
                  较上周 +0%
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography fontSize={13} fontWeight={800} sx={{ mt: 1.2 }}>
            整体转化率{" "}
            {funnel[0].value
              ? `${((funnel[3].value / funnel[0].value) * 100).toFixed(1)}%`
              : "0.0%"}
          </Typography>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle
          title="我的待办"
          helper={`${Math.max(dashboard.pendingFollowUps, todoTasks.length)} 项待推进`}
        />
        <TableContainer sx={{ mt: 1 }}>
          <SystemDataTable tableId="academy-overview-execution-tasks">
            <TableHead>
              <TableRow>
                <TableCell>任务内容</TableCell>
                <TableCell>关联场次</TableCell>
                <TableCell>任务类型</TableCell>
                <TableCell>负责人</TableCell>
                <TableCell>截止时间</TableCell>
                <TableCell>状态</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {todoTasks.map((task) => (
                <TableRow key={task.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{task.title}</TableCell>
                  <TableCell>{task.sessionTitle}</TableCell>
                  <TableCell>
                    {task.category === "BEFORE"
                      ? "课前准备"
                      : task.category === "DURING"
                        ? "现场执行"
                        : "课后跟进"}
                  </TableCell>
                  <TableCell>{task.completedByName || "待分配"}</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={statusLabel[task.status]}
                      sx={{
                        height: 22,
                        bgcolor:
                          task.status === "BLOCKED"
                            ? palette.redSoft
                            : palette.blueSoft,
                        color:
                          task.status === "BLOCKED"
                            ? palette.red
                            : palette.blue,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {!todoTasks.length && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    暂无待办任务
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
      </Paper>
    </>
  );
};

const Plans: React.FC<{
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  onCreate: () => void;
  canCreate: boolean;
  onViewAll: () => void;
  onNeedDetail: (id: string) => void;
}> = ({ sessions, details, onCreate, canCreate, onViewAll, onNeedDetail }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const monday = new Date();
  const todayWeekday = monday.getDay() || 7;
  monday.setDate(monday.getDate() - todayWeekday + 1 + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const weekSessions = sessions
    .filter((item) => {
      const startsAt = new Date(item.startsAt);
      return startsAt >= monday && startsAt < nextMonday;
    })
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const selected = weekSessions[0];
  const selectedDetail = selected ? details[selected.id] : undefined;
  const selectedDate = selected ? new Date(selected.startsAt) : new Date();
  const shortDate = (date: Date) =>
    `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  useEffect(() => {
    if (selected && !selectedDetail) onNeedDetail(selected.id);
  }, [onNeedDetail, selected, selectedDetail]);
  return (
    <>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5, overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ md: "center" }}
          spacing={1}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography sx={{ fontWeight: 900, fontSize: 16, color: palette.ink }}>
              本周课程计划
            </Typography>
            <Typography fontSize={13} color="text.secondary">
              {shortDate(monday)} ～ {shortDate(sunday)}
            </Typography>
            <IconButton
              size="small"
              aria-label="上一周"
              onClick={() => setWeekOffset((value) => value - 1)}
              sx={{ border: `1px solid ${palette.line}`, borderRadius: 1 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Button size="small" variant="outlined" onClick={() => setWeekOffset(0)}>
              本周
            </Button>
            <IconButton
              size="small"
              aria-label="下一周"
              onClick={() => setWeekOffset((value) => value + 1)}
              sx={{ border: `1px solid ${palette.line}`, borderRadius: 1 }}
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={onViewAll}>
              查看全部场次
            </Button>
            {canCreate && (
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={onCreate}
              >
                新建课程计划
              </Button>
            )}
          </Stack>
        </Stack>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(145px, 1fr))",
            minWidth: 1080,
            mt: 1.3,
            border: `1px solid ${palette.line}`,
            borderRadius: 1.2,
            overflow: "hidden",
          }}
        >
          {days.map((day, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            const items = weekSessions.filter((item) => {
              const startsAt = new Date(item.startsAt);
              return startsAt.toDateString() === date.toDateString();
            });
            return (
              <Box
                key={day}
                sx={{
                  minHeight: 245,
                  p: 1.2,
                  bgcolor: items.length ? "#F4F8FF" : "#fff",
                  borderRight: index < 6 ? `1px solid ${palette.line}` : 0,
                }}
              >
                <Stack direction="row" spacing={0.8} alignItems="center">
                  <Typography
                    fontWeight={900}
                    color={items.length ? palette.blue : palette.ink}
                    fontSize={13.5}
                  >
                    {day}
                  </Typography>
                  <Typography fontSize={12.5} color="text.secondary">
                    {String(date.getMonth() + 1).padStart(2, "0")}-
                    {String(date.getDate()).padStart(2, "0")}
                  </Typography>
                </Stack>
                {items.length ? (
                  <Stack spacing={1} sx={{ mt: 1.2 }}>
                    {items.map((item) => (
                      <Box
                        key={item.id}
                        sx={{
                          p: 1.2,
                          borderRadius: 1,
                          bgcolor: "#fff",
                          border: `1px solid #C9DBFF`,
                        }}
                      >
                        <Typography variant="body2" fontWeight={900}>
                          {item.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(item.startsAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Typography>
                        <Chip
                          size="small"
                          sx={{ mt: 1 }}
                          label={statusLabel[item.status] || item.status}
                        />
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 9, textAlign: "center" }}
                  >
                    暂无排期
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          spacing={1}
          sx={{ pt: 1.1 }}
        >
          <Typography fontSize={12.5} color="text.secondary">
            本周已安排课程 {weekSessions.length}{" "}
            场，目标成交金额由各场次经营目标汇总
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography fontSize={12} color="text.secondary">
              数据更新时间：
              {new Date().toLocaleString("zh-CN", { hour12: false })}
            </Typography>
            <Button size="small" startIcon={<RefreshIcon fontSize="small" />}>
              刷新
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, .85fr) minmax(0, 1.45fr)",
          },
          gap: 1.5,
        }}
      >
        <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
          <SectionTitle
            title={
              selected
                ? `${days[(selectedDate.getDay() || 7) - 1]}课程任务概览`
                : "课程任务概览"
            }
            helper={selected ? statusLabel[selected.status] : "暂无场次"}
          />
          {selected ? (
            <Stack spacing={1.1} sx={{ mt: 1.4 }}>
              {[
                { label: "课程名称", value: selected.title },
                {
                  label: "目标人群",
                  value: selected.course?.category || "待填写",
                },
                {
                  label: "课程产品",
                  value: selected.course?.title || "待关联",
                },
                {
                  label: "负责人",
                  value: selected.facilitatorUserName || "待分配",
                },
                {
                  label: "课程时间",
                  value: `${formatDate(selected.startsAt)} ～ ${formatDate(selected.endsAt)}`,
                },
                { label: "场地", value: selected.venue || "待填写" },
              ].map((row) => (
                <Box
                  key={row.label}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "92px 1fr",
                    gap: 1,
                  }}
                >
                  <Typography fontSize={12.5} color="text.secondary">
                    {row.label}
                  </Typography>
                  <Typography fontSize={13} fontWeight={800}>
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography
              color="text.secondary"
              sx={{ py: 5, textAlign: "center" }}
            >
              请先创建本周课程场次
            </Typography>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
          <SectionTitle title="执行任务" helper="开课前必须完成所有必做任务" />
          <TableContainer sx={{ mt: 1 }}>
            <SystemDataTable
              tableId="academy-plan-execution-tasks"
              sx={{
                width: "100%",
                minWidth: "0 !important",
                tableLayout: "fixed",
                "& .MuiTableCell-root": {
                  px: 0.7,
                  py: 0.8,
                  fontSize: 12,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "34%" }}>任务项</TableCell>
                  <TableCell sx={{ width: "14%" }}>负责人</TableCell>
                  <TableCell sx={{ width: "12%" }}>协作人</TableCell>
                  <TableCell sx={{ width: "16%" }}>截止时间</TableCell>
                  <TableCell sx={{ width: "10%" }}>风险</TableCell>
                  <TableCell sx={{ width: "14%" }}>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(selectedDetail?.tasks || []).map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Checkbox size="small" checked={task.status === "DONE"} readOnly />
                      {task.title}
                    </TableCell>
                    <TableCell>
                      {task.completedByName || selected?.facilitatorUserName || "待分配"}
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>{task.completedAt ? formatDate(task.completedAt) : "待安排"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={task.status === "BLOCKED" ? "高" : task.status === "PENDING" ? "中" : "低"}
                        sx={{
                          height: 21,
                          bgcolor:
                            task.status === "BLOCKED"
                              ? palette.redSoft
                              : task.status === "PENDING"
                                ? palette.amberSoft
                                : palette.greenSoft,
                          color:
                            task.status === "BLOCKED"
                              ? palette.red
                              : task.status === "PENDING"
                                ? palette.amber
                                : palette.green,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: task.status === "DONE" ? palette.green : palette.blue }}>
                      {statusLabel[task.status] || task.status}
                    </TableCell>
                  </TableRow>
                ))}
                {selected && !selectedDetail && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      正在加载执行任务…
                    </TableCell>
                  </TableRow>
                )}
                {!selected && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      当前周暂无课程场次
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SystemDataTable>
          </TableContainer>
        </Paper>
      </Box>
    </>
  );
};

const CourseWorkspace: React.FC<{
  items: AcademyCourse[];
  sessions: AcademySession[];
  total: number;
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  canManage: boolean;
  onCreate: () => void;
  onStatusChange: (
    course: AcademyCourse,
    status: AcademyCourse["status"],
  ) => void;
  page: number;
  pageSize: number;
  onPage: (value: number) => void;
  onPageSize: (value: number) => void;
}> = ({
  items,
  sessions,
  total,
  selectedId,
  onSelect,
  search,
  onSearch,
  canManage,
  onCreate,
  onStatusChange,
  page,
  pageSize,
  onPage,
  onPageSize,
}) => {
  const [detailTab, setDetailTab] = useState(0);
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const selectedSessions = selected
    ? sessions.filter((item) => item.courseId === selected.id)
    : [];
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          lg: "minmax(0, 1.9fr) minmax(360px, .9fr)",
        },
        gap: 1.5,
        alignItems: "stretch",
      }}
    >
      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          sx={{ p: 1.4, borderBottom: `1px solid ${palette.line}` }}
        >
          <TextField
            size="small"
            placeholder="输入课程名称"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            InputProps={{
              startAdornment: (
                <SearchIcon sx={{ mr: 0.8, color: "#98A2B3", fontSize: 20 }} />
              ),
            }}
            sx={{ minWidth: 220 }}
          />
          <TextField
            select
            size="small"
            label="课程分类"
            defaultValue="全部"
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="内容状态"
            defaultValue="全部"
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <Box flex={1} />
          <Button startIcon={<RefreshIcon />} variant="outlined">
            重置
          </Button>
          <Button variant="contained">查询</Button>
          {canManage && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreate}
            >
              新建课程
            </Button>
          )}
        </Stack>
        <Typography
          fontSize={13}
          color="text.secondary"
          sx={{ px: 1.5, py: 1.2 }}
        >
          共 {total} 条
        </Typography>
        <TableContainer>
          <SystemDataTable
            tableId="academy-course-library"
            sx={{
              width: "100% !important",
              maxWidth: "100% !important",
              minWidth: "0 !important",
              tableLayout: "fixed",
              "& .MuiTableCell-root": {
                px: 0.75,
                py: 0.9,
                fontSize: 12,
                boxSizing: "border-box",
                minWidth: 0,
                maxWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: "17%" }}>课程名称</TableCell>
                <TableCell sx={{ width: "10%" }}>目标客户</TableCell>
                <TableCell sx={{ width: "10%" }}>转化产品</TableCell>
                <TableCell sx={{ width: "7%" }}>版本</TableCell>
                <TableCell sx={{ width: "8%" }}>状态</TableCell>
                <TableCell sx={{ width: "9%" }}>负责人</TableCell>
                <TableCell sx={{ width: "10%" }}>最近使用</TableCell>
                <TableCell sx={{ width: "6%" }}>场次</TableCell>
                <TableCell sx={{ width: "6%" }} align="right">
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  selected={item.id === selected?.id}
                  onClick={() => onSelect(item.id)}
                  sx={{
                    cursor: "pointer",
                    "&.Mui-selected": { bgcolor: "#F1F6FF" },
                    "&.Mui-selected:hover": { bgcolor: "#EDF4FF" },
                  }}
                >
                  <TableCell sx={{ fontWeight: 800 }}>{item.title}</TableCell>
                  <TableCell>{item.objectives[0] || "企业管理者"}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>V1.0</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={statusLabel[item.status]}
                      sx={{
                        height: 22,
                        bgcolor:
                          item.status === "ACTIVE"
                            ? palette.greenSoft
                            : item.status === "DRAFT"
                              ? palette.soft
                              : palette.blueSoft,
                        color:
                          item.status === "ACTIVE"
                            ? palette.green
                            : palette.muted,
                      }}
                    />
                  </TableCell>
                  <TableCell>{item.ownerUserName}</TableCell>
                  <TableCell>
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    {sessions.filter((session) => session.courseId === item.id).length}
                  </TableCell>
                  <TableCell
                    align="right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconButton size="small" onClick={() => onSelect(item.id)}>
                      <VisibilityOutlinedIcon fontSize="small" />
                    </IconButton>
                    {canManage && item.status === "DRAFT" && (
                      <Button
                        size="small"
                        onClick={() => onStatusChange(item, "ACTIVE")}
                      >
                        发布
                      </Button>
                    )}
                    {canManage && item.status === "ACTIVE" && (
                      <IconButton
                        size="small"
                        onClick={() => onStatusChange(item, "ARCHIVED")}
                      >
                        <MoreHorizIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    暂无课程数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination
          count={total}
          page={page}
          rowsPerPage={pageSize}
          onPageChange={(_, next) => onPage(next)}
          onRowsPerPageChange={(event) =>
            onPageSize(Number(event.target.value))
          }
        />
      </Paper>
      <Paper
        variant="outlined"
        sx={{ ...panelSx, overflow: "hidden", minHeight: 650 }}
      >
        {selected ? (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              sx={{ p: 1.7, borderBottom: `1px solid ${palette.line}` }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontSize={18} fontWeight={950}>
                    {selected.title}
                  </Typography>
                  <Chip
                    size="small"
                    label={statusLabel[selected.status]}
                    sx={{
                      bgcolor: palette.greenSoft,
                      color: palette.green,
                      height: 22,
                    }}
                  />
                </Stack>
                <Typography
                  fontSize={12.5}
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  {selected.code} · V1.0 · {selected.category}
                </Typography>
              </Box>
              <IconButton size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Box sx={{ p: 1.7 }}>
              <SectionTitle
                title="课程概览"
                action={
                  canManage ? <Button size="small">编辑</Button> : undefined
                }
              />
              <Stack spacing={1.35} sx={{ mt: 1.4 }}>
                {[
                  {
                    label: "课程定位",
                    value:
                      selected.summary ||
                      "面向目标客户，解决真实业务问题并形成可落地行动。",
                  },
                  {
                    label: "客户核心问题",
                    value:
                      selected.objectives[0] || "增长方法零散、执行难以闭环。",
                  },
                  {
                    label: "课程目标",
                    value:
                      selected.objectives.slice(0, 2).join("；") ||
                      "形成清晰方法、行动清单与复盘机制。",
                  },
                  {
                    label: "核心观点",
                    value: "从问题出发，以流程、数据和复盘形成持续改进。",
                  },
                  { label: "目标产品", value: selected.category },
                  {
                    label: "版本状态",
                    value: `当前版本 V1.0 · ${new Date(selected.updatedAt).toLocaleDateString("zh-CN")}`,
                  },
                ].map((row) => (
                  <Box
                    key={row.label}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "88px 1fr",
                      gap: 1,
                    }}
                  >
                    <Typography
                      fontSize={12.5}
                      color="text.secondary"
                      fontWeight={800}
                    >
                      {row.label}
                    </Typography>
                    <Typography fontSize={13} lineHeight={1.55}>
                      {row.value}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
            <Divider />
            <Tabs
              value={detailTab}
              onChange={(_, value: number) => setDetailTab(value)}
              sx={{
                px: 1.2,
                minHeight: 44,
                "& .MuiTab-root": { minHeight: 44, fontSize: 13, px: 1.4 },
              }}
            >
              <Tab label="内容结构" />
              <Tab label="课程资产" />
              <Tab label="版本记录" />
              <Tab label="使用记录" />
            </Tabs>
            <Box sx={{ p: 1.7 }}>
              {detailTab === 0 && (
                <Stack spacing={1}>
                  {(selected.objectives.length
                    ? selected.objectives
                    : ["尚未维护课程目标与内容结构"]
                  ).map((objective, index) => (
                    <Stack
                      key={`${objective}-${index}`}
                      direction="row"
                      spacing={1.2}
                      sx={{ p: 1.1, borderBottom: `1px solid ${palette.line}` }}
                    >
                      <Chip size="small" label={index + 1} color="primary" />
                      <Box>
                        <Typography fontSize={13} fontWeight={800}>
                          {objective}
                        </Typography>
                        <Typography fontSize={11.5} color="text.secondary">
                          课程内容节点
                        </Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
              {detailTab === 1 && (
                <Stack spacing={1}>
                  {[
                    "课件 PPT",
                    "逐字稿",
                    "课程案例",
                    "宣传海报",
                    "邀约话术",
                    "直播回放",
                  ].map((asset) => (
                    <Stack
                      key={asset}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ p: 1.1, borderBottom: `1px solid ${palette.line}` }}
                    >
                      <Box>
                        <Typography fontSize={13} fontWeight={800}>{asset}</Typography>
                        <Typography fontSize={11.5} color="text.secondary">
                          当前课程尚未保存该类资产文件
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label="待上传"
                        sx={{ height: 21, bgcolor: palette.soft, color: palette.muted }}
                      />
                    </Stack>
                  ))}
                </Stack>
              )}
              {detailTab === 2 && (
                <Stack spacing={1.1}>
                  <Typography fontSize={13} fontWeight={800}>V1.0 当前版本</Typography>
                  <Typography fontSize={12.5} color="text.secondary">
                    创建于 {formatDate(selected.createdAt)}，最近更新 {formatDate(selected.updatedAt)}。
                  </Typography>
                  <Typography fontSize={12.5} color="text.secondary">
                    后续版本发布必须保留旧版本，不覆盖历史场次引用。
                  </Typography>
                </Stack>
              )}
              {detailTab === 3 && (
                <Stack spacing={1}>
                  {selectedSessions.map((session) => (
                    <Stack
                      key={session.id}
                      direction="row"
                      justifyContent="space-between"
                      sx={{ p: 1.1, borderBottom: `1px solid ${palette.line}` }}
                    >
                      <Box>
                        <Typography fontSize={13} fontWeight={800}>{session.title}</Typography>
                        <Typography fontSize={11.5} color="text.secondary">
                          {formatDate(session.startsAt)} · {session.venue || "场地待定"}
                        </Typography>
                      </Box>
                      <Chip size="small" label={statusLabel[session.status] || session.status} />
                    </Stack>
                  ))}
                  {!selectedSessions.length && (
                    <Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>
                      当前课程尚未创建场次
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          </>
        ) : (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 10 }}>
            选择课程查看详情
          </Typography>
        )}
      </Paper>
    </Box>
  );
};
const SessionTable: React.FC<{
  items: AcademySession[];
  onOpen: (id: string) => void;
}> = ({ items, onOpen }) => (
  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
    <SystemDataTable tableId="academy-session-list">
      <TableHead>
        <TableRow>
          <TableCell>场次</TableCell>
          <TableCell>课程</TableCell>
          <TableCell>开课时间</TableCell>
          <TableCell>场地</TableCell>
          <TableCell>负责人</TableCell>
          <TableCell>学员</TableCell>
          <TableCell>状态</TableCell>
          <TableCell align="right">操作</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} hover>
            <TableCell sx={{ fontWeight: 800 }}>{item.title}</TableCell>
            <TableCell>{item.course?.title || "-"}</TableCell>
            <TableCell>{formatDate(item.startsAt)}</TableCell>
            <TableCell>{item.venue || "-"}</TableCell>
            <TableCell>{item.facilitatorUserName || "待分配"}</TableCell>
            <TableCell>{item._count?.engagements || 0}</TableCell>
            <TableCell>
              <Chip
                size="small"
                label={statusLabel[item.status] || item.status}
                color={statusColor(item.status)}
              />
            </TableCell>
            <TableCell align="right">
              <Button size="small" onClick={() => onOpen(item.id)}>
                进入执行详情
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {!items.length && (
          <TableRow>
            <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
              暂无场次数据
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </SystemDataTable>
  </TableContainer>
);
const EngagementWorkspace: React.FC<{
  sessions: AcademySession[];
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
  detail?: AcademySessionDetail;
  canManage: boolean;
  onAdd: () => void;
}> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  detail,
  canManage,
  onAdd,
}) => {
  const items = detail?.engagements || [];
  const selected = items[0];
  const invited = items.length;
  const confirmed = items.filter(
    (item) => item.invitationStatus === "CONFIRMED",
  ).length;
  const attended = items.filter(
    (item) => item.attendanceStatus === "ATTENDED",
  ).length;
  const consulted = items.filter((item) =>
    ["A", "B"].includes(item.courseAssessment || ""),
  ).length;
  return (
    <>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.4 }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1}>
          <TextField
            select
            size="small"
            label="课程场次"
            value={selectedSessionId}
            onChange={(event) => onSelectSession(event.target.value)}
            sx={{ minWidth: 320 }}
          >
            {sessions.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.title} ·{" "}
                {new Date(item.startsAt).toLocaleDateString("zh-CN")}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="销售负责人"
            defaultValue="全部"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="邀约状态"
            defaultValue="全部"
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="到课状态"
            defaultValue="全部"
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <TextField
            size="small"
            placeholder="客户/公司/手机号"
            InputProps={{
              startAdornment: (
                <SearchIcon sx={{ mr: 0.7, color: "#98A2B3", fontSize: 20 }} />
              ),
            }}
          />
          <Box flex={1} />
          {canManage && (
            <Button variant="contained" onClick={onAdd}>
              从CRM添加学员
            </Button>
          )}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.4 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(5, 1fr)" },
            border: `1px solid ${palette.line}`,
            borderRadius: 1.2,
            overflow: "hidden",
          }}
        >
          {[
            { label: "学员总数", value: invited },
            { label: "邀约", value: invited },
            { label: "确认", value: confirmed },
            { label: "到课", value: attended },
            { label: "咨询", value: consulted },
          ].map((step, index) => (
            <Box
              key={step.label}
              sx={{
                p: 1.3,
                borderRight: index < 4 ? `1px solid ${palette.line}` : 0,
              }}
            >
              <Typography fontSize={12} color="text.secondary">
                {step.label}
              </Typography>
              <Typography fontSize={22} fontWeight={950} sx={{ mt: 0.4 }}>
                {step.value}
              </Typography>
              <Typography fontSize={11.5} color={palette.green}>
                转化率 {invited ? Math.round((step.value / invited) * 100) : 0}%
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 2fr) minmax(330px, .7fr)",
          },
          gap: 1.5,
        }}
      >
        <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
          <TableContainer>
            <SystemDataTable tableId="academy-engagement-list">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" />
                  </TableCell>
                  <TableCell>客户</TableCell>
                  <TableCell>公司/行业</TableCell>
                  <TableCell>销售负责人</TableCell>
                  <TableCell>邀约状态</TableCell>
                  <TableCell>到课</TableCell>
                  <TableCell>课堂互动</TableCell>
                  <TableCell>课程分层</TableCell>
                  <TableCell>下一步跟进</TableCell>
                  <TableCell>成交/交接</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id} hover selected={index === 0}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>
                      {item.participantName}
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>{item.ownerUserName || "待分配"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          statusLabel[item.invitationStatus] ||
                          item.invitationStatus
                        }
                        sx={{
                          height: 21,
                          bgcolor: palette.greenSoft,
                          color: palette.green,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {statusLabel[item.attendanceStatus] ||
                        item.attendanceStatus}
                    </TableCell>
                    <TableCell>{item.interactionLevel || "待记录"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={item.courseAssessment || "待分层"}
                        sx={{
                          height: 22,
                          bgcolor:
                            item.courseAssessment === "A"
                              ? palette.redSoft
                              : item.courseAssessment === "B"
                                ? palette.amberSoft
                                : palette.blueSoft,
                          color:
                            item.courseAssessment === "A"
                              ? palette.red
                              : item.courseAssessment === "B"
                                ? palette.amber
                                : palette.blue,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {item.courseAssessment === "A"
                        ? "24小时内重点跟进"
                        : item.courseAssessment === "B"
                          ? "建立跟进计划"
                          : "持续培育"}
                    </TableCell>
                    <TableCell>
                      {statusLabel[item.followUpStatus] || item.followUpStatus}
                    </TableCell>
                    <TableCell>
                      <Button size="small">查看</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!items.length && (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 7 }}>
                      当前场次暂无学员，请从CRM添加
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SystemDataTable>
          </TableContainer>
        </Paper>
        <Paper
          variant="outlined"
          sx={{ ...panelSx, overflow: "hidden", minHeight: 520 }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ p: 1.5, borderBottom: `1px solid ${palette.line}` }}
          >
            <Typography fontWeight={950}>
              {selected ? `${selected.participantName}·过程` : "学员单屏过程"}
            </Typography>
            <IconButton size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          {selected ? (
            <Stack spacing={1.4} sx={{ p: 1.5 }}>
              <Box>
                <Typography fontSize={12} color="text.secondary">
                  CRM身份
                </Typography>
                <Typography fontSize={13.5} fontWeight={800}>
                  {selected.customerId ? "已关联客户" : "临时学员"}
                </Typography>
              </Box>
              <Box>
                <Typography fontSize={12} color="text.secondary">
                  课程与场次
                </Typography>
                <Typography fontSize={13.5}>{detail?.title || "-"}</Typography>
              </Box>
              <Divider />
              <Typography fontSize={13} fontWeight={900}>
                流程时间线
              </Typography>
              {[
                "加入邀约名单",
                statusLabel[selected.invitationStatus] ||
                  selected.invitationStatus,
                statusLabel[selected.attendanceStatus] ||
                  selected.attendanceStatus,
                `课程分层：${selected.courseAssessment || "待分层"}`,
                `跟进：${statusLabel[selected.followUpStatus] || selected.followUpStatus}`,
              ].map((text, index) => (
                <Stack key={`${text}-${index}`} direction="row" spacing={1}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      mt: 0.8,
                      borderRadius: "50%",
                      bgcolor: index < 2 ? palette.green : palette.blue,
                    }}
                  />
                  <Box>
                    <Typography fontSize={13} fontWeight={800}>
                      {text}
                    </Typography>
                    <Typography fontSize={11.5} color="text.secondary">
                      由系统业务状态自动记录
                    </Typography>
                  </Box>
                </Stack>
              ))}
              <Divider />
              <Typography fontSize={13} fontWeight={900}>
                下一步行动
              </Typography>
              <Typography fontSize={12.5} color="text.secondary">
                {selected.courseAssessment === "A"
                  ? "重点跟进并关联正式订单"
                  : "按课程反馈建立后续跟进计划"}
              </Typography>
              <Button variant="contained">更新学员进度</Button>
            </Stack>
          ) : (
            <Typography
              color="text.secondary"
              textAlign="center"
              sx={{ py: 9 }}
            >
              选择学员查看全过程
            </Typography>
          )}
        </Paper>
      </Box>
    </>
  );
};

const HandoffWorkspace: React.FC<{
  sessions: AcademySession[];
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
  detail?: AcademySessionDetail;
  onGoCustomers: () => void;
  onGoOrders: () => void;
}> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  detail,
  onGoCustomers,
  onGoOrders,
}) => {
  const items = detail?.engagements || [];
  const qualified = items.filter((item) =>
    ["A", "B"].includes(item.courseAssessment || ""),
  );
  const hot = items.filter((item) => item.courseAssessment === "A");
  const following = items.filter((item) => item.followUpStatus !== "DONE");
  const done = items.filter((item) => item.followUpStatus === "DONE");

  return (
    <>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.4 }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1}
          alignItems={{ lg: "center" }}
        >
          <Box>
            <Typography fontWeight={900} fontSize={16}>
              转化与交接
            </Typography>
            <Typography fontSize={12.5} color="text.secondary">
              商学院只负责形成转化线索和交接入口，客户主档、订单和交付继续使用极享OS现有模块。
            </Typography>
          </Box>
          <Box flex={1} />
          <TextField
            select
            size="small"
            label="课程场次"
            value={selectedSessionId}
            onChange={(event) => onSelectSession(event.target.value)}
            sx={{ minWidth: 320 }}
          >
            {sessions.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.title} · {new Date(item.startsAt).toLocaleDateString("zh-CN")}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={onGoCustomers}>
            打开客户管理
          </Button>
          <Button variant="contained" onClick={onGoOrders}>
            打开订单管理
          </Button>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
          gap: 1.2,
        }}
      >
        {[
          { label: "待转化学员", value: qualified.length, color: palette.blue },
          { label: "A类重点跟进", value: hot.length, color: palette.red },
          { label: "跟进中", value: following.length, color: palette.amber },
          { label: "已完成跟进", value: done.length, color: palette.green },
        ].map((item) => (
          <Paper key={item.label} variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
            <Typography fontSize={12.5} color="text.secondary">
              {item.label}
            </Typography>
            <Typography fontSize={26} fontWeight={950} color={item.color} sx={{ mt: 0.5 }}>
              {item.value}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Box sx={{ px: 1.5, py: 1.3, borderBottom: `1px solid ${palette.line}` }}>
          <SectionTitle
            title="课程转化清单"
            helper="按课程分层推进销售跟进；正式成交结果以订单管理为准。"
          />
        </Box>
        <TableContainer>
          <SystemDataTable tableId="academy-conversion-handoff-list">
            <TableHead>
              <TableRow>
                <TableCell>学员</TableCell>
                <TableCell>课程场次</TableCell>
                <TableCell>CRM关联</TableCell>
                <TableCell>课程分层</TableCell>
                <TableCell>销售负责人</TableCell>
                <TableCell>跟进状态</TableCell>
                <TableCell>建议动作</TableCell>
                <TableCell>业务去向</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={{ fontWeight: 800 }}>{item.participantName}</TableCell>
                  <TableCell>{detail?.title || "-"}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={item.customerId ? "已关联客户" : "待关联客户"}
                      sx={{
                        bgcolor: item.customerId ? palette.greenSoft : palette.amberSoft,
                        color: item.customerId ? palette.green : palette.amber,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={item.courseAssessment || "待分层"}
                      sx={{
                        bgcolor:
                          item.courseAssessment === "A"
                            ? palette.redSoft
                            : item.courseAssessment === "B"
                              ? palette.amberSoft
                              : palette.blueSoft,
                        color:
                          item.courseAssessment === "A"
                            ? palette.red
                            : item.courseAssessment === "B"
                              ? palette.amber
                              : palette.blue,
                      }}
                    />
                  </TableCell>
                  <TableCell>{item.ownerUserName || "待分配"}</TableCell>
                  <TableCell>{statusLabel[item.followUpStatus] || item.followUpStatus}</TableCell>
                  <TableCell>
                    {item.courseAssessment === "A"
                      ? "24小时内重点跟进"
                      : item.courseAssessment === "B"
                        ? "建立销售跟进计划"
                        : "进入长期培育"}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Button size="small" onClick={onGoCustomers}>客户</Button>
                      <Button size="small" onClick={onGoOrders}>订单</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 7 }}>
                    当前场次暂无学员转化数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
      </Paper>
    </>
  );
};

const Reviews: React.FC<{
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  selectedId: string;
  onSelect: (id: string) => void;
  confirmed: number;
  attended: number;
  hot: number;
  canEdit: boolean;
  form: SaveAcademyReviewInput;
  onFormChange: (value: SaveAcademyReviewInput) => void;
  onSave: () => void;
  saving: boolean;
}> = ({
  sessions,
  details,
  selectedId,
  onSelect,
  confirmed,
  attended,
  hot,
  canEdit,
  form,
  onFormChange,
  onSave,
  saving,
}) => {
  const detail = details[selectedId];
  const invited = detail?.engagements.length || 0;
  const conversion = invited ? Math.round((attended / invited) * 100) : 0;
  const consulted =
    detail?.engagements.filter((item) =>
      ["A", "B"].includes(item.courseAssessment || ""),
    ).length || 0;
  const funnel = [
    { label: "邀约", target: Math.max(invited, 1), actual: invited },
    { label: "确认", target: Math.max(confirmed, 1), actual: confirmed },
    { label: "到课", target: Math.max(attended, 1), actual: attended },
    { label: "咨询", target: Math.max(consulted, 1), actual: consulted },
    { label: "成交人数", target: Math.max(hot, 1), actual: hot },
    { label: "成交金额", target: 0, actual: 0 },
  ];
  return (
    <>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.4 }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1}
          alignItems={{ lg: "center" }}
        >
          <TextField
            select
            size="small"
            label="时间范围"
            defaultValue="本周"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="本周">本周</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="课程/场次"
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
            sx={{ minWidth: 340 }}
          >
            {sessions.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="讲师"
            defaultValue="全部"
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="销售部门"
            defaultValue="全部"
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="渠道"
            defaultValue="全部"
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="全部">全部</MenuItem>
          </TextField>
          <Box flex={1} />
          <Button variant="outlined" startIcon={<DownloadIcon />}>
            导出经营报告
          </Button>
          {canEdit && (
            <Button
              variant="contained"
              disabled={saving || !selectedId}
              onClick={onSave}
            >
              提交复盘
            </Button>
          )}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle
          title="经营复盘·目标与实际"
          helper={
            detail
              ? `${new Date(detail.startsAt).toLocaleDateString("zh-CN")} · ${detail.title}`
              : "请选择复盘场次"
          }
        />
        <Box
          sx={{
            mt: 1.3,
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(6, 1fr)" },
            border: `1px solid ${palette.line}`,
            borderRadius: 1.2,
            overflow: "hidden",
          }}
        >
          {funnel.map((item, index) => (
            <Box
              key={item.label}
              sx={{
                p: 1.35,
                borderRight: index < 5 ? `1px solid ${palette.line}` : 0,
              }}
            >
              <Typography fontSize={12.5} fontWeight={900}>
                {item.label}
              </Typography>
              <Stack spacing={0.3} sx={{ mt: 0.8 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontSize={11.5} color="text.secondary">
                    目标
                  </Typography>
                  <Typography fontSize={12.5}>
                    {index === 5
                      ? `¥${item.target.toLocaleString()}`
                      : item.target}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontSize={11.5} color="text.secondary">
                    实际
                  </Typography>
                  <Typography fontSize={14} fontWeight={950}>
                    {index === 5
                      ? `¥${item.actual.toLocaleString()}`
                      : item.actual}
                  </Typography>
                </Stack>
                <Typography
                  fontSize={11.5}
                  color={
                    item.actual >= item.target ? palette.green : palette.red
                  }
                >
                  差距 {item.actual - item.target >= 0 ? "+" : ""}
                  {item.actual - item.target}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Box>
        <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>
          整体到课率 {conversion}% · A类客户 {hot} 人 · 数据来自当前选择场次
        </Typography>
      </Paper>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle title="核心场次达成对比" />
        <TableContainer sx={{ mt: 1 }}>
          <SystemDataTable tableId="academy-review-session-performance">
            <TableHead>
              <TableRow>
                <TableCell>场次日期</TableCell>
                <TableCell>场次名称</TableCell>
                <TableCell>目标到场</TableCell>
                <TableCell>实际到场</TableCell>
                <TableCell>到课率</TableCell>
                <TableCell>A/B客户</TableCell>
                <TableCell>成交人数</TableCell>
                <TableCell>成交金额</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.slice(0, 6).map((session) => {
                const sessionDetail = details[session.id];
                const learners = sessionDetail?.engagements || [];
                const arrive = learners.filter(
                  (item) => item.attendanceStatus === "ATTENDED",
                ).length;
                const ab = learners.filter((item) =>
                  ["A", "B"].includes(item.courseAssessment || ""),
                ).length;
                return (
                  <TableRow
                    key={session.id}
                    selected={session.id === selectedId}
                    onClick={() => onSelect(session.id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      {new Date(session.startsAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>
                      {session.title}
                    </TableCell>
                    <TableCell>{session.capacity}</TableCell>
                    <TableCell>{arrive}</TableCell>
                    <TableCell
                      sx={{
                        color:
                          arrive / Math.max(session.capacity, 1) >= 0.7
                            ? palette.green
                            : palette.red,
                      }}
                    >
                      {Math.round(
                        (arrive / Math.max(session.capacity, 1)) * 100,
                      )}
                      %
                    </TableCell>
                    <TableCell>{ab}</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>¥0</TableCell>
                  </TableRow>
                );
              })}
              {!sessions.length && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    暂无可复盘场次
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1fr) minmax(0, 1.2fr)",
          },
          gap: 1.5,
        }}
      >
        <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
          <SectionTitle title="本周复盘结论" />
          <Stack spacing={1.2} sx={{ mt: 1.2 }}>
            <TextField
              label="做得好的"
              multiline
              minRows={2}
              disabled={!canEdit}
              value={form.summary}
              onChange={(event) =>
                onFormChange({ ...form, summary: event.target.value })
              }
            />
            <TextField
              label="未达标原因"
              multiline
              minRows={2}
              disabled={!canEdit}
              value={form.issues}
              onChange={(event) =>
                onFormChange({ ...form, issues: event.target.value })
              }
            />
            <TextField
              label="下次改进"
              multiline
              minRows={2}
              disabled={!canEdit}
              value={form.improvements}
              onChange={(event) =>
                onFormChange({ ...form, improvements: event.target.value })
              }
            />
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
          <SectionTitle
            title="改进行动计划"
            action={
              <Button size="small" startIcon={<AddIcon />}>
                生成改进行动
              </Button>
            }
          />
          <TableContainer sx={{ mt: 1 }}>
            <SystemDataTable
              tableId="academy-review-action-plan"
              sx={{
                width: "100%",
                minWidth: "0 !important",
                tableLayout: "fixed",
                "& .MuiTableCell-root": {
                  px: 0.75,
                  py: 0.85,
                  fontSize: 12,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "32%" }}>改进行动</TableCell>
                  <TableCell sx={{ width: "25%" }}>关联课程/场次</TableCell>
                  <TableCell sx={{ width: "16%" }}>负责人</TableCell>
                  <TableCell sx={{ width: "16%" }}>完成截止</TableCell>
                  <TableCell sx={{ width: "11%" }}>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detail?.review?.actionItems?.map((item, index) => (
                  <TableRow key={`${item.title}-${index}`}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{detail.title}</TableCell>
                    <TableCell>{item.ownerUserId || "待分配"}</TableCell>
                    <TableCell>{formatDate(item.dueAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label="待开始"
                        sx={{
                          height: 21,
                          bgcolor: palette.blueSoft,
                          color: palette.blue,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!detail?.review?.actionItems?.length && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      暂无改进行动，可根据复盘结论生成
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SystemDataTable>
          </TableContainer>
        </Paper>
      </Box>
    </>
  );
};

export default Academy;
