import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
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
import GroupsIcon from "@mui/icons-material/Groups";
import InsightsIcon from "@mui/icons-material/Insights";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
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

const palette = {
  blue: "#1E6BFF",
  ink: "#101828",
  muted: "#667085",
  line: "#DDE5EF",
  soft: "#F4F7FB",
  green: "#0F9D76",
  amber: "#B76A00",
  red: "#D92D20",
  purple: "#7A5AF8",
};

type AcademyView =
  "overview" | "plans" | "courses" | "sessions" | "engagements" | "reviews";
const viewPath: Record<AcademyView, string> = {
  overview: ROUTES.ACADEMY,
  plans: `${ROUTES.ACADEMY}/plans`,
  courses: `${ROUTES.ACADEMY}/courses`,
  sessions: `${ROUTES.ACADEMY}/sessions`,
  engagements: `${ROUTES.ACADEMY}/engagements`,
  reviews: `${ROUTES.ACADEMY}/reviews`,
};
const navItems: Array<{ value: AcademyView; label: string }> = [
  { value: "overview", label: "运营工作台" },
  { value: "plans", label: "课程计划" },
  { value: "courses", label: "课程库" },
  { value: "sessions", label: "场次运营" },
  { value: "engagements", label: "学员与转化" },
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
  <Paper
    variant="outlined"
    sx={{ p: 2, borderRadius: 2, borderColor: palette.line, minWidth: 0 }}
  >
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Box minWidth={0}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography
          sx={{ mt: 0.5, fontWeight: 900, fontSize: 26, color: palette.ink }}
        >
          {value}
        </Typography>
      </Box>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 1.5,
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
      <Typography sx={{ fontWeight: 900, fontSize: 17 }}>{title}</Typography>
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
    if (item.value === "engagements")
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
    if (!selectedSessionId && sessionResponse.data.items[0])
      setSelectedSessionId(sessionResponse.data.items[0].id);
  }, [alert, selectedSessionId]);

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
      (view === "engagements" || view === "reviews") &&
      selectedSessionId &&
      !details[selectedSessionId]
    )
      void loadDetail(selectedSessionId);
  }, [details, loadDetail, selectedSessionId, view]);
  useEffect(() => {
    if (view !== "engagements" || !canEngagement || customers.length) return;
    void customerApi.fetchCustomers({ page: 1, pageSize: 100 }).then((response) => {
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
    const groups: Array<{
      title: string;
      category: AcademySessionTask["category"];
    }> = [
      { title: "课前筹备", category: "BEFORE" },
      { title: "课堂执行", category: "DURING" },
      { title: "课后转化与复盘", category: "AFTER" },
    ];
    return (
      <Box
        sx={{ minHeight: "100%", bgcolor: "#F6F8FB", p: { xs: 1.5, md: 3 } }}
      >
        <Stack spacing={2.5} maxWidth={1480} mx="auto">
          <Button
            startIcon={<ArrowBackIcon />}
            sx={{ alignSelf: "flex-start" }}
            onClick={() => setDetail(null)}
          >
            返回场次列表
          </Button>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRadius: 2.5,
              borderColor: "#CFE0FF",
              bgcolor: "#F8FBFF",
            }}
          >
            <Stack
              direction={{ xs: "column", lg: "row" }}
              justifyContent="space-between"
              spacing={2}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={statusLabel[detail.status] || detail.status}
                    color={statusColor(detail.status)}
                  />
                  <Typography sx={{ fontWeight: 900, fontSize: 24 }}>
                    {detail.title}
                  </Typography>
                </Stack>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {detail.course?.title} · {formatDate(detail.startsAt)} ·{" "}
                  {detail.venue || "未填写场地"}
                </Typography>
              </Box>
              <Box sx={{ minWidth: { lg: 260 } }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">整体执行进度</Typography>
                  <Typography variant="body2" fontWeight={800}>
                    {progress}%
                  </Typography>
                </Stack>
                <LinearProgress
                  value={progress}
                  variant="determinate"
                  sx={{ mt: 1, height: 8, borderRadius: 8 }}
                />
              </Box>
            </Stack>
          </Paper>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" },
              gap: 2,
            }}
          >
            {groups.map((group) => (
              <Paper
                key={group.category}
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, borderColor: palette.line }}
              >
                <Typography sx={{ fontWeight: 900, mb: 1.5 }}>
                  {group.title}
                </Typography>
                <Stack spacing={1}>
                  {detail.tasks
                    .filter((task) => task.category === group.category)
                    .map((task) => (
                      <Box
                        key={task.id}
                        sx={{
                          p: 1.3,
                          borderRadius: 1.5,
                          bgcolor:
                            task.status === "BLOCKED"
                              ? "#FFF4F2"
                              : palette.soft,
                        }}
                      >
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={800}>
                              {task.title}
                              {task.isRequired ? " *" : ""}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {task.completedByName || "待分配负责人"}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            clickable={canSession}
                            onClick={() => canSession && void updateTask(task)}
                            label={statusLabel[task.status] || task.status}
                            color={statusColor(task.status)}
                          />
                        </Stack>
                      </Box>
                    ))}
                </Stack>
              </Paper>
            ))}
          </Box>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <SectionTitle
              title="邀约、到课与转化"
              helper="课程后30分钟完成A/B/C分层，A/B类24小时内进入销售待办。"
            />
            <EngagementTable items={detail.engagements} />
          </Paper>
        </Stack>
        {feedbackDialog}
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "#F6F8FB", p: { xs: 1.5, md: 3 } }}>
      <Stack spacing={2.5} maxWidth={1600} mx="auto">
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: 24, md: 30 },
                fontWeight: 950,
                color: palette.ink,
              }}
            >
              极享商学院
            </Typography>
            <Typography color="text.secondary">
              课程经营、客户转化与组织协同中心
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {canPlan && (
              <Button
                variant="outlined"
                startIcon={<CalendarMonthIcon />}
                onClick={() => navigate(viewPath.plans)}
              >
                制定课程计划
              </Button>
            )}
            {canSession && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  setSessionForm(emptySession);
                  setSessionOpen(true);
                }}
              >
                新建场次
              </Button>
            )}
          </Stack>
        </Stack>
        <Paper
          variant="outlined"
          sx={{ px: 1, borderRadius: 2, borderColor: palette.line }}
        >
          <Tabs
            value={view}
            onChange={(_, value: AcademyView) => navigate(viewPath[value])}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            {visibleNavItems.map((item) => (
              <Tab key={item.value} value={item.value} label={item.label} />
            ))}
          </Tabs>
        </Paper>
        {loading && <LinearProgress />}

        {view === "overview" && (
          <Overview
            dashboard={dashboard}
            sessions={weekSessions}
            details={details}
            onOpen={(id) => void loadDetail(id, true)}
          />
        )}
        {view === "plans" && (
          <Plans
            sessions={weekSessions}
            onCreate={() => setSessionOpen(true)}
            canCreate={canPlan}
          />
        )}
        {view === "courses" && (
          <>
            <SectionTitle
              title="课程库"
              helper="管理课程定位、内容版本、课件与宣传资产。"
              action={
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    placeholder="搜索课程编码、名称、分类"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {canCourse && (
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => setCourseOpen(true)}
                    >
                      新建课程
                    </Button>
                  )}
                </Stack>
              }
            />
            <CourseTable
              items={pagedCourses}
              canManage={canCourse}
              onStatusChange={(course, status) =>
                void changeCourseStatus(course, status)
              }
            />
            <TablePagination
              count={filteredCourses.length}
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
        {view === "sessions" && (
          <>
            <SectionTitle
              title="场次运营"
              helper="每场课从筹备、执行、客户分层到复盘的完整闭环。"
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
          <>
            <SectionTitle
              title="学员与转化"
              helper="从CRM客户完成邀约、确认、到课、分层、跟进和成交交接。"
              action={canEngagement && selectedSessionId ? (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setEngagementForm({ ...emptyEngagement, sessionId: selectedSessionId });
                    setEngagementOpen(true);
                  }}
                >
                  添加CRM客户
                </Button>
              ) : undefined}
            />
            <TextField
              select
              size="small"
              label="选择课程场次"
              value={selectedSessionId}
              onChange={(event) => {
                setSelectedSessionId(event.target.value);
                void loadDetail(event.target.value);
              }}
              sx={{ maxWidth: 480 }}
            >
              {sessions.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.title} · {formatDate(item.startsAt)}
                </MenuItem>
              ))}
            </TextField>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" },
                gap: 1.5,
              }}
            >
              <MetricCard
                label="已邀约"
                value={selectedDetail?.engagements.length || 0}
                helper="当前场次客户"
                color={palette.blue}
                icon={<GroupsIcon />}
              />
              <MetricCard
                label="已确认"
                value={
                  selectedDetail?.engagements.filter(
                    (item) => item.invitationStatus === "CONFIRMED",
                  ).length || 0
                }
                helper="确认参加课程"
                color={palette.purple}
                icon={<TaskAltIcon />}
              />
              <MetricCard
                label="已到课"
                value={
                  selectedDetail?.engagements.filter(
                    (item) => item.attendanceStatus === "ATTENDED",
                  ).length || 0
                }
                helper="实际签到学员"
                color={palette.green}
                icon={<AutoStoriesIcon />}
              />
              <MetricCard
                label="A类客户"
                value={
                  selectedDetail?.engagements.filter(
                    (item) => item.courseAssessment === "A",
                  ).length || 0
                }
                helper="24小时内需跟进"
                color={palette.amber}
                icon={<InsightsIcon />}
              />
            </Box>
            <EngagementTable items={selectedDetail?.engagements || []} />
          </>
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
                    const customer = customers.find((item) => item.id === event.target.value);
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
                      {customer.name} · {customer.company || "未填写公司"} · {customer.owner || "待分配"}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="邀约状态"
                  value={engagementForm.invitationStatus}
                  onChange={(event) => {
                    markDirty();
                    setEngagementForm({ ...engagementForm, invitationStatus: event.target.value });
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
                    setEngagementForm({ ...engagementForm, notes: event.target.value });
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
    </Box>
  );
};

const Overview: React.FC<{
  dashboard: AcademyDashboard;
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  onOpen: (id: string) => void;
}> = ({ dashboard, sessions, details, onOpen }) => {
  const engagementList = Object.values(details).flatMap(
    (item) => item.engagements,
  );
  const funnel = [
    { label: "邀约", value: engagementList.length, color: palette.blue },
    {
      label: "确认",
      value: engagementList.filter(
        (item) => item.invitationStatus === "CONFIRMED",
      ).length,
      color: palette.purple,
    },
    {
      label: "到课",
      value: engagementList.filter(
        (item) => item.attendanceStatus === "ATTENDED",
      ).length,
      color: palette.green,
    },
    {
      label: "A/B类",
      value: engagementList.filter((item) =>
        ["A", "B"].includes(item.courseAssessment || ""),
      ).length,
      color: palette.amber,
    },
  ];
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        <MetricCard
          label="启用课程"
          value={dashboard.activeCourses}
          helper="可用于计划和排期"
          color={palette.blue}
          icon={<AutoStoriesIcon />}
        />
        <MetricCard
          label="待执行场次"
          value={dashboard.upcomingSessions}
          helper="本周需要协同推进"
          color={palette.purple}
          icon={<CalendarMonthIcon />}
        />
        <MetricCard
          label="准备风险"
          value={dashboard.sessionsNeedingAttention}
          helper="就绪前需完成检查"
          color={palette.amber}
          icon={<WarningAmberIcon />}
        />
        <MetricCard
          label="待销售跟进"
          value={dashboard.pendingFollowUps}
          helper="A/B类客户需要待办"
          color={palette.red}
          icon={<GroupsIcon />}
        />
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "1.6fr 1fr" },
          gap: 2,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <SectionTitle
            title="本周课程作战台"
            helper="所有场次的时间、负责人和准备状态集中可见。"
          />
          <Stack spacing={1.2} sx={{ mt: 2 }}>
            {sessions.map((item) => (
              <Box
                key={item.id}
                sx={{
                  p: 1.5,
                  border: `1px solid ${palette.line}`,
                  borderRadius: 1.5,
                  bgcolor: "#fff",
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Box>
                    <Typography fontWeight={900}>{item.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(item.startsAt)} · {item.venue || "未定场地"} ·{" "}
                      {item.facilitatorUserName || "待分配负责人"}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={statusLabel[item.status] || item.status}
                      color={statusColor(item.status)}
                    />
                    <Button size="small" onClick={() => onOpen(item.id)}>
                      进入场次
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
            {!sessions.length && (
              <Typography
                color="text.secondary"
                sx={{ py: 5, textAlign: "center" }}
              >
                本周暂无场次，请先制定课程计划。
              </Typography>
            )}
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <SectionTitle
            title="本周转化漏斗"
            helper="实时反映已加载场次的客户转化进度。"
          />
          <Stack spacing={1.7} sx={{ mt: 2 }}>
            {funnel.map((item, index) => (
              <Box key={item.label}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={800}>
                    {item.label}
                  </Typography>
                  <Typography variant="body2" fontWeight={900}>
                    {item.value}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={
                    funnel[0].value
                      ? Math.max(5, (item.value / funnel[0].value) * 100)
                      : 0
                  }
                  sx={{
                    mt: 0.7,
                    height: 9,
                    borderRadius: 8,
                    "& .MuiLinearProgress-bar": { bgcolor: item.color },
                  }}
                />
                {index < funnel.length - 1 && (
                  <Typography variant="caption" color="text.secondary">
                    下一阶段转化持续更新
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </>
  );
};

const Plans: React.FC<{
  sessions: AcademySession[];
  onCreate: () => void;
  canCreate: boolean;
}> = ({ sessions, onCreate, canCreate }) => {
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return (
    <>
      <SectionTitle
        title="课程计划"
        helper="以周为单位安排课程、目标、负责人与经营指标。"
        action={
          canCreate && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreate}
            >
              新增课程计划
            </Button>
          )
        }
      />
      <Paper
        variant="outlined"
        sx={{ p: 2, borderRadius: 2, overflowX: "auto" }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(150px, 1fr))",
            gap: 1,
            minWidth: 1080,
          }}
        >
          {days.map((day, index) => {
            const items = sessions.filter((item) => {
              const weekday = new Date(item.startsAt).getDay() || 7;
              return weekday === index + 1;
            });
            return (
              <Box
                key={day}
                sx={{
                  minHeight: 220,
                  p: 1.2,
                  borderRadius: 1.5,
                  bgcolor:
                    index === 2 || index === 3 ? "#EEF4FF" : palette.soft,
                  border: `1px solid ${index === 2 || index === 3 ? "#B9D2FF" : palette.line}`,
                }}
              >
                <Typography
                  fontWeight={900}
                  color={
                    index === 2 || index === 3 ? palette.blue : palette.ink
                  }
                >
                  {day}
                </Typography>
                {items.length ? (
                  <Stack spacing={1} sx={{ mt: 1.2 }}>
                    {items.map((item) => (
                      <Box
                        key={item.id}
                        sx={{
                          p: 1.2,
                          borderRadius: 1.2,
                          bgcolor: "#fff",
                          borderLeft: `4px solid ${palette.blue}`,
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
                    sx={{ display: "block", mt: 2 }}
                  >
                    暂无排期
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <SectionTitle title="周计划发布门禁" />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" },
            gap: 1.2,
            mt: 1.5,
          }}
        >
          {[
            "课程目标与客户问题已确认",
            "课程与素材负责人已确认",
            "邀约、到课、成交目标已设定",
            "风险项和验收标准已确认",
          ].map((text) => (
            <Box
              key={text}
              sx={{ p: 1.4, bgcolor: "#F8FAFC", borderRadius: 1.5 }}
            >
              <TaskAltIcon sx={{ color: palette.green, fontSize: 20 }} />
              <Typography variant="body2" fontWeight={700}>
                {text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </>
  );
};

const CourseTable: React.FC<{
  items: AcademyCourse[];
  canManage: boolean;
  onStatusChange: (
    course: AcademyCourse,
    status: AcademyCourse["status"],
  ) => void;
}> = ({ items, canManage, onStatusChange }) => (
  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>课程编码</TableCell>
          <TableCell>课程名称</TableCell>
          <TableCell>分类</TableCell>
          <TableCell>最新版本</TableCell>
          <TableCell>负责人</TableCell>
          <TableCell>状态</TableCell>
          <TableCell>最后更新</TableCell>
          <TableCell align="right">操作</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} hover>
            <TableCell>{item.code}</TableCell>
            <TableCell>
              <Typography fontWeight={800}>{item.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item.summary || "未填写课程定位"}
              </Typography>
            </TableCell>
            <TableCell>{item.category}</TableCell>
            <TableCell>V1</TableCell>
            <TableCell>{item.ownerUserName}</TableCell>
            <TableCell>
              <Chip
                size="small"
                label={statusLabel[item.status] || item.status}
                color={statusColor(item.status)}
              />
            </TableCell>
            <TableCell>{formatDate(item.updatedAt)}</TableCell>
            <TableCell align="right">
              {canManage && item.status === "DRAFT" && (
                <Button
                  size="small"
                  onClick={() => onStatusChange(item, "ACTIVE")}
                >
                  发布课程
                </Button>
              )}
              {canManage && item.status === "ACTIVE" && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => onStatusChange(item, "ARCHIVED")}
                >
                  归档
                </Button>
              )}
              {canManage && item.status === "ARCHIVED" && (
                <Button
                  size="small"
                  onClick={() => onStatusChange(item, "ACTIVE")}
                >
                  重新启用
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
        {!items.length && (
          <TableRow>
            <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
              暂无课程数据
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </TableContainer>
);
const SessionTable: React.FC<{
  items: AcademySession[];
  onOpen: (id: string) => void;
}> = ({ items, onOpen }) => (
  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
    <Table size="small">
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
    </Table>
  </TableContainer>
);
const EngagementTable: React.FC<{ items: AcademyEngagement[] }> = ({
  items,
}) => (
  <TableContainer
    component={Paper}
    variant="outlined"
    sx={{ mt: 1.5, borderRadius: 2 }}
  >
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>客户 / 学员</TableCell>
          <TableCell>销售负责人</TableCell>
          <TableCell>邀约</TableCell>
          <TableCell>到课</TableCell>
          <TableCell>课堂分层</TableCell>
          <TableCell>跟进状态</TableCell>
          <TableCell>下一步</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} hover>
            <TableCell sx={{ fontWeight: 800 }}>
              {item.participantName}
            </TableCell>
            <TableCell>{item.ownerUserName || "待分配"}</TableCell>
            <TableCell>
              {statusLabel[item.invitationStatus] || item.invitationStatus}
            </TableCell>
            <TableCell>
              {statusLabel[item.attendanceStatus] || item.attendanceStatus}
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                label={item.courseAssessment || "待分层"}
                color={
                  item.courseAssessment === "A"
                    ? "error"
                    : item.courseAssessment === "B"
                      ? "warning"
                      : "default"
                }
              />
            </TableCell>
            <TableCell>
              {statusLabel[item.followUpStatus] || item.followUpStatus}
            </TableCell>
            <TableCell>
              {item.courseAssessment === "A"
                ? "24小时内重点跟进"
                : item.courseAssessment === "B"
                  ? "建立跟进计划"
                  : "持续培育"}
            </TableCell>
          </TableRow>
        ))}
        {!items.length && (
          <TableRow>
            <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
              当前场次暂无学员记录
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </TableContainer>
);
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
  return (
    <>
      <SectionTitle
        title="经营复盘"
        helper="按单场、周期和课程版本查看目标差异、原因与改进行动。"
        action={canEdit ? (
          <Button variant="contained" disabled={saving || !selectedId} onClick={onSave}>
            保存本场复盘
          </Button>
        ) : undefined}
      />
      <TextField
        select
        size="small"
        label="复盘场次"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
        sx={{ maxWidth: 480 }}
      >
        {sessions.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            {item.title}
          </MenuItem>
        ))}
      </TextField>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        <MetricCard
          label="邀约客户"
          value={invited}
          helper="当前场次"
          color={palette.blue}
          icon={<GroupsIcon />}
        />
        <MetricCard
          label="确认参加"
          value={confirmed}
          helper="已表达参课意向"
          color={palette.purple}
          icon={<TaskAltIcon />}
        />
        <MetricCard
          label="实际到课"
          value={attended}
          helper={`到课率 ${conversion}%`}
          color={palette.green}
          icon={<AutoStoriesIcon />}
        />
        <MetricCard
          label="A类客户"
          value={hot}
          helper="需重点销售跟进"
          color={palette.amber}
          icon={<InsightsIcon />}
        />
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" },
          gap: 2,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <SectionTitle title="复盘结论" />
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            <TextField
              label="本场总结"
              multiline
              minRows={3}
              disabled={!canEdit}
              value={form.summary}
              onChange={(event) => onFormChange({ ...form, summary: event.target.value })}
            />
            <TextField
              label="主要问题"
              multiline
              minRows={3}
              disabled={!canEdit}
              value={form.issues}
              onChange={(event) => onFormChange({ ...form, issues: event.target.value })}
            />
            <TextField
              label="下次改进"
              multiline
              minRows={3}
              disabled={!canEdit}
              value={form.improvements}
              onChange={(event) => onFormChange({ ...form, improvements: event.target.value })}
            />
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <SectionTitle title="改进行动" />
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {detail?.review?.actionItems?.map((item, index) => (
              <Box
                key={`${item.title}-${index}`}
                sx={{ p: 1.2, bgcolor: palette.soft, borderRadius: 1.3 }}
              >
                <Typography variant="body2" fontWeight={800}>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  截止：{formatDate(item.dueAt)}
                </Typography>
              </Box>
            )) || <Typography color="text.secondary">暂无改进行动</Typography>}
          </Stack>
        </Paper>
      </Box>
    </>
  );
};

export default Academy;
