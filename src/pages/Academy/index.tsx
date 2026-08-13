import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import InsightsIcon from "@mui/icons-material/Insights";
import PublishRoundedIcon from "@mui/icons-material/PublishRounded";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import SearchIcon from "@mui/icons-material/Search";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import {
  academyApi,
  customerApi,
  orderApi,
  productApi,
  settingsApi,
} from "../../api";
import type {
  AcademyAssetType,
  AcademyCourse,
  AcademyCourseCategory,
  AcademyCourseAsset,
  AcademyDashboard,
  AcademyEngagement,
  AcademyMyTask,
  AcademyPublicCalendarItem,
  AcademySession,
  AcademySessionDetail,
  AcademySessionTask,
  AcademySopTemplate,
  AcademySopTemplateStep,
  CreateAcademyCourseInput,
  CreateAcademySessionInput,
  SaveAcademyEngagementInput,
  SaveAcademyReviewInput,
} from "../../types/academy";
import type { BusinessAttachment } from "../../types/businessAttachment";
import type { Customer } from "../../types/customer";
import type { Order } from "../../types/order";
import type { Product } from "../../types/product";
import type { User } from "../../types/settings";
import { ROUTES } from "../../shared/utils/constants";
import { hasPermission, PERMISSION_KEYS } from "../../shared/utils/permissions";
import useAuthStore from "../../store/useAuthStore";
import useAppFeedback from "../../shared/hooks/useAppFeedback";
import ProtectedFormDialog from "../../shared/components/ProtectedFormDialog";
import DialogCloseTitle from "../../shared/components/DialogCloseTitle";
import TablePagination from "../../shared/components/TablePagination";
import SystemDataTable from "../../shared/components/SystemDataTable";
import BusinessAttachmentPicker from "../../shared/components/BusinessAttachmentPicker";
import {
  ModuleHeader,
  ModulePage,
  ModuleTabs,
} from "../../shared/components/ModuleShell";
import { Plans } from "./AcademyPlans";
import {
  getAcademyPriorityTask,
  getAcademyPrivateLoadPlan,
  getAcademyWorkbenchSummary,
  getCoursePhaseProgress,
  taskRequiresEvidence,
} from "./academyMvpModel";
import {
  clampPageIndex,
  getCourseStatusAction,
  replaceCourseById,
  updatePendingCourseIds,
} from "./courseWorkspaceModel";

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

type AcademyView = "overview" | "courses" | "plans" | "learners" | "reviews";
const viewPath: Record<AcademyView, string> = {
  overview: ROUTES.ACADEMY,
  courses: `${ROUTES.ACADEMY}/courses`,
  plans: `${ROUTES.ACADEMY}/plans`,
  learners: `${ROUTES.ACADEMY}/learners`,
  reviews: `${ROUTES.ACADEMY}/reviews`,
};
const navItems: Array<{ value: AcademyView; label: string }> = [
  { value: "overview", label: "我的工作台" },
  { value: "courses", label: "课程库" },
  { value: "plans", label: "课程安排" },
  { value: "learners", label: "邀约跟进" },
];

const emptyCourse: CreateAcademyCourseInput = {
  title: "",
  category: "",
  summary: "",
  targetAudience: "",
  customerProblem: "",
  coreViewpoint: "",
  conversionProductId: "",
  ownerUserId: "",
  defaultDurationMinutes: 120,
  objectives: [],
};

const emptySopStep = (index: number): AcademySopTemplateStep => ({
  id: "",
  templateId: "",
  stepKey: `STEP_${index + 1}_${crypto.randomUUID().slice(0, 8)}`,
  title: "",
  category: "BEFORE",
  sortOrder: index + 1,
  assigneeRole: "PROJECT_OWNER",
  dueAnchor: "STARTS_AT",
  dueOffsetMinutes: null,
  completionMode: "CONFIRM",
  requiresReview: false,
  acceptanceCriteria: "",
  isRequired: true,
});
const emptySession: CreateAcademySessionInput = {
  courseId: "",
  title: "",
  startsAt: "",
  endsAt: "",
  deliveryMode: "LIVE",
  venue: "",
  meetingUrl: "",
  capacity: 30,
  inviteTarget: 0,
  registrationTarget: 0,
  attendanceTarget: 0,
  consultationTarget: 0,
  dealTarget: 0,
  targetRevenue: 0,
  audience: "ALL_EMPLOYEES",
  isInvitable: true,
  facilitatorUserId: "",
  lecturerUserId: "",
  collaboratorUserIds: [],
  projectOwnerUserId: "",
  taskReviewerUserId: "",
  contentOwnerUserId: "",
  materialOwnerUserId: "",
  reviewOwnerUserId: "",
  sopTemplateId: "",
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
const assetTypes: Array<{ value: AcademyAssetType; label: string }> = [
  { value: "PPT", label: "课件 PPT" },
  { value: "SCRIPT", label: "逐字稿" },
  { value: "CASE", label: "课程案例" },
  { value: "POSTER", label: "宣传海报" },
  { value: "INVITATION", label: "邀约话术" },
  { value: "REPLAY", label: "直播回放" },
];

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
const deliveryModeLabel: Record<string, string> = {
  OFFLINE: "线下授课",
  LIVE: "直播授课",
  ONLINE: "线上会议",
};
const statusLabel: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "已发布",
  ARCHIVED: "已归档",
  PLANNED: "已排期",
  READY: "待开课",
  IN_PROGRESS: "授课中",
  POST_COURSE: "课后跟进",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  PENDING: "待处理",
  SUBMITTED: "待验收",
  DONE: "已完成",
  REJECTED: "验收驳回",
  BLOCKED: "受阻",
  SKIPPED: "已关闭",
  CONFIRMED: "已确认",
  INVITED: "已邀约",
  REGISTERED: "已报名",
  DECLINED: "已拒绝",
  ATTENDED: "已到课",
  ABSENT: "未到课",
  UNKNOWN: "未确认",
};
const taskStatusLabel: Record<string, string> = {
  PENDING: "待处理",
  IN_PROGRESS: "处理中",
  SUBMITTED: "待验收",
  DONE: "已完成",
  REJECTED: "验收驳回",
  BLOCKED: "受阻",
  SKIPPED: "已关闭",
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
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();
  const [dashboard, setDashboard] = useState<AcademyDashboard>({
    activeCourses: 0,
    upcomingSessions: 0,
    sessionsNeedingAttention: 0,
    pendingFollowUps: 0,
  });
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [sessions, setSessions] = useState<AcademySession[]>([]);
  const [publicCalendar, setPublicCalendar] = useState<
    AcademyPublicCalendarItem[]
  >([]);
  const [myTasks, setMyTasks] = useState<AcademyMyTask[]>([]);
  const [myTaskTotal, setMyTaskTotal] = useState(0);
  const [openTaskTotal, setOpenTaskTotal] = useState(0);
  const [reviewTaskTotal, setReviewTaskTotal] = useState(0);
  const [priorityTasks, setPriorityTasks] = useState<AcademyMyTask[]>([]);
  const [myTaskPage, setMyTaskPage] = useState(0);
  const [myTaskPageSize, setMyTaskPageSize] = useState(10);
  const [myTaskView, setMyTaskView] = useState<"OPEN" | "REVIEW" | "HISTORY">(
    "OPEN",
  );
  const [details, setDetails] = useState<Record<string, AcademySessionDetail>>(
    {},
  );
  const [sessionDetailErrors, setSessionDetailErrors] = useState<
    Record<string, string>
  >({});
  const sessionDetailRequestsRef = useRef<Set<string>>(new Set());
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [detail, setDetail] = useState<AcademySessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseEditingId, setCourseEditingId] = useState("");
  const [courseSettingsOpen, setCourseSettingsOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionEditingId, setSessionEditingId] = useState("");
  const [sessionHistoricalMode, setSessionHistoricalMode] = useState(false);
  const [workbenchRequestedSessionId, setWorkbenchRequestedSessionId] =
    useState("");
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementEditingId, setEngagementEditingId] = useState("");
  const [engagementMode, setEngagementMode] = useState<"sales" | "execution">(
    "sales",
  );
  const [planOpenSessionId, setPlanOpenSessionId] = useState("");
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [academyUsers, setAcademyUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [courseCategories, setCourseCategories] = useState<
    AcademyCourseCategory[]
  >([]);
  const [sopTemplates, setSopTemplates] = useState<AcademySopTemplate[]>([]);
  const [sopSettingsOpen, setSopSettingsOpen] = useState(false);
  const [sopEditing, setSopEditing] = useState<AcademySopTemplate | null>(null);
  const [sopEditingBaseline, setSopEditingBaseline] = useState("");
  const [sopAdvanced, setSopAdvanced] = useState(false);
  const [sopTemplatePage, setSopTemplatePage] = useState(0);
  const [sopTemplatePageSize, setSopTemplatePageSize] = useState(10);
  const [categoryForm, setCategoryForm] = useState({
    id: "",
    name: "",
    description: "",
    sortOrder: 1,
    isActive: true,
  });
  const [sessionForm, setSessionForm] = useState(emptySession);
  const [engagementForm, setEngagementForm] = useState(emptyEngagement);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [selectedInviteCustomers, setSelectedInviteCustomers] = useState<
    Customer[]
  >([]);
  const [customerResultTotal, setCustomerResultTotal] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);
  const [customerPageSize, setCustomerPageSize] = useState(20);
  const [customerLoadError, setCustomerLoadError] = useState("");
  const [courseAssets, setCourseAssets] = useState<
    Record<string, AcademyCourseAsset[]>
  >({});
  const [courseAssetsLoadingIds, setCourseAssetsLoadingIds] = useState<
    Set<string>
  >(new Set());
  const [courseAssetLoadErrors, setCourseAssetLoadErrors] = useState<
    Record<string, string>
  >({});
  const courseAssetRequestsRef = useRef<Set<string>>(new Set());
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetCourseId, setAssetCourseId] = useState("");
  const [assetType, setAssetType] = useState<AcademyAssetType>("PPT");
  const [assetTitle, setAssetTitle] = useState("");
  const [existingAssetAttachments, setExistingAssetAttachments] = useState<
    BusinessAttachment[]
  >([]);
  const [assetAttachments, setAssetAttachments] = useState<
    BusinessAttachment[]
  >([]);
  const [taskAction, setTaskAction] = useState<{
    task: AcademySessionTask;
    status: AcademySessionTask["status"];
  } | null>(null);
  const [taskActionNote, setTaskActionNote] = useState("");
  const [workbenchTask, setWorkbenchTask] = useState<AcademyMyTask | null>(
    null,
  );
  const [workbenchTaskNote, setWorkbenchTaskNote] = useState("");
  const [taskEvidenceAttachments, setTaskEvidenceAttachments] = useState<
    BusinessAttachment[]
  >([]);
  const [taskEvidenceLoading, setTaskEvidenceLoading] = useState(false);
  const [taskEvidenceUploading, setTaskEvidenceUploading] = useState(false);
  const activeTaskEvidenceIdRef = useRef("");
  const taskEvidenceAttachmentsRef = useRef<BusinessAttachment[]>([]);
  const [orderLink, setOrderLink] = useState<{
    engagement: AcademyEngagement;
    orders: Order[];
  } | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [courseStatusChangingIds, setCourseStatusChangingIds] = useState<
    Set<string>
  >(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const selectedSessionCourse = courses.find(
    (course) => course.id === sessionForm.courseId,
  );
  const selectedSessionTemplate = sopTemplates.find(
    (template) => template.id === sessionForm.sopTemplateId,
  );
  const selectedSessionSnapshotTasks = sessionEditingId
    ? details[sessionEditingId]?.tasks || []
    : [];
  const selectedSessionRoles = new Set(
    selectedSessionTemplate?.steps.map((step) => step.assigneeRole) ||
      (selectedSessionSnapshotTasks
        .map((task) => task.assigneeRole)
        .filter(Boolean) as AcademySopTemplateStep["assigneeRole"][]),
  );
  const sessionOwnerFields: Array<
    [
      keyof CreateAcademySessionInput,
      string,
      AcademySopTemplateStep["assigneeRole"] | "ALWAYS",
    ]
  > = [
    ["projectOwnerUserId", "项目负责人 *", "ALWAYS"],
    ["taskReviewerUserId", "任务验收人 *", "ALWAYS"],
    ["contentOwnerUserId", "课程内容负责人 *", "CONTENT_OWNER"],
    ["materialOwnerUserId", "素材负责人 *", "MATERIAL_OWNER"],
    ["lecturerUserId", "主讲人 *", "LECTURER"],
    ["reviewOwnerUserId", "复盘负责人 *", "REVIEW_OWNER"],
  ];
  const visibleSessionOwnerFields = sessionOwnerFields.filter(
    ([, , role]) => role === "ALWAYS" || selectedSessionRoles.has(role),
  );
  const missingSessionOwner = visibleSessionOwnerFields.some(
    ([key]) => !String(sessionForm[key] || "").trim(),
  );

  const view: AcademyView = location.pathname.endsWith("/plans")
    ? "plans"
    : location.pathname.endsWith("/courses")
      ? "courses"
      : location.pathname.endsWith("/learners") ||
          location.pathname.endsWith("/engagements") ||
          location.pathname.endsWith("/handoffs")
        ? "learners"
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
    if (item.value === "overview") return true;
    if (item.value === "plans")
      return (
        hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE) ||
        hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE) ||
        hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE)
      );
    if (item.value === "courses")
      return hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE);
    if (item.value === "learners")
      return hasPermission(
        currentUser,
        PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
      );
    return false;
  });
  const selectedDetail = details[selectedSessionId];
  const taskActionCanEditEvidence = Boolean(
    taskAction?.status === "SUBMITTED" &&
    taskAction.task.assigneeUserId === currentUser?.id,
  );

  useEffect(() => {
    if (location.pathname.endsWith("/sessions"))
      navigate(viewPath.plans, { replace: true });
    if (
      location.pathname.endsWith("/engagements") ||
      location.pathname.endsWith("/handoffs")
    )
      navigate(viewPath.learners, { replace: true });
    if (location.pathname.endsWith("/reviews"))
      navigate(viewPath.plans, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!courseOpen) return;
    setCourseForm((current) => ({
      ...current,
      ownerUserId: current.ownerUserId || currentUser?.id || "",
    }));
    void Promise.all([
      settingsApi.fetchAssignableUsers({ isActive: true }),
      productApi.getProducts(),
    ]).then(([usersResponse, productsResponse]) => {
      if (usersResponse.code === 0)
        setAcademyUsers(usersResponse.data.filter((item) => item.isActive));
      if (productsResponse.code === 0) setProducts(productsResponse.data);
    });
  }, [courseOpen, currentUser?.id]);
  useEffect(() => {
    if (!sessionOpen) return;
    void settingsApi
      .fetchAssignableUsers({ isActive: true })
      .then((response) => {
        if (response.code === 0)
          setAcademyUsers(response.data.filter((item) => item.isActive));
      });
  }, [sessionOpen]);
  useEffect(() => {
    if (visibleNavItems.some((item) => item.value === view)) return;
    const fallback = visibleNavItems[0];
    if (fallback) navigate(viewPath[fallback.value], { replace: true });
  }, [navigate, view, visibleNavItems]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    const calendarStart = new Date();
    const calendarWeekday = calendarStart.getDay() || 7;
    calendarStart.setDate(calendarStart.getDate() - calendarWeekday + 1);
    calendarStart.setHours(0, 0, 0, 0);
    const calendarEnd = new Date(calendarStart);
    calendarStart.setDate(calendarStart.getDate() - 42);
    calendarEnd.setDate(calendarEnd.getDate() + 42);
    const currentTaskRequest = academyApi.listMyTasks({
      page: myTaskPage + 1,
      pageSize: myTaskPageSize,
      status: myTaskView,
    });
    const openTaskRequest = academyApi.listMyTasks({
      page: 1,
      pageSize: 100,
      status: "OPEN",
    });
    const reviewTaskRequest =
      myTaskView === "REVIEW"
        ? currentTaskRequest
        : academyApi.listMyTasks({ page: 1, pageSize: 1, status: "REVIEW" });
    const [
      publicCalendarResponse,
      myTaskResponse,
      openTaskResponse,
      reviewTaskResponse,
    ] = await Promise.all([
      academyApi.getPublicCalendar({
        start: calendarStart.toISOString(),
        end: calendarEnd.toISOString(),
      }),
      currentTaskRequest,
      openTaskRequest,
      reviewTaskRequest,
    ]);
    if (publicCalendarResponse.code === 0)
      setPublicCalendar(publicCalendarResponse.data);
    if (myTaskResponse.code === 0) {
      setMyTasks(myTaskResponse.data.items);
      setMyTaskTotal(myTaskResponse.data.total);
    }
    if (openTaskResponse.code === 0) {
      setOpenTaskTotal(openTaskResponse.data.total);
      const remainingOpenTaskPages = Math.max(
        0,
        Math.ceil(openTaskResponse.data.total / 100) - 1,
      );
      const remainingOpenTaskResponses = remainingOpenTaskPages
        ? await Promise.all(
            Array.from({ length: remainingOpenTaskPages }, (_, index) =>
              academyApi.listMyTasks({
                page: index + 2,
                pageSize: 100,
                status: "OPEN",
              }),
            ),
          )
        : [];
      setPriorityTasks([
        ...openTaskResponse.data.items,
        ...remainingOpenTaskResponses.flatMap((response) =>
          response.code === 0 ? response.data.items : [],
        ),
      ]);
    }
    if (reviewTaskResponse.code === 0)
      setReviewTaskTotal(reviewTaskResponse.data.total);
    const privateLoadPlan = getAcademyPrivateLoadPlan({
      plan: hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE),
      course: hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE),
      session: hasPermission(
        currentUser,
        PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
      ),
      engagement: hasPermission(
        currentUser,
        PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
      ),
      review: hasPermission(currentUser, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE),
    });
    if (!privateLoadPlan.dashboard) {
      setLoading(false);
      return;
    }
    const [
      dashboardResponse,
      courseResponse,
      sessionResponse,
      categoryResponse,
      sopResponse,
    ] = await Promise.all([
      privateLoadPlan.dashboard
        ? academyApi.getDashboard()
        : Promise.resolve(null),
      privateLoadPlan.courses
        ? academyApi.listCourses({ page: 1, pageSize: 100 })
        : Promise.resolve(null),
      privateLoadPlan.sessions
        ? academyApi.listSessions({ page: 1, pageSize: 100 })
        : Promise.resolve(null),
      privateLoadPlan.categories
        ? academyApi.listCourseCategories()
        : Promise.resolve(null),
      privateLoadPlan.templates
        ? academyApi.listSopTemplates()
        : Promise.resolve(null),
    ]);
    const loadErrors: string[] = [];
    if (dashboardResponse) {
      if (dashboardResponse.code === 0) setDashboard(dashboardResponse.data);
      else loadErrors.push(`工作台：${dashboardResponse.message}`);
    }
    if (courseResponse) {
      if (courseResponse.code === 0) {
        setCourses(courseResponse.data.items);
        if (!selectedCourseId && courseResponse.data.items[0])
          setSelectedCourseId(courseResponse.data.items[0].id);
      } else loadErrors.push(`课程列表：${courseResponse.message}`);
    }
    if (categoryResponse) {
      if (categoryResponse.code === 0)
        setCourseCategories(categoryResponse.data);
      else loadErrors.push(`课程分类：${categoryResponse.message}`);
    }
    if (sopResponse) {
      if (sopResponse.code === 0) setSopTemplates(sopResponse.data);
      else loadErrors.push(`课程流程：${sopResponse.message}`);
    }
    if (sessionResponse) {
      if (sessionResponse.code !== 0) {
        loadErrors.push(`课程安排：${sessionResponse.message}`);
      } else {
        const remainingSessionPages = Math.max(
          0,
          Math.ceil(sessionResponse.data.total / 100) - 1,
        );
        const remainingSessionResponses = remainingSessionPages
          ? await Promise.all(
              Array.from({ length: remainingSessionPages }, (_, index) =>
                academyApi.listSessions({ page: index + 2, pageSize: 100 }),
              ),
            )
          : [];
        const failedSessionPage = remainingSessionResponses.find(
          (response) => response.code !== 0,
        );
        if (failedSessionPage && failedSessionPage.code !== 0) {
          loadErrors.push(`课程安排：${failedSessionPage.message}`);
        } else {
          const allSessions = [
            ...sessionResponse.data.items,
            ...remainingSessionResponses.flatMap((response) =>
              response.code === 0 ? response.data.items : [],
            ),
          ];
          setSessions(allSessions);
          if (!selectedSessionId && allSessions[0])
            setSelectedSessionId(allSessions[0].id);
        }
      }
    }
    setLoading(false);
    if (loadErrors.length)
      await alert(loadErrors.join("\n"), "部分商学院数据加载失败");
  }, [
    alert,
    canCourse,
    canEngagement,
    canPlan,
    canReview,
    canSession,
    currentUser,
    myTaskPage,
    myTaskPageSize,
    myTaskView,
    selectedCourseId,
    selectedSessionId,
  ]);

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
      if (sessionDetailRequestsRef.current.has(sessionId)) return;
      sessionDetailRequestsRef.current.add(sessionId);
      try {
        const response = await academyApi.getSessionDetail(sessionId);
        if (response.code !== 0) {
          setSessionDetailErrors((current) => ({
            ...current,
            [sessionId]: response.message,
          }));
          if (open) await alert(response.message, "课程安排详情加载失败");
          return;
        }
        setDetails((current) => ({ ...current, [sessionId]: response.data }));
        setSessionDetailErrors((current) => {
          const next = { ...current };
          delete next[sessionId];
          return next;
        });
        if (open) setDetail(response.data);
      } catch {
        const message = "课程安排详情加载失败，请重试。";
        setSessionDetailErrors((current) => ({
          ...current,
          [sessionId]: message,
        }));
        if (open) await alert(message, "课程安排详情加载失败");
      } finally {
        sessionDetailRequestsRef.current.delete(sessionId);
      }
    },
    [alert],
  );

  const loadCourseAssets = useCallback(
    async (courseId: string) => {
      if (!courseId) return;
      if (courseAssetRequestsRef.current.has(courseId)) return;
      courseAssetRequestsRef.current.add(courseId);
      setCourseAssetsLoadingIds((current) =>
        updatePendingCourseIds(current, courseId, true),
      );
      setCourseAssetLoadErrors((current) => {
        const next = { ...current };
        delete next[courseId];
        return next;
      });
      try {
        const response = await academyApi.listCourseAssets(courseId);
        if (response.code !== 0) {
          setCourseAssetLoadErrors((current) => ({
            ...current,
            [courseId]: response.message,
          }));
          await alert(response.message, "课程资产加载失败");
          return;
        }
        setCourseAssets((current) => ({
          ...current,
          [courseId]: response.data,
        }));
      } catch {
        const message = "课程资产加载失败，请重试。";
        setCourseAssetLoadErrors((current) => ({
          ...current,
          [courseId]: message,
        }));
        await alert(message, "课程资产加载失败");
      } finally {
        courseAssetRequestsRef.current.delete(courseId);
        setCourseAssetsLoadingIds((current) =>
          updatePendingCourseIds(current, courseId, false),
        );
      }
    },
    [alert],
  );

  useEffect(() => {
    if (
      (view === "learners" || view === "reviews") &&
      selectedSessionId &&
      !details[selectedSessionId]
    )
      void loadDetail(selectedSessionId);
  }, [details, loadDetail, selectedSessionId, view]);
  useEffect(() => {
    if (!engagementOpen || engagementMode !== "sales" || !canEngagement) return;
    let active = true;
    setCustomerSearchLoading(true);
    setCustomerLoadError("");
    const timer = window.setTimeout(() => {
      void customerApi
        .fetchCustomers({
          page: customerPage + 1,
          pageSize: customerPageSize,
          search: customerSearch.trim() || undefined,
        })
        .then((response) => {
          if (active && response.code === 0) {
            setCustomers(response.data.items);
            setCustomerResultTotal(response.data.pagination.total);
          } else if (active) {
            setCustomers([]);
            setCustomerResultTotal(0);
            setCustomerLoadError(response.message || "CRM客户加载失败，请重试");
          }
        })
        .catch(() => {
          if (active) {
            setCustomers([]);
            setCustomerResultTotal(0);
            setCustomerLoadError("CRM客户加载失败，请重试");
          }
        })
        .finally(() => {
          if (active) setCustomerSearchLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    canEngagement,
    customerPage,
    customerPageSize,
    customerSearch,
    engagementMode,
    engagementOpen,
  ]);
  useEffect(() => {
    setCustomerPage(0);
  }, [customerSearch]);
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

  const filteredSessions = useMemo(
    () =>
      sessions.filter((item) =>
        `${item.title}${item.course?.title || ""}${item.venue}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search, sessions],
  );
  const pagedSessions = filteredSessions.slice(
    page * pageSize,
    page * pageSize + pageSize,
  );
  const engagementSessions = useMemo(
    () =>
      sessions.filter(
        (item) =>
          item.audience === "ALL_EMPLOYEES" &&
          item.isInvitable &&
          item.status !== "CANCELLED",
      ),
    [sessions],
  );
  const invitableSessions = useMemo(
    () =>
      sessions.filter(
        (item) =>
          item.audience === "ALL_EMPLOYEES" &&
          item.isInvitable &&
          ["PLANNED", "READY"].includes(item.status),
      ),
    [sessions],
  );
  useEffect(() => {
    if (view !== "learners") return;
    if (engagementSessions.some((item) => item.id === selectedSessionId))
      return;
    const nextId = engagementSessions[0]?.id || "";
    setSelectedSessionId(nextId);
    if (nextId && !details[nextId]) void loadDetail(nextId);
  }, [details, engagementSessions, loadDetail, selectedSessionId, view]);
  const selectedEngagements = selectedDetail?.engagements || [];
  const existingInviteCustomerIds = useMemo(
    () =>
      new Set(
        selectedEngagements
          .map((item) => item.customerId)
          .filter((id): id is string => Boolean(id)),
      ),
    [selectedEngagements],
  );
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
    const response = courseEditingId
      ? await academyApi.updateCourse(courseEditingId, courseForm)
      : await academyApi.createCourse(courseForm);
    setSaving(false);
    if (response.code !== 0)
      return alert(
        response.message,
        courseEditingId ? "课程保存失败" : "课程创建失败",
      );
    setCourseOpen(false);
    setCourseEditingId("");
    setCourseForm(emptyCourse);
    await loadBase();
  };
  const openCourseCreate = () => {
    setCourseEditingId("");
    setCourseForm({ ...emptyCourse, ownerUserId: currentUser?.id || "" });
    setCourseOpen(true);
  };
  const openCourseEdit = (course: AcademyCourse) => {
    setCourseEditingId(course.id);
    setCourseForm({
      title: course.title,
      category: course.category,
      summary: course.summary || "",
      targetAudience: course.targetAudience || "",
      customerProblem: course.customerProblem || "",
      coreViewpoint: course.coreViewpoint || "",
      conversionProductId: course.conversionProductId || "",
      ownerUserId: course.ownerUserId,
      defaultDurationMinutes: course.defaultDurationMinutes,
      objectives: course.objectives || [],
    });
    setCourseOpen(true);
  };
  const saveCourseCategory = async () => {
    setSaving(true);
    const response = await academyApi.saveCourseCategory(categoryForm);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "课程分类保存失败");
    setCategoryForm({
      id: "",
      name: "",
      description: "",
      sortOrder: courseCategories.length + 1,
      isActive: true,
    });
    setCourseSettingsOpen(false);
    await loadBase();
  };
  const openSopTemplateList = () => {
    setSopEditing(null);
    setSopEditingBaseline("");
    setSopAdvanced(false);
    setSopTemplatePage(0);
    setSopSettingsOpen(true);
  };
  const openSopSettings = (template?: AcademySopTemplate) => {
    const draft: AcademySopTemplate = template
      ? { ...template, steps: template.steps.map((step) => ({ ...step })) }
      : {
          id: "",
          name: "",
          description: "",
          status: "ACTIVE",
          isDefault: !sopTemplates.length,
          steps: [emptySopStep(0)],
          updatedAt: "",
        };
    setSopEditing(draft);
    setSopEditingBaseline(JSON.stringify(draft));
    setSopAdvanced(false);
    setSopSettingsOpen(true);
  };
  const closeSopSettings = async (toList = false) => {
    if (sopEditing && JSON.stringify(sopEditing) !== sopEditingBaseline) {
      const discard = await confirm(
        "当前课程流程还有未保存内容，确定放弃吗？",
        "放弃流程修改",
      );
      if (!discard) return;
    }
    setSopEditing(null);
    setSopEditingBaseline("");
    setSopAdvanced(false);
    if (!toList) setSopSettingsOpen(false);
  };
  const saveSopTemplate = async () => {
    if (!sopEditing) return;
    setSaving(true);
    const response = await academyApi.saveSopTemplate({
      id: sopEditing.id,
      name: sopEditing.name,
      description: sopEditing.description,
      status: sopEditing.status,
      isDefault: sopEditing.isDefault,
      steps: sopEditing.steps.map((step, index) => ({
        ...step,
        sortOrder: index + 1,
      })),
    });
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "课程流程保存失败");
    setSopEditing(null);
    setSopEditingBaseline("");
    await loadBase();
  };
  const changeSopTemplateStatus = async (template: AcademySopTemplate) => {
    const nextStatus = template.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (nextStatus === "INACTIVE") {
      const approved = await confirm(
        `确定停用“${template.name}”吗？停用后新建课程安排不能再选择它。`,
        "停用课程流程",
      );
      if (!approved) return;
    }
    setSaving(true);
    const response = await academyApi.saveSopTemplate({
      ...template,
      status: nextStatus,
    });
    setSaving(false);
    if (response.code !== 0)
      return alert(
        response.message,
        nextStatus === "ACTIVE" ? "课程流程启用失败" : "课程流程停用失败",
      );
    await loadBase();
  };
  const setDefaultSopTemplate = async (template: AcademySopTemplate) => {
    if (template.isDefault || template.status !== "ACTIVE") return;
    const approved = await confirm(
      `确定将“${template.name}”设为默认课程流程吗？新建课程安排会优先选择它。`,
      "设为默认课程流程",
    );
    if (!approved) return;
    setSaving(true);
    const response = await academyApi.saveSopTemplate({
      ...template,
      isDefault: true,
    });
    setSaving(false);
    if (response.code !== 0)
      return alert(response.message, "默认课程流程设置失败");
    await loadBase();
  };
  const deleteSopTemplate = async (template: AcademySopTemplate) => {
    const approved = await confirm(
      `确定删除“${template.name}”吗？删除后无法恢复。`,
      "删除课程流程",
    );
    if (!approved) return;
    setSaving(true);
    const response = await academyApi.deleteSopTemplate(template.id);
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "课程流程删除失败");
    const remaining = Math.max(0, sopTemplates.length - 1);
    const lastPage = Math.max(
      0,
      Math.ceil(remaining / sopTemplatePageSize) - 1,
    );
    setSopTemplatePage((page) => Math.min(page, lastPage));
    await loadBase();
  };
  const moveSopStep = (index: number, direction: -1 | 1) => {
    if (!sopEditing) return;
    const target = index + direction;
    if (target < 0 || target >= sopEditing.steps.length) return;
    const steps = [...sopEditing.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setSopEditing({
      ...sopEditing,
      steps: steps.map((step, itemIndex) => ({
        ...step,
        sortOrder: itemIndex + 1,
      })),
    });
  };
  const saveSession = async () => {
    if (
      !sessionHistoricalMode &&
      !sessionEditingId &&
      new Date(sessionForm.startsAt).getTime() < Date.now()
    )
      return alert(
        "正常排期不能选择过去时间；历史课程请使用“补录历史课程”。",
        "课程时间不正确",
      );
    setSaving(true);
    const input = { ...sessionForm };
    const response = sessionEditingId
      ? await academyApi.updateSession(sessionEditingId, input)
      : sessionHistoricalMode
        ? await academyApi.createHistoricalSession(input)
        : await academyApi.createSession(input);
    setSaving(false);
    if (response.code !== 0)
      return alert(
        /Backend request failed/i.test(response.message)
          ? "课程安排保存失败，请刷新页面后重试。"
          : response.message,
        sessionEditingId ? "课程安排更新失败" : "课程安排创建失败",
      );
    setSessionOpen(false);
    setSessionEditingId("");
    setSessionHistoricalMode(false);
    setSessionForm(emptySession);
    await loadBase();
  };
  const changeSessionStatus = async (
    session: AcademySession,
    status: AcademySession["status"],
  ) => {
    if (saving) return;
    if (status === "CANCELLED") {
      const approved = await confirm(
        `确定取消“${session.title}”吗？取消后不会进入工作台。`,
        "取消课程安排",
      );
      if (!approved) return;
    }
    if (status === "COMPLETED") {
      const approved = await confirm(
        `确定“${session.title}”已经结束吗？确认后将进入已完结课程，可填写复盘。`,
        "结束课程",
      );
      if (!approved) return;
    }
    if (status === "POST_COURSE") {
      const approved = await confirm(
        `确定“${session.title}”已经结束授课吗？确认后将进入课后跟进，课后负责人可以开始处理任务。`,
        "结束授课",
      );
      if (!approved) return;
    }
    setSaving(true);
    try {
      const response = await academyApi.changeSessionStatus(session.id, status);
      if (response.code !== 0) {
        await alert(response.message, "课程安排状态更新失败");
        return;
      }
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id ? { ...item, ...response.data } : item,
        ),
      );
      setPublicCalendar((current) =>
        current.map((item) =>
          item.id === session.id
            ? { ...item, status: response.data.status }
            : item,
        ),
      );
      await loadDetail(session.id);
    } finally {
      setSaving(false);
    }
  };
  const openSessionCreate = (course?: AcademyCourse, date?: Date) => {
    const startsAt = date ? new Date(date) : new Date(Date.now() + 60 * 60_000);
    startsAt.setSeconds(0, 0);
    if (date) startsAt.setHours(19, 30, 0, 0);
    const durationMinutes = course?.defaultDurationMinutes || 120;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const toLocalInput = (value: Date) => {
      const offset = value.getTimezoneOffset() * 60_000;
      return new Date(value.getTime() - offset).toISOString().slice(0, 16);
    };
    setSessionForm({
      ...emptySession,
      courseId: course?.id || "",
      title: course
        ? `${course.title}｜${startsAt.toLocaleDateString("zh-CN")}`
        : "",
      startsAt: toLocalInput(startsAt),
      endsAt: toLocalInput(endsAt),
      facilitatorUserId: "",
      projectOwnerUserId: "",
      contentOwnerUserId: "",
      materialOwnerUserId: "",
      lecturerUserId: "",
      reviewOwnerUserId: "",
      sopTemplateId:
        sopTemplates.find((item) => item.isDefault && item.status === "ACTIVE")
          ?.id || "",
    });
    setSessionEditingId("");
    setSessionHistoricalMode(false);
    setSessionOpen(true);
  };
  const openHistoricalSessionCreate = () => {
    const startsAt = new Date(Date.now() - 24 * 60 * 60_000);
    startsAt.setMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 120 * 60_000);
    const toLocalInput = (value: Date) =>
      new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
    setSessionEditingId("");
    setSessionHistoricalMode(true);
    setSessionForm({
      ...emptySession,
      startsAt: toLocalInput(startsAt),
      endsAt: toLocalInput(endsAt),
      sopTemplateId:
        sopTemplates.find((item) => item.isDefault && item.status === "ACTIVE")
          ?.id || "",
    });
    setSessionOpen(true);
  };
  const openSessionEdit = async (session: AcademySession) => {
    const toLocalInput = (value: string) => {
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
    };
    let sessionDetail = details[session.id];
    if (!sessionDetail) {
      const response = await academyApi.getSessionDetail(session.id);
      if (response.code !== 0)
        return alert(response.message, "课程安排加载失败");
      sessionDetail = response.data;
      setDetails((current) => ({ ...current, [session.id]: response.data }));
    }
    const tasks = sessionDetail.tasks;
    const ownerFor = (role: AcademySopTemplateStep["assigneeRole"]) =>
      tasks.find((task) => task.assigneeRole === role)?.assigneeUserId || "";
    setSessionEditingId(session.id);
    setSessionHistoricalMode(new Date(session.startsAt).getTime() < Date.now());
    setSessionForm({
      ...emptySession,
      courseId: session.courseId,
      title: session.title,
      startsAt: toLocalInput(session.startsAt),
      endsAt: toLocalInput(session.endsAt),
      deliveryMode: session.deliveryMode,
      venue: session.venue || "",
      meetingUrl: session.meetingUrl || "",
      capacity: session.capacity,
      inviteTarget: session.inviteTarget,
      registrationTarget: session.registrationTarget,
      attendanceTarget: session.attendanceTarget,
      consultationTarget: session.consultationTarget,
      dealTarget: session.dealTarget,
      targetRevenue: session.targetRevenue,
      audience: session.audience || "ALL_EMPLOYEES",
      isInvitable: session.isInvitable !== false,
      facilitatorUserId: session.facilitatorUserId || "",
      projectOwnerUserId: session.facilitatorUserId || "",
      taskReviewerUserId:
        session.taskReviewerUserId || session.facilitatorUserId || "",
      lecturerUserId: session.lecturerUserId || ownerFor("LECTURER"),
      contentOwnerUserId: ownerFor("CONTENT_OWNER"),
      materialOwnerUserId: ownerFor("MATERIAL_OWNER"),
      reviewOwnerUserId: ownerFor("REVIEW_OWNER"),
      collaboratorUserIds: session.collaboratorUserIds || [],
      sopTemplateId: tasks[0]?.sopTemplateId || "",
    });
    setSessionOpen(true);
  };
  const changeCourseStatus = async (
    course: AcademyCourse,
    status: AcademyCourse["status"],
  ) => {
    const action = getCourseStatusAction(course);
    if (action.nextStatus !== status) return;
    if (courseStatusChangingIds.has(course.id)) return;
    if (action.confirmationRequired) {
      const confirmed = await confirm(
        action.label === "发布"
          ? `发布后课程将可用于课程安排，确认发布“${course.title}”吗？`
          : `归档后将不能再新建课程安排，确认归档“${course.title}”吗？`,
        `确认${action.label}课程`,
        { confirmText: `确认${action.label}` },
      );
      if (!confirmed) return;
    }
    setCourseStatusChangingIds((current) =>
      updatePendingCourseIds(current, course.id, true),
    );
    try {
      const response = await academyApi.changeCourseStatus(course.id, status);
      if (response.code !== 0) {
        await alert(response.message, "课程状态更新失败");
        return;
      }
      setCourses((current) => replaceCourseById(current, response.data));
      const activeDelta =
        Number(response.data.status === "ACTIVE") -
        Number(course.status === "ACTIVE");
      if (activeDelta) {
        setDashboard((current) => ({
          ...current,
          activeCourses: Math.max(0, current.activeCourses + activeDelta),
        }));
      }
      await alert(`课程已${action.label}`, "课程状态更新成功");
    } catch {
      await alert("请检查网络连接后重试。", "课程状态更新失败");
    } finally {
      setCourseStatusChangingIds((current) =>
        updatePendingCourseIds(current, course.id, false),
      );
    }
  };
  const updateTask = async (
    task: AcademySessionTask,
    status: AcademySessionTask["status"],
    note = "",
  ) => {
    if (saving) return;
    if (status === "SUBMITTED") {
      if (taskEvidenceLoading || taskEvidenceUploading) return;
      if (
        taskRequiresEvidence(task) &&
        !taskEvidenceAttachmentsRef.current.length
      ) {
        await alert("该节点需至少上传1个交付文件后才能提交。", "缺少交付文件");
        return;
      }
    }
    setSaving(true);
    try {
      const response = await academyApi.updateTask(task.id, {
        status,
        ...(status === "SUBMITTED" ? { submissionNote: note } : {}),
        ...(status === "DONE" || status === "REJECTED"
          ? { reviewNote: note }
          : {}),
      });
      if (response.code !== 0)
        return alert(response.message, "任务状态更新失败");
      setTaskAction(null);
      setTaskActionNote("");
      activeTaskEvidenceIdRef.current = "";
      taskEvidenceAttachmentsRef.current = [];
      setTaskEvidenceAttachments([]);
      setTaskEvidenceUploading(false);
      if (detail) await loadDetail(detail.id, true);
      else if (selectedSessionId) await loadDetail(selectedSessionId);
    } catch {
      await alert("请检查网络连接后重试。", "任务状态更新失败");
    } finally {
      setSaving(false);
    }
  };
  const updateWorkbenchTask = async (
    task: AcademyMyTask,
    status: AcademySessionTask["status"],
  ) => {
    if (saving) return;
    if (status === "SUBMITTED") {
      if (taskEvidenceLoading || taskEvidenceUploading) return;
      if (
        taskRequiresEvidence(task) &&
        !taskEvidenceAttachmentsRef.current.length
      ) {
        await alert("该节点需至少上传1个交付文件后才能提交。", "缺少交付文件");
        return;
      }
    }
    setSaving(true);
    try {
      const response = await academyApi.updateTask(task.id, {
        status,
        ...(status === "SUBMITTED"
          ? { submissionNote: workbenchTaskNote.trim() }
          : {}),
        ...(status === "DONE" || status === "REJECTED"
          ? { reviewNote: workbenchTaskNote.trim() }
          : {}),
      });
      if (response.code !== 0) return alert(response.message, "任务更新失败");
      const nextTask = { ...task, ...response.data, session: task.session };
      setWorkbenchTask(nextTask);
      setMyTasks((current) =>
        current.map((item) => (item.id === task.id ? nextTask : item)),
      );
      setPublicCalendar((current) =>
        current.map((session) => {
          if (session.id !== task.session.id) return session;
          const sessionTasks = session.tasks.map((item) =>
            item.taskId === task.id
              ? { ...item, status: response.data.status }
              : item,
          );
          const done = sessionTasks.filter((item) =>
            ["DONE", "SKIPPED"].includes(item.status),
          ).length;
          return {
            ...session,
            tasks: sessionTasks,
            currentStep: sessionTasks.find(
              (item) => !["DONE", "SKIPPED"].includes(item.status),
            ),
            progress: {
              done,
              total: sessionTasks.length,
              percent: sessionTasks.length
                ? Math.round((done / sessionTasks.length) * 100)
                : 0,
            },
          };
        }),
      );
      setWorkbenchTaskNote("");
      if (["DONE", "REJECTED", "SUBMITTED"].includes(status)) void loadBase();
    } catch {
      await alert("请检查网络连接后重试。", "任务更新失败");
    } finally {
      setSaving(false);
    }
  };
  const loadTaskEvidence = useCallback(
    async (taskId: string) => {
      activeTaskEvidenceIdRef.current = taskId;
      taskEvidenceAttachmentsRef.current = [];
      setTaskEvidenceAttachments([]);
      setTaskEvidenceUploading(false);
      setTaskEvidenceLoading(true);
      try {
        const response = await academyApi.listTaskAttachments(taskId);
        if (activeTaskEvidenceIdRef.current !== taskId) return;
        if (response.code !== 0) {
          taskEvidenceAttachmentsRef.current = [];
          setTaskEvidenceAttachments([]);
          await alert(response.message, "交付文件加载失败");
          return;
        }
        taskEvidenceAttachmentsRef.current = response.data;
        setTaskEvidenceAttachments(response.data);
      } catch {
        if (activeTaskEvidenceIdRef.current !== taskId) return;
        taskEvidenceAttachmentsRef.current = [];
        setTaskEvidenceAttachments([]);
        await alert("请检查网络连接后重试。", "交付文件加载失败");
      } finally {
        if (activeTaskEvidenceIdRef.current === taskId)
          setTaskEvidenceLoading(false);
      }
    },
    [alert],
  );
  const replaceTaskEvidenceState = (
    taskId: string,
    attachments: BusinessAttachment[],
  ) => {
    if (activeTaskEvidenceIdRef.current !== taskId) return;
    taskEvidenceAttachmentsRef.current = attachments;
    setTaskEvidenceAttachments(attachments);
  };
  const syncTaskEvidence = (
    taskId: string,
    attachments: BusinessAttachment[],
  ) => {
    setWorkbenchTask((current) =>
      current?.id === taskId ? { ...current, attachments } : current,
    );
    setMyTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, attachments } : task,
      ),
    );
    setDetails((current) =>
      Object.fromEntries(
        Object.entries(current).map(([sessionId, sessionDetail]) => [
          sessionId,
          {
            ...sessionDetail,
            tasks: sessionDetail.tasks.map((task) =>
              task.id === taskId ? { ...task, attachments } : task,
            ),
          },
        ]),
      ),
    );
  };
  const bindTaskEvidence = async (
    taskId: string,
    attachment: BusinessAttachment,
  ) => {
    if (activeTaskEvidenceIdRef.current !== taskId) return false;
    try {
      const byId = new Map(
        taskEvidenceAttachmentsRef.current.map((item) => [item.id, item]),
      );
      byId.set(attachment.id, attachment);
      const response = await academyApi.addTaskAttachment(
        taskId,
        Array.from(byId.keys()),
      );
      if (activeTaskEvidenceIdRef.current !== taskId) return false;
      if (response.code !== 0) {
        await alert(response.message, "交付文件关联失败");
        return false;
      }
      replaceTaskEvidenceState(taskId, response.data);
      syncTaskEvidence(taskId, response.data);
      return true;
    } catch {
      if (activeTaskEvidenceIdRef.current === taskId)
        await alert("请检查网络连接后重试。", "交付文件关联失败");
      return false;
    }
  };
  const unbindTaskEvidence = async (
    taskId: string,
    attachment: BusinessAttachment,
  ) => {
    if (activeTaskEvidenceIdRef.current !== taskId) return false;
    try {
      const remainingIds = taskEvidenceAttachmentsRef.current
        .filter((item) => item.id !== attachment.id)
        .map((item) => item.id);
      const response = await academyApi.removeTaskAttachment(
        taskId,
        remainingIds,
      );
      if (activeTaskEvidenceIdRef.current !== taskId) return false;
      if (response.code !== 0) {
        await alert(response.message, "交付文件删除失败");
        return false;
      }
      replaceTaskEvidenceState(taskId, response.data);
      syncTaskEvidence(taskId, response.data);
      return true;
    } catch {
      if (activeTaskEvidenceIdRef.current === taskId)
        await alert("请检查网络连接后重试。", "交付文件删除失败");
      return false;
    }
  };
  const openTaskAction = (
    task: AcademySessionTask,
    status: AcademySessionTask["status"],
  ) => {
    if (status === "IN_PROGRESS") {
      void updateTask(task, status);
      return;
    }
    setTaskAction({ task, status });
    setTaskActionNote("");
    void loadTaskEvidence(task.id);
  };
  const openAssetUpload = (
    course: AcademyCourse,
    nextType: AcademyAssetType,
  ) => {
    const existing = courseAssets[course.id]?.find(
      (item) => item.assetType === nextType,
    );
    setAssetCourseId(course.id);
    setAssetType(nextType);
    setAssetTitle(
      existing?.title ||
        `${course.title} · ${assetTypes.find((item) => item.value === nextType)?.label || "课程资产"}`,
    );
    setExistingAssetAttachments(existing?.attachments || []);
    setAssetAttachments([]);
    setAssetOpen(true);
  };
  const saveCourseAsset = async () => {
    setSaving(true);
    const response = await academyApi.saveCourseAsset(assetCourseId, {
      assetType,
      title: assetTitle,
      attachments: [...existingAssetAttachments, ...assetAttachments],
    });
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "课程资产保存失败");
    setAssetOpen(false);
    await loadCourseAssets(assetCourseId);
  };
  const openOrderLink = async (engagement: AcademyEngagement) => {
    if (!engagement.customerId)
      return alert(
        "请先将该学员关联到CRM客户，再关联正式订单。",
        "暂不能关联订单",
      );
    const response = await orderApi.fetchOrders({
      customerId: engagement.customerId,
      page: 1,
      pageSize: 100,
    });
    if (response.code !== 0) return alert(response.message, "正式订单加载失败");
    setOrderLink({ engagement, orders: response.data.items });
    setSelectedOrderId(engagement.orderId || "");
  };
  const saveOrderLink = async () => {
    if (!orderLink) return;
    const order = orderLink.orders.find((item) => item.id === selectedOrderId);
    if (!order) return;
    setSaving(true);
    const response = await academyApi.linkEngagementOrder(
      orderLink.engagement.id,
      {
        orderId: order.id,
      },
    );
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "订单关联失败");
    setOrderLink(null);
    await loadDetail(selectedSessionId);
  };
  const saveEngagement = async () => {
    setSaving(true);
    const response =
      engagementMode === "execution" && engagementEditingId
        ? await academyApi.updateEngagementExecution(engagementEditingId, {
            attendanceStatus: engagementForm.attendanceStatus,
            interactionLevel: engagementForm.interactionLevel,
            courseAssessment: engagementForm.courseAssessment,
          })
        : engagementMode === "sales" && engagementEditingId
          ? await academyApi.quickFollowUp(engagementEditingId, {
              content: engagementForm.notes || "",
              invitationStatus: engagementForm.invitationStatus,
              courseAssessment: engagementForm.courseAssessment,
              nextFollowUpAt: engagementForm.nextFollowUpAt,
            })
          : await academyApi.saveEngagement(engagementForm);
    if (response.code !== 0) {
      setSaving(false);
      return alert(response.message, "学员记录保存失败");
    }
    setSaving(false);
    setEngagementOpen(false);
    setEngagementEditingId("");
    setEngagementForm(emptyEngagement);
    await loadDetail(selectedSessionId);
  };
  const saveBatchInvites = async () => {
    if (!selectedInviteCustomers.length || !selectedSessionId || saving) return;
    setSaving(true);
    const response = await academyApi.saveEngagementBatch({
      sessionId: selectedSessionId,
      customerIds: selectedInviteCustomers.map((customer) => customer.id),
    });
    setSaving(false);
    if (response.code !== 0) return alert(response.message, "批量邀约失败");
    const successCount = response.data.created.length;
    const failedCount = response.data.rejected.length;
    const customerNames = new Map(
      selectedInviteCustomers.map((customer) => [customer.id, customer.name]),
    );
    const rejectedSummary = response.data.rejected
      .slice(0, 10)
      .map(
        (item) =>
          `${customerNames.get(item.customerId) || item.customerId}：${item.message}`,
      )
      .join("\n");
    setSelectedInviteCustomers([]);
    setEngagementOpen(false);
    await loadDetail(selectedSessionId);
    await alert(
      `已加入 ${successCount} 位客户${failedCount ? `，${failedCount} 位未加入。\n${rejectedSummary}${failedCount > 10 ? `\n其余 ${failedCount - 10} 位请按客户权限或状态检查。` : ""}` : "。"}`,
      "客户邀约完成",
    );
  };
  const saveReview = async (value: SaveAcademyReviewInput = reviewForm) => {
    setSaving(true);
    const response = await academyApi.saveReview(value);
    setSaving(false);
    if (response.code !== 0) {
      await alert(response.message, "复盘保存失败");
      return false;
    }
    setReviewForm(value);
    await loadDetail(selectedSessionId);
    return true;
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
          description="全员查看课程安排，参与人在同一处完成课程任务。"
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
                          {task.assigneeUserName || "待分配"}
                        </TableCell>
                        <TableCell>
                          {task.collaboratorNames?.join("、") || "-"}
                        </TableCell>
                        <TableCell>{formatDate(task.dueAt)}</TableCell>
                        <TableCell>
                          {task.acceptanceCriteria || "完成后由负责人确认"}
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
                          <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="center"
                          >
                            <Chip
                              size="small"
                              label={statusLabel[task.status] || task.status}
                              sx={{
                                height: 22,
                                bgcolor:
                                  task.status === "DONE"
                                    ? palette.greenSoft
                                    : task.status === "BLOCKED" ||
                                        task.status === "REJECTED"
                                      ? palette.redSoft
                                      : palette.blueSoft,
                                color:
                                  task.status === "DONE"
                                    ? palette.green
                                    : task.status === "BLOCKED" ||
                                        task.status === "REJECTED"
                                      ? palette.red
                                      : palette.blue,
                              }}
                            />
                            {task.assigneeUserId === currentUser?.id &&
                              task.status === "PENDING" && (
                                <Button
                                  size="small"
                                  onClick={() =>
                                    openTaskAction(task, "IN_PROGRESS")
                                  }
                                >
                                  开始
                                </Button>
                              )}
                            {task.assigneeUserId === currentUser?.id &&
                              task.status === "IN_PROGRESS" && (
                                <Button
                                  size="small"
                                  onClick={() =>
                                    openTaskAction(task, "SUBMITTED")
                                  }
                                >
                                  提交验收
                                </Button>
                              )}
                            {detail.taskReviewerUserId === currentUser?.id && task.status === "SUBMITTED" && (
                              <>
                                <Button
                                  size="small"
                                  color="success"
                                  onClick={() => openTaskAction(task, "DONE")}
                                >
                                  通过
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  onClick={() =>
                                    openTaskAction(task, "REJECTED")
                                  }
                                >
                                  驳回
                                </Button>
                              </>
                            )}
                            {task.assigneeUserId === currentUser?.id &&
                              (task.status === "REJECTED" ||
                                task.status === "BLOCKED") && (
                                <Button
                                  size="small"
                                  onClick={() =>
                                    openTaskAction(task, "IN_PROGRESS")
                                  }
                                >
                                  重新处理
                                </Button>
                              )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </SystemDataTable>
              </TableContainer>
            </Paper>
            <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
                <SectionTitle title="课程安排控制台" />
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
                <SectionTitle title="课程安排负责人" />
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
        <ProtectedFormDialog
          open={Boolean(taskAction)}
          onClose={() => {
            setTaskAction(null);
            activeTaskEvidenceIdRef.current = "";
            taskEvidenceAttachmentsRef.current = [];
            setTaskEvidenceAttachments([]);
            setTaskEvidenceLoading(false);
            setTaskEvidenceUploading(false);
          }}
          submitting={saving}
          markButtonClicksDirty={false}
          fullWidth
          maxWidth="sm"
          resetKey={`${taskAction?.task.id || ""}:${taskAction?.status || ""}`}
        >
          {({ markDirty, requestClose }) => (
            <>
              <DialogCloseTitle onClose={() => void requestClose()}>
                {taskAction?.status === "SUBMITTED"
                  ? "提交任务验收"
                  : taskAction?.status === "REJECTED"
                    ? "驳回任务验收"
                    : "确认任务验收"}
              </DialogCloseTitle>
              <DialogContent dividers>
                <Typography fontWeight={800} sx={{ mb: 1.5 }}>
                  {taskAction?.task.title}
                </Typography>
                {taskAction && (
                  <Box sx={{ mb: 2 }}>
                    {taskAction.status !== "SUBMITTED" && (
                      <Paper
                        variant="outlined"
                        sx={{ ...panelSx, p: 1.5, mb: 1.5 }}
                      >
                        <Typography fontSize={12} color="text.secondary">
                          负责人完成说明
                        </Typography>
                        <Typography sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                          {taskAction.task.submissionNote || "未填写完成说明"}
                        </Typography>
                      </Paper>
                    )}
                    {taskAction.task.completionMode === "ATTACHMENT" && (
                      <BusinessAttachmentPicker
                        title="交付证据"
                        description={
                          taskAction.status === "SUBMITTED"
                            ? "支持PPT、文档和图片，单个文件不超过20MB；完成说明可填写网盘或在线文档链接。"
                            : "验收时可查看和下载负责人提交的文件。"
                        }
                        value={taskEvidenceAttachments}
                        onChange={(attachments) =>
                          replaceTaskEvidenceState(
                            taskAction.task.id,
                            attachments,
                          )
                        }
                        category="academy-task-evidence"
                        draftKey={`academy-task:${taskAction.task.id}`}
                        maxCount={10}
                        imagesOnly={false}
                        disabled={
                          taskEvidenceLoading ||
                          taskEvidenceUploading ||
                          !taskActionCanEditEvidence
                        }
                        onUploadingChange={setTaskEvidenceUploading}
                        onUploaded={async (attachment) =>
                          bindTaskEvidence(taskAction.task.id, attachment)
                        }
                        onRemove={async (attachment) =>
                          unbindTaskEvidence(taskAction.task.id, attachment)
                        }
                      />
                    )}
                  </Box>
                )}
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  required={
                    taskAction?.status === "SUBMITTED" ||
                    taskAction?.status === "REJECTED"
                  }
                  label={
                    taskAction?.status === "REJECTED"
                      ? "驳回原因"
                      : "完成说明 / 验收意见"
                  }
                  value={taskActionNote}
                  onChange={(event) => {
                    markDirty();
                    setTaskActionNote(event.target.value);
                  }}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => void requestClose()}>取消</Button>
                <Button
                  variant="contained"
                  color={
                    taskAction?.status === "REJECTED" ? "error" : "primary"
                  }
                  disabled={
                    saving ||
                    taskEvidenceLoading ||
                    taskEvidenceUploading ||
                    !taskAction ||
                    ((taskAction.status === "SUBMITTED" ||
                      taskAction.status === "REJECTED") &&
                      !taskActionNote.trim()) ||
                    (taskAction.status === "SUBMITTED" &&
                      !taskActionCanEditEvidence) ||
                    (taskAction.status === "SUBMITTED" &&
                      taskRequiresEvidence(taskAction.task) &&
                      !taskEvidenceAttachments.length)
                  }
                  onClick={() =>
                    taskAction &&
                    void updateTask(
                      taskAction.task,
                      taskAction.status,
                      taskActionNote,
                    )
                  }
                >
                  确认
                </Button>
              </DialogActions>
            </>
          )}
        </ProtectedFormDialog>
        {feedbackDialog}
      </ModulePage>
    );
  }

  return (
    <ModulePage>
      <ModuleHeader
        title="极享商学院"
        description="全员查看课程安排，参与人在同一处完成课程任务。"
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
          <WorkbenchOverview
            sessions={publicCalendar}
            managedSessions={sessions}
            canManageSessions={canSession}
            tasks={myTasks}
            openTaskTotal={openTaskTotal}
            reviewTaskTotal={reviewTaskTotal}
            priorityTasks={priorityTasks}
            taskTotal={myTaskTotal}
            taskPage={myTaskPage}
            taskPageSize={myTaskPageSize}
            taskView={myTaskView}
            canReviewTasks
            onTaskViewChange={(value) => {
              setMyTaskView(value);
              setMyTaskPage(0);
            }}
            onTaskPageChange={setMyTaskPage}
            onTaskPageSizeChange={(size) => {
              setMyTaskPageSize(size);
              setMyTaskPage(0);
            }}
            onOpenTask={(task) => {
              setWorkbenchTask(task);
              setWorkbenchTaskNote("");
              if (!task.eventId) void loadTaskEvidence(task.id);
            }}
            onChangeSessionStatus={(session, status) =>
              void changeSessionStatus(session, status)
            }
            requestedSessionId={workbenchRequestedSessionId}
            onRequestedSessionConsumed={() =>
              setWorkbenchRequestedSessionId("")
            }
          />
        )}
        {view === "plans" && (
          <Plans
            sessions={sessions}
            details={details}
            detailErrors={sessionDetailErrors}
            onCreate={(date) => openSessionCreate(undefined, date)}
            onCreateHistorical={openHistoricalSessionCreate}
            onEdit={openSessionEdit}
            onChangeStatus={(session, status) =>
              void changeSessionStatus(session, status)
            }
            onOpenWorkbench={(sessionId) => {
              setWorkbenchRequestedSessionId(sessionId);
              navigate(viewPath.overview);
            }}
            canCreate={canPlan || canSession}
            canManage={canSession}
            canReview={canReview}
            canConfigureFlows={canPlan || canSession}
            onFlowSettings={openSopTemplateList}
            requestedSessionId={planOpenSessionId}
            onRequestConsumed={() => setPlanOpenSessionId("")}
            onNeedDetail={loadDetail}
            onReloadDetail={(id) => void loadDetail(id)}
            onSelectSession={(id) => {
              setSelectedSessionId(id);
            }}
            reviewForm={reviewForm}
            onSaveReview={saveReview}
            saving={saving}
          />
        )}
        {view === "courses" && (
          <CourseWorkspace
            items={courses}
            sessions={sessions}
            assets={courseAssets}
            assetLoadingCourseIds={courseAssetsLoadingIds}
            assetLoadErrors={courseAssetLoadErrors}
            categories={courseCategories}
            canManage={canCourse}
            onCreate={openCourseCreate}
            onSettings={() => setCourseSettingsOpen(true)}
            onView={(course) => {
              setSelectedCourseId(course.id);
              if (!courseAssets[course.id]) void loadCourseAssets(course.id);
            }}
            onEdit={openCourseEdit}
            onUploadAsset={openAssetUpload}
            onReloadAssets={(course) => void loadCourseAssets(course.id)}
            onStatusChange={(course, status) =>
              void changeCourseStatus(course, status)
            }
            statusChangingCourseIds={courseStatusChangingIds}
            onCreateSession={(course) => openSessionCreate(course)}
          />
        )}
        {view === "learners" && (
          <LearnerConversionWorkspace
            sessions={engagementSessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={(id) => {
              setSelectedSessionId(id);
              void loadDetail(id);
            }}
            detail={selectedDetail}
            canManage={canEngagement}
            canAddCustomer={invitableSessions.some(
              (item) => item.id === selectedSessionId,
            )}
            onAdd={() => {
              if (
                !invitableSessions.some((item) => item.id === selectedSessionId)
              ) {
                void alert(
                  "当前课程已开课或结束，不能继续添加邀约客户，但仍可维护已有客户跟进。",
                  "暂不能添加客户",
                );
                return;
              }
              setEngagementMode("sales");
              setEngagementEditingId("");
              setEngagementForm({
                ...emptyEngagement,
                sessionId: selectedSessionId,
              });
              setSelectedInviteCustomers([]);
              setCustomerPage(0);
              setEngagementOpen(true);
            }}
            onLinkOrder={(engagement) => void openOrderLink(engagement)}
            onEdit={(engagement) => {
              setEngagementMode("sales");
              setEngagementEditingId(engagement.id);
              setEngagementForm({
                sessionId: engagement.sessionId,
                participantKey: engagement.participantKey,
                participantName: engagement.participantName,
                customerId: engagement.customerId,
                leadId: engagement.leadId,
                invitationStatus: engagement.invitationStatus,
                attendanceStatus: engagement.attendanceStatus,
                interactionLevel: engagement.interactionLevel,
                courseAssessment: engagement.courseAssessment,
                followUpStatus: engagement.followUpStatus,
                nextFollowUpAt: engagement.nextFollowUpAt,
                notes: engagement.notes,
              });
              setEngagementOpen(true);
            }}
          />
        )}
      </Stack>

      <Drawer
        anchor="right"
        open={Boolean(workbenchTask)}
        onClose={() => {
          setWorkbenchTask(null);
          activeTaskEvidenceIdRef.current = "";
          taskEvidenceAttachmentsRef.current = [];
          setTaskEvidenceAttachments([]);
          setTaskEvidenceLoading(false);
          setTaskEvidenceUploading(false);
        }}
        PaperProps={{
          role: "dialog",
          "aria-label": "我的商学院任务",
          sx: { width: { xs: "100%", sm: 520 }, maxWidth: "100vw", p: 2 },
        }}
      >
        {workbenchTask && (
          <Stack spacing={2}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box>
                <Typography fontSize={20} fontWeight={950}>
                  {workbenchTask.title}
                </Typography>
                <Typography fontSize={12.5} color="text.secondary">
                  {workbenchTask.session.title} ·{" "}
                  {formatDate(workbenchTask.session.startsAt)}
                </Typography>
              </Box>
              <IconButton
                aria-label="关闭我的任务"
                onClick={() => {
                  setWorkbenchTask(null);
                  activeTaskEvidenceIdRef.current = "";
                  taskEvidenceAttachmentsRef.current = [];
                  setTaskEvidenceAttachments([]);
                  setTaskEvidenceLoading(false);
                  setTaskEvidenceUploading(false);
                }}
              >
                <CloseIcon />
              </IconButton>
            </Stack>
            <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
              <Typography fontSize={12} color="text.secondary">
                完成标准
              </Typography>
              <Typography sx={{ mt: 0.5 }}>
                {workbenchTask.acceptanceCriteria || "完成后提交负责人确认"}
              </Typography>
              <Divider sx={{ my: 1.5 }} />
              <Typography fontSize={12} color="text.secondary">
                截止时间
              </Typography>
              <Typography sx={{ mt: 0.5 }}>
                {formatDate(workbenchTask.dueAt)}
              </Typography>
            </Paper>
            {!workbenchTask.eventId && workbenchTask.completionMode === "ATTACHMENT" && (
              <BusinessAttachmentPicker
                title="任务交付文件"
                description="支持PPT、文档和图片，单个文件不超过20MB；完成说明可填写网盘或在线文档链接。"
                value={taskEvidenceAttachments}
                onChange={(attachments) =>
                  replaceTaskEvidenceState(workbenchTask.id, attachments)
                }
                category="academy-task-evidence"
                draftKey={`academy-task:${workbenchTask.id}`}
                maxCount={10}
                imagesOnly={false}
                disabled={
                  taskEvidenceLoading ||
                  taskEvidenceUploading ||
                  !["IN_PROGRESS", "REJECTED", "BLOCKED"].includes(
                    workbenchTask.status,
                  )
                }
                onUploadingChange={setTaskEvidenceUploading}
                onUploaded={async (attachment) =>
                  bindTaskEvidence(workbenchTask.id, attachment)
                }
                onRemove={async (attachment) =>
                  unbindTaskEvidence(workbenchTask.id, attachment)
                }
              />
            )}
            {!workbenchTask.eventId && workbenchTask.status === "PENDING" &&
              workbenchTask.completionMode === "CONFIRM" && (
                <Button
                  variant="contained"
                  disabled={saving}
                  onClick={() =>
                    void updateWorkbenchTask(workbenchTask, "SUBMITTED")
                  }
                >
                  {workbenchTask.requiresReview ? "确认并提交验收" : "确认完成"}
                </Button>
              )}
            {!workbenchTask.eventId && workbenchTask.status === "PENDING" &&
              workbenchTask.completionMode !== "CONFIRM" && (
                <Button
                  variant="contained"
                  disabled={saving}
                  onClick={() =>
                    void updateWorkbenchTask(workbenchTask, "IN_PROGRESS")
                  }
                >
                  开始处理
                </Button>
              )}
            {!workbenchTask.eventId && ["IN_PROGRESS", "REJECTED", "BLOCKED"].includes(
              workbenchTask.status,
            ) && (
              <>
                <TextField
                  multiline
                  minRows={3}
                  label={
                    workbenchTask.completionMode === "CONFIRM"
                      ? "完成说明（选填）"
                      : "完成说明 *"
                  }
                  helperText={
                    taskEvidenceUploading
                      ? "交付文件正在上传并关联，请稍候"
                      : taskRequiresEvidence(workbenchTask) &&
                          !taskEvidenceAttachments.length
                        ? "该步骤配置为必须上传附件"
                        : workbenchTask.completionMode === "CHECKLIST"
                          ? "确认完成标准后填写检查结果"
                          : "可粘贴网盘或在线文档链接"
                  }
                  value={workbenchTaskNote}
                  onChange={(event) => setWorkbenchTaskNote(event.target.value)}
                />
                <Button
                  variant="contained"
                  disabled={
                    saving ||
                    taskEvidenceLoading ||
                    taskEvidenceUploading ||
                    (workbenchTask.completionMode !== "CONFIRM" &&
                      !workbenchTaskNote.trim()) ||
                    (taskRequiresEvidence(workbenchTask) &&
                      !taskEvidenceAttachments.length)
                  }
                  onClick={() =>
                    void updateWorkbenchTask(workbenchTask, "SUBMITTED")
                  }
                >
                  {workbenchTask.requiresReview ? "提交验收" : "确认完成"}
                </Button>
              </>
            )}
            {workbenchTask.status === "SUBMITTED" && (
              <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
                <Typography color="text.secondary">
                  已提交，等待{workbenchTask.session.taskReviewerUserName || "任务验收人"}验收。
                </Typography>
                <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>
                  本次完成说明
                </Typography>
                <Typography sx={{ mt: 0.4, whiteSpace: "pre-wrap" }}>
                  {workbenchTask.submissionNote || "-"}
                </Typography>
              </Paper>
            )}
            {!workbenchTask.eventId &&
              workbenchTask.status === "SUBMITTED" &&
              workbenchTask.session.taskReviewerUserId === currentUser?.id && (
              <>
                <TextField
                  multiline
                  minRows={2}
                  label="验收意见"
                  placeholder="通过可选填；驳回时必须填写原因"
                  value={workbenchTaskNote}
                  onChange={(event) => setWorkbenchTaskNote(event.target.value)}
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={saving}
                    onClick={() =>
                      void updateWorkbenchTask(workbenchTask, "DONE")
                    }
                  >
                    验收通过
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={saving || !workbenchTaskNote.trim()}
                    onClick={() =>
                      void updateWorkbenchTask(workbenchTask, "REJECTED")
                    }
                  >
                    驳回修改
                  </Button>
                </Stack>
              </>
            )}
            {workbenchTask.status === "DONE" && (
              <Paper
                variant="outlined"
                sx={{
                  ...panelSx,
                  p: 2,
                  bgcolor: palette.greenSoft,
                  borderColor: "#B7E5CF",
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <TaskAltIcon color="success" />
                  <Box>
                    <Typography fontWeight={950} color="success.main">
                      该步骤已完成
                    </Typography>
                    <Typography fontSize={12.5} color="text.secondary">
                      完成时间：
                      {formatDate(
                        workbenchTask.completedAt ||
                          workbenchTask.reviewedAt ||
                          workbenchTask.submittedAt,
                      )}
                    </Typography>
                  </Box>
                </Stack>
                {(workbenchTask.submissionNote || workbenchTask.note) && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography fontSize={12} color="text.secondary">
                      完成结果
                    </Typography>
                    <Typography sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                      {workbenchTask.submissionNote || workbenchTask.note}
                    </Typography>
                  </>
                )}
              </Paper>
            )}
            {workbenchTask.status === "SKIPPED" && (
              <Paper variant="outlined" sx={{ ...panelSx, p: 2, bgcolor: palette.soft }}>
                <Typography fontWeight={950}>该任务已关闭</Typography>
                <Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>
                  {workbenchTask.note || "关联课程安排已取消，任务无需继续处理。"}
                </Typography>
                <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>
                  关闭时间：{formatDate(workbenchTask.completedAt)}
                </Typography>
              </Paper>
            )}
            {workbenchTask.status === "REJECTED" && (
              <Paper variant="outlined" sx={{ ...panelSx, p: 2, bgcolor: palette.redSoft }}>
                <Typography fontWeight={950} color="error.main">该次验收已驳回</Typography>
                <Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>
                  {workbenchTask.reviewNote || "未填写驳回原因"}
                </Typography>
                <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>
                  验收人：{workbenchTask.reviewedByName || "-"} · {formatDate(workbenchTask.reviewedAt)}
                </Typography>
              </Paper>
            )}
          </Stack>
        )}
      </Drawer>

      <ProtectedFormDialog
        open={courseOpen}
        onClose={() => {
          setCourseOpen(false);
          setCourseEditingId("");
        }}
        submitting={saving}
        markButtonClicksDirty={false}
        fullWidth
        maxWidth="md"
        resetKey={String(courseOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              {courseEditingId ? "编辑课程" : "新建课程"}
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2.2}>
                <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                  <SectionTitle
                    title="1 基础信息"
                    helper="沉淀可复用课程内容；主讲人和本次负责人在课程安排中设置。"
                  />
                  <Box
                    sx={{
                      mt: 2,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    <TextField
                      label="课程名称 *"
                      value={courseForm.title}
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          title: event.target.value,
                        });
                      }}
                    />
                    <TextField
                      select
                      label="课程分类 *"
                      value={courseForm.category}
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          category: event.target.value,
                        });
                      }}
                    >
                      {courseCategories
                        .filter(
                          (item) =>
                            item.isActive || item.name === courseForm.category,
                        )
                        .map((item) => (
                          <MenuItem key={item.id} value={item.name}>
                            {item.name}
                          </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                      select
                      label="课程维护人 *"
                      helperText="负责维护课程内容，不代表每次课程安排的负责人"
                      value={courseForm.ownerUserId}
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          ownerUserId: event.target.value,
                        });
                      }}
                    >
                      {academyUsers.map((user) => (
                        <MenuItem key={user.id} value={user.id}>
                          {user.name}（{user.positionName || user.role}）
                        </MenuItem>
                      ))}
                    </TextField>
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
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                  <SectionTitle
                    title="2 课程定位"
                    helper="明确这门课讲给谁、解决什么问题。"
                  />
                  <Stack spacing={2} sx={{ mt: 2 }}>
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
                      label="目标客户"
                      multiline
                      minRows={2}
                      placeholder="例如：正在推进企业AI升级的传统企业经营者"
                      value={courseForm.targetAudience || ""}
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          targetAudience: event.target.value,
                        });
                      }}
                    />
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                  <SectionTitle
                    title="3 业务目标"
                    helper="沉淀课程交付目标，并连接后续转化产品。"
                  />
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <TextField
                      label="客户核心问题"
                      multiline
                      minRows={2}
                      value={courseForm.customerProblem || ""}
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          customerProblem: event.target.value,
                        });
                      }}
                    />
                    <Box>
                      <Typography fontSize={13} fontWeight={800} sx={{ mb: 1 }}>
                        课程目标
                      </Typography>
                      <Stack spacing={1}>
                        {courseForm.objectives.map((objective, index) => (
                          <Stack
                            key={index}
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <TextField
                              fullWidth
                              label={`目标 ${index + 1}`}
                              value={objective}
                              onChange={(event) => {
                                markDirty();
                                const objectives = [...courseForm.objectives];
                                objectives[index] = event.target.value;
                                setCourseForm({ ...courseForm, objectives });
                              }}
                              onPaste={(event) => {
                                const lines = event.clipboardData
                                  .getData("text")
                                  .split(/\r?\n/)
                                  .map((item) => item.trim())
                                  .filter(Boolean);
                                if (lines.length <= 1) return;
                                event.preventDefault();
                                markDirty();
                                const objectives = [...courseForm.objectives];
                                objectives.splice(index, 1, ...lines);
                                setCourseForm({ ...courseForm, objectives });
                              }}
                            />
                            <Button
                              color="error"
                              onClick={() => {
                                markDirty();
                                setCourseForm({
                                  ...courseForm,
                                  objectives: courseForm.objectives.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                });
                              }}
                            >
                              删除
                            </Button>
                          </Stack>
                        ))}
                        <Button
                          variant="outlined"
                          startIcon={<AddIcon />}
                          sx={{ alignSelf: "flex-start" }}
                          onClick={() => {
                            markDirty();
                            setCourseForm({
                              ...courseForm,
                              objectives: [...courseForm.objectives, ""],
                            });
                          }}
                        >
                          添加课程目标
                        </Button>
                      </Stack>
                    </Box>
                    <TextField
                      label="核心观点"
                      multiline
                      minRows={2}
                      value={courseForm.coreViewpoint || ""}
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          coreViewpoint: event.target.value,
                        });
                      }}
                    />
                    <TextField
                      select
                      label="转化产品"
                      value={courseForm.conversionProductId || ""}
                      helperText="可选；关联系统设置中已启用的产品，后续用于转化与复盘。"
                      onChange={(event) => {
                        markDirty();
                        setCourseForm({
                          ...courseForm,
                          conversionProductId: event.target.value,
                        });
                      }}
                    >
                      <MenuItem value="">暂不关联</MenuItem>
                      {products.map((product) => (
                        <MenuItem key={product.id} value={product.id}>
                          {product.name} · ¥
                          {product.price.toLocaleString("zh-CN")}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                </Paper>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={
                  saving ||
                  !courseForm.title.trim() ||
                  !courseForm.category ||
                  !courseForm.ownerUserId ||
                  !courseForm.defaultDurationMinutes
                }
                onClick={() => void saveCourse()}
              >
                {courseEditingId ? "保存课程" : "保存课程草稿"}
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <Drawer
        anchor="right"
        open={sopSettingsOpen}
        onClose={() => void closeSopSettings()}
        PaperProps={{
          role: "dialog",
          "aria-modal": true,
          "aria-label": "课程流程设置",
          sx: {
            width: { xs: "100%", md: 980 },
            maxWidth: "100vw",
            bgcolor: palette.soft,
          },
        }}
      >
        <Stack sx={{ minHeight: "100%" }}>
          <Paper
            square
            elevation={0}
            sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${palette.line}` }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Box>
                <Typography fontSize={20} fontWeight={950}>
                  课程流程设置
                </Typography>
                <Typography fontSize={12.5} color="text.secondary">
                  配置每次课程安排可以选择的执行步骤、负责人角色和完成方式
                </Typography>
              </Box>
              <IconButton
                aria-label="关闭课程流程设置"
                onClick={() => void closeSopSettings()}
              >
                <CloseIcon />
              </IconButton>
            </Stack>
          </Paper>
          <Box sx={{ p: 2, flex: 1 }}>
            {!sopEditing ? (
              <Stack spacing={1.5}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  spacing={1}
                >
                  <Box>
                    <Typography fontWeight={950}>流程列表</Typography>
                    <Typography fontSize={12.5} color="text.secondary">
                      统一维护可选课程流程；新建课程安排时选择并生成本次任务。
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => openSopSettings()}
                  >
                    新建课程流程
                  </Button>
                </Stack>
                <Paper
                  variant="outlined"
                  sx={{ ...panelSx, overflow: "hidden" }}
                >
                  <TableContainer>
                    <SystemDataTable
                      tableId="academy-sop-template-list"
                      aria-label="课程流程列表"
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>流程名称</TableCell>
                          <TableCell>步骤</TableCell>
                          <TableCell>默认流程</TableCell>
                          <TableCell>状态</TableCell>
                          <TableCell>最近更新</TableCell>
                          <TableCell align="right">操作</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sopTemplates
                          .slice(
                            sopTemplatePage * sopTemplatePageSize,
                            (sopTemplatePage + 1) * sopTemplatePageSize,
                          )
                          .map((template) => (
                            <TableRow key={template.id} hover>
                              <TableCell>
                                <Typography fontWeight={850}>
                                  {template.name}
                                </Typography>
                                <Typography
                                  fontSize={12}
                                  color="text.secondary"
                                  noWrap
                                  sx={{ maxWidth: 330 }}
                                >
                                  {template.description || "暂无说明"}
                                </Typography>
                              </TableCell>
                              <TableCell>{template.steps.length} 步</TableCell>
                              <TableCell>
                                {template.isDefault ? (
                                  <Chip
                                    size="small"
                                    color="primary"
                                    label="默认"
                                  />
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  color={
                                    template.status === "ACTIVE"
                                      ? "success"
                                      : "default"
                                  }
                                  label={
                                    template.status === "ACTIVE"
                                      ? "已启用"
                                      : "已停用"
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {formatDate(template.updatedAt)}
                              </TableCell>
                              <TableCell align="right">
                                <Stack
                                  direction="row"
                                  spacing={0.25}
                                  justifyContent="flex-end"
                                >
                                  <Tooltip title="编辑流程" arrow>
                                    <IconButton
                                      size="small"
                                      aria-label={`编辑流程 ${template.name}`}
                                      onClick={() => openSopSettings(template)}
                                    >
                                      <EditOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip
                                    title={
                                      template.isDefault
                                        ? "当前默认流程"
                                        : template.status !== "ACTIVE"
                                          ? "请先启用流程"
                                          : "设为默认流程"
                                    }
                                    arrow
                                  >
                                    <span>
                                      <IconButton
                                        size="small"
                                        color={
                                          template.isDefault
                                            ? "primary"
                                            : "default"
                                        }
                                        disabled={
                                          saving ||
                                          template.isDefault ||
                                          template.status !== "ACTIVE"
                                        }
                                        aria-label={`设为默认流程 ${template.name}`}
                                        onClick={() =>
                                          void setDefaultSopTemplate(template)
                                        }
                                      >
                                        <EventAvailableOutlinedIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip
                                    title={
                                      template.isDefault &&
                                      template.status === "ACTIVE"
                                        ? "默认流程不能停用"
                                        : template.status === "ACTIVE"
                                          ? "停用流程"
                                          : "启用流程"
                                    }
                                    arrow
                                  >
                                    <span>
                                      <IconButton
                                        size="small"
                                        color={
                                          template.status === "ACTIVE"
                                            ? "warning"
                                            : "success"
                                        }
                                        disabled={
                                          saving ||
                                          (template.isDefault &&
                                            template.status === "ACTIVE")
                                        }
                                        aria-label={`${template.status === "ACTIVE" ? "停用" : "启用"}流程 ${template.name}`}
                                        onClick={() =>
                                          void changeSopTemplateStatus(template)
                                        }
                                      >
                                        {template.status === "ACTIVE" ? (
                                          <ToggleOnOutlinedIcon fontSize="small" />
                                        ) : (
                                          <ToggleOffOutlinedIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip
                                    title={
                                      template.isDefault
                                        ? "默认流程不能删除"
                                        : "删除流程"
                                    }
                                    arrow
                                  >
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        disabled={saving || template.isDefault}
                                        aria-label={`删除流程 ${template.name}`}
                                        onClick={() =>
                                          void deleteSopTemplate(template)
                                        }
                                      >
                                        <DeleteOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          ))}
                        {!sopTemplates.length && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              align="center"
                              sx={{ py: 7 }}
                            >
                              <Typography fontWeight={900}>
                                暂无课程流程
                              </Typography>
                              <Typography
                                fontSize={12.5}
                                color="text.secondary"
                              >
                                点击右上角“新建课程流程”开始配置。
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </SystemDataTable>
                  </TableContainer>
                  <TablePagination
                    count={sopTemplates.length}
                    page={sopTemplatePage}
                    rowsPerPage={sopTemplatePageSize}
                    onPageChange={(_, nextPage) => setSopTemplatePage(nextPage)}
                    onRowsPerPageChange={(event) => {
                      setSopTemplatePageSize(Number(event.target.value));
                      setSopTemplatePage(0);
                    }}
                    sx={{ borderTop: `1px solid ${palette.line}` }}
                  />
                </Paper>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Paper variant="outlined" sx={{ ...panelSx, p: 1.6 }}>
                  <Stack spacing={1.2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Box>
                        <Typography fontWeight={950}>流程基本信息</Typography>
                        <Typography fontSize={12.5} color="text.secondary">
                          这里只设置流程名称和每一步需要谁完成；启停、默认流程在列表操作。
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setSopAdvanced((value) => !value)}
                      >
                        {sopAdvanced ? "收起高级设置" : "高级设置"}
                      </Button>
                    </Stack>
                    <TextField
                      label="流程名称 *"
                      value={sopEditing.name}
                      onChange={(event) =>
                        setSopEditing({
                          ...sopEditing,
                          name: event.target.value,
                        })
                      }
                    />
                    <TextField
                      label="流程说明"
                      multiline
                      minRows={2}
                      value={sopEditing.description}
                      onChange={(event) =>
                        setSopEditing({
                          ...sopEditing,
                          description: event.target.value,
                        })
                      }
                    />
                  </Stack>
                </Paper>
                {sopEditing.steps.map((step, index) => (
                  <Paper
                    key={step.id || step.stepKey}
                    variant="outlined"
                    sx={{ ...panelSx, p: 1.5 }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography fontWeight={950}>
                        第 {index + 1} 步
                      </Typography>
                      <Stack direction="row" spacing={0.5}>
                        <Button
                          size="small"
                          disabled={index === 0}
                          onClick={() => moveSopStep(index, -1)}
                        >
                          上移
                        </Button>
                        <Button
                          size="small"
                          disabled={index === sopEditing.steps.length - 1}
                          onClick={() => moveSopStep(index, 1)}
                        >
                          下移
                        </Button>
                        <Button
                          color="error"
                          size="small"
                          disabled={sopEditing.steps.length === 1}
                          onClick={() =>
                            setSopEditing({
                              ...sopEditing,
                              steps: sopEditing.steps.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                        >
                          删除
                        </Button>
                      </Stack>
                    </Stack>
                    <Box
                      sx={{
                        mt: 1.2,
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        gap: 1.2,
                      }}
                    >
                      <TextField
                        label="步骤名称 *"
                        value={step.title}
                        onChange={(event) => {
                          const steps = [...sopEditing.steps];
                          steps[index] = {
                            ...step,
                            title: event.target.value,
                          };
                          setSopEditing({ ...sopEditing, steps });
                        }}
                      />
                      <TextField
                        select
                        label="负责人角色"
                        value={step.assigneeRole}
                        onChange={(event) => {
                          const steps = [...sopEditing.steps];
                          steps[index] = {
                            ...step,
                            assigneeRole: event.target
                              .value as AcademySopTemplateStep["assigneeRole"],
                          };
                          setSopEditing({ ...sopEditing, steps });
                        }}
                      >
                        {[
                          ["PROJECT_OWNER", "项目负责人"],
                          ["CONTENT_OWNER", "内容负责人"],
                          ["MATERIAL_OWNER", "素材负责人"],
                          ["LECTURER", "主讲人"],
                          ["REVIEW_OWNER", "复盘负责人"],
                        ].map(([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>
                      {sopAdvanced && (
                        <TextField
                          select
                          label="流程阶段"
                          value={step.category}
                          onChange={(event) => {
                            const steps = [...sopEditing.steps];
                            steps[index] = {
                              ...step,
                              category: event.target
                                .value as AcademySopTemplateStep["category"],
                            };
                            setSopEditing({ ...sopEditing, steps });
                          }}
                        >
                          <MenuItem value="BEFORE">课前准备</MenuItem>
                          <MenuItem value="DURING">课程执行</MenuItem>
                          <MenuItem value="AFTER">课后跟进</MenuItem>
                        </TextField>
                      )}
                      {sopAdvanced && (
                        <TextField
                          select
                          label="时间基准"
                          value={step.dueAnchor}
                          onChange={(event) => {
                            const steps = [...sopEditing.steps];
                            steps[index] = {
                              ...step,
                              dueAnchor: event.target
                                .value as AcademySopTemplateStep["dueAnchor"],
                            };
                            setSopEditing({ ...sopEditing, steps });
                          }}
                        >
                          <MenuItem value="STARTS_AT">相对开课时间</MenuItem>
                          <MenuItem value="ENDS_AT">相对结束时间</MenuItem>
                        </TextField>
                      )}
                      {sopAdvanced && (
                        <TextField
                          label="时间偏移（分钟）"
                          type="number"
                          helperText="负数表示提前；留空表示不设截止时间"
                          value={step.dueOffsetMinutes ?? ""}
                          onChange={(event) => {
                            const steps = [...sopEditing.steps];
                            steps[index] = {
                              ...step,
                              dueOffsetMinutes:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            };
                            setSopEditing({ ...sopEditing, steps });
                          }}
                        />
                      )}
                      <TextField
                        select
                        label="完成方式"
                        value={step.completionMode}
                        onChange={(event) => {
                          const steps = [...sopEditing.steps];
                          steps[index] = {
                            ...step,
                            completionMode: event.target
                              .value as AcademySopTemplateStep["completionMode"],
                          };
                          setSopEditing({ ...sopEditing, steps });
                        }}
                      >
                        <MenuItem value="CONFIRM">直接确认</MenuItem>
                        <MenuItem value="NOTE">填写说明</MenuItem>
                        <MenuItem value="ATTACHMENT">上传附件</MenuItem>
                        <MenuItem value="CHECKLIST">检查确认</MenuItem>
                      </TextField>
                      {sopAdvanced && (
                        <TextField
                          select
                          label="是否必做"
                          value={step.isRequired ? "YES" : "NO"}
                          onChange={(event) => {
                            const steps = [...sopEditing.steps];
                            steps[index] = {
                              ...step,
                              isRequired: event.target.value === "YES",
                            };
                            setSopEditing({ ...sopEditing, steps });
                          }}
                        >
                          <MenuItem value="YES">必做</MenuItem>
                          <MenuItem value="NO">选做</MenuItem>
                        </TextField>
                      )}
                      <TextField
                        select
                        label="是否需要验收"
                        value={step.requiresReview ? "YES" : "NO"}
                        onChange={(event) => {
                          const steps = [...sopEditing.steps];
                          steps[index] = {
                            ...step,
                            requiresReview: event.target.value === "YES",
                          };
                          setSopEditing({ ...sopEditing, steps });
                        }}
                      >
                        <MenuItem value="NO">提交后直接完成</MenuItem>
                        <MenuItem value="YES">项目负责人验收</MenuItem>
                      </TextField>
                      <TextField
                        label="完成标准"
                        multiline
                        minRows={2}
                        value={step.acceptanceCriteria || ""}
                        onChange={(event) => {
                          const steps = [...sopEditing.steps];
                          steps[index] = {
                            ...step,
                            acceptanceCriteria: event.target.value,
                          };
                          setSopEditing({ ...sopEditing, steps });
                        }}
                        sx={{ gridColumn: { md: "1 / -1" } }}
                      />
                    </Box>
                  </Paper>
                ))}
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    setSopEditing({
                      ...sopEditing,
                      steps: [
                        ...sopEditing.steps,
                        emptySopStep(sopEditing.steps.length),
                      ],
                    })
                  }
                >
                  添加步骤
                </Button>
              </Stack>
            )}
          </Box>
          {sopEditing && (
            <Paper
              square
              elevation={0}
              sx={{ p: 1.5, borderTop: `1px solid ${palette.line}` }}
            >
              <Stack direction="row" justifyContent="flex-end" spacing={1}>
                <Button onClick={() => void closeSopSettings(true)}>
                  返回列表
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    saving ||
                    !sopEditing.name.trim() ||
                    sopEditing.steps.some((step) => !step.title.trim())
                  }
                  onClick={() => void saveSopTemplate()}
                >
                  {saving ? "保存中…" : "保存流程"}
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Drawer>
      <ProtectedFormDialog
        open={courseSettingsOpen}
        onClose={() => setCourseSettingsOpen(false)}
        submitting={saving}
        markButtonClicksDirty={false}
        fullWidth
        maxWidth="md"
        resetKey={String(courseSettingsOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              课程分类设置
            </DialogCloseTitle>
            <DialogContent dividers>
              <SectionTitle
                title="课程分类"
                helper="分类由商学院统一维护；已使用的分类建议停用，不直接删除。"
              />
              <Stack spacing={1.2} sx={{ mt: 2 }}>
                {courseCategories.map((category) => (
                  <Paper
                    key={category.id}
                    variant="outlined"
                    sx={{ p: 1.5, borderColor: palette.line }}
                  >
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.2}
                      alignItems={{ md: "center" }}
                    >
                      <Box flex={1}>
                        <Typography fontWeight={800}>
                          {category.name}
                        </Typography>
                        <Typography fontSize={12.5} color="text.secondary">
                          {category.description || "暂无说明"}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={category.isActive ? "启用" : "停用"}
                        color={category.isActive ? "success" : "default"}
                      />
                      <Button
                        size="small"
                        onClick={() =>
                          setCategoryForm({
                            id: category.id,
                            name: category.name,
                            description: category.description,
                            sortOrder: category.sortOrder,
                            isActive: category.isActive,
                          })
                        }
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        color={category.isActive ? "error" : "primary"}
                        onClick={() =>
                          void academyApi
                            .saveCourseCategory({
                              id: category.id,
                              name: category.name,
                              description: category.description,
                              sortOrder: category.sortOrder,
                              isActive: !category.isActive,
                            })
                            .then(async (response) => {
                              if (response.code !== 0)
                                alert(response.message, "课程分类更新失败");
                              else await loadBase();
                            })
                        }
                      >
                        {category.isActive ? "停用" : "启用"}
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              <Paper variant="outlined" sx={{ ...panelSx, p: 2, mt: 2 }}>
                <Typography fontWeight={900} sx={{ mb: 1.5 }}>
                  {categoryForm.id ? "编辑分类" : "新增分类"}
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    gap: 1.5,
                  }}
                >
                  <TextField
                    label="分类名称 *"
                    value={categoryForm.name}
                    onChange={(event) => {
                      markDirty();
                      setCategoryForm({
                        ...categoryForm,
                        name: event.target.value,
                      });
                    }}
                  />
                  <TextField
                    label="排序"
                    type="number"
                    value={categoryForm.sortOrder}
                    onChange={(event) => {
                      markDirty();
                      setCategoryForm({
                        ...categoryForm,
                        sortOrder: Number(event.target.value),
                      });
                    }}
                  />
                  <TextField
                    label="分类说明"
                    value={categoryForm.description}
                    onChange={(event) => {
                      markDirty();
                      setCategoryForm({
                        ...categoryForm,
                        description: event.target.value,
                      });
                    }}
                    sx={{ gridColumn: { md: "1 / -1" } }}
                  />
                </Box>
              </Paper>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  markDirty();
                  setCategoryForm({
                    id: "",
                    name: "",
                    description: "",
                    sortOrder: courseCategories.length + 1,
                    isActive: true,
                  });
                }}
              >
                清空
              </Button>
              <Button
                variant="contained"
                disabled={saving || !categoryForm.name.trim()}
                onClick={() => void saveCourseCategory()}
              >
                保存分类
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <ProtectedFormDialog
        open={sessionOpen}
        onClose={() => {
          setSessionOpen(false);
          setSessionEditingId("");
          setSessionHistoricalMode(false);
        }}
        submitting={saving}
        markButtonClicksDirty={false}
        fullWidth
        maxWidth="md"
        resetKey={String(sessionOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              {sessionEditingId
                ? "编辑课程安排"
                : sessionHistoricalMode
                  ? "补录历史课程"
                  : "新建课程安排"}
            </DialogCloseTitle>
            <DialogContent dividers sx={{ bgcolor: palette.soft }}>
              <Stack spacing={2}>
                {sessionHistoricalMode && (
                  <Alert severity="info">
                    历史补录允许选择过去时间，用于补齐既有课程记录；保存后仍按课程执行流程核对并推进状态。
                  </Alert>
                )}
                <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                  <SectionTitle
                    title="1 课程和时间"
                    helper="选择课程，确定本次授课时间与方式。"
                  />
                  <Box
                    sx={{
                      mt: 2,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    <TextField
                      select
                      disabled={Boolean(sessionEditingId)}
                      label="课程 *"
                      value={sessionForm.courseId}
                      onChange={(event) => {
                        markDirty();
                        const course = courses.find(
                          (item) => item.id === event.target.value,
                        );
                        const startsAt = sessionForm.startsAt
                          ? new Date(sessionForm.startsAt)
                          : new Date();
                        const endsAt = new Date(
                          startsAt.getTime() +
                            (course?.defaultDurationMinutes || 120) * 60_000,
                        );
                        const localEnd = new Date(
                          endsAt.getTime() -
                            endsAt.getTimezoneOffset() * 60_000,
                        )
                          .toISOString()
                          .slice(0, 16);
                        setSessionForm({
                          ...sessionForm,
                          courseId: event.target.value,
                          title: course
                            ? `${course.title}｜${startsAt.toLocaleDateString("zh-CN")}`
                            : "",
                          endsAt: localEnd,
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
                      label="安排名称"
                      helperText="未填写时系统会按课程名称和日期自动生成"
                      value={sessionForm.title}
                      onChange={(event) => {
                        markDirty();
                        setSessionForm({
                          ...sessionForm,
                          title: event.target.value,
                        });
                      }}
                    />
                  </Box>
                  <Box
                    sx={{
                      mt: 2,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    <TextField
                      type="datetime-local"
                      label="开始时间 *"
                      InputLabelProps={{ shrink: true }}
                      inputProps={
                        !sessionHistoricalMode && !sessionEditingId
                          ? {
                              min: new Date(
                                Date.now() -
                                  new Date().getTimezoneOffset() * 60_000,
                              )
                                .toISOString()
                                .slice(0, 16),
                            }
                          : undefined
                      }
                      value={sessionForm.startsAt}
                      onChange={(event) => {
                        markDirty();
                        const start = new Date(event.target.value);
                        const duration =
                          selectedSessionCourse?.defaultDurationMinutes || 120;
                        const end = new Date(
                          start.getTime() + duration * 60_000,
                        );
                        const localEnd = Number.isNaN(end.getTime())
                          ? sessionForm.endsAt
                          : new Date(
                              end.getTime() - end.getTimezoneOffset() * 60_000,
                            )
                              .toISOString()
                              .slice(0, 16);
                        setSessionForm({
                          ...sessionForm,
                          startsAt: event.target.value,
                          endsAt: localEnd,
                        });
                      }}
                    />
                    <TextField
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
                    <TextField
                      select
                      label="授课方式 *"
                      value={sessionForm.deliveryMode}
                      onChange={(event) => {
                        markDirty();
                        setSessionForm({
                          ...sessionForm,
                          deliveryMode: event.target
                            .value as CreateAcademySessionInput["deliveryMode"],
                          venue: "",
                          meetingUrl: "",
                        });
                      }}
                    >
                      {Object.entries(deliveryModeLabel).map(
                        ([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ),
                      )}
                    </TextField>
                    {sessionForm.deliveryMode === "ONLINE" ? (
                      <TextField
                        label="线上会议链接 *"
                        value={sessionForm.meetingUrl || ""}
                        onChange={(event) => {
                          markDirty();
                          setSessionForm({
                            ...sessionForm,
                            meetingUrl: event.target.value,
                          });
                        }}
                      />
                    ) : (
                      <TextField
                        label={
                          sessionForm.deliveryMode === "LIVE"
                            ? "直播间 / 直播账号 *"
                            : "授课场地 *"
                        }
                        value={sessionForm.venue}
                        onChange={(event) => {
                          markDirty();
                          setSessionForm({
                            ...sessionForm,
                            venue: event.target.value,
                          });
                        }}
                      />
                    )}
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
                  <SectionTitle
                    title="2 执行流程与负责人"
                    helper="选择本次课程执行流程，再把流程角色分配给具体员工。"
                  />
                  <TextField
                    sx={{ mt: 2 }}
                    fullWidth
                    select
                    disabled={Boolean(sessionEditingId)}
                    label="课程执行流程 *"
                    value={sessionForm.sopTemplateId || ""}
                    helperText={
                      sessionEditingId
                        ? "已生成任务的安排不能更换流程"
                        : "选择后可预览本次会生成的步骤"
                    }
                    onChange={(event) => {
                      markDirty();
                      setSessionForm({
                        ...sessionForm,
                        sopTemplateId: event.target.value,
                      });
                    }}
                  >
                    {sopTemplates
                      .filter((item) => item.status === "ACTIVE")
                      .map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                          {item.name} · {item.steps.length} 步
                        </MenuItem>
                      ))}
                  </TextField>
                  {selectedSessionTemplate && (
                    <Paper
                      variant="outlined"
                      sx={{ mt: 1.5, p: 1.5, bgcolor: palette.soft }}
                    >
                      <Stack spacing={0.7}>
                        <Typography fontSize={13} fontWeight={900}>
                          本次将生成 {selectedSessionTemplate.steps.length}{" "}
                          个执行步骤
                        </Typography>
                        {selectedSessionTemplate.steps.map((step, index) => (
                          <Stack
                            key={step.id || step.stepKey}
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <Chip size="small" label={index + 1} />
                            <Typography fontSize={13} fontWeight={800}>
                              {step.title}
                            </Typography>
                            <Typography fontSize={12} color="text.secondary">
                              ·{" "}
                              {step.completionMode === "ATTACHMENT"
                                ? "上传附件"
                                : step.completionMode === "NOTE"
                                  ? "填写说明"
                                  : step.completionMode === "CHECKLIST"
                                    ? "检查确认"
                                    : "直接确认"}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Paper>
                  )}
                  <Box
                    sx={{
                      mt: 2,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    {visibleSessionOwnerFields.map(([key, label]) => (
                      <TextField
                        key={key}
                        select
                        label={label}
                        value={String(sessionForm[key] || "")}
                        onChange={(event) => {
                          markDirty();
                          const value = event.target.value;
                          setSessionForm({
                            ...sessionForm,
                            [key]: value,
                            ...(key === "projectOwnerUserId"
                              ? { facilitatorUserId: value }
                              : {}),
                          });
                        }}
                      >
                        {academyUsers.map((user) => (
                          <MenuItem key={user.id} value={user.id}>
                            {user.name}（{user.positionName || user.role}）
                          </MenuItem>
                        ))}
                      </TextField>
                    ))}
                    <TextField
                      select
                      label="允许销售邀约"
                      value={sessionForm.isInvitable ? "YES" : "NO"}
                      onChange={(event) => {
                        markDirty();
                        setSessionForm({
                          ...sessionForm,
                          isInvitable: event.target.value === "YES",
                        });
                      }}
                    >
                      <MenuItem value="YES">允许</MenuItem>
                      <MenuItem value="NO">不允许</MenuItem>
                    </TextField>
                  </Box>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{ ...panelSx, p: 2, bgcolor: palette.blueSoft }}
                >
                  <Typography fontWeight={900}>
                    保存后生成本次课程任务
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    {selectedSessionTemplate?.name || "尚未选择课程流程"}；共{" "}
                    {selectedSessionTemplate?.steps.length || 0}{" "}
                    步。以后调整流程设置，不影响本次已生成任务。
                  </Typography>
                </Paper>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={
                  saving ||
                  !sessionForm.courseId ||
                  !sessionForm.sopTemplateId ||
                  !sessionForm.startsAt ||
                  !sessionForm.endsAt ||
                  missingSessionOwner ||
                  (sessionForm.deliveryMode === "ONLINE"
                    ? !sessionForm.meetingUrl?.trim()
                    : !sessionForm.venue.trim())
                }
                onClick={() => void saveSession()}
              >
                {sessionEditingId ? "保存课程安排" : "保存课程安排并生成任务"}
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <ProtectedFormDialog
        open={engagementOpen}
        onClose={() => setEngagementOpen(false)}
        submitting={saving}
        markButtonClicksDirty={false}
        fullWidth
        maxWidth={
          engagementMode === "sales" && !engagementEditingId ? "lg" : "sm"
        }
        resetKey={String(engagementOpen)}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              {engagementMode === "execution"
                ? "记录学员执行"
                : engagementEditingId
                  ? "客户跟进"
                  : "添加邀约客户"}
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                {engagementMode === "execution" ? (
                  <>
                    <TextField
                      label="学员"
                      value={engagementForm.participantName}
                      disabled
                    />
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                        gap: 1.5,
                      }}
                    >
                      <TextField
                        select
                        label="到课状态"
                        value={engagementForm.attendanceStatus}
                        onChange={(event) => {
                          markDirty();
                          setEngagementForm({
                            ...engagementForm,
                            attendanceStatus: event.target.value,
                          });
                        }}
                      >
                        <MenuItem value="UNKNOWN">未确认</MenuItem>
                        <MenuItem value="ATTENDED">已到课</MenuItem>
                        <MenuItem value="ABSENT">未到课</MenuItem>
                      </TextField>
                      <TextField
                        select
                        label="课堂互动"
                        value={engagementForm.interactionLevel || ""}
                        onChange={(event) => {
                          markDirty();
                          setEngagementForm({
                            ...engagementForm,
                            interactionLevel: event.target.value,
                          });
                        }}
                      >
                        <MenuItem value="">待记录</MenuItem>
                        <MenuItem value="HIGH">高</MenuItem>
                        <MenuItem value="MEDIUM">中</MenuItem>
                        <MenuItem value="LOW">低</MenuItem>
                      </TextField>
                      <TextField
                        select
                        label="课程评估"
                        value={engagementForm.courseAssessment || ""}
                        onChange={(event) => {
                          markDirty();
                          setEngagementForm({
                            ...engagementForm,
                            courseAssessment: event.target.value,
                          });
                        }}
                      >
                        <MenuItem value="">待评估</MenuItem>
                        <MenuItem value="A">A类重点跟进</MenuItem>
                        <MenuItem value="B">B类建立计划</MenuItem>
                        <MenuItem value="C">C类持续培育</MenuItem>
                      </TextField>
                    </Box>
                  </>
                ) : (
                  <>
                    {engagementEditingId ? (
                      <TextField
                        label="CRM客户"
                        value={engagementForm.participantName}
                        disabled
                      />
                    ) : (
                      <Stack spacing={1.2}>
                        <TextField
                          size="small"
                          label="搜索CRM客户"
                          placeholder="输入客户姓名、公司或手机号"
                          value={customerSearch}
                          onChange={(event) =>
                            setCustomerSearch(event.target.value)
                          }
                          InputProps={{
                            startAdornment: (
                              <SearchIcon sx={{ mr: 0.8, color: "#98A2B3" }} />
                            ),
                          }}
                        />
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          spacing={1}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={
                              !customers.length || customerSearchLoading
                            }
                            onClick={() => {
                              markDirty();
                              setSelectedInviteCustomers((current) => {
                                const selectedById = new Map(
                                  current.map((customer) => [
                                    customer.id,
                                    customer,
                                  ]),
                                );
                                customers
                                  .filter(
                                    (customer) =>
                                      !existingInviteCustomerIds.has(
                                        customer.id,
                                      ),
                                  )
                                  .slice(
                                    0,
                                    Math.max(0, 100 - selectedById.size),
                                  )
                                  .forEach((customer) =>
                                    selectedById.set(customer.id, customer),
                                  );
                                return Array.from(selectedById.values());
                              });
                            }}
                          >
                            全选当前页
                          </Button>
                          <Typography fontSize={12.5} color="text.secondary">
                            已选 {selectedInviteCustomers.length}/100 位 · 共{" "}
                            {customerResultTotal} 位本人可见客户
                          </Typography>
                        </Stack>
                        <Paper
                          variant="outlined"
                          sx={{ ...panelSx, overflow: "hidden" }}
                        >
                          <TableContainer sx={{ maxHeight: 390 }}>
                            <SystemDataTable
                              tableId="academy-invite-customer-picker"
                              sx={{ minWidth: 760 }}
                            >
                              <TableHead>
                                <TableRow>
                                  <TableCell padding="checkbox" />
                                  <TableCell>客户</TableCell>
                                  <TableCell>公司</TableCell>
                                  <TableCell>手机号</TableCell>
                                  <TableCell>客户标签</TableCell>
                                  <TableCell>销售负责人</TableCell>
                                  <TableCell>状态</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {customers.map((customer) => {
                                  const selected = selectedInviteCustomers.some(
                                    (item) => item.id === customer.id,
                                  );
                                  const alreadyAdded =
                                    existingInviteCustomerIds.has(customer.id);
                                  const selectionFull =
                                    !selected &&
                                    selectedInviteCustomers.length >= 100;
                                  return (
                                    <TableRow
                                      key={customer.id}
                                      hover={!alreadyAdded}
                                    >
                                      <TableCell padding="checkbox">
                                        <Checkbox
                                          checked={selected || alreadyAdded}
                                          disabled={
                                            alreadyAdded || selectionFull
                                          }
                                          onChange={() => {
                                            markDirty();
                                            setSelectedInviteCustomers(
                                              (current) =>
                                                selected
                                                  ? current.filter(
                                                      (item) =>
                                                        item.id !== customer.id,
                                                    )
                                                  : current.length < 100
                                                    ? [...current, customer]
                                                    : current,
                                            );
                                          }}
                                          inputProps={{
                                            "aria-label": alreadyAdded
                                              ? `客户 ${customer.name} 已在名单`
                                              : `选择客户 ${customer.name}`,
                                          }}
                                        />
                                      </TableCell>
                                      <TableCell sx={{ fontWeight: 850 }}>
                                        {customer.name}
                                      </TableCell>
                                      <TableCell>
                                        {customer.company || "未填写"}
                                      </TableCell>
                                      <TableCell>
                                        {customer.phone || "未填写"}
                                      </TableCell>
                                      <TableCell>
                                        {customer.tags
                                          ?.slice(0, 2)
                                          .join("、") || "暂无标签"}
                                      </TableCell>
                                      <TableCell>
                                        {customer.owner || "待分配"}
                                      </TableCell>
                                      <TableCell>
                                        {alreadyAdded ? (
                                          <Chip size="small" label="已在名单" />
                                        ) : (
                                          "可添加"
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                                {!customers.length &&
                                  !customerSearchLoading &&
                                  !customerLoadError && (
                                    <TableRow>
                                      <TableCell
                                        colSpan={7}
                                        align="center"
                                        sx={{ py: 5 }}
                                      >
                                        <Typography fontWeight={850}>
                                          未找到本人可见客户
                                        </Typography>
                                        <Typography
                                          fontSize={12.5}
                                          color="text.secondary"
                                          sx={{ mt: 0.5 }}
                                        >
                                          请调整姓名、公司或手机号搜索条件
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                {customerSearchLoading && (
                                  <TableRow>
                                    <TableCell
                                      colSpan={7}
                                      align="center"
                                      sx={{ py: 5 }}
                                    >
                                      <CircularProgress size={24} />
                                      <Typography
                                        fontSize={12.5}
                                        color="text.secondary"
                                        sx={{ mt: 1 }}
                                      >
                                        正在加载CRM客户…
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                )}
                                {customerLoadError &&
                                  !customerSearchLoading && (
                                    <TableRow>
                                      <TableCell
                                        colSpan={7}
                                        align="center"
                                        sx={{ py: 5, color: "error.main" }}
                                      >
                                        {customerLoadError}
                                      </TableCell>
                                    </TableRow>
                                  )}
                              </TableBody>
                            </SystemDataTable>
                          </TableContainer>
                          <TablePagination
                            count={customerResultTotal}
                            page={customerPage}
                            rowsPerPage={customerPageSize}
                            onPageChange={(_, next) => setCustomerPage(next)}
                            onRowsPerPageChange={(event) => {
                              setCustomerPageSize(Number(event.target.value));
                              setCustomerPage(0);
                            }}
                          />
                        </Paper>
                        <Typography fontSize={12} color="text.secondary">
                          加入后统一进入“待邀约”，跨页选择会保留；单次最多添加100位，已有客户不会重复加入。
                        </Typography>
                      </Stack>
                    )}
                    {engagementEditingId && (
                      <>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            gap: 1.5,
                          }}
                        >
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
                            select
                            label="ABC分层"
                            value={engagementForm.courseAssessment || ""}
                            onChange={(event) => {
                              markDirty();
                              setEngagementForm({
                                ...engagementForm,
                                courseAssessment: event.target.value,
                              });
                            }}
                          >
                            <MenuItem value="">待分层</MenuItem>
                            <MenuItem value="A">A类重点跟进</MenuItem>
                            <MenuItem value="B">B类建立计划</MenuItem>
                            <MenuItem value="C">C类持续培育</MenuItem>
                          </TextField>
                        </Box>
                        <TextField
                          type="datetime-local"
                          label="下次跟进时间"
                          InputLabelProps={{ shrink: true }}
                          value={
                            engagementForm.nextFollowUpAt?.slice(0, 16) || ""
                          }
                          onChange={(event) => {
                            markDirty();
                            setEngagementForm({
                              ...engagementForm,
                              nextFollowUpAt: event.target.value,
                            });
                          }}
                        />
                        <TextField
                          multiline
                          minRows={2}
                          required
                          label="跟进内容 *"
                          value={engagementForm.notes || ""}
                          onChange={(event) => {
                            markDirty();
                            setEngagementForm({
                              ...engagementForm,
                              notes: event.target.value,
                            });
                          }}
                        />
                      </>
                    )}
                  </>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={
                  saving ||
                  (engagementMode === "sales" &&
                    !engagementEditingId &&
                    !selectedInviteCustomers.length) ||
                  (engagementMode === "sales" &&
                    Boolean(engagementEditingId) &&
                    (!engagementForm.customerId ||
                      !engagementForm.notes?.trim()))
                }
                onClick={() =>
                  void (engagementMode === "sales" && !engagementEditingId
                    ? saveBatchInvites()
                    : saveEngagement())
                }
              >
                {engagementMode === "execution"
                  ? "保存学员执行"
                  : engagementEditingId
                    ? "保存并同步CRM跟进"
                    : `加入名单（${selectedInviteCustomers.length}）`}
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <ProtectedFormDialog
        open={assetOpen}
        onClose={() => setAssetOpen(false)}
        submitting={saving}
        markButtonClicksDirty={false}
        fullWidth
        maxWidth="md"
        resetKey={`${assetCourseId}:${assetType}:${assetOpen}`}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              上传课程资产
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <TextField
                  select
                  label="资产类型 *"
                  value={assetType}
                  onChange={(event) => {
                    markDirty();
                    setAssetType(event.target.value as AcademyAssetType);
                  }}
                >
                  {assetTypes.map((item) => (
                    <MenuItem key={item.value} value={item.value}>
                      {item.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="资产名称 *"
                  value={assetTitle}
                  onChange={(event) => {
                    markDirty();
                    setAssetTitle(event.target.value);
                  }}
                />
                {existingAssetAttachments.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      已关联文件
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      flexWrap="wrap"
                    >
                      {existingAssetAttachments.map((attachment) => (
                        <Chip
                          key={attachment.id}
                          label={attachment.name}
                          variant="outlined"
                          size="small"
                        />
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      已保存文件保持只读；本次可继续追加新文件，避免取消编辑时误删原文件。
                    </Typography>
                  </Box>
                )}
                <BusinessAttachmentPicker
                  title="课程资产文件"
                  description="支持课件、文档、图片和 MP4 回放；文件保存在业务附件私有目录。"
                  value={assetAttachments}
                  onChange={(attachments) => {
                    markDirty();
                    setAssetAttachments(attachments);
                  }}
                  category="academy-course-asset"
                  draftKey={`academy-course-${assetCourseId}-${assetType}`}
                  imagesOnly={false}
                  maxCount={20}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={
                  saving ||
                  !assetTitle.trim() ||
                  existingAssetAttachments.length + assetAttachments.length ===
                    0
                }
                onClick={() => void saveCourseAsset()}
              >
                保存并关联当前版本
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      <ProtectedFormDialog
        open={Boolean(orderLink)}
        onClose={() => setOrderLink(null)}
        submitting={saving}
        markButtonClicksDirty={false}
        fullWidth
        maxWidth="sm"
        resetKey={orderLink?.engagement.id || ""}
      >
        {({ markDirty, requestClose }) => (
          <>
            <DialogCloseTitle onClose={() => void requestClose()}>
              关联正式订单
            </DialogCloseTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Typography color="text.secondary">
                  学员：{orderLink?.engagement.participantName}
                  。成交金额和后续交付以所选正式订单为准。
                </Typography>
                <TextField
                  select
                  label="正式订单 *"
                  value={selectedOrderId}
                  onChange={(event) => {
                    markDirty();
                    setSelectedOrderId(event.target.value);
                  }}
                >
                  {orderLink?.orders.map((order) => (
                    <MenuItem key={order.id} value={order.id}>
                      {order.orderNo} ·{" "}
                      {order.productName || order.productLevel} · ¥
                      {Number(order.actualAmount || 0).toLocaleString("zh-CN")}
                    </MenuItem>
                  ))}
                </TextField>
                {!orderLink?.orders.length && (
                  <Typography color="text.secondary">
                    该客户暂无可关联的正式订单。
                  </Typography>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => void requestClose()}>取消</Button>
              <Button
                variant="contained"
                disabled={saving || !selectedOrderId}
                onClick={() => void saveOrderLink()}
              >
                确认关联
              </Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      {feedbackDialog}
    </ModulePage>
  );
};

const WorkbenchOverview: React.FC<{
  sessions: AcademyPublicCalendarItem[];
  managedSessions: AcademySession[];
  canManageSessions: boolean;
  tasks: AcademyMyTask[];
  priorityTasks: AcademyMyTask[];
  openTaskTotal: number;
  reviewTaskTotal: number;
  taskTotal: number;
  taskPage: number;
  taskPageSize: number;
  taskView: "OPEN" | "REVIEW" | "HISTORY";
  canReviewTasks: boolean;
  onTaskViewChange: (value: "OPEN" | "REVIEW" | "HISTORY") => void;
  onTaskPageChange: (page: number) => void;
  onTaskPageSizeChange: (pageSize: number) => void;
  onOpenTask: (task: AcademyMyTask) => void;
  onChangeSessionStatus: (
    session: AcademySession,
    status: AcademySession["status"],
  ) => void;
  requestedSessionId?: string;
  onRequestedSessionConsumed: () => void;
}> = ({
  sessions,
  managedSessions,
  canManageSessions,
  tasks,
  priorityTasks,
  openTaskTotal,
  reviewTaskTotal,
  taskTotal,
  taskPage,
  taskPageSize,
  taskView,
  canReviewTasks,
  onTaskViewChange,
  onTaskPageChange,
  onTaskPageSizeChange,
  onOpenTask,
  onChangeSessionStatus,
  requestedSessionId,
  onRequestedSessionConsumed,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [flowOpen, setFlowOpen] = useState(false);
  const now = new Date();
  const monday = new Date(now);
  const weekday = monday.getDay() || 7;
  monday.setDate(monday.getDate() - weekday + 1);
  monday.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date,
      sessions: sessions.filter(
        (session) =>
          new Date(session.startsAt).toDateString() === date.toDateString(),
      ),
    };
  });
  const activeCourses = sessions.filter(
    (session) => !["COMPLETED", "CANCELLED"].includes(session.status),
  );
  useEffect(() => {
    if (
      !requestedSessionId ||
      !activeCourses.some((session) => session.id === requestedSessionId)
    )
      return;
    setSelectedCourseId(requestedSessionId);
    onRequestedSessionConsumed();
  }, [activeCourses, onRequestedSessionConsumed, requestedSessionId]);
  useEffect(() => {
    if (activeCourses.some((session) => session.id === selectedCourseId)) return;
    setSelectedCourseId(
      activeCourses.find((session) => session.status === "IN_PROGRESS")?.id ||
        activeCourses.find((session) => session.status === "POST_COURSE")?.id ||
        activeCourses[0]?.id ||
        "",
    );
  }, [activeCourses, selectedCourseId]);

  const selectedCourse =
    activeCourses.find((session) => session.id === selectedCourseId) || null;
  const selectedManagedCourse =
    managedSessions.find((session) => session.id === selectedCourseId) || null;
  const priorityTask = getAcademyPriorityTask(priorityTasks, now);
  const summary = getAcademyWorkbenchSummary({
    openTaskTotal,
    reviewTaskTotal,
    sessions,
    now,
  });
  const phaseProgress = selectedCourse
    ? getCoursePhaseProgress(selectedCourse)
    : [];
  const currentPhase = selectedCourse
    ? ["PLANNED", "READY"].includes(selectedCourse.status)
      ? "BEFORE"
      : selectedCourse.status === "IN_PROGRESS"
        ? "DURING"
        : "AFTER"
    : null;
  const statusAction =
    selectedManagedCourse && canManageSessions
      ? selectedManagedCourse.status === "PLANNED"
        ? { label: "确认待开课", status: "READY" as const, category: "BEFORE" as const }
        : selectedManagedCourse.status === "READY"
          ? { label: "开始课程", status: "IN_PROGRESS" as const, category: null }
          : selectedManagedCourse.status === "IN_PROGRESS"
            ? { label: "结束授课，进入课后跟进", status: "POST_COURSE" as const, category: "DURING" as const }
            : selectedManagedCourse.status === "POST_COURSE"
              ? { label: "确认课程完结", status: "COMPLETED" as const, category: "AFTER" as const }
              : null
      : null;
  const incompleteRequiredTasks = statusAction?.category
    ? selectedCourse?.tasks.filter(
        (task) =>
          task.category === statusAction.category &&
          task.isRequired &&
          task.status !== "DONE",
      ) || []
    : [];
  const phaseLabel: Record<string, string> = {
    BEFORE: "课前准备",
    DURING: "课程执行",
    AFTER: "课后跟进",
  };
  const isOverdue = (value?: string) => Boolean(value && new Date(value) < now);

  return (
    <>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle title="工作台概览" helper="先看今天最重要的任务和正在执行的课程" />
        <Box
          sx={{
            mt: 1.25,
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
            gap: 1,
          }}
        >
          {([
            ["待我处理", summary.openTaskTotal, palette.blue, <TaskAltIcon fontSize="small" />],
            ["待我验收", summary.reviewTaskTotal, palette.purple, <EventAvailableOutlinedIcon fontSize="small" />],
            ["今日课程", summary.todayCourseTotal, palette.amber, <CalendarMonthIcon fontSize="small" />],
            ["授课中", summary.activeCourseTotal, palette.green, <AutoStoriesIcon fontSize="small" />],
          ] as Array<[string, number, string, React.ReactNode]>).map(([label, value, color, icon]) => (
            <Paper key={String(label)} variant="outlined" sx={{ p: 1.25, borderColor: palette.line }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography fontSize={12.5} color="text.secondary">{label}</Typography>
                  <Typography fontSize={24} fontWeight={950} color={String(color)}>{value}</Typography>
                </Box>
                <Box sx={{ color }}>{icon}</Box>
              </Stack>
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          ...panelSx,
          p: { xs: 1.5, md: 1.8 },
          borderColor: priorityTask ? "#B9D2FF" : palette.line,
          background: priorityTask ? "linear-gradient(135deg, #F7FAFF 0%, #FFFFFF 75%)" : "#fff",
        }}
      >
        <SectionTitle
          title="我的下一步"
          helper={priorityTask ? "系统已按驳回、受阻、逾期和截止时间排好优先级" : "当前没有需要你处理的课程任务"}
        />
        {priorityTask ? (
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "center" }}
            spacing={1.5}
            sx={{ mt: 1.4 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={phaseLabel[priorityTask.category]} sx={{ bgcolor: palette.blueSoft, color: palette.blue }} />
                {isOverdue(priorityTask.dueAt) && <Chip size="small" label="已逾期" sx={{ bgcolor: palette.redSoft, color: palette.red }} />}
                <Typography fontSize={13} color="text.secondary">{priorityTask.session.title}</Typography>
              </Stack>
              <Typography sx={{ mt: 0.8, fontSize: 19, fontWeight: 950, color: palette.ink }}>
                {priorityTask.title}
              </Typography>
              <Typography sx={{ mt: 0.45 }} fontSize={13} color="text.secondary">
                完成标准：{priorityTask.acceptanceCriteria || "按任务要求完成并确认"}
              </Typography>
              <Typography fontSize={12.5} color={isOverdue(priorityTask.dueAt) ? palette.red : "text.secondary"}>
                截止时间：{formatDate(priorityTask.dueAt)} · 验收人：{priorityTask.requiresReview ? priorityTask.session.taskReviewerUserName || priorityTask.reviewerUserName || "待指定" : "无需验收"}
              </Typography>
            </Box>
            <Button variant="contained" size="large" onClick={() => onOpenTask(priorityTask)} sx={{ minWidth: 116 }}>
              {priorityTask.status === "REJECTED" ? "重新处理" : "去完成"}
            </Button>
          </Stack>
        ) : (
          <Box sx={{ py: 2.5, textAlign: "center" }}>
            <Typography fontWeight={900}>今天没有待办，工作已清空</Typography>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
          <Box>
            <Typography fontWeight={900} fontSize={16}>本周课程计划</Typography>
            <Typography fontSize={12.5} color="text.secondary">
              {monday.toLocaleDateString("zh-CN")} ～ {weekDays[6].date.toLocaleDateString("zh-CN")} · 全员可见 · 只读
            </Typography>
          </Box>
          <Chip size="small" label="全员课程周历" sx={{ alignSelf: { sm: "center" }, bgcolor: palette.blueSoft, color: palette.blue }} />
        </Stack>
        <Box
          title="全员课程周历"
          sx={{
            mt: 1.2,
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(128px, 1fr))",
            overflowX: "auto",
            border: `1px solid ${palette.line}`,
            borderRadius: 1.2,
          }}
        >
          {weekDays.map(({ date, sessions: daySessions }, index) => (
            <Box key={date.toISOString()} sx={{ minHeight: 126, p: 1, minWidth: 128, borderRight: index < 6 ? `1px solid ${palette.line}` : 0, bgcolor: date.toDateString() === now.toDateString() ? "#F5F9FF" : "#fff" }}>
              <Typography fontSize={12.5} fontWeight={900}>
                周{"一二三四五六日"[index]} <Box component="span" color="text.secondary">{String(date.getMonth() + 1).padStart(2, "0")}-{String(date.getDate()).padStart(2, "0")}</Box>
              </Typography>
              <Box sx={{ maxHeight: 112, overflowY: "auto", pr: 0.3 }}>
                {daySessions.map((session) => (
                  <Box key={session.id} sx={{ mt: 0.8, pl: 0.8, borderLeft: `3px solid ${session.status === "COMPLETED" ? palette.green : palette.blue}` }}>
                    <Typography fontSize={11.5} color="text.secondary">
                      {new Date(session.startsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </Typography>
                    <Typography fontSize={12.5} fontWeight={850} title={session.title}>{session.title}</Typography>
                  </Box>
                ))}
              </Box>
              {!daySessions.length && <Typography fontSize={12} color="#A0A8B8" sx={{ mt: 3.5, textAlign: "center" }}>暂无安排</Typography>}
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ ...panelSx, p: { xs: 1.5, md: 1.8 } }}>
        <SectionTitle
          title="课程阶段进度"
          helper={selectedCourse ? `${selectedCourse.title} · ${selectedCourse.progress.done}/${selectedCourse.progress.total} 已完成` : "当前没有未完结课程"}
          action={activeCourses.length ? (
            <TextField select size="small" label="查看未完结课程" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)} sx={{ minWidth: 240 }}>
              {activeCourses.map((session) => <MenuItem key={session.id} value={session.id}>{session.title} · {new Date(session.startsAt).toLocaleDateString("zh-CN")}</MenuItem>)}
            </TextField>
          ) : undefined}
        />
        {selectedCourse ? (
          <>
            <Box sx={{ mt: 1.4, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1 }}>
              {phaseProgress.map((phase) => {
                const active = phase.category === currentPhase;
                return (
                  <Paper key={phase.category} variant="outlined" sx={{ p: 1.25, borderColor: active ? palette.blue : palette.line, bgcolor: active ? palette.blueSoft : "#fff" }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={900}>{phase.label}</Typography>
                      <Typography fontWeight={950} color={active ? palette.blue : palette.ink}>{phase.done}/{phase.total}</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={phase.percent} sx={{ mt: 1, height: 6, borderRadius: 3 }} />
                    <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.6 }}>{active ? "当前阶段" : phase.total === 0 ? "无任务" : phase.done === phase.total ? "已完成" : "待推进"}</Typography>
                  </Paper>
                );
              })}
            </Box>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1.2} sx={{ mt: 1.3, p: 1.25, borderRadius: 1.2, bgcolor: palette.soft }}>
              <Box>
                <Typography fontSize={12} color="text.secondary">当前步骤</Typography>
                <Typography fontWeight={950}>{selectedCourse.currentStep?.title || "当前阶段任务已完成"}</Typography>
                <Typography fontSize={12.5} color="text.secondary">
                  当前接力人：{selectedCourse.currentStep?.assigneeUserName || "暂无"} · 截止：{formatDate(selectedCourse.currentStep?.dueAt)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button variant="outlined" onClick={() => setFlowOpen(true)}>查看全部流程</Button>
                {statusAction && (
                  <Button variant="contained" disabled={incompleteRequiredTasks.length > 0} onClick={() => onChangeSessionStatus(selectedManagedCourse!, statusAction.status)}>
                    {statusAction.label}
                  </Button>
                )}
              </Stack>
            </Stack>
            {statusAction && incompleteRequiredTasks.length > 0 && (
              <Alert severity="info" sx={{ mt: 1 }}>
                还有 {incompleteRequiredTasks.length} 项本阶段必做任务未完成，完成后才能“{statusAction.label}”。
              </Alert>
            )}
          </>
        ) : (
          <Box sx={{ py: 3, textAlign: "center" }}><Typography color="text.secondary">新的课程安排创建后会显示在这里</Typography></Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle title="我的课程任务" helper={taskView === "OPEN" ? `${taskTotal} 项等你处理` : taskView === "REVIEW" ? `${taskTotal} 项等你验收` : `${taskTotal} 条处理记录`} />
        <Tabs value={taskView} onChange={(_, value) => onTaskViewChange(value)} sx={{ mt: 0.5, minHeight: 42 }}>
          <Tab value="OPEN" label="待我处理" />
          {canReviewTasks && <Tab value="REVIEW" label="待我验收" />}
          <Tab value="HISTORY" label="处理记录" />
        </Tabs>
        <TableContainer sx={{ mt: 1 }}>
          <SystemDataTable tableId="academy-overview-execution-tasks">
            <TableHead><TableRow><TableCell>任务内容</TableCell><TableCell>所属课程</TableCell><TableCell>阶段</TableCell><TableCell>截止时间</TableCell><TableCell>状态</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.eventId || task.id} hover>
                  <TableCell sx={{ fontWeight: 750 }}>{task.title}</TableCell>
                  <TableCell>{task.session.title}</TableCell>
                  <TableCell>{phaseLabel[task.category]}</TableCell>
                  <TableCell sx={{ color: isOverdue(task.dueAt) && taskView === "OPEN" ? palette.red : undefined }}>{formatDate(task.dueAt)}</TableCell>
                  <TableCell><Chip size="small" label={taskStatusLabel[task.status] || task.status} sx={{ height: 22, bgcolor: task.status === "BLOCKED" || task.status === "REJECTED" ? palette.redSoft : palette.blueSoft, color: task.status === "BLOCKED" || task.status === "REJECTED" ? palette.red : palette.blue }} /></TableCell>
                  <TableCell align="right"><Button size="small" onClick={() => onOpenTask(task)}>{taskView === "OPEN" ? "去处理" : taskView === "REVIEW" ? "去验收" : "查看结果"}</Button></TableCell>
                </TableRow>
              ))}
              {!tasks.length && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>{taskView === "OPEN" ? "当前没有待处理任务" : taskView === "REVIEW" ? "当前没有待验收任务" : "暂无处理记录"}</TableCell></TableRow>}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination count={taskTotal} page={taskPage} rowsPerPage={taskPageSize} onPageChange={(_, next) => onTaskPageChange(next)} onRowsPerPageChange={(event) => onTaskPageSizeChange(Number(event.target.value))} />
      </Paper>

      <Drawer anchor="right" open={flowOpen} onClose={() => setFlowOpen(false)} PaperProps={{ role: "dialog", "aria-modal": true, "aria-label": "完整课程流程", sx: { width: { xs: "100%", sm: 620 }, maxWidth: "100vw" } }}>
        <DialogCloseTitle onClose={() => setFlowOpen(false)}>完整课程流程</DialogCloseTitle>
        <Box sx={{ p: 2 }}>
          <Typography color="text.secondary" fontSize={13}>{selectedCourse?.title} · 仅用于查看整场进度，任务统一从“我的课程任务”处理。</Typography>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {selectedCourse?.tasks.map((task) => (
              <Paper key={`${task.stepNumber}-${task.title}`} variant="outlined" sx={{ p: 1.2 }}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Box><Typography fontWeight={900}>{task.stepNumber}. {task.title}</Typography><Typography fontSize={12.5} color="text.secondary">{phaseLabel[task.category]} · 负责人：{task.assigneeUserName || "待分配"}</Typography></Box>
                  <Chip size="small" label={taskStatusLabel[task.status] || task.status} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Drawer>
    </>
  );
};

const LegacyOverview: React.FC<{
  dashboard: AcademyDashboard;
  sessions: AcademyPublicCalendarItem[];
  managedSessions: AcademySession[];
  canManageSessions: boolean;
  tasks: AcademyMyTask[];
  taskTotal: number;
  taskPage: number;
  taskPageSize: number;
  taskView: "OPEN" | "REVIEW" | "HISTORY";
  canReviewTasks: boolean;
  onTaskViewChange: (value: "OPEN" | "REVIEW" | "HISTORY") => void;
  onTaskPageChange: (page: number) => void;
  onTaskPageSizeChange: (pageSize: number) => void;
  onOpenTask: (task: AcademyMyTask) => void;
  onChangeSessionStatus: (
    session: AcademySession,
    status: AcademySession["status"],
  ) => void;
  requestedSessionId?: string;
  onRequestedSessionConsumed: () => void;
}> = ({
  sessions,
  managedSessions,
  canManageSessions,
  tasks,
  taskTotal,
  taskPage,
  taskPageSize,
  taskView,
  canReviewTasks,
  onTaskViewChange,
  onTaskPageChange,
  onTaskPageSizeChange,
  onOpenTask,
  onChangeSessionStatus,
  requestedSessionId,
  onRequestedSessionConsumed,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState("");
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
  const todoTasks = tasks;
  const activeCourses = sessions.filter(
    (session) =>
      session.status !== "COMPLETED" && session.status !== "CANCELLED",
  );
  useEffect(() => {
    if (
      !requestedSessionId ||
      !activeCourses.some((session) => session.id === requestedSessionId)
    )
      return;
    setSelectedCourseId(requestedSessionId);
    onRequestedSessionConsumed();
  }, [activeCourses, onRequestedSessionConsumed, requestedSessionId]);
  useEffect(() => {
    if (activeCourses.some((session) => session.id === selectedCourseId))
      return;
    setSelectedCourseId(
      activeCourses.find((session) => session.status === "IN_PROGRESS")?.id ||
        activeCourses.find((session) => session.status === "POST_COURSE")?.id ||
        activeCourses[0]?.id ||
        "",
    );
  }, [activeCourses, selectedCourseId]);
  const selectedCourse =
    activeCourses.find((session) => session.id === selectedCourseId) || null;
  const selectedManagedCourse =
    managedSessions.find((session) => session.id === selectedCourseId) || null;
  const statusAction =
    selectedManagedCourse && canManageSessions
      ? selectedManagedCourse.status === "PLANNED"
        ? { label: "确认待开课", status: "READY" as const }
        : selectedManagedCourse.status === "READY"
          ? { label: "开始课程", status: "IN_PROGRESS" as const }
          : selectedManagedCourse.status === "IN_PROGRESS"
            ? { label: "结束授课，进入课后跟进", status: "POST_COURSE" as const }
            : selectedManagedCourse.status === "POST_COURSE"
              ? { label: "确认课程完结", status: "COMPLETED" as const }
              : null
      : null;
  const statusGateCategory = selectedManagedCourse?.status === "PLANNED"
    ? "BEFORE"
    : selectedManagedCourse?.status === "IN_PROGRESS"
      ? "DURING"
      : selectedManagedCourse?.status === "POST_COURSE"
        ? "AFTER"
        : null;
  const incompleteRequiredTasks = statusGateCategory
    ? selectedCourse?.tasks.filter(
        (task) =>
          task.category === statusGateCategory &&
          task.isRequired &&
          task.status !== "DONE",
      ) || []
    : [];
  const openMyStep = (taskId?: string) => {
    if (!taskId) return;
    const loadedTask = tasks.find((item) => item.id === taskId);
    if (loadedTask) return onOpenTask(loadedTask);
    const task = selectedCourse?.tasks.find((item) => item.taskId === taskId);
    if (!task || !selectedCourse) return;
    onOpenTask({
      id: taskId,
      sessionId: selectedCourse.id,
      templateKey: task.templateKey || "",
      title: task.title,
      category: task.category,
      isRequired: true,
      reviewerUserName: task.reviewerUserName,
      status: task.status,
      assigneeUserName: task.assigneeUserName,
      dueAt: task.dueAt,
      acceptanceCriteria: task.acceptanceCriteria,
      sortOrder: task.stepNumber,
      completionMode: task.completionMode || "CONFIRM",
      requiresReview: task.requiresReview === true,
      note: task.note,
      submissionNote: task.submissionNote,
      submittedAt: task.submittedAt,
      reviewedAt: task.reviewedAt,
      completedAt: task.completedAt,
      session: {
        id: selectedCourse.id,
        title: selectedCourse.title,
        startsAt: selectedCourse.startsAt,
        endsAt: selectedCourse.endsAt,
        status: selectedCourse.status,
      },
    });
  };
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
            <Chip size="small" variant="outlined" label="本周" />
          </Stack>
          <Chip
            size="small"
            label="全员可见 · 只读"
            sx={{ bgcolor: palette.blueSoft, color: palette.blue }}
          />
        </Stack>
        <Box
          title="全员课程周历"
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
                daySessions.map((session) =>
                  session.status === "COMPLETED" ? (
                    <Stack
                      key={session.id}
                      spacing={0.55}
                      sx={{
                        mt: 1.2,
                        p: 1,
                        width: "100%",
                        textAlign: "left",
                        border: `1px solid ${palette.line}`,
                        borderRadius: 1,
                        bgcolor: "#fff",
                      }}
                    >
                      <Typography
                        color={palette.green}
                        fontWeight={900}
                        fontSize={13}
                      >
                        • 已完结
                      </Typography>
                      <Typography fontSize={13}>
                        {new Date(session.startsAt).toLocaleTimeString(
                          "zh-CN",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                        –
                        {new Date(session.endsAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Typography>
                      <Typography fontWeight={900} fontSize={13.5}>
                        {session.title}
                      </Typography>
                      <Typography fontSize={12.5} color="text.secondary">
                        主讲人：{session.lecturerUserName || "待确定"}
                      </Typography>
                      <Chip
                        size="small"
                        label="已完结"
                        sx={{
                          alignSelf: "flex-start",
                          height: 22,
                          bgcolor: palette.greenSoft,
                          color: palette.green,
                          fontWeight: 800,
                        }}
                      />
                    </Stack>
                  ) : (
                    <Stack
                      component="button"
                      type="button"
                      key={session.id}
                      aria-pressed={selectedCourseId === session.id}
                      aria-label={`查看课程进度 ${session.title}`}
                      spacing={0.55}
                      onClick={() => setSelectedCourseId(session.id)}
                      sx={{
                        mt: 1.2,
                        p: 1,
                        width: "100%",
                        textAlign: "left",
                        border: `1px solid ${selectedCourseId === session.id ? palette.blue : palette.line}`,
                        borderRadius: 1,
                        bgcolor:
                          selectedCourseId === session.id
                            ? palette.blueSoft
                            : "#fff",
                        cursor: "pointer",
                        "&:focus-visible": {
                          outline: `2px solid ${palette.blue}`,
                        },
                      }}
                    >
                      <Typography
                        color={palette.blue}
                        fontWeight={900}
                        fontSize={13}
                      >
                        • 有课程
                      </Typography>
                      <Typography fontSize={13}>
                        {new Date(session.startsAt).toLocaleTimeString(
                          "zh-CN",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
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
                        主讲人：{session.lecturerUserName || "待确定"}
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
                      <Typography fontSize={11.5} color="text.secondary">
                        进度 {session.progress.done}/{session.progress.total} ·{" "}
                        {session.progress.percent}%
                      </Typography>
                    </Stack>
                  ),
                )
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

      <Paper variant="outlined" sx={{ ...panelSx, p: { xs: 1.4, md: 1.8 } }}>
        <SectionTitle
          title="课程执行接力"
          helper={
            selectedCourse
              ? `${selectedCourse.title} · 已完成 ${selectedCourse.progress.done}/${selectedCourse.progress.total}`
              : "选择未完结课程，查看现在做到哪一步"
          }
          action={
            activeCourses.length ? (
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ sm: "center" }}
              >
                <TextField
                  select
                  size="small"
                  label="查看未完结课程"
                  value={selectedCourseId}
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                  sx={{ minWidth: 240 }}
                >
                  {activeCourses.map((session) => (
                    <MenuItem key={session.id} value={session.id}>
                      {session.title} ·{" "}
                      {new Date(session.startsAt).toLocaleDateString("zh-CN")}
                    </MenuItem>
                  ))}
                </TextField>
                {selectedCourse && (
                  <Chip
                    label={`${selectedCourse.progress.percent}%`}
                    sx={{
                      bgcolor: palette.blueSoft,
                      color: palette.blue,
                      fontWeight: 950,
                      fontSize: 16,
                    }}
                  />
                )}
              </Stack>
            ) : undefined
          }
        />
        {selectedCourse ? (
          <>
            <LinearProgress
              variant="determinate"
              value={selectedCourse.progress.percent}
              sx={{ mt: 1.4, height: 8, borderRadius: 4 }}
            />
            <Paper
              variant="outlined"
              sx={{
                mt: 1.4,
                p: 1.3,
                bgcolor: palette.blueSoft,
                borderColor: "#C9DBFF",
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={1}
              >
                <Box>
                  <Typography fontSize={12} color="text.secondary">
                    当前步骤
                  </Typography>
                  <Typography fontWeight={950}>
                    {selectedCourse.currentStep
                      ? `第${selectedCourse.currentStep.stepNumber || 1}步 · ${selectedCourse.currentStep.title}`
                      : "全部流程已结束"}
                  </Typography>
                </Box>
                <Box>
                  <Typography fontSize={12} color="text.secondary">
                    当前接力人
                  </Typography>
                  <Typography fontWeight={900}>
                    {selectedCourse.currentStep?.assigneeUserName ||
                      "暂无待处理负责人"}
                  </Typography>
                </Box>
                <Box>
                  <Typography fontSize={12} color="text.secondary">
                    截止时间
                  </Typography>
                  <Typography fontWeight={800}>
                    {formatDate(selectedCourse.currentStep?.dueAt)}
                  </Typography>
                </Box>
                <Box>
                  <Typography fontSize={12} color="text.secondary">
                    验收人
                  </Typography>
                  <Typography fontWeight={800}>
                    {selectedCourse.currentStep?.requiresReview
                      ? selectedCourse.currentStep.reviewerUserName || "待指定"
                      : "无需验收"}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
            <Stack spacing={1.2} sx={{ mt: 1.6 }}>
              {([
                ["BEFORE", "课前准备"],
                ["DURING", "课程执行"],
                ["AFTER", "课后跟进"],
              ] as const).map(([category, label]) => {
                const phaseTasks = selectedCourse.tasks.filter((task) => task.category === category);
                const phaseActive =
                  (["PLANNED", "READY"].includes(selectedCourse.status) && category === "BEFORE") ||
                  (selectedCourse.status === "IN_PROGRESS" && category === "DURING") ||
                  (selectedCourse.status === "POST_COURSE" && category === "AFTER");
                return (
                  <Paper key={category} variant="outlined" sx={{ p: 1.2, opacity: phaseActive ? 1 : 0.72 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography fontWeight={950}>{label}</Typography>
                      <Chip size="small" label={phaseActive ? "当前阶段" : !phaseTasks.length ? "无任务" : phaseTasks.every((task) => task.isRequired ? task.status === "DONE" : ["DONE", "SKIPPED"].includes(task.status)) ? "已完成" : "未开始"} />
                    </Stack>
                    <Box sx={{ mt: 1, overflowX: "auto", pb: 0.5 }}>
                      <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(phaseTasks.length, 1)}, minmax(145px, 1fr))`, minWidth: Math.max(phaseTasks.length * 145, 320) }}>
                {phaseTasks.map((task) => {
                  const done = ["DONE", "SKIPPED"].includes(task.status);
                  const risky =
                    ["BLOCKED", "REJECTED"].includes(task.status) ||
                    Boolean(
                      task.dueAt && new Date(task.dueAt) < new Date() && !done,
                    );
                  return (
                    <Stack
                      component={task.isMine && phaseActive ? "button" : "div"}
                      type={task.isMine && phaseActive ? "button" : undefined}
                      key={`${task.stepNumber}-${task.title}`}
                      alignItems="center"
                      spacing={0.55}
                      onClick={
                        task.isMine && phaseActive ? () => openMyStep(task.taskId) : undefined
                      }
                      sx={{
                        position: "relative",
                        px: 0.6,
                        py: 0,
                        border: 0,
                        bgcolor: "transparent",
                        cursor: task.isMine && phaseActive ? "pointer" : "default",
                        "&:focus-visible": {
                          outline: `2px solid ${palette.blue}`,
                          borderRadius: 1,
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          bgcolor: done
                            ? palette.green
                            : risky
                              ? palette.red
                              : task.isMine
                                ? palette.blue
                                : "#fff",
                          color:
                            done || risky || task.isMine
                              ? "#fff"
                              : palette.blue,
                          border: `2px solid ${done ? palette.green : risky ? palette.red : palette.blue}`,
                          fontSize: 11,
                          fontWeight: 950,
                          zIndex: 1,
                        }}
                      >
                        {done ? "✓" : task.stepNumber || "·"}
                      </Box>
                      <Typography
                        fontSize={12}
                        fontWeight={950}
                        textAlign="center"
                      >
                        {task.title}
                      </Typography>
                      <Typography
                        fontSize={11}
                        color="text.secondary"
                        textAlign="center"
                      >
                        {task.assigneeUserName || "待分配"}
                      </Typography>
                      <Chip
                        size="small"
                        label={
                          task.isMine
                            ? phaseActive ? "我负责" : "等待阶段开始"
                            : statusLabel[task.status] || task.status
                        }
                        sx={{
                          height: 21,
                          bgcolor: task.isMine ? palette.blueSoft : undefined,
                          color: task.isMine ? palette.blue : undefined,
                          fontWeight: 800,
                        }}
                      />
                    </Stack>
                  );
                })}
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Stack>
            <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>
              {selectedCourse.currentStep?.isMine
                ? "当前轮到你处理，点击蓝色“我负责”节点即可完成。"
                : selectedCourse.currentStep
                  ? `当前等待 ${selectedCourse.currentStep.assigneeUserName || "负责人"} 处理，你可以在这里查看进度。`
                  : "全部课程任务已经完成。"}
            </Typography>
            {statusAction && (
              <Paper variant="outlined" sx={{ mt: 1.4, p: 1.3 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  spacing={1}
                >
                  <Box>
                    <Typography fontWeight={900}>课程状态</Typography>
                    <Typography fontSize={12.5} color="text.secondary">
                      {incompleteRequiredTasks.length
                        ? `还有 ${incompleteRequiredTasks.length} 项必做${statusGateCategory === "BEFORE" ? "课前" : statusGateCategory === "DURING" ? "课中" : "课后"}任务未完成，完成后才可执行“${statusAction.label}”。`
                        : `课程任务已到当前阶段，可执行“${statusAction.label}”。`}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    disabled={incompleteRequiredTasks.length > 0}
                    onClick={() =>
                      selectedManagedCourse &&
                      onChangeSessionStatus(
                        selectedManagedCourse,
                        statusAction.status,
                      )
                    }
                  >
                    {statusAction.label}
                  </Button>
                </Stack>
              </Paper>
            )}
          </>
        ) : (
          <Box sx={{ py: 5, textAlign: "center" }}>
            <Typography fontWeight={900}>当前没有未完结课程</Typography>
            <Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.5 }}>
              新的课程安排创建后会显示在这里
            </Typography>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle
          title="我的课程任务"
          helper={
            taskView === "OPEN"
              ? `${taskTotal} 项等你处理`
              : taskView === "REVIEW"
                ? `${taskTotal} 项等你验收`
                : `${taskTotal} 条处理记录`
          }
        />
        <Tabs
          value={taskView}
          onChange={(_, value) => onTaskViewChange(value)}
          sx={{ mt: 0.5, minHeight: 42 }}
        >
          <Tab value="OPEN" label="待我处理" />
          {canReviewTasks && <Tab value="REVIEW" label="待我验收" />}
          <Tab value="HISTORY" label="处理记录" />
        </Tabs>
        <TableContainer sx={{ mt: 1 }}>
          <SystemDataTable tableId="academy-overview-execution-tasks">
            <TableHead>
              <TableRow>
                <TableCell>任务内容</TableCell>
                <TableCell>关联课程安排</TableCell>
                <TableCell>
                  {taskView === "REVIEW" ? "提交人" : "完成方式"}
                </TableCell>
                <TableCell>截止时间</TableCell>
                <TableCell>状态</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {todoTasks.map((task) => (
                <TableRow key={task.eventId || task.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{task.title}</TableCell>
                  <TableCell>{task.session.title}</TableCell>
                  <TableCell>
                    {taskView === "REVIEW"
                      ? task.submittedByName || task.assigneeUserName || "-"
                      : task.completionMode === "CONFIRM"
                        ? "直接确认"
                        : task.completionMode === "ATTACHMENT"
                          ? "上传交付物"
                          : task.completionMode === "CHECKLIST"
                            ? "检查确认"
                            : "填写说明"}
                  </TableCell>
                  <TableCell>{formatDate(task.dueAt)}</TableCell>
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
                  <TableCell align="right">
                    <Button size="small" onClick={() => onOpenTask(task)}>
                      {taskView === "OPEN"
                        ? "去处理"
                        : taskView === "REVIEW"
                          ? "去验收"
                          : "查看结果"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!todoTasks.length && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    {taskView === "OPEN"
                      ? "当前没有待处理任务"
                      : taskView === "REVIEW"
                        ? "当前没有待验收任务"
                        : "暂无处理记录"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination
          count={taskTotal}
          page={taskPage}
          rowsPerPage={taskPageSize}
          onPageChange={(_, next) => onTaskPageChange(next)}
          onRowsPerPageChange={(event) =>
            onTaskPageSizeChange(Number(event.target.value))
          }
        />
      </Paper>
    </>
  );
};

export const LegacyPlans: React.FC<{
  sessions: AcademySession[];
  details: Record<string, AcademySessionDetail>;
  onCreate: (date?: Date) => void;
  canCreate: boolean;
  onNeedDetail: (id: string) => void;
  onExecute: (id: string) => void;
}> = ({ sessions, details, onCreate, canCreate, onNeedDetail, onExecute }) => {
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
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
          >
            <Typography
              sx={{ fontWeight: 900, fontSize: 16, color: palette.ink }}
            >
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
            <Button
              size="small"
              variant="outlined"
              onClick={() => setWeekOffset(0)}
            >
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
            <Button
              size="small"
              variant="outlined"
              disabled={!selected}
              onClick={() => selected && onExecute(selected.id)}
            >
              打开课程安排
            </Button>
            {canCreate && (
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => onCreate()}
              >
                新建课程安排
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
              请先创建本周课程安排
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
                      <Checkbox
                        size="small"
                        checked={task.status === "DONE"}
                        readOnly
                      />
                      {task.title}
                    </TableCell>
                    <TableCell>
                      {task.completedByName ||
                        selected?.facilitatorUserName ||
                        "待分配"}
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>
                      {task.completedAt
                        ? formatDate(task.completedAt)
                        : "待安排"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          task.status === "BLOCKED"
                            ? "高"
                            : task.status === "PENDING"
                              ? "中"
                              : "低"
                        }
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
                    <TableCell
                      sx={{
                        color:
                          task.status === "DONE" ? palette.green : palette.blue,
                      }}
                    >
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
                      当前周暂无课程安排
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

const courseStatusIcon = (label: "发布" | "归档" | "恢复") => {
  if (label === "发布") return <PublishRoundedIcon fontSize="small" />;
  if (label === "归档") return <ArchiveOutlinedIcon fontSize="small" />;
  return <RestoreOutlinedIcon fontSize="small" />;
};

const courseStatusChipSx = (status: AcademyCourse["status"]) => ({
  height: 24,
  fontWeight: 800,
  bgcolor:
    status === "ACTIVE"
      ? palette.greenSoft
      : status === "DRAFT"
        ? palette.soft
        : palette.blueSoft,
  color:
    status === "ACTIVE"
      ? palette.green
      : status === "ARCHIVED"
        ? palette.muted
        : palette.ink,
});

export const CourseDetailWorkspace: React.FC<{
  course: AcademyCourse;
  sessions: AcademySession[];
  assets: AcademyCourseAsset[];
  assetsLoading: boolean;
  assetsError?: string;
  canManage: boolean;
  statusChanging: boolean;
  onBack: () => void;
  onEdit: (course: AcademyCourse) => void;
  onUploadAsset: (course: AcademyCourse, assetType: AcademyAssetType) => void;
  onReloadAssets: (course: AcademyCourse) => void;
  onStatusChange: (
    course: AcademyCourse,
    status: AcademyCourse["status"],
  ) => void;
  onCreateSession: (course: AcademyCourse) => void;
}> = ({
  course,
  sessions,
  assets,
  assetsLoading,
  assetsError,
  canManage,
  statusChanging,
  onBack,
  onEdit,
  onUploadAsset,
  onReloadAssets,
  onStatusChange,
  onCreateSession,
}) => {
  const [detailTab, setDetailTab] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [sessionPageSize, setSessionPageSize] = useState(10);
  const sessionMaxPage = Math.max(0, Math.ceil(sessions.length / sessionPageSize) - 1);
  useEffect(() => setSessionPage(0), [course.id]);
  useEffect(() => { if (sessionPage > sessionMaxPage) setSessionPage(sessionMaxPage); }, [sessionMaxPage, sessionPage]);
  const statusAction = getCourseStatusAction(course);
  const pagedSessions = sessions.slice(
    sessionPage * sessionPageSize,
    sessionPage * sessionPageSize + sessionPageSize,
  );
  const overviewRows = [
    { label: "课程分类", value: course.category },
    { label: "转化产品", value: course.conversionProductName || "未关联" },
    { label: "课程维护人", value: course.ownerUserName },
    { label: "默认时长", value: `${course.defaultDurationMinutes} 分钟` },
    {
      label: "最近更新",
      value: new Date(course.updatedAt).toLocaleDateString("zh-CN"),
    },
  ];

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          spacing={2}
          sx={{ p: { xs: 1.5, md: 2 } }}
        >
          <Box minWidth={0}>
            <Button
              size="small"
              startIcon={<CloseIcon />}
              onClick={onBack}
              sx={{ mb: 1, ml: -1 }}
            >
              关闭课程详情
            </Button>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              useFlexGap
              flexWrap="wrap"
            >
              <Typography fontSize={{ xs: 21, md: 24 }} fontWeight={950}>
                {course.title}
              </Typography>
              <Chip
                size="small"
                label={statusLabel[course.status]}
                sx={courseStatusChipSx(course.status)}
              />
            </Stack>
            <Stack
              direction="row"
              spacing={0.8}
              useFlexGap
              flexWrap="wrap"
              sx={{ mt: 0.7 }}
            >
              <Typography fontSize={13} color="text.secondary" fontWeight={700}>
                {course.code}
              </Typography>
              <Typography fontSize={13} color="text.disabled">
                ·
              </Typography>
              <Typography fontSize={13} color="text.secondary">
                {course.category}
              </Typography>
              <Typography fontSize={13} color="text.disabled">
                ·
              </Typography>
              <Typography fontSize={13} color="text.secondary">
                最近更新{" "}
                {new Date(course.updatedAt).toLocaleDateString("zh-CN")}
              </Typography>
            </Stack>
            {assetsLoading && (
              <Typography
                role="status"
                fontSize={12}
                color="primary"
                sx={{ mt: 0.7 }}
              >
                正在加载课程资产…
              </Typography>
            )}
            {assetsError && !assetsLoading && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mt: 0.7 }}
              >
                <Typography role="alert" fontSize={12} color="error">
                  课程资产加载失败
                </Typography>
                <Button
                  size="small"
                  color="error"
                  onClick={() => onReloadAssets(course)}
                >
                  重新加载课程资产
                </Button>
              </Stack>
            )}
          </Box>
          {canManage && (
            <Stack
              direction="row"
              spacing={0.8}
              alignItems="center"
              alignSelf={{ md: "center" }}
            >
              <Tooltip title="编辑课程" arrow>
                <IconButton
                  color="primary"
                  aria-label={`编辑课程 ${course.title}`}
                  onClick={() => onEdit(course)}
                >
                  <EditOutlinedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={`${statusAction.label}课程`} arrow>
                <span>
                  <IconButton
                    color={
                      statusAction.label === "归档" ? "warning" : "success"
                    }
                    aria-label={`${statusAction.label}课程 ${course.title}`}
                    disabled={statusChanging}
                    onClick={() =>
                      onStatusChange(course, statusAction.nextStatus)
                    }
                  >
                    {statusChanging ? (
                      <CircularProgress size={20} />
                    ) : (
                      courseStatusIcon(statusAction.label)
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<EventAvailableOutlinedIcon />}
                onClick={() => onCreateSession(course)}
              >
                新建课程安排
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 2fr) minmax(280px, 1fr)",
          },
          gap: 1.5,
        }}
      >
        <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
          <Typography fontSize={16} fontWeight={950}>
            课程定位
          </Typography>
          <Typography fontSize={13.5} lineHeight={1.75} sx={{ mt: 1 }}>
            {course.summary || "当前还没有维护课程定位与简介。"}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 1.2,
              mt: 1.8,
            }}
          >
            {[
              { label: "目标客户", value: course.targetAudience || "未填写" },
              {
                label: "客户核心问题",
                value: course.customerProblem || "未填写",
              },
              { label: "核心观点", value: course.coreViewpoint || "未填写" },
              {
                label: "课程目标",
                value: course.objectives.join("；") || "未填写",
              },
            ].map((row) => (
              <Box
                key={row.label}
                sx={{ p: 1.35, borderRadius: 1.2, bgcolor: palette.soft }}
              >
                <Typography
                  fontSize={11.5}
                  color="text.secondary"
                  fontWeight={800}
                >
                  {row.label}
                </Typography>
                <Typography fontSize={13} lineHeight={1.6} sx={{ mt: 0.45 }}>
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
          <Typography fontSize={16} fontWeight={950}>
            课程运营信息
          </Typography>
          <Stack spacing={1.25} sx={{ mt: 1.4 }}>
            {overviewRows.map((row) => (
              <Stack
                key={row.label}
                direction="row"
                justifyContent="space-between"
                spacing={2}
              >
                <Typography
                  fontSize={12.5}
                  color="text.secondary"
                  fontWeight={700}
                >
                  {row.label}
                </Typography>
                <Typography fontSize={13} fontWeight={800} textAlign="right">
                  {row.value}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Tabs
          value={detailTab}
          onChange={(_, value: number) => setDetailTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ px: 1.2, borderBottom: `1px solid ${palette.line}` }}
        >
          <Tab label="课程内容" />
          <Tab
            label={
              assetsLoading
                ? "课程资产（加载中）"
                : assetsError
                  ? "课程资产（加载失败）"
                  : `课程资产（${assets.length}）`
            }
          />
          <Tab label={`场次记录（${sessions.length}）`} />
        </Tabs>
        <Box sx={{ p: { xs: 1.5, md: 2 } }}>
          {detailTab === 0 &&
            (course.objectives.length ? (
              <Stack spacing={1}>
                {course.objectives.map((objective, index) => (
                  <Stack
                    key={`${objective}-${index}`}
                    direction="row"
                    spacing={1.2}
                    alignItems="flex-start"
                    sx={{
                      p: 1.4,
                      border: `1px solid ${palette.line}`,
                      borderRadius: 1.2,
                    }}
                  >
                    <Chip size="small" label={index + 1} color="primary" />
                    <Box>
                      <Typography fontSize={13.5} fontWeight={850}>
                        {objective}
                      </Typography>
                      <Typography
                        fontSize={11.5}
                        color="text.secondary"
                        sx={{ mt: 0.3 }}
                      >
                        课程内容节点
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Stack alignItems="center" spacing={1} sx={{ py: 5 }}>
                <AutoStoriesIcon color="primary" sx={{ fontSize: 34 }} />
                <Typography fontWeight={900}>当前还没有课程内容结构</Typography>
                <Typography
                  fontSize={12.5}
                  color="text.secondary"
                  textAlign="center"
                >
                  完善课程目标后，可以继续维护课程内容节点。
                </Typography>
                {canManage && (
                  <Button variant="outlined" onClick={() => onEdit(course)}>
                    完善课程内容
                  </Button>
                )}
              </Stack>
            ))}
          {detailTab === 1 &&
            (assetsLoading ? (
              <Stack alignItems="center" spacing={1.2} sx={{ py: 6 }}>
                <CircularProgress size={28} />
                <Typography fontSize={13} color="text.secondary">
                  正在加载课程资产…
                </Typography>
              </Stack>
            ) : assetsError ? (
              <Stack alignItems="center" spacing={1.2} sx={{ py: 6 }}>
                <WarningAmberIcon color="error" sx={{ fontSize: 34 }} />
                <Typography fontWeight={900}>课程资产加载失败</Typography>
                <Typography fontSize={12.5} color="text.secondary">
                  当前不展示空数据，重新加载后再进行资产操作。
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => onReloadAssets(course)}
                >
                  重新加载课程资产
                </Button>
              </Stack>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "1fr 1fr",
                    xl: "repeat(3, 1fr)",
                  },
                  gap: 1.2,
                }}
              >
                {assetTypes.map((assetType) => {
                  const asset = assets.find(
                    (item) => item.assetType === assetType.value,
                  );
                  return (
                    <Paper
                      key={assetType.value}
                      variant="outlined"
                      sx={{ p: 1.5, borderColor: palette.line }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Box minWidth={0}>
                          <Typography fontSize={13.5} fontWeight={900}>
                            {assetType.label}
                          </Typography>
                          <Typography
                            fontSize={11.5}
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            {asset
                              ? `${asset.attachments.length} 个文件 · ${asset.ownerUserName} · ${formatDate(asset.updatedAt)}`
                              : "当前还没有上传文件"}
                          </Typography>
                        </Box>
                        {canManage && (
                          <Button
                            size="small"
                            onClick={() =>
                              onUploadAsset(course, assetType.value)
                            }
                          >
                            {asset ? "更新" : "上传"}
                          </Button>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>
            ))}
          {detailTab === 2 && (
            <>
              <TableContainer sx={{ overflowX: "auto" }}>
                <SystemDataTable
                  tableId="academy-course-session-records"
                  sx={{ minWidth: 760 }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>课程安排名称</TableCell>
                      <TableCell>开课时间</TableCell>
                      <TableCell>场地</TableCell>
                      <TableCell>负责人</TableCell>
                      <TableCell>学员</TableCell>
                      <TableCell>状态</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedSessions.map((session) => (
                      <TableRow key={session.id} hover>
                        <TableCell sx={{ fontWeight: 800 }}>
                          {session.title}
                        </TableCell>
                        <TableCell>{formatDate(session.startsAt)}</TableCell>
                        <TableCell>{session.venue || "待定"}</TableCell>
                        <TableCell>
                          {session.facilitatorUserName || "待分配"}
                        </TableCell>
                        <TableCell>
                          {session._count?.engagements || 0}/{session.capacity}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={
                              statusLabel[session.status] || session.status
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!pagedSessions.length && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                          <Stack alignItems="center" spacing={1}>
                            <CalendarMonthIcon color="primary" />
                            <Typography fontWeight={850}>
                              当前课程还没有排期记录
                            </Typography>
                            {canManage && (
                              <Button
                                variant="outlined"
                                onClick={() => onCreateSession(course)}
                              >
                                新建课程安排
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </SystemDataTable>
              </TableContainer>
              <TablePagination
                count={sessions.length}
                page={sessionPage}
                rowsPerPage={sessionPageSize}
                onPageChange={(_, next) => setSessionPage(next)}
                onRowsPerPageChange={(event) => {
                  setSessionPageSize(Number(event.target.value));
                  setSessionPage(0);
                }}
              />
            </>
          )}
        </Box>
      </Paper>
    </Stack>
  );
};

export const CourseDetailDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => (
  <Drawer
    anchor="right"
    open={open}
    onClose={onClose}
    ModalProps={{ keepMounted: true }}
    PaperProps={{
      role: "dialog",
      "aria-modal": true,
      "aria-label": "课程详情",
      sx: {
        width: { xs: "100%", sm: 680, lg: 780 },
        maxWidth: "100vw",
        bgcolor: palette.soft,
      },
    }}
  >
    <Box sx={{ height: "100%", overflowY: "auto", p: { xs: 1, sm: 1.5 } }}>
      {children}
    </Box>
  </Drawer>
);

export const CourseWorkspace: React.FC<{
  items: AcademyCourse[];
  sessions: AcademySession[];
  assets: Record<string, AcademyCourseAsset[]>;
  assetLoadingCourseIds: ReadonlySet<string>;
  assetLoadErrors: Record<string, string>;
  categories: AcademyCourseCategory[];
  canManage: boolean;
  onCreate: () => void;
  onSettings: () => void;
  onView: (course: AcademyCourse) => void;
  onEdit: (course: AcademyCourse) => void;
  onUploadAsset: (course: AcademyCourse, assetType: AcademyAssetType) => void;
  onReloadAssets: (course: AcademyCourse) => void;
  onStatusChange: (
    course: AcademyCourse,
    status: AcademyCourse["status"],
  ) => void;
  statusChangingCourseIds: ReadonlySet<string>;
  onCreateSession: (course: AcademyCourse) => void;
}> = ({
  items,
  sessions,
  assets,
  assetLoadingCourseIds,
  assetLoadErrors,
  categories,
  canManage,
  onCreate,
  onSettings,
  onView,
  onEdit,
  onUploadAsset,
  onReloadAssets,
  onStatusChange,
  statusChangingCourseIds,
  onCreateSession,
}) => {
  const [detailCourse, setDetailCourse] = useState<AcademyCourse | null>(null);
  const [draftFilters, setDraftFilters] = useState({
    search: "",
    category: "",
    status: "",
  });
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    status: "",
  });
  const [coursePage, setCoursePage] = useState(0);
  const [coursePageSize, setCoursePageSize] = useState(10);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchesSearch =
          !filters.search ||
          `${item.code}${item.title}${item.ownerUserName}${item.conversionProductName || ""}`
            .toLowerCase()
            .includes(filters.search.toLowerCase());
        return (
          matchesSearch &&
          (!filters.category || item.category === filters.category) &&
          (!filters.status || item.status === filters.status)
        );
      }),
    [filters, items],
  );
  useEffect(() => {
    const nextPage = clampPageIndex(
      coursePage,
      filtered.length,
      coursePageSize,
    );
    if (nextPage !== coursePage) setCoursePage(nextPage);
  }, [coursePage, coursePageSize, filtered.length]);
  const pageItems = filtered.slice(
    coursePage * coursePageSize,
    coursePage * coursePageSize + coursePageSize,
  );
  const selectedSessions = detailCourse
    ? sessions.filter((item) => item.courseId === detailCourse.id)
    : [];
  const selectedAssets = detailCourse ? assets[detailCourse.id] || [] : [];
  const resetFilters = () => {
    const empty = { search: "", category: "", status: "" };
    setDraftFilters(empty);
    setFilters(empty);
    setCoursePage(0);
  };
  const applyFilters = () => {
    setFilters(draftFilters);
    setCoursePage(0);
  };
  const openDetail = (course: AcademyCourse) => {
    setDetailCourse(course);
    onView(course);
  };
  useEffect(() => {
    if (!detailCourse) return;
    setDetailCourse(items.find((item) => item.id === detailCourse.id) || null);
  }, [detailCourse?.id, items]);

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography fontSize={18} fontWeight={950}>
            课程库
          </Typography>
          <Typography fontSize={12.5} color="text.secondary">
            维护可重复使用的课程内容与资产
          </Typography>
        </Box>
        {canManage && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreate}
            >
              新建课程
            </Button>
          </Stack>
        )}
      </Stack>
      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          sx={{
            p: 1.4,
            borderBottom: `1px solid ${palette.line}`,
            "& .MuiButton-root": { whiteSpace: "nowrap" },
          }}
        >
          <TextField
            size="small"
            placeholder="搜索课程名称、编码、维护人或产品"
            value={draftFilters.search}
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, search: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
            InputProps={{
              startAdornment: (
                <SearchIcon sx={{ mr: 0.8, color: "#98A2B3", fontSize: 20 }} />
              ),
            }}
            sx={{ minWidth: { xs: 0, md: 220 }, flex: { md: 1 } }}
          />
          <TextField
            select
            size="small"
            label="课程分类"
            value={draftFilters.category}
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, category: event.target.value })
            }
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">全部</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.name}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="课程状态"
            value={draftFilters.status}
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, status: event.target.value })
            }
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="DRAFT">草稿</MenuItem>
            <MenuItem value="ACTIVE">已发布</MenuItem>
            <MenuItem value="ARCHIVED">已归档</MenuItem>
          </TextField>
          <Box flex={1} />
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            onClick={resetFilters}
          >
            重置
          </Button>
          <Button variant="contained" onClick={applyFilters}>
            查询
          </Button>
          {canManage && (
            <Button
              variant="outlined"
              startIcon={<SettingsOutlinedIcon />}
              onClick={onSettings}
            >
              分类设置
            </Button>
          )}
        </Stack>
        <Typography
          fontSize={13}
          color="text.secondary"
          sx={{ px: 1.5, py: 1.2 }}
        >
          共 {filtered.length} 条
        </Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <SystemDataTable
            tableId="academy-course-library"
            sx={{
              minWidth: 1320,
              tableLayout: "auto",
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 175 }}>课程编码</TableCell>
                <TableCell sx={{ minWidth: 180 }}>课程名称</TableCell>
                <TableCell sx={{ minWidth: 120 }}>课程分类</TableCell>
                <TableCell sx={{ minWidth: 200 }}>目标客户</TableCell>
                <TableCell sx={{ minWidth: 180 }}>转化产品</TableCell>
                <TableCell sx={{ minWidth: 120 }}>课程维护人</TableCell>
                <TableCell sx={{ minWidth: 100 }}>状态</TableCell>
                <TableCell sx={{ minWidth: 140 }}>最近更新</TableCell>
                <TableCell sx={{ minWidth: 80 }}>场次</TableCell>
                <TableCell sx={{ minWidth: 150 }} align="center">
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageItems.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  onClick={() => openDetail(item)}
                  sx={{
                    cursor: "pointer",
                    "&.Mui-selected": { bgcolor: "#F1F6FF" },
                    "&.Mui-selected:hover": { bgcolor: "#EDF4FF" },
                  }}
                >
                  <TableCell sx={{ fontWeight: 750, color: "text.secondary" }}>
                    {item.code}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 850 }}>{item.title}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.targetAudience || "未填写"}</TableCell>
                  <TableCell>
                    {item.conversionProductName || "未关联"}
                  </TableCell>
                  <TableCell>{item.ownerUserName}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={statusLabel[item.status]}
                      sx={courseStatusChipSx(item.status)}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    {
                      sessions.filter((session) => session.courseId === item.id)
                        .length
                    }
                  </TableCell>
                  <TableCell
                    align="center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Stack
                      direction="row"
                      spacing={0.25}
                      justifyContent="center"
                    >
                      <Tooltip title="查看详情" arrow>
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label={`查看课程 ${item.title}`}
                          onClick={() => openDetail(item)}
                        >
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canManage && (
                        <Tooltip title="编辑课程" arrow>
                          <IconButton
                            size="small"
                            color="primary"
                            aria-label={`编辑课程 ${item.title}`}
                            onClick={() => onEdit(item)}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canManage &&
                        (() => {
                          const action = getCourseStatusAction(item);
                          const changing = statusChangingCourseIds.has(item.id);
                          return (
                            <Tooltip title={`${action.label}课程`} arrow>
                              <span>
                                <IconButton
                                  size="small"
                                  color={
                                    action.label === "归档"
                                      ? "warning"
                                      : "success"
                                  }
                                  aria-label={`${action.label}课程 ${item.title}`}
                                  disabled={changing}
                                  onClick={() =>
                                    onStatusChange(item, action.nextStatus)
                                  }
                                >
                                  {changing ? (
                                    <CircularProgress size={18} />
                                  ) : (
                                    courseStatusIcon(action.label)
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                          );
                        })()}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!pageItems.length && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    {items.length ? "当前筛选无结果" : "暂无课程数据"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination
          count={filtered.length}
          page={coursePage}
          rowsPerPage={coursePageSize}
          onPageChange={(_, next) => setCoursePage(next)}
          onRowsPerPageChange={(event) => {
            setCoursePageSize(Number(event.target.value));
            setCoursePage(0);
          }}
        />
      </Paper>
      <CourseDetailDrawer
        open={Boolean(detailCourse)}
        onClose={() => setDetailCourse(null)}
      >
        {detailCourse && (
          <CourseDetailWorkspace
            course={detailCourse}
            sessions={selectedSessions}
            assets={selectedAssets}
            assetsLoading={assetLoadingCourseIds.has(detailCourse.id)}
            assetsError={assetLoadErrors[detailCourse.id]}
            canManage={canManage}
            statusChanging={statusChangingCourseIds.has(detailCourse.id)}
            onBack={() => setDetailCourse(null)}
            onEdit={onEdit}
            onUploadAsset={onUploadAsset}
            onReloadAssets={onReloadAssets}
            onStatusChange={onStatusChange}
            onCreateSession={onCreateSession}
          />
        )}
      </CourseDetailDrawer>
    </>
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
            label="课程安排"
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
                      当前课程安排暂无学员，请从CRM添加
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
  canManage: boolean;
  onLinkOrder: (engagement: AcademyEngagement) => void;
  onEdit: (engagement: AcademyEngagement) => void;
}> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  detail,
  canManage,
  onLinkOrder,
  onEdit,
}) => {
  const items = detail?.engagements || [];
  const [stage, setStage] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const salesStage = (item: AcademyEngagement) => {
    if (item.orderNo) return "DEAL";
    if (item.courseAssessment === "A") return "HOT";
    if (
      item.invitationStatus === "DECLINED" ||
      (item.invitationStatus === "CONFIRMED" && item.followUpStatus !== "DONE")
    )
      return "FOLLOW_UP";
    if (item.invitationStatus === "CONFIRMED") return "CONFIRMED";
    if (item.invitationStatus === "INVITED") return "PENDING_CONFIRM";
    return "PENDING_INVITE";
  };
  const stageDefinitions = [
    { key: "PENDING_INVITE", label: "待邀约", color: palette.blue },
    { key: "PENDING_CONFIRM", label: "待确认", color: palette.amber },
    { key: "CONFIRMED", label: "已确认", color: palette.green },
    { key: "FOLLOW_UP", label: "待跟进", color: palette.amber },
    { key: "HOT", label: "重点客户", color: palette.red },
    { key: "DEAL", label: "已成交", color: palette.green },
  ].map((definition) => ({
    ...definition,
    count: items.filter((item) => salesStage(item) === definition.key).length,
  }));
  const stageMatches = (item: AcademyEngagement) =>
    stage === "ALL" || salesStage(item) === stage;
  const filtered = items.filter(
    (item) =>
      stageMatches(item) &&
      `${item.participantName}${item.ownerUserName || ""}${item.orderNo || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);
  useEffect(() => setPage(0), [search, stage, selectedSessionId]);
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [filtered.length, page, pageSize]);
  const nextAction = (item: AcademyEngagement) => {
    if (item.orderNo) return "查看成交结果";
    if (item.invitationStatus === "PENDING") return "发起邀约";
    if (item.invitationStatus === "INVITED") return "记录邀约结果";
    if (item.courseAssessment === "A") return "重点跟进";
    if (item.invitationStatus === "CONFIRMED") return "跟进客户";
    return "更新跟进";
  };

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
              选择课程安排
            </Typography>
            <Typography fontSize={12.5} color="text.secondary">
              选择本次要邀约和跟进的课程，客户状态按该课程独立管理。
            </Typography>
          </Box>
          <Box flex={1} />
          <TextField
            select
            size="small"
            label="课程安排"
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
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
            xl: "repeat(6, 1fr)",
          },
          gap: 1.2,
        }}
      >
        {stageDefinitions.map((item) => (
          <Paper
            component="button"
            type="button"
            key={item.key}
            variant="outlined"
            aria-pressed={stage === item.key}
            onClick={() =>
              setStage((current) => (current === item.key ? "ALL" : item.key))
            }
            sx={{
              ...panelSx,
              p: 1.5,
              textAlign: "left",
              cursor: "pointer",
              borderColor: stage === item.key ? palette.blue : palette.line,
              bgcolor: stage === item.key ? palette.blueSoft : "#fff",
            }}
          >
            <Typography fontSize={12.5} color="text.secondary">
              {item.label}
            </Typography>
            <Typography
              fontSize={26}
              fontWeight={950}
              color={item.color}
              sx={{ mt: 0.5 }}
            >
              {item.count}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ ...panelSx, overflow: "hidden" }}>
        <Box
          sx={{ px: 1.5, py: 1.3, borderBottom: `1px solid ${palette.line}` }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "center" }}
            spacing={1}
          >
            <SectionTitle
              title="客户推进表"
              helper="系统根据客户当前状态提示下一步；成交结果以正式订单为准。"
            />
            <TextField
              size="small"
              placeholder="搜索客户、负责人或订单号"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              InputProps={{
                startAdornment: (
                  <SearchIcon
                    sx={{ mr: 0.7, color: "#98A2B3", fontSize: 20 }}
                  />
                ),
              }}
            />
          </Stack>
        </Box>
        <TableContainer>
          <SystemDataTable tableId="academy-sales-customer-pipeline">
            <TableHead>
              <TableRow>
                <TableCell>客户</TableCell>
                <TableCell>邀约状态</TableCell>
                <TableCell>课程结果</TableCell>
                <TableCell>ABC分层</TableCell>
                <TableCell>销售负责人</TableCell>
                <TableCell>最近跟进</TableCell>
                <TableCell>下次跟进</TableCell>
                <TableCell>正式订单</TableCell>
                <TableCell>下一步</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={{ fontWeight: 800 }}>
                    {item.participantName}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={
                        statusLabel[item.invitationStatus] ||
                        item.invitationStatus
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {statusLabel[item.attendanceStatus] ||
                      item.attendanceStatus}
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
                  <TableCell>
                    <Typography fontSize={12.5}>
                      {item.notes || "暂无跟进记录"}
                    </Typography>
                    <Typography fontSize={11.5} color="text.secondary">
                      {item.notes
                        ? `更新于 ${formatDate(item.updatedAt)}`
                        : statusLabel[item.followUpStatus] ||
                          item.followUpStatus}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(item.nextFollowUpAt)}</TableCell>
                  <TableCell>
                    {item.orderNo ? (
                      <Chip size="small" color="success" label={item.orderNo} />
                    ) : canManage ? (
                      <Button
                        size="small"
                        disabled={!item.customerId}
                        onClick={() => onLinkOrder(item)}
                      >
                        关联订单
                      </Button>
                    ) : (
                      "待关联"
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage &&
                      (item.orderNo ? (
                        <Chip size="small" color="success" label="已成交" />
                      ) : (
                        <Button
                          size="small"
                          variant={
                            item.courseAssessment === "A" ? "contained" : "text"
                          }
                          onClick={() => onEdit(item)}
                        >
                          {nextAction(item)}
                        </Button>
                      ))}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 7 }}>
                    <Typography fontWeight={850}>当前条件下暂无客户</Typography>
                    <Typography
                      fontSize={12.5}
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      {items.length
                        ? "请调整推进阶段或搜索条件"
                        : "点击右上角“添加邀约客户”建立本场客户名单"}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </SystemDataTable>
        </TableContainer>
        <TablePagination
          count={filtered.length}
          page={page}
          rowsPerPage={pageSize}
          onPageChange={(_, next) => setPage(next)}
          onRowsPerPageChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(0);
          }}
        />
      </Paper>
    </>
  );
};

const LearnerConversionWorkspace: React.FC<{
  sessions: AcademySession[];
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
  detail?: AcademySessionDetail;
  canManage: boolean;
  canAddCustomer: boolean;
  onAdd: () => void;
  onLinkOrder: (engagement: AcademyEngagement) => void;
  onEdit: (engagement: AcademyEngagement) => void;
}> = (props) => {
  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ sm: "center" }}
          spacing={1}
        >
          <Box>
            <Typography fontSize={18} fontWeight={950}>
              客户邀约与跟进
            </Typography>
            <Typography fontSize={12.5} color="text.secondary" sx={{ mt: 0.4 }}>
              选择本人有权查看的CRM客户，完成课程邀约、客户分层、持续跟进和正式订单关联。
            </Typography>
          </Box>
          {props.canManage && (
            <Button
              variant="contained"
              startIcon={<GroupsIcon />}
              disabled={!props.selectedSessionId || !props.canAddCustomer}
              title={
                props.canAddCustomer ? "" : "课程已开课或结束，仅可维护已有客户"
              }
              onClick={props.onAdd}
            >
              添加邀约客户
            </Button>
          )}
        </Stack>
      </Paper>
      <HandoffWorkspace
        sessions={props.sessions}
        selectedSessionId={props.selectedSessionId}
        onSelectSession={props.onSelectSession}
        detail={props.detail}
        canManage={props.canManage}
        onLinkOrder={props.onLinkOrder}
        onEdit={props.onEdit}
      />
    </Stack>
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
              : "请选择课程安排"
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
          整体到课率 {conversion}% · A类客户 {hot} 人 · 数据来自当前选择课程安排
        </Typography>
      </Paper>
      <Paper variant="outlined" sx={{ ...panelSx, p: 1.5 }}>
        <SectionTitle title="核心场次达成对比" />
        <TableContainer sx={{ mt: 1 }}>
          <SystemDataTable tableId="academy-review-session-performance">
            <TableHead>
              <TableRow>
                <TableCell>课程安排日期</TableCell>
                <TableCell>课程安排名称</TableCell>
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
                    暂无可分析课程安排
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
