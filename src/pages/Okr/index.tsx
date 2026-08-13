import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { okrApi } from "../../api/okrApi";
import useAuthStore from "../../store/useAuthStore";
import { hasPermission, PERMISSION_KEYS } from "../../shared/utils/permissions";
import {
  ModuleHeader,
  ModulePage,
  ModuleToolbar,
  moduleDialogSx,
  moduleTablePaperSx,
  moduleTableSx,
  moduleTokens,
} from "../../shared/components/ModuleShell";
import TablePagination from "../../shared/components/TablePagination";
import OperationFeedbackDialog from "../../shared/components/OperationFeedbackDialog";
import ProtectedFormDialog from "../../shared/components/ProtectedFormDialog";
import type {
  CreateOkrCheckInInput,
  CreateOkrCycleInput,
  CreateOkrKeyResultInput,
  CreateOkrObjectiveInput,
  OkrCycle,
  OkrCheckIn,
  OkrAlignmentObjective,
  OkrDirectoryUser,
  OkrDueCheckInItem,
  OkrHealth,
  OkrKeyResult,
  OkrMetricCatalogItem,
  OkrObjective,
  OkrScope,
} from "../../types/okr";
import {
  createCycleDraft,
  createCurrentQuarterCycleDraft,
  getAllowedObjectiveScopes,
  getWorkbenchPeople,
  hasSubmittedObjectiveReview,
  isSystemMetricValueReadOnly,
  updateCycleDraftPeriod,
} from "./okrPageModel";
import { submitOkrCheckIn } from "./okrPageActions";

const healthMap: Record<
  OkrHealth,
  { label: string; color: "success" | "warning" | "error" }
> = {
  ON_TRACK: { label: "正常", color: "success" },
  AT_RISK: { label: "有风险", color: "warning" },
  OFF_TRACK: { label: "已偏离", color: "error" },
};

const scopeLabel: Record<OkrScope, string> = {
  COMPANY: "公司目标",
  DEPARTMENT: "部门目标",
  INDIVIDUAL: "个人目标",
};

const cycleStatusMap: Record<
  OkrCycle["status"],
  { label: string; color: "default" | "info" | "success" | "warning" }
> = {
  DRAFT: { label: "草稿", color: "default" },
  ACTIVE: { label: "进行中", color: "success" },
  SCORING: { label: "待评分", color: "warning" },
  CLOSED: { label: "已关闭", color: "info" },
};

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "—";

const normalizePage = <T,>(
  data: unknown,
  fallbackPage: number,
  fallbackPageSize: number,
) => {
  const value = (data || {}) as {
    items?: T[];
    total?: number;
    page?: number;
    pageSize?: number;
    pagination?: { total?: number; page?: number; pageSize?: number };
  };
  return {
    items: value.items || [],
    total: Number(value.total ?? value.pagination?.total ?? 0),
    page: Number(value.page ?? value.pagination?.page ?? fallbackPage),
    pageSize: Number(
      value.pageSize ?? value.pagination?.pageSize ?? fallbackPageSize,
    ),
  };
};

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  helper: string;
  tone: string;
  icon: React.ReactNode;
}> = ({ label, value, helper, tone, icon }) => (
  <Paper
    variant="outlined"
    sx={{ p: 2, borderColor: moduleTokens.line, borderRadius: 1.5 }}
  >
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="flex-start"
    >
      <Box>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {helper}
        </Typography>
      </Box>
      <Box sx={{ color: tone, bgcolor: `${tone}14`, borderRadius: 1.5, p: 1 }}>
        {icon}
      </Box>
    </Stack>
  </Paper>
);

const Progress: React.FC<{ value: number }> = ({ value }) => (
  <Stack spacing={0.5} sx={{ minWidth: 120 }}>
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="caption" color="text.secondary">
        进度
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 800 }}>
        {Math.round(value || 0)}%
      </Typography>
    </Stack>
    <LinearProgress
      variant="determinate"
      value={Math.max(0, Math.min(100, value || 0))}
      sx={{ height: 6, borderRadius: 9 }}
    />
  </Stack>
);

const latestCheckIn = (keyResult: OkrKeyResult): OkrCheckIn | undefined =>
  [...(keyResult.checkIns || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

const KeyResultContext: React.FC<{ keyResult: OkrKeyResult }> = ({
  keyResult,
}) => {
  const checkIn = latestCheckIn(keyResult);
  return (
    <Stack spacing={0.5} sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        最近检视：
        {checkIn
          ? `${formatDate(checkIn.createdAt)} · ${checkIn.actorName || "未知操作人"} · ${checkIn.currentValue}${keyResult.unit || ""}`
          : "暂无"}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        已关联任务：
        {keyResult.taskLinks?.length
          ? keyResult.taskLinks
              .map((link) => link.taskTitle || link.taskId)
              .join("、")
          : "暂无"}
      </Typography>
    </Stack>
  );
};

const ObjectiveReviewSummary: React.FC<{ objective: OkrObjective }> = ({
  objective,
}) =>
  objective.reviews?.length ? (
    <Stack spacing={0.25} sx={{ mt: 0.75 }}>
      {objective.reviews.map((review) => (
        <Typography
          key={review.id}
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          {review.reviewerType === "SELF" ? "负责人自评" : "管理者评分"}
          {`：${Number(review.score).toFixed(2)} · ${review.reviewerName} · ${review.summary}`}
        </Typography>
      ))}
    </Stack>
  ) : null;

const ObjectiveSummary: React.FC<{
  objective: OkrObjective;
  showOwner?: boolean;
}> = ({ objective, showOwner = true }) => (
  <>
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Chip
        size="small"
        variant="outlined"
        label={scopeLabel[objective.scope]}
      />
      <Chip
        size="small"
        color={healthMap[objective.health].color}
        label={healthMap[objective.health].label}
      />
    </Stack>
    <Typography sx={{ fontWeight: 900, mt: 1 }}>{objective.title}</Typography>
    <Typography variant="caption" color="text.secondary">
      {objective.cycleName || "当前周期"}
      {showOwner ? ` · ${objective.ownerName}` : ""}
      {objective.departmentNameSnapshot
        ? ` · ${objective.departmentNameSnapshot}`
        : ""}
    </Typography>
    {objective.parent && (
      <Typography
        variant="caption"
        color="primary.main"
        sx={{ display: "block" }}
      >
        向上对齐：{scopeLabel[objective.parent.scope]} ·{" "}
        {objective.parent.title}
      </Typography>
    )}
    <ObjectiveReviewSummary objective={objective} />
  </>
);

const ObjectiveList: React.FC<{
  objectives: OkrObjective[];
  total: number;
  page: number;
  pageSize: number;
  mobile: boolean;
  currentUserId?: string;
  canCheckIn: boolean;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  canManageObjective: (objective: OkrObjective) => boolean;
  canBindObjective: (objective: OkrObjective) => boolean;
  canReviewObjective: (objective: OkrObjective) => boolean;
  onCreateKr: (objective: OkrObjective) => void;
  quickKrObjectiveId: string;
  quickKrTitle: string;
  onQuickKrTitle: (title: string) => void;
  onStartQuickKr: (objectiveId: string) => void;
  onQuickCreateKr: (objective: OkrObjective) => void;
  onCancelQuickKr: () => void;
  onEditObjective: (objective: OkrObjective) => void;
  onEditKr: (objective: OkrObjective, keyResult: OkrKeyResult) => void;
  onCheckIn: (keyResult: OkrKeyResult) => void;
  onLinkTask: (keyResult: OkrKeyResult) => void;
  onBindMetric: (keyResult: OkrKeyResult) => void;
  onRefreshMetric: (keyResult: OkrKeyResult) => void;
  onReview: (objective: OkrObjective) => void;
}> = ({
  objectives,
  total,
  page,
  pageSize,
  mobile,
  currentUserId,
  canCheckIn,
  onPage,
  onPageSize,
  canManageObjective,
  canBindObjective,
  canReviewObjective,
  onCreateKr,
  quickKrObjectiveId,
  quickKrTitle,
  onQuickKrTitle,
  onStartQuickKr,
  onQuickCreateKr,
  onCancelQuickKr,
  onEditObjective,
  onEditKr,
  onCheckIn,
  onLinkTask,
  onBindMetric,
  onRefreshMetric,
  onReview,
}) => (
  <>
    {!objectives.length ? (
      <Paper variant="outlined" sx={{ py: 7, px: 2, textAlign: "center", borderColor: moduleTokens.line }}>
        <FlagOutlinedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
        <Typography sx={{ mt: 1, fontWeight: 800 }}>这个周期还没有目标</Typography>
        <Typography variant="body2" color="text.secondary">从一个清晰的 Objective 开始，再用可衡量的 KR 承接。</Typography>
      </Paper>
    ) : (
      <Stack spacing={1.5}>
        {objectives.map((objective, objectiveIndex) => (
          <Paper key={objective.id} variant="outlined" sx={{ borderColor: moduleTokens.line, borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ p: { xs: 1.5, md: 2 } }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}>
                <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
                  <Chip label={`O${objectiveIndex + 1}`} size="small" color="primary" sx={{ mt: 0.25, fontWeight: 900 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: { xs: 16, md: 18 } }}>{objective.title}</Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                      <Chip size="small" variant="outlined" label={scopeLabel[objective.scope]} />
                      <Typography variant="caption" color="text.secondary">负责人：{objective.ownerName}</Typography>
                      {objective.parent && <Typography variant="caption" color="primary.main">对齐：{objective.parent.title}</Typography>}
                    </Stack>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
                  <Chip size="small" color={healthMap[objective.health].color} label={healthMap[objective.health].label} />
                  <Box sx={{ minWidth: 130 }}><Progress value={objective.progress} /></Box>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>权重 {objective.weight}%</Typography>
                </Stack>
              </Stack>
            </Box>
            <Divider />
            <Box sx={{ px: { xs: 1.5, md: 2 } }}>
              {(objective.keyResults || []).map((keyResult, krIndex) => (
                <Box key={keyResult.id} sx={{ py: 1.5, borderBottom: krIndex < objective.keyResults.length - 1 ? `1px solid ${moduleTokens.line}` : "none" }}>
                  <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" gap={1}>
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
                      <Chip label={`KR${krIndex + 1}`} size="small" variant="outlined" color="primary" sx={{ fontWeight: 800 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{keyResult.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {keyResult.ownerName} · 当前 {keyResult.currentValue}{keyResult.unit || ""} / 目标 {keyResult.targetValue}{keyResult.unit || ""} · 权重 {keyResult.weight}%
                        </Typography>
                        {!mobile && <KeyResultContext keyResult={keyResult} />}
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end" flexWrap="wrap">
                      <Box sx={{ minWidth: 120 }}><Progress value={keyResult.progress} /></Box>
                      {canCheckIn && keyResult.ownerId === currentUserId && objective.status === "PUBLISHED" && (
                        <Button size="small" onClick={() => onCheckIn(keyResult)}>检视</Button>
                      )}
                      {canManageObjective(objective) && objective.status === "DRAFT" && <Button size="small" onClick={() => onEditKr(objective, keyResult)}>编辑KR</Button>}
                      {canManageObjective(objective) && <Button size="small" onClick={() => onLinkTask(keyResult)}>关联任务</Button>}
                      {canBindObjective(objective) && (keyResult.metricBinding ? objective.status === "PUBLISHED" && <Button size="small" onClick={() => onRefreshMetric(keyResult)}>刷新指标</Button> : objective.status === "DRAFT" && <Button size="small" onClick={() => onBindMetric(keyResult)}>绑定指标</Button>)}
                    </Stack>
                  </Stack>
                </Box>
              ))}
              {quickKrObjectiveId === objective.id && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ py: 1.25 }}>
                  <TextField
                    autoFocus
                    fullWidth
                    size="small"
                    placeholder="输入关键结果，回车创建"
                    value={quickKrTitle}
                    onChange={(event) => onQuickKrTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) onQuickCreateKr(objective);
                      if (event.key === "Escape") onCancelQuickKr();
                    }}
                  />
                  <Button variant="contained" onClick={() => onQuickCreateKr(objective)} disabled={!quickKrTitle.trim()}>创建KR</Button>
                  <Button onClick={() => onCreateKr(objective)}>更多设置</Button>
                </Stack>
              )}
            </Box>
            <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1, bgcolor: moduleTokens.subtle }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                <Typography variant="caption" color="text.secondary">{objective.status === "DRAFT" ? "草稿目标，可继续完善关键结果" : `${objective.keyResults?.length || 0} 个关键结果`}</Typography>
                <Stack direction="row" spacing={0.5}>
                  {canManageObjective(objective) && objective.status === "DRAFT" && <Button size="small" onClick={() => onEditObjective(objective)}>编辑目标</Button>}
                  {canManageObjective(objective) && objective.status === "DRAFT" && <Button size="small" startIcon={<AddIcon />} onClick={() => onStartQuickKr(objective.id)}>添加 Key Result</Button>}
                  {canReviewObjective(objective) && objective.status === "PUBLISHED" && <Button size="small" onClick={() => onReview(objective)}>评分复盘</Button>}
                </Stack>
              </Stack>
              <ObjectiveReviewSummary objective={objective} />
            </Box>
          </Paper>
        ))}
      </Stack>
    )}
    <TablePagination
      count={total}
      page={page}
      rowsPerPage={pageSize}
      onPageChange={(_, next) => onPage(next)}
      onRowsPerPageChange={(event) => onPageSize(Number(event.target.value))}
      sx={{ mt: 1 }}
    />
  </>
);

const OkrCenter: React.FC = () => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const currentUser = useAuthStore((state) => state.currentUser);
  const canCreate =
    hasPermission(currentUser, PERMISSION_KEYS.OKR_CREATE, "write") ||
    hasPermission(
      currentUser,
      PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE,
      "write",
    ) ||
    hasPermission(currentUser, PERMISSION_KEYS.OKR_COMPANY_MANAGE, "write");
  const canManageDepartment = hasPermission(
    currentUser,
    PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE,
    "write",
  );
  const canManageCompany = hasPermission(
    currentUser,
    PERMISSION_KEYS.OKR_COMPANY_MANAGE,
    "write",
  );
  const canCheckIn = hasPermission(
    currentUser,
    PERMISSION_KEYS.OKR_CHECK_IN,
    "write",
  );
  const canManageCycles = hasPermission(
    currentUser,
    PERMISSION_KEYS.OKR_CYCLE_MANAGE,
    "write",
  );
  const canScoreClose = hasPermission(
    currentUser,
    PERMISSION_KEYS.OKR_SCORE_CLOSE,
    "write",
  );
  const canBindMetric = hasPermission(
    currentUser,
    PERMISSION_KEYS.OKR_METRIC_BIND,
    "write",
  );
  const canReadTeam =
    hasPermission(currentUser, PERMISSION_KEYS.OKR_TEAM_READ) ||
    canManageDepartment ||
    canManageCompany ||
    canScoreClose;
  const [cycles, setCycles] = useState<OkrCycle[]>([]);
  const [cycleOptions, setCycleOptions] = useState<OkrCycle[]>([]);
  const [cycleTotal, setCycleTotal] = useState(0);
  const [cyclePage, setCyclePage] = useState(0);
  const [cyclePageSize, setCyclePageSize] = useState(10);
  const [cycleId, setCycleId] = useState("");
  const [health, setHealth] = useState<OkrHealth | "">("");
  const [search, setSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(currentUser?.id || "");
  const [objectives, setObjectives] = useState<OkrObjective[]>([]);
  const [objectiveTotal, setObjectiveTotal] = useState(0);
  const [dueCheckIns, setDueCheckIns] = useState<OkrDueCheckInItem[]>([]);
  const [dueCheckInTotal, setDueCheckInTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [users, setUsers] = useState<OkrDirectoryUser[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peoplePage, setPeoplePage] = useState(0);
  const [peoplePageSize, setPeoplePageSize] = useState(10);
  const [alignmentObjectives, setAlignmentObjectives] = useState<
    OkrAlignmentObjective[]
  >([]);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleManagerOpen, setCycleManagerOpen] = useState(false);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [quickObjectiveOpen, setQuickObjectiveOpen] = useState(false);
  const [quickObjectiveTitle, setQuickObjectiveTitle] = useState("");
  const [quickKrObjectiveId, setQuickKrObjectiveId] = useState("");
  const [quickKrTitle, setQuickKrTitle] = useState("");
  const [editingObjective, setEditingObjective] = useState<OkrObjective | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSourceCycleId, setImportSourceCycleId] = useState("");
  const [importSourceObjectiveId, setImportSourceObjectiveId] = useState("");
  const [importCandidates, setImportCandidates] = useState<OkrObjective[]>([]);
  const [importTotal, setImportTotal] = useState(0);
  const [importPage, setImportPage] = useState(0);
  const [importPageSize, setImportPageSize] = useState(10);
  const [krObjective, setKrObjective] = useState<OkrObjective | null>(null);
  const [editingKr, setEditingKr] = useState<OkrKeyResult | null>(null);
  const [checkInKr, setCheckInKr] = useState<OkrKeyResult | null>(null);
  const [linkTaskKr, setLinkTaskKr] = useState<OkrKeyResult | null>(null);
  const [taskId, setTaskId] = useState("");
  const [metricKr, setMetricKr] = useState<OkrKeyResult | null>(null);
  const [metrics, setMetrics] = useState<OkrMetricCatalogItem[]>([]);
  const [metricCode, setMetricCode] = useState<
    OkrMetricCatalogItem["code"] | ""
  >("");
  const [reviewObjective, setReviewObjective] = useState<OkrObjective | null>(
    null,
  );
  const [reviewForm, setReviewForm] = useState({
    score: "0.7",
    summary: "",
    lessons: "",
  });
  const objectiveRequestId = React.useRef(0);
  const dueRequestId = React.useRef(0);
  const cycleRequestId = React.useRef(0);
  const peopleRequestId = React.useRef(0);
  const quickCreateInFlight = React.useRef(false);
  const [cycleForm, setCycleForm] = useState<CreateOkrCycleInput>(() =>
    createCurrentQuarterCycleDraft(),
  );
  const [objectiveForm, setObjectiveForm] = useState<CreateOkrObjectiveInput>({
    cycleId: "",
    scope: "INDIVIDUAL",
    title: "",
    description: "",
    ownerId: currentUser?.id || "",
    weight: 100,
  });
  const [krForm, setKrForm] = useState<CreateOkrKeyResultInput>({
    title: "",
    ownerId: currentUser?.id || "",
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 0,
    unit: "",
    weight: 100,
    dueAt: "",
  });
  const [checkInForm, setCheckInForm] = useState({
    currentValue: "",
    confidence: "4",
    health: "ON_TRACK" as OkrHealth,
    blocker: "",
    nextAction: "",
    evidence: "",
  });

  const loadCycles = useCallback(async () => {
    const requestId = ++cycleRequestId.current;
    const [pageResponse, optionsResponse] = await Promise.all([
      okrApi.listCycles({ page: cyclePage + 1, pageSize: cyclePageSize }),
      okrApi.listCycles({ page: 1, pageSize: 100 }),
    ]);
    if (requestId !== cycleRequestId.current) return;
    if (pageResponse.code !== 0 || optionsResponse.code !== 0) {
      setMessage({
        tone: "error",
        text:
          pageResponse.code !== 0
            ? pageResponse.message
            : optionsResponse.message,
      });
      return;
    }
    const data = normalizePage<OkrCycle>(
      pageResponse.data,
      cyclePage + 1,
      cyclePageSize,
    );
    const options = normalizePage<OkrCycle>(optionsResponse.data, 1, 100);
    setCycles(data.items);
    setCycleOptions(options.items);
    setCycleTotal(data.total);
    setCycleId(
      (current) =>
        current ||
        options.items.find((item) => item.status === "ACTIVE")?.id ||
        options.items[0]?.id ||
        "",
    );
  }, [cyclePage, cyclePageSize]);

  const loadObjectives = useCallback(async () => {
    const requestId = ++objectiveRequestId.current;
    setLoading(true);
    const response = await okrApi.listObjectives({
      page: page + 1,
      pageSize,
      cycleId: cycleId || undefined,
      health: health || undefined,
      ownerId: selectedOwnerId || currentUser?.id || undefined,
      search: search.trim() || undefined,
    });
    if (requestId !== objectiveRequestId.current) return;
    if (response.code === 0) {
      const data = normalizePage<OkrObjective>(
        response.data,
        page + 1,
        pageSize,
      );
      setObjectives(data.items);
      setObjectiveTotal(data.total);
    } else setMessage({ tone: "error", text: response.message });
    setLoading(false);
  }, [cycleId, currentUser?.id, health, page, pageSize, search, selectedOwnerId]);

  const loadDueCheckIns = useCallback(async () => {
    if (!cycleId || !canCheckIn) return;
    const requestId = ++dueRequestId.current;
    setLoading(true);
    const response = await okrApi.listDueCheckIns({
      page: page + 1,
      pageSize,
      cycleId,
    });
    if (requestId !== dueRequestId.current) return;
    if (response.code === 0) {
      const data = normalizePage<OkrDueCheckInItem>(
        response.data,
        page + 1,
        pageSize,
      );
      setDueCheckIns(data.items);
      setDueCheckInTotal(data.total);
    } else setMessage({ tone: "error", text: response.message });
    setLoading(false);
  }, [canCheckIn, cycleId, page, pageSize]);

  useEffect(() => {
    void loadCycles();
  }, [loadCycles]);
  useEffect(() => {
    void loadObjectives();
  }, [loadObjectives]);
  useEffect(() => {
    void loadDueCheckIns();
  }, [loadDueCheckIns]);
  useEffect(() => {
    setPage(0);
  }, [cycleId, health, pageSize, search, selectedOwnerId]);
  useEffect(() => {
    if (!canCreate && !canReadTeam) return;
    const requestId = ++peopleRequestId.current;
    okrApi.listDirectoryUsers({
      page: peoplePage + 1,
      pageSize: peoplePageSize,
      search: peopleSearch.trim() || undefined,
    }).then((response) => {
      if (requestId !== peopleRequestId.current || response.code !== 0) return;
      const data = normalizePage<OkrDirectoryUser>(response.data, peoplePage + 1, peoplePageSize);
      setUsers(data.items);
      setPeopleTotal(data.total);
    });
  }, [canCreate, canReadTeam, peoplePage, peoplePageSize, peopleSearch]);
  useEffect(() => {
    setPeoplePage(0);
  }, [peoplePageSize, peopleSearch]);
  useEffect(() => {
    if (!canBindMetric) return;
    okrApi.listMetrics().then((response) => {
      if (response.code === 0) setMetrics(response.data);
    });
  }, [canBindMetric]);
  useEffect(() => {
    if (
      !objectiveOpen ||
      !objectiveForm.cycleId ||
      objectiveForm.scope === "COMPANY"
    ) {
      setAlignmentObjectives([]);
      return;
    }
    let active = true;
    okrApi
      .listAlignmentObjectives({
        cycleId: objectiveForm.cycleId,
        childScope: objectiveForm.scope,
      })
      .then((response) => {
        if (active && response.code === 0)
          setAlignmentObjectives(response.data);
      });
    return () => {
      active = false;
    };
  }, [objectiveForm.cycleId, objectiveForm.scope, objectiveOpen]);
  const stats = useMemo(() => {
    const count = objectives.length || 1;
    return {
      total: objectiveTotal,
      progress: Math.round(
        objectives.reduce((sum, item) => sum + Number(item.progress || 0), 0) /
          count,
      ),
      risk: objectives.filter((item) => item.health !== "ON_TRACK").length,
      checkInDue: objectives
        .flatMap((item) => item.keyResults || [])
        .filter((item) => !item.checkIns?.length).length,
    };
  }, [objectiveTotal, objectives]);
  const ownerOptions = useMemo(
    () =>
      currentUser && !users.some((user) => user.id === currentUser.id)
        ? [
            {
              id: currentUser.id,
              name: currentUser.name,
              positionName: currentUser.positionName,
            } as OkrDirectoryUser,
            ...users,
          ]
        : users,
    [currentUser, users],
  );
  const workbenchPeople = useMemo(
    () =>
      getWorkbenchPeople(
        currentUser
          ? ({
              id: currentUser.id,
              name: currentUser.name,
              departmentId: currentUser.departmentId,
              positionName: currentUser.positionName,
            } as OkrDirectoryUser)
          : null,
        ownerOptions,
        canReadTeam,
      ),
    [canReadTeam, currentUser, ownerOptions, peopleSearch],
  );
  const selectedPerson =
    ownerOptions.find((person) => person.id === selectedOwnerId) ||
    workbenchPeople[0];
  const allowedScopes = useMemo(
    () =>
      getAllowedObjectiveScopes({
        canCreate,
        canManageDepartment,
        canManageCompany,
      }),
    [canCreate, canManageCompany, canManageDepartment],
  );

  const saveCycle = async () => {
    setSubmitting(true);
    const response = await okrApi.createCycle(cycleForm);
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setCycleOpen(false);
    setMessage({ tone: "success", text: "周期已创建。" });
    await loadCycles();
  };

  const saveObjective = async () => {
    setSubmitting(true);
    const response = editingObjective
      ? await okrApi.updateObjective(editingObjective.id, {
          title: objectiveForm.title,
          description: objectiveForm.description,
          weight: objectiveForm.weight,
        })
      : await okrApi.createObjective(objectiveForm);
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setObjectiveOpen(false);
    setEditingObjective(null);
    setMessage({ tone: "success", text: editingObjective ? "目标已更新。" : "目标已创建，请继续补充KR。" });
    await loadObjectives();
  };

  const quickCreateObjective = async () => {
    const title = quickObjectiveTitle.trim();
    const draftCycle = cycleOptions.find((cycle) => cycle.id === cycleId && cycle.status === "DRAFT");
    if (!title || !draftCycle || quickCreateInFlight.current) return;
    quickCreateInFlight.current = true;
    setSubmitting(true);
    const response = await okrApi.createObjective({
      cycleId: draftCycle.id,
      scope: "INDIVIDUAL",
      title,
      ownerId: selectedOwnerId || currentUser?.id || "",
      weight: 100,
      autoDistributeWeight: true,
    });
    setSubmitting(false);
    quickCreateInFlight.current = false;
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setQuickObjectiveTitle("");
    setQuickObjectiveOpen(false);
    await loadObjectives();
  };

  const quickCreateKr = async (objective: OkrObjective) => {
    const title = quickKrTitle.trim();
    if (!title || quickCreateInFlight.current) return;
    quickCreateInFlight.current = true;
    setSubmitting(true);
    const response = await okrApi.createKeyResult(objective.id, {
      title,
      ownerId: objective.ownerId || currentUser?.id || "",
      type: "PERCENTAGE",
      direction: "INCREASE",
      baselineValue: 0,
      targetValue: 100,
      currentValue: 0,
      unit: "%",
      weight: 100,
      autoDistributeWeight: true,
    });
    setSubmitting(false);
    quickCreateInFlight.current = false;
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setQuickKrObjectiveId("");
    setQuickKrTitle("");
    await loadObjectives();
  };

  const openImportObjective = () => {
    const sourceCycle = cycleOptions.find((cycle) => cycle.id !== cycleId);
    setImportSourceCycleId(sourceCycle?.id || "");
    setImportSourceObjectiveId("");
    setImportCandidates([]);
    setImportTotal(0);
    setImportPage(0);
    setImportOpen(true);
  };

  useEffect(() => {
    if (!importOpen || !importSourceCycleId) return;
    let active = true;
    okrApi
      .listObjectives({
        page: importPage + 1,
        pageSize: importPageSize,
        cycleId: importSourceCycleId,
        ownerId: selectedOwnerId || currentUser?.id || undefined,
      })
      .then((response) => {
        if (!active || response.code !== 0) return;
        const data = normalizePage<OkrObjective>(response.data, importPage + 1, importPageSize);
        setImportCandidates(data.items);
        setImportTotal(data.total);
        setImportSourceObjectiveId((current) => current || data.items[0]?.id || "");
      });
    return () => { active = false; };
  }, [currentUser?.id, importOpen, importPage, importPageSize, importSourceCycleId, selectedOwnerId]);

  const importObjective = async () => {
    if (!importSourceObjectiveId || !cycleId) return;
    setSubmitting(true);
    const response = await okrApi.importObjective({
      sourceObjectiveId: importSourceObjectiveId,
      targetCycleId: cycleId,
    });
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setImportOpen(false);
    setMessage({ tone: "success", text: "目标和KR定义已导入，进度已重置。" });
    await loadObjectives();
  };

  const saveKr = async () => {
    if (!krObjective) return;
    setSubmitting(true);
    const response = editingKr
      ? await okrApi.updateKeyResult(editingKr.id, krForm)
      : await okrApi.createKeyResult(krObjective.id, krForm);
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setKrObjective(null);
    setEditingKr(null);
    setMessage({ tone: "success", text: editingKr ? "KR已更新。" : "KR已创建。" });
    await loadObjectives();
  };

  const saveCheckIn = async () => {
    if (!checkInKr) return;
    setSubmitting(true);
    const input: CreateOkrCheckInInput = {
      currentValue: Number(checkInForm.currentValue),
      confidence: Number(checkInForm.confidence),
      health: checkInForm.health,
      blocker: checkInForm.blocker.trim() || undefined,
      nextAction: checkInForm.nextAction.trim() || undefined,
      evidence: checkInForm.evidence.trim()
        ? [{ type: "TEXT", content: checkInForm.evidence.trim() }]
        : [],
    };
    const result = await submitOkrCheckIn(
      {
        createCheckIn: okrApi.createCheckIn,
        reload: async () => {
          await Promise.all([loadObjectives(), loadDueCheckIns()]);
        },
      },
      checkInKr.id,
      input,
    );
    setSubmitting(false);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) setCheckInKr(null);
  };

  const saveTaskLink = async () => {
    if (!linkTaskKr || !taskId.trim()) return;
    setSubmitting(true);
    const response = await okrApi.linkTask(linkTaskKr.id, taskId.trim());
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setLinkTaskKr(null);
    setTaskId("");
    setMessage({ tone: "success", text: "任务已关联到KR。" });
    await loadObjectives();
  };

  const saveMetricBinding = async () => {
    if (!metricKr || !metricCode) return;
    setSubmitting(true);
    const response = await okrApi.bindMetric(metricKr.id, metricCode);
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setMetricKr(null);
    setMetricCode("");
    setMessage({
      tone: "success",
      text: "经营指标已绑定，进行中周期可自动刷新进度。",
    });
    await loadObjectives();
  };

  const saveReview = async () => {
    if (!reviewObjective) return;
    setSubmitting(true);
    const response = await okrApi.submitReview(reviewObjective.id, {
      score: Number(reviewForm.score),
      summary: reviewForm.summary.trim(),
      lessons: reviewForm.lessons.trim() || undefined,
    });
    setSubmitting(false);
    if (response.code !== 0) {
      setMessage({ tone: "error", text: response.message });
      return;
    }
    setReviewObjective(null);
    setMessage({ tone: "success", text: "目标复盘已提交。" });
    await loadObjectives();
  };

  const refreshMetric = async (keyResult: OkrKeyResult) => {
    const response = await okrApi.refreshMetric(keyResult.id);
    setMessage({
      tone: response.code === 0 ? "success" : "error",
      text: response.code === 0 ? "经营指标已刷新。" : response.message,
    });
    if (response.code === 0) await loadObjectives();
  };

  const transitionCycle = async (
    cycle: OkrCycle,
    action: "activate" | "score" | "close",
  ) => {
    const response =
      action === "activate"
        ? await okrApi.activateCycle(cycle.id)
        : action === "score"
          ? await okrApi.startCycleScoring(cycle.id)
          : await okrApi.closeCycle(cycle.id);
    setMessage({
      tone: response.code === 0 ? "success" : "error",
      text: response.code === 0 ? "周期状态已更新。" : response.message,
    });
    if (response.code === 0) await loadCycles();
  };

  const openObjective = () => {
    const draftCycle =
      cycleOptions.find(
        (cycle) => cycle.id === cycleId && cycle.status === "DRAFT",
      ) || cycleOptions.find((cycle) => cycle.status === "DRAFT");
    setObjectiveForm({
      cycleId: draftCycle?.id || "",
      scope: allowedScopes[0] || "INDIVIDUAL",
      title: quickObjectiveTitle.trim(),
      description: "",
      ownerId: selectedOwnerId || currentUser?.id || "",
      weight: 100,
    });
    setEditingObjective(null);
    setQuickObjectiveOpen(false);
    setObjectiveOpen(true);
  };
  const editObjective = (objective: OkrObjective) => {
    setEditingObjective(objective);
    setObjectiveForm({
      cycleId: objective.cycleId,
      scope: objective.scope,
      title: objective.title,
      description: objective.description || "",
      ownerId: objective.ownerId,
      weight: objective.weight,
    });
    setObjectiveOpen(true);
  };
  const openKr = (objective: OkrObjective) => {
    setKrForm({
      title: quickKrObjectiveId === objective.id ? quickKrTitle.trim() : "",
      ownerId: objective.ownerId || currentUser?.id || "",
      type: "NUMERIC",
      direction: "INCREASE",
      baselineValue: 0,
      targetValue: 100,
      currentValue: 0,
      unit: "",
      weight: 100,
      dueAt: "",
    });
    setEditingKr(null);
    setQuickKrObjectiveId("");
    setKrObjective(objective);
  };
  const editKr = (objective: OkrObjective, keyResult: OkrKeyResult) => {
    setEditingKr(keyResult);
    setKrForm({
      title: keyResult.title,
      description: keyResult.description || "",
      ownerId: keyResult.ownerId,
      type: keyResult.type,
      direction: keyResult.direction,
      baselineValue: keyResult.baselineValue,
      targetValue: keyResult.targetValue,
      currentValue: keyResult.currentValue,
      unit: keyResult.unit || "",
      weight: keyResult.weight,
      dueAt: keyResult.dueAt ? keyResult.dueAt.slice(0, 10) : "",
    });
    setKrObjective(objective);
  };
  const openCheckIn = (kr: OkrKeyResult) => {
    setCheckInForm({
      currentValue: String(kr.currentValue ?? ""),
      confidence: "4",
      health: kr.health,
      blocker: "",
      nextAction: "",
      evidence: "",
    });
    setCheckInKr(kr);
  };

  const selectedCycle = cycleOptions.find((cycle) => cycle.id === cycleId);
  const canManageObjective = (objective: OkrObjective) =>
    objective.capabilities?.canManage ?? (canManageCompany ||
    (canManageDepartment &&
      objective.scope !== "COMPANY" &&
      (!currentUser?.departmentId ||
        objective.departmentId === currentUser.departmentId)) ||
    (canCreate &&
      objective.scope === "INDIVIDUAL" &&
      objective.ownerId === currentUser?.id));
  const canBindObjective = (objective: OkrObjective) =>
    canBindMetric && canManageObjective(objective);
  const canReviewObjective = (objective: OkrObjective) =>
    selectedCycle?.status === "SCORING" &&
    (canScoreClose || objective.ownerId === currentUser?.id) &&
    !hasSubmittedObjectiveReview(
      objective,
      currentUser?.id,
      objective.ownerId === currentUser?.id ? "SELF" : "MANAGER",
    );

  return (
    <ModulePage sx={{ p: { xs: 2, md: 3 } }}>
      <ModuleHeader
        title="目标工作台"
        description="在一个页面查看自己和团队的目标，让KR、经营进度、周检视与复盘围绕目标发生。"
        actions={
          canCreate ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openObjective}
              disabled={!cycleOptions.some((cycle) => cycle.status === "DRAFT")}
            >
              新建目标
            </Button>
          ) : undefined
        }
      />
      <OperationFeedbackDialog
        open={Boolean(message)}
        severity={message?.tone}
        message={message?.text || ""}
        onClose={() => setMessage(null)}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "230px minmax(0, 1fr)" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            borderColor: moduleTokens.line,
            borderRadius: 2,
            position: { md: "sticky" },
            top: { md: 16 },
            overflow: "hidden",
          }}
        >
          {mobile ? (
            <Box sx={{ p: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="搜索员工"
                value={peopleSearch}
                onChange={(event) => setPeopleSearch(event.target.value)}
                sx={{ mb: 1 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              />
              <TextField fullWidth select size="small" label="查看谁的目标" value={selectedOwnerId} onChange={(event) => setSelectedOwnerId(event.target.value)}>
                {getWorkbenchPeople(
                  currentUser ? ({ id: currentUser.id, name: currentUser.name } as OkrDirectoryUser) : null,
                  ownerOptions,
                  canReadTeam,
                ).map((person) => (
                  <MenuItem key={person.id} value={person.id}>{person.id === currentUser?.id ? `我的目标 · ${person.name}` : `${person.name} · ${person.positionName || person.departmentName || "团队成员"}`}</MenuItem>
                ))}
              </TextField>
            </Box>
          ) : (
            <>
              <Box sx={{ p: 1.5 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="搜索员工"
                  value={peopleSearch}
                  onChange={(event) => setPeopleSearch(event.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                />
              </Box>
              <Divider />
              <Box sx={{ p: 1, maxHeight: "calc(100vh - 250px)", overflowY: "auto" }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, fontWeight: 800 }}>
              我的目标
            </Typography>
            {workbenchPeople.filter((person) => person.id === currentUser?.id).map((person) => (
              <Button
                key={person.id}
                fullWidth
                onClick={() => setSelectedOwnerId(person.id)}
                sx={{ mt: 0.5, justifyContent: "flex-start", px: 1, py: 1, bgcolor: selectedOwnerId === person.id ? `${moduleTokens.blue}12` : "transparent" }}
                startIcon={<Avatar sx={{ width: 28, height: 28, fontSize: 13 }}>{person.name.slice(0, 1)}</Avatar>}
              >
                {person.name}
              </Button>
            ))}
            {canReadTeam && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 1.5, display: "block", fontWeight: 800 }}>
                  团队成员
                </Typography>
                {workbenchPeople.filter((person) => person.id !== currentUser?.id).map((person) => (
                  <Button
                    key={person.id}
                    fullWidth
                    onClick={() => setSelectedOwnerId(person.id)}
                    sx={{ mt: 0.5, justifyContent: "flex-start", px: 1, py: 1, bgcolor: selectedOwnerId === person.id ? `${moduleTokens.blue}12` : "transparent" }}
                    startIcon={<Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: moduleTokens.subtle, color: "text.primary" }}>{person.name.slice(0, 1)}</Avatar>}
                  >
                    <Box sx={{ minWidth: 0, textAlign: "left" }}>
                      <Typography variant="body2" noWrap>{person.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{person.positionName || person.departmentName || "团队成员"}</Typography>
                    </Box>
                  </Button>
                ))}
              </>
            )}
              </Box>
            </>
          )}
          {canReadTeam && (
            <TablePagination
              count={peopleTotal}
              page={peoplePage}
              rowsPerPage={peoplePageSize}
              onPageChange={(_, next) => setPeoplePage(next)}
              onRowsPerPageChange={(event) => {
                setPeoplePage(0);
                setPeoplePageSize(Number(event.target.value));
              }}
            />
          )}
        </Paper>

        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: moduleTokens.line, borderRadius: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} gap={1.5}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Avatar sx={{ width: 40, height: 40 }}>{(selectedPerson?.name || currentUser?.name || "我").slice(0, 1)}</Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>{selectedPerson?.name || currentUser?.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{selectedPerson?.positionName || selectedPerson?.departmentName || "目标负责人"}</Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <TextField select size="small" label="目标周期" value={cycleId} onChange={(event) => setCycleId(event.target.value)} sx={{ minWidth: 190 }}>
                  {cycleOptions.map((cycle) => <MenuItem key={cycle.id} value={cycle.id}>{cycle.name}</MenuItem>)}
                </TextField>
                {canCheckIn && selectedOwnerId === currentUser?.id && (
                  <Badge badgeContent={dueCheckInTotal} color="error">
                    <Button variant="outlined" startIcon={<AssignmentTurnedInOutlinedIcon />} onClick={() => dueCheckIns[0] && openCheckIn(dueCheckIns[0].keyResult)} disabled={!dueCheckIns.length}>
                      本周待检视
                    </Button>
                  </Badge>
                )}
                {canManageCycles && (
                  <Tooltip title="周期管理">
                    <IconButton onClick={() => setCycleManagerOpen(true)}><SettingsOutlinedIcon /></IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          </Paper>

          <ModuleToolbar>
            <TextField select size="small" label="风险状态" value={health} onChange={(event) => setHealth(event.target.value as OkrHealth | "")} sx={{ minWidth: 140 }}>
              <MenuItem value="">全部状态</MenuItem>
              {Object.entries(healthMap).map(([value, item]) => <MenuItem key={value} value={value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="搜索目标" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: { xs: "100%", md: 220 } }} />
          </ModuleToolbar>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <MetricCard label="目标总数" value={stats.total} helper="当前人员与周期" tone={moduleTokens.blue} icon={<FlagOutlinedIcon />} />
            <MetricCard label="本页平均进度" value={`${stats.progress}%`} helper="当前页目标" tone={moduleTokens.green} icon={<TrackChangesOutlinedIcon />} />
            <MetricCard label="本页风险目标" value={stats.risk} helper="当前页需关注" tone={moduleTokens.red} icon={<WarningAmberOutlinedIcon />} />
            <MetricCard label="本页尚未检视" value={stats.checkInDue} helper="当前页KR" tone={moduleTokens.amber} icon={<TrackChangesOutlinedIcon />} />
          </Box>

          <ObjectiveList
            objectives={objectives}
            total={objectiveTotal}
            page={page}
            pageSize={pageSize}
            mobile={mobile}
            currentUserId={currentUser?.id}
            canCheckIn={canCheckIn}
            onPage={setPage}
            onPageSize={setPageSize}
            canManageObjective={canManageObjective}
            canBindObjective={canBindObjective}
            canReviewObjective={canReviewObjective}
            onCreateKr={openKr}
            quickKrObjectiveId={quickKrObjectiveId}
            quickKrTitle={quickKrTitle}
            onQuickKrTitle={setQuickKrTitle}
            onStartQuickKr={(objectiveId) => {
              setQuickKrObjectiveId(objectiveId);
              setQuickKrTitle("");
            }}
            onQuickCreateKr={(objective) => void quickCreateKr(objective)}
            onCancelQuickKr={() => { setQuickKrObjectiveId(""); setQuickKrTitle(""); }}
            onEditObjective={editObjective}
            onEditKr={editKr}
            onCheckIn={openCheckIn}
            onLinkTask={(keyResult) => { setLinkTaskKr(keyResult); setTaskId(""); }}
            onBindMetric={(keyResult) => { setMetricKr(keyResult); setMetricCode(""); }}
            onRefreshMetric={(keyResult) => void refreshMetric(keyResult)}
            onReview={(objective) => { setReviewObjective(objective); setReviewForm({ score: String(Number(objective.progress || 0) / 100), summary: "", lessons: "" }); }}
          />
          {canCreate && selectedCycle?.status === "DRAFT" && (
            <Paper variant="outlined" sx={{ p: 1, borderStyle: "dashed", borderColor: moduleTokens.line }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {quickObjectiveOpen ? (
                  <>
                    <TextField
                      autoFocus
                      fullWidth
                      size="small"
                      placeholder="输入目标，回车创建"
                      value={quickObjectiveTitle}
                      onChange={(event) => setQuickObjectiveTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) void quickCreateObjective();
                        if (event.key === "Escape") setQuickObjectiveOpen(false);
                      }}
                    />
                    <Button variant="contained" onClick={() => void quickCreateObjective()} disabled={!quickObjectiveTitle.trim() || submitting}>创建目标</Button>
                    <Button onClick={openObjective}>更多设置</Button>
                  </>
                ) : (
                  <Button startIcon={<AddIcon />} onClick={() => { setQuickObjectiveOpen(true); setQuickObjectiveTitle(""); }}>添加 Objective</Button>
                )}
                <Button startIcon={<ContentCopyOutlinedIcon />} onClick={openImportObjective} disabled={selectedCycle?.status !== "DRAFT" || cycleOptions.length < 2}>从其他周期导入</Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Box>

      <ProtectedFormDialog open={cycleManagerOpen} onClose={() => setCycleManagerOpen(false)} fullWidth maxWidth="lg" sx={moduleDialogSx}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>周期管理</Typography>
            <Alert severity="info">周期启用后目标定义将锁定；修改必须留下调整记录。</Alert>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", sm: "center" }}
            gap={1}
          >
            <Typography variant="body2" color="text.secondary">
              周期启用后目标定义将锁定；修改必须留下调整记录。
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setCycleForm(createCurrentQuarterCycleDraft());
                setCycleOpen(true);
              }}
            >
              新建周期
            </Button>
          </Stack>
          {!cycles.length ? (
            <Alert severity="info">尚未创建OKR周期。</Alert>
          ) : mobile ? (
            <Stack spacing={1.5}>
              {cycles.map((cycle) => (
                <Paper key={cycle.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ fontWeight: 900 }}>
                      {cycle.name}
                    </Typography>
                    <Chip
                      size="small"
                      color={cycleStatusMap[cycle.status].color}
                      label={cycleStatusMap[cycle.status].label}
                    />
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {formatDate(cycle.startAt)} — {formatDate(cycle.endAt)}
                  </Typography>
                  <Stack
                    direction="row"
                    justifyContent="flex-end"
                    sx={{ mt: 1 }}
                  >
                    {cycle.status === "DRAFT" && (
                      <Button
                        size="small"
                        onClick={() => void transitionCycle(cycle, "activate")}
                      >
                        启用
                      </Button>
                    )}
                    {cycle.status === "ACTIVE" && canScoreClose && (
                      <Button
                        size="small"
                        onClick={() => void transitionCycle(cycle, "score")}
                      >
                        进入评分
                      </Button>
                    )}
                    {cycle.status === "SCORING" && canScoreClose && (
                      <Button
                        size="small"
                        onClick={() => void transitionCycle(cycle, "close")}
                      >
                        关闭周期
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : (
            <TableContainer component={Paper} sx={moduleTablePaperSx}>
              <Table size="small" sx={moduleTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>周期</TableCell>
                    <TableCell>年度/季度</TableCell>
                    <TableCell>起止日期</TableCell>
                    <TableCell>周检视日</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cycles.map((cycle) => (
                    <TableRow hover key={cycle.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          {cycle.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {cycle.cycleType === "MONTH" ? "月度" : cycle.cycleType === "CUSTOM" ? "自定义" : `Q${cycle.quarter}`}
                      </TableCell>
                      <TableCell>
                        {formatDate(cycle.startAt)} — {formatDate(cycle.endAt)}
                      </TableCell>
                      <TableCell>
                        星期
                        {
                          ["日", "一", "二", "三", "四", "五", "六"][
                            cycle.checkInWeekday ?? 5
                          ]
                        }
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={cycleStatusMap[cycle.status].color}
                          label={cycleStatusMap[cycle.status].label}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {cycle.status === "DRAFT" && (
                          <Button
                            size="small"
                            onClick={() =>
                              void transitionCycle(cycle, "activate")
                            }
                          >
                            启用
                          </Button>
                        )}
                        {cycle.status === "ACTIVE" && canScoreClose && (
                          <Button
                            size="small"
                            onClick={() => void transitionCycle(cycle, "score")}
                          >
                            进入评分
                          </Button>
                        )}
                        {cycle.status === "SCORING" && canScoreClose && (
                          <Button
                            size="small"
                            onClick={() => void transitionCycle(cycle, "close")}
                          >
                            关闭周期
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <TablePagination
            count={cycleTotal}
            page={cyclePage}
            rowsPerPage={cyclePageSize}
            onPageChange={(_, next) => setCyclePage(next)}
            onRowsPerPageChange={(event) =>
              {
                setCyclePage(0);
                setCyclePageSize(Number(event.target.value));
              }
            }
          />
        </Stack>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCycleManagerOpen(false)}>关闭</Button></DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog open={importOpen} onClose={() => setImportOpen(false)} submitting={submitting} resetKey={String(importOpen)} fullWidth maxWidth="sm" sx={moduleDialogSx}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>从其他周期导入</Typography>
            <Alert severity="info">复制目标和KR定义到当前草稿周期；历史进度、检视记录和经营指标绑定不会复制。</Alert>
            <TextField select label="来源周期" value={importSourceCycleId} onChange={(event) => { setImportSourceCycleId(event.target.value); setImportSourceObjectiveId(""); setImportPage(0); }}>
              {cycleOptions.filter((cycle) => cycle.id !== cycleId).map((cycle) => <MenuItem key={cycle.id} value={cycle.id}>{cycle.name}</MenuItem>)}
            </TextField>
            <TextField select label="选择目标" value={importSourceObjectiveId} onChange={(event) => setImportSourceObjectiveId(event.target.value)} disabled={!importCandidates.length}>
              {importCandidates.map((objective) => <MenuItem key={objective.id} value={objective.id}>{objective.title} · {objective.ownerName}</MenuItem>)}
            </TextField>
            {!importCandidates.length && importSourceCycleId && <Alert severity="warning">该人员在来源周期没有可导入的目标。</Alert>}
            <TablePagination
              count={importTotal}
              page={importPage}
              rowsPerPage={importPageSize}
              onPageChange={(_, next) => { setImportPage(next); setImportSourceObjectiveId(""); }}
              onRowsPerPageChange={(event) => {
                setImportPage(0);
                setImportPageSize(Number(event.target.value));
                setImportSourceObjectiveId("");
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => void importObjective()} disabled={submitting || !importSourceObjectiveId || selectedCycle?.status !== "DRAFT"}>确认导入</Button>
        </DialogActions>
      </ProtectedFormDialog>

      {loading && (
        <LinearProgress
          sx={{ position: "fixed", left: 0, right: 0, bottom: 0 }}
        />
      )}

      <ProtectedFormDialog
        open={cycleOpen}
        onClose={() => setCycleOpen(false)}
        submitting={submitting}
        resetKey={String(cycleOpen)}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              新建OKR周期
            </Typography>
            <TextField
              select
              label="周期类型"
              value={cycleForm.cycleType}
              onChange={(event) =>
                setCycleForm(createCycleDraft(event.target.value as CreateOkrCycleInput["cycleType"]))
              }
            >
              <MenuItem value="MONTH">月度</MenuItem>
              <MenuItem value="QUARTER">季度</MenuItem>
              <MenuItem value="CUSTOM">自定义</MenuItem>
            </TextField>
            <TextField
              label="周期名称"
              value={cycleForm.name}
              onChange={(event) =>
                setCycleForm({ ...cycleForm, name: event.target.value })
              }
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                type="number"
                label="年度"
                value={cycleForm.year}
                onChange={(event) =>
                  setCycleForm(updateCycleDraftPeriod(cycleForm, { year: Number(event.target.value) }))
                }
              />
              {cycleForm.cycleType === "QUARTER" && <TextField
                fullWidth
                select
                label="季度"
                value={cycleForm.quarter}
                onChange={(event) =>
                  setCycleForm(updateCycleDraftPeriod(cycleForm, { quarter: Number(event.target.value) }))
                }
              >
                {[1, 2, 3, 4].map((quarter) => (
                  <MenuItem key={quarter} value={quarter}>
                    Q{quarter}
                  </MenuItem>
                ))}
              </TextField>}
              {cycleForm.cycleType === "MONTH" && <TextField
                fullWidth
                type="number"
                label="月份"
                inputProps={{ min: 1, max: 12 }}
                value={cycleForm.month || ""}
                onChange={(event) => setCycleForm(updateCycleDraftPeriod(cycleForm, { month: Number(event.target.value) }))}
              />}
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                type="date"
                label="开始日期"
                value={cycleForm.startAt}
                disabled={cycleForm.cycleType !== "CUSTOM"}
                onChange={(event) =>
                  setCycleForm({ ...cycleForm, startAt: event.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                type="date"
                label="结束日期"
                value={cycleForm.endAt}
                disabled={cycleForm.cycleType !== "CUSTOM"}
                onChange={(event) =>
                  setCycleForm({ ...cycleForm, endAt: event.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <TextField
              select
              label="每周检视日"
              value={cycleForm.checkInWeekday}
              onChange={(event) =>
                setCycleForm({
                  ...cycleForm,
                  checkInWeekday: Number(event.target.value),
                })
              }
            >
              {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map(
                (label, value) => (
                  <MenuItem key={label} value={value}>
                    {label}
                  </MenuItem>
                ),
              )}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCycleOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveCycle()}
            disabled={
              submitting ||
              !cycleForm.name.trim() ||
              !cycleForm.startAt ||
              !cycleForm.endAt
            }
          >
            创建
          </Button>
        </DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={objectiveOpen}
        onClose={() => setObjectiveOpen(false)}
        submitting={submitting}
        resetKey={String(objectiveOpen)}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              {editingObjective ? "编辑目标" : "新建目标"}
            </Typography>
            {!cycleOptions.some((cycle) => cycle.status === "DRAFT") && (
              <Alert severity="warning">
                只能在草稿周期中创建目标，请先新建周期。
              </Alert>
            )}
            <TextField
              select
              label="OKR周期"
              value={objectiveForm.cycleId}
              disabled={Boolean(editingObjective)}
              onChange={(event) =>
                setObjectiveForm({
                  ...objectiveForm,
                  cycleId: event.target.value,
                  parentObjectiveId: undefined,
                })
              }
            >
              {cycleOptions
                .filter((cycle) => cycle.status === "DRAFT")
                .map((cycle) => (
                  <MenuItem key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              select
              label="目标层级"
              value={objectiveForm.scope}
              disabled={Boolean(editingObjective)}
              onChange={(event) =>
                setObjectiveForm({
                  ...objectiveForm,
                  scope: event.target.value as OkrScope,
                  parentObjectiveId: undefined,
                })
              }
            >
              {allowedScopes.map((scope) => (
                <MenuItem key={scope} value={scope}>
                  {scopeLabel[scope]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="目标名称"
              value={objectiveForm.title}
              onChange={(event) =>
                setObjectiveForm({
                  ...objectiveForm,
                  title: event.target.value,
                })
              }
            />
            <TextField
              label="为什么做"
              multiline
              minRows={2}
              value={objectiveForm.description || ""}
              onChange={(event) =>
                setObjectiveForm({
                  ...objectiveForm,
                  description: event.target.value,
                })
              }
            />
            <TextField
              select
              label="负责人"
              value={objectiveForm.ownerId || ""}
              disabled={Boolean(editingObjective)}
              onChange={(event) =>
                setObjectiveForm({
                  ...objectiveForm,
                  ownerId: event.target.value,
                })
              }
            >
              {ownerOptions.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name} ·{" "}
                  {user.positionName || user.departmentName || "未归属岗位"}
                </MenuItem>
              ))}
            </TextField>
              {!editingObjective && objectiveForm.scope !== "COMPANY" && (
              <TextField
                select
                label="向上对齐目标（选填）"
                value={objectiveForm.parentObjectiveId || ""}
                onChange={(event) =>
                  setObjectiveForm({
                    ...objectiveForm,
                    parentObjectiveId: event.target.value || undefined,
                  })
                }
              >
                <MenuItem value="">暂不对齐</MenuItem>
                {alignmentObjectives.map((objective) => (
                  <MenuItem key={objective.id} value={objective.id}>
                    {scopeLabel[objective.scope]} · {objective.title}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              type="number"
              label="目标权重（%）"
              value={objectiveForm.weight}
              onChange={(event) =>
                setObjectiveForm({
                  ...objectiveForm,
                  weight: Number(event.target.value),
                })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setObjectiveOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveObjective()}
            disabled={
              submitting ||
              !objectiveForm.cycleId ||
              !objectiveForm.title.trim() ||
              !objectiveForm.ownerId
            }
          >
            {editingObjective ? "保存修改" : "创建"}
          </Button>
        </DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={Boolean(krObjective)}
        onClose={() => setKrObjective(null)}
        submitting={submitting}
        resetKey={krObjective?.id || ""}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              {editingKr ? "编辑关键结果" : "新增关键结果"}
            </Typography>
            <Alert severity="info">{krObjective?.title}</Alert>
            <TextField
              label="KR名称"
              value={krForm.title}
              onChange={(event) =>
                setKrForm({ ...krForm, title: event.target.value })
              }
            />
            <TextField
              label="KR说明 / 验收口径"
              multiline
              minRows={2}
              value={krForm.description || ""}
              onChange={(event) => setKrForm({ ...krForm, description: event.target.value })}
            />
            <TextField
              select
              label="负责人"
              value={krForm.ownerId || ""}
              disabled={Boolean(editingKr)}
              onChange={(event) =>
                setKrForm({ ...krForm, ownerId: event.target.value })
              }
            >
              {ownerOptions.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name} ·{" "}
                  {user.positionName || user.departmentName || "未归属岗位"}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                select
                label="指标类型"
                value={krForm.type}
                disabled={Boolean(editingKr)}
                onChange={(event) =>
                  setKrForm({
                    ...krForm,
                    type: event.target.value as CreateOkrKeyResultInput["type"],
                  })
                }
              >
                <MenuItem value="NUMERIC">数值</MenuItem>
                <MenuItem value="PERCENTAGE">百分比</MenuItem>
                <MenuItem value="MILESTONE">里程碑</MenuItem>
              </TextField>
              <TextField
                fullWidth
                select
                label="变化方向"
                value={krForm.direction}
                disabled={Boolean(editingKr)}
                onChange={(event) =>
                  setKrForm({
                    ...krForm,
                    direction: event.target
                      .value as CreateOkrKeyResultInput["direction"],
                  })
                }
              >
                <MenuItem value="INCREASE">提升</MenuItem>
                <MenuItem value="DECREASE">下降</MenuItem>
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                type="number"
                label="基线值"
                value={krForm.baselineValue}
                onChange={(event) =>
                  setKrForm({
                    ...krForm,
                    baselineValue: Number(event.target.value),
                    currentValue: Number(event.target.value),
                  })
                }
              />
              <TextField
                fullWidth
                type="number"
                label="目标值"
                value={krForm.targetValue}
                onChange={(event) =>
                  setKrForm({
                    ...krForm,
                    targetValue: Number(event.target.value),
                  })
                }
              />
              <TextField
                fullWidth
                label="单位"
                value={krForm.unit || ""}
                onChange={(event) =>
                  setKrForm({ ...krForm, unit: event.target.value })
                }
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                type="number"
                label="权重（%）"
                value={krForm.weight}
                onChange={(event) =>
                  setKrForm({ ...krForm, weight: Number(event.target.value) })
                }
              />
              <TextField
                fullWidth
                type="date"
                label="截止日期"
                value={krForm.dueAt || ""}
                onChange={(event) =>
                  setKrForm({ ...krForm, dueAt: event.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKrObjective(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveKr()}
            disabled={submitting || !krForm.title.trim() || !krForm.ownerId}
          >
            {editingKr ? "保存修改" : "创建KR"}
          </Button>
        </DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={Boolean(checkInKr)}
        onClose={() => setCheckInKr(null)}
        submitting={submitting}
        resetKey={checkInKr?.id || ""}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              本周KR检视
            </Typography>
            <Alert severity="info">{checkInKr?.title}</Alert>
            {checkInKr && <KeyResultContext keyResult={checkInKr} />}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                required
                type="number"
                label={`当前值${checkInKr?.unit ? `（${checkInKr.unit}）` : ""}`}
                value={checkInForm.currentValue}
                disabled={
                  checkInKr ? isSystemMetricValueReadOnly(checkInKr) : false
                }
                onChange={(event) =>
                  setCheckInForm({
                    ...checkInForm,
                    currentValue: event.target.value,
                  })
                }
                helperText={
                  checkInKr && isSystemMetricValueReadOnly(checkInKr)
                    ? "当前值由经营指标自动取数，本次检视可继续填写风险、下一步和证据。"
                    : undefined
                }
              />
              <TextField
                fullWidth
                select
                label="信心度"
                value={checkInForm.confidence}
                onChange={(event) =>
                  setCheckInForm({
                    ...checkInForm,
                    confidence: event.target.value,
                  })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <MenuItem key={value} value={String(value)}>
                    {value} / 5
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                select
                label="风险状态"
                value={checkInForm.health}
                onChange={(event) =>
                  setCheckInForm({
                    ...checkInForm,
                    health: event.target.value as OkrHealth,
                  })
                }
              >
                {Object.entries(healthMap).map(([value, item]) => (
                  <MenuItem key={value} value={value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="当前阻塞"
              multiline
              minRows={2}
              value={checkInForm.blocker}
              onChange={(event) =>
                setCheckInForm({ ...checkInForm, blocker: event.target.value })
              }
            />
            <TextField
              label="下一步行动"
              multiline
              minRows={2}
              value={checkInForm.nextAction}
              onChange={(event) =>
                setCheckInForm({
                  ...checkInForm,
                  nextAction: event.target.value,
                })
              }
            />
            <TextField
              label="进展证据（选填）"
              multiline
              minRows={2}
              value={checkInForm.evidence}
              onChange={(event) =>
                setCheckInForm({ ...checkInForm, evidence: event.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckInKr(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveCheckIn()}
            disabled={submitting || checkInForm.currentValue === ""}
          >
            提交并更新进度
          </Button>
        </DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={Boolean(linkTaskKr)}
        onClose={() => setLinkTaskKr(null)}
        submitting={submitting}
        resetKey={linkTaskKr?.id || ""}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              关联执行任务
            </Typography>
            <Alert severity="info">{linkTaskKr?.title}</Alert>
            {linkTaskKr && <KeyResultContext keyResult={linkTaskKr} />}
            <TextField
              required
              label="准确任务ID"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              helperText="只能关联你有权查看的现有员工任务，系统会再次校验。"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkTaskKr(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveTaskLink()}
            disabled={submitting || !taskId.trim()}
          >
            确认关联
          </Button>
        </DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={Boolean(metricKr)}
        onClose={() => setMetricKr(null)}
        submitting={submitting}
        resetKey={metricKr?.id || ""}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              绑定经营指标
            </Typography>
            <Alert severity="info">{metricKr?.title}</Alert>
            <TextField
              select
              required
              label="可信指标"
              value={metricCode}
              onChange={(event) =>
                setMetricCode(
                  event.target.value as OkrMetricCatalogItem["code"],
                )
              }
            >
              {metrics.map((metric) => (
                <MenuItem key={metric.code} value={metric.code}>
                  {metric.name}（{metric.unit}）
                </MenuItem>
              ))}
            </TextField>
            <Alert severity="warning">
              绑定后指标范围固定继承目标层级，系统保留每次取数快照；线索类指标暂不开放自动取数。
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricKr(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveMetricBinding()}
            disabled={submitting || !metricCode}
          >
            确认绑定
          </Button>
        </DialogActions>
      </ProtectedFormDialog>

      <ProtectedFormDialog
        open={Boolean(reviewObjective)}
        onClose={() => setReviewObjective(null)}
        submitting={submitting}
        resetKey={reviewObjective?.id || ""}
        fullWidth
        maxWidth="sm"
        sx={moduleDialogSx}
      >
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              目标评分与复盘
            </Typography>
            <Alert severity="info">{reviewObjective?.title}</Alert>
            <TextField
              required
              type="number"
              label="完成评分（0—1）"
              value={reviewForm.score}
              inputProps={{ min: 0, max: 1, step: 0.05 }}
              onChange={(event) =>
                setReviewForm({ ...reviewForm, score: event.target.value })
              }
            />
            <TextField
              required
              multiline
              minRows={3}
              label="复盘总结"
              value={reviewForm.summary}
              onChange={(event) =>
                setReviewForm({ ...reviewForm, summary: event.target.value })
              }
            />
            <TextField
              multiline
              minRows={2}
              label="经验与改进"
              value={reviewForm.lessons}
              onChange={(event) =>
                setReviewForm({ ...reviewForm, lessons: event.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewObjective(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void saveReview()}
            disabled={
              submitting ||
              !reviewForm.summary.trim() ||
              !Number.isFinite(Number(reviewForm.score)) ||
              Number(reviewForm.score) < 0 ||
              Number(reviewForm.score) > 1
            }
          >
            提交复盘
          </Button>
        </DialogActions>
      </ProtectedFormDialog>
    </ModulePage>
  );
};

export default OkrCenter;
