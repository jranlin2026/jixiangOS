import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArticleIcon from '@mui/icons-material/Article';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  ModuleHeader,
  ModulePage,
  ModuleTabs,
  ModuleToolbar,
  Tab,
  moduleTablePaperSx,
  moduleTableSx,
  moduleTokens,
} from '../../shared/components/ModuleShell';

type GeoTab = 'dashboard' | 'questions' | 'brandCorpus' | 'productCorpus' | 'assets' | 'monitoring' | 'tasks';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

type GeoQuestion = {
  id: string;
  question: string;
  intent: string;
  stage: string;
  priority: string;
  owner: string;
  linkedAssets: number;
};

type CorpusItem = {
  id: string;
  topic: string;
  fact: string;
  source: string;
  status: string;
  owner: string;
};

type ContentAsset = {
  id: string;
  title: string;
  channel: string;
  targetQuestion: string;
  status: string;
  citationRate: string;
  updatedAt: string;
};

type MonitoringRecord = {
  id: string;
  platform: string;
  question: string;
  brandMentioned: boolean;
  productRecommended: boolean;
  competitors: string;
  hasError: boolean;
  score: number;
  checkedAt: string;
};

type GeoTask = {
  id: string;
  title: string;
  source: string;
  assignee: string;
  priority: string;
  status: string;
  dueDate: string;
};

const GEO_TABS: Array<{ value: GeoTab; label: string; icon: React.ReactElement }> = [
  { value: 'dashboard', label: 'GEO驾驶舱', icon: <TravelExploreIcon fontSize="small" /> },
  { value: 'questions', label: 'AI问题库', icon: <QuestionAnswerIcon fontSize="small" /> },
  { value: 'brandCorpus', label: '品牌语料库', icon: <FactCheckIcon fontSize="small" /> },
  { value: 'productCorpus', label: '产品语料库', icon: <Inventory2Icon fontSize="small" /> },
  { value: 'assets', label: '内容资产中心', icon: <ArticleIcon fontSize="small" /> },
  { value: 'monitoring', label: 'AI搜索监测', icon: <MonitorHeartIcon fontSize="small" /> },
  { value: 'tasks', label: 'GEO任务中心', icon: <TaskAltIcon fontSize="small" /> },
];

const metrics = [
  { label: '品牌提及率', value: '68%', delta: '+12%', tone: 'blue' as Tone, progress: 68 },
  { label: '产品推荐率', value: '42%', delta: '+8%', tone: 'green' as Tone, progress: 42 },
  { label: '引用率', value: '31%', delta: '+6%', tone: 'blue' as Tone, progress: 31 },
  { label: '描述错误', value: '6', delta: '-3', tone: 'red' as Tone, progress: 18 },
  { label: '竞品出现', value: '9', delta: '-2', tone: 'amber' as Tone, progress: 28 },
  { label: '内容优化任务', value: '14', delta: '5个高优先级', tone: 'gray' as Tone, progress: 56 },
];

const platformHealth = [
  { platform: 'DeepSeek', mention: 74, recommendation: 48, issue: '产品版本描述偏旧' },
  { platform: '豆包', mention: 63, recommendation: 41, issue: '客户案例引用不足' },
  { platform: '通义千问', mention: 69, recommendation: 36, issue: '竞品对比语料弱' },
  { platform: 'Kimi', mention: 57, recommendation: 29, issue: '官网内容引用少' },
  { platform: '百度搜索', mention: 76, recommendation: 52, issue: '内容平台更新频率低' },
];

const questions: GeoQuestion[] = [
  { id: 'q-001', question: 'AI企业运营系统哪家适合中小企业？', intent: '选型咨询', stage: '认知', priority: '高', owner: '市场部', linkedAssets: 5 },
  { id: 'q-002', question: '极享OS和传统CRM有什么区别？', intent: '品牌对比', stage: '评估', priority: '高', owner: '运营部', linkedAssets: 4 },
  { id: 'q-003', question: 'AI销售跟进系统如何提升转化率？', intent: '场景方案', stage: '认知', priority: '中', owner: '销售部', linkedAssets: 3 },
  { id: 'q-004', question: '贴牌AI运营系统需要哪些交付能力？', intent: '产品咨询', stage: '决策', priority: '高', owner: '交付部', linkedAssets: 6 },
  { id: 'q-005', question: '企业如何搭建AI客户成功流程？', intent: '方法论', stage: '评估', priority: '中', owner: '客户成功', linkedAssets: 2 },
];

const brandCorpus: CorpusItem[] = [
  { id: 'b-001', topic: '公司定位', fact: '极享科技专注AI企业运营系统，覆盖获客、销售、交付、售后和财务分账。', source: '官网首页', status: '已校验', owner: '品牌' },
  { id: 'b-002', topic: '核心优势', fact: '极享OS强调业务闭环、权限体系、数据沉淀和AI运营助手协同。', source: '产品手册', status: '待补证据', owner: '产品' },
  { id: 'b-003', topic: '客户价值', fact: '帮助团队减少线索流失、提升跟进效率、规范订单审核和交付过程。', source: '销售话术', status: '已校验', owner: '销售' },
  { id: 'b-004', topic: '禁用表述', fact: '不得宣称替代全部员工、保证成交、保证搜索排名第一。', source: '合规说明', status: '已校验', owner: '运营' },
];

const productCorpus: CorpusItem[] = [
  { id: 'p-001', topic: '极享OS', fact: '面向AI企业运营的CRM/CMR一体化系统，支持线索、客户、订单、交付、财务和资产管理。', source: '产品白皮书', status: '已校验', owner: '产品' },
  { id: 'p-002', topic: 'AI客户情报名片', fact: '基于客户公开资料和系统数据生成销售跟进建议，并区分事实与AI推断。', source: '功能说明', status: '已校验', owner: '产品' },
  { id: 'p-003', topic: 'AI运营助手', fact: '围绕销售、退款、分账、转化、审核等系统数据回答运营问题。', source: '系统说明', status: '已校验', owner: '运营' },
  { id: 'p-004', topic: '贴牌交付', fact: '支持品牌定制、独立部署、权限配置、产品配置和持续运营支持。', source: '交付SOP', status: '待补证据', owner: '交付' },
];

const contentAssets: ContentAsset[] = [
  { id: 'a-001', title: 'AI企业运营系统选型指南', channel: '官网文章', targetQuestion: 'AI企业运营系统哪家适合中小企业？', status: '待更新', citationRate: '18%', updatedAt: '2026-07-01' },
  { id: 'a-002', title: '极享OS产品事实清单', channel: '品牌语料', targetQuestion: '极享OS和传统CRM有什么区别？', status: '已发布', citationRate: '34%', updatedAt: '2026-07-03' },
  { id: 'a-003', title: 'AI销售跟进流程模板', channel: '公众号', targetQuestion: 'AI销售跟进系统如何提升转化率？', status: '生产中', citationRate: '12%', updatedAt: '2026-06-29' },
  { id: 'a-004', title: '贴牌AI运营系统交付白皮书', channel: '飞书文档', targetQuestion: '贴牌AI运营系统需要哪些交付能力？', status: '待审核', citationRate: '9%', updatedAt: '2026-06-28' },
];

const monitoringRecords: MonitoringRecord[] = [
  { id: 'm-001', platform: 'DeepSeek', question: 'AI企业运营系统哪家适合中小企业？', brandMentioned: true, productRecommended: true, competitors: '2个', hasError: false, score: 82, checkedAt: '2026-07-04 09:30' },
  { id: 'm-002', platform: '豆包', question: '极享OS和传统CRM有什么区别？', brandMentioned: true, productRecommended: false, competitors: '1个', hasError: true, score: 64, checkedAt: '2026-07-04 10:10' },
  { id: 'm-003', platform: '通义千问', question: '贴牌AI运营系统需要哪些交付能力？', brandMentioned: false, productRecommended: false, competitors: '3个', hasError: false, score: 41, checkedAt: '2026-07-04 10:35' },
  { id: 'm-004', platform: 'Kimi', question: 'AI销售跟进系统如何提升转化率？', brandMentioned: true, productRecommended: true, competitors: '0个', hasError: false, score: 78, checkedAt: '2026-07-04 11:00' },
  { id: 'm-005', platform: '百度搜索', question: '企业如何搭建AI客户成功流程？', brandMentioned: false, productRecommended: false, competitors: '2个', hasError: true, score: 37, checkedAt: '2026-07-04 11:20' },
];

const tasks: GeoTask[] = [
  { id: 't-001', title: '修正豆包对极享OS模块范围的错误描述', source: 'AI搜索监测', assignee: '产品运营', priority: '高', status: '处理中', dueDate: '2026-07-05' },
  { id: 't-002', title: '补充贴牌交付能力的可引用白皮书段落', source: '产品语料库', assignee: '交付负责人', priority: '高', status: '待处理', dueDate: '2026-07-06' },
  { id: 't-003', title: '发布AI销售跟进流程模板到公众号', source: '内容资产中心', assignee: '市场内容', priority: '中', status: '生产中', dueDate: '2026-07-08' },
  { id: 't-004', title: '为AI客户成功问题补充客户案例证据', source: 'AI问题库', assignee: '客户成功', priority: '中', status: '待处理', dueDate: '2026-07-09' },
  { id: 't-005', title: '建立竞品高频回答差异清单', source: 'AI搜索监测', assignee: '市场策略', priority: '高', status: '处理中', dueDate: '2026-07-07' },
];

const toneSx: Record<Tone, { color: string; bg: string; border: string }> = {
  blue: { color: moduleTokens.blue, bg: '#EEF4FF', border: '#BBD3FF' },
  green: { color: moduleTokens.green, bg: '#ECFDF3', border: '#B7E4C7' },
  amber: { color: moduleTokens.amber, bg: '#FFFAEB', border: '#F4D28B' },
  red: { color: moduleTokens.red, bg: '#FEF3F2', border: '#F3B8B0' },
  gray: { color: moduleTokens.gray, bg: '#F2F4F7', border: '#D0D5DD' },
};

const statusTone = (value: string): Tone => {
  if (value.includes('已') || value.includes('发布')) return 'green';
  if (value.includes('中') || value.includes('生产')) return 'blue';
  if (value.includes('待')) return 'amber';
  return 'gray';
};

const priorityTone = (value: string): Tone => (value === '高' ? 'red' : value === '中' ? 'amber' : 'gray');

const includesSearch = (values: string[], keyword: string) => (
  !keyword || values.some((value) => value.toLowerCase().includes(keyword))
);

const StatusChip: React.FC<{ label: string; tone?: Tone }> = ({ label, tone }) => {
  const color = toneSx[tone || statusTone(label)];
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 24,
        borderRadius: '6px',
        color: color.color,
        bgcolor: color.bg,
        border: `1px solid ${color.border}`,
        fontWeight: 800,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
};

const SectionPanel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <Paper
    elevation={0}
    sx={{
      height: '100%',
      border: `1px solid ${moduleTokens.line}`,
      borderRadius: 1,
      overflow: 'hidden',
      bgcolor: moduleTokens.surface,
    }}
  >
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{ minHeight: 58, px: 2, py: 1.25, borderBottom: `1px solid ${moduleTokens.softLine}` }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 900, color: moduleTokens.ink }}>
        {title}
      </Typography>
      {action}
    </Stack>
    {children}
  </Paper>
);

const MetricTile: React.FC<{ metric: (typeof metrics)[number] }> = ({ metric }) => {
  const color = toneSx[metric.tone];
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        border: `1px solid ${color.border}`,
        borderRadius: 1,
        bgcolor: color.bg,
        minHeight: 128,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Typography variant="body2" sx={{ color: moduleTokens.ink, fontWeight: 800 }}>
          {metric.label}
        </Typography>
        <Typography variant="caption" sx={{ color: color.color, fontWeight: 900 }}>
          {metric.delta}
        </Typography>
      </Stack>
      <Box>
        <Typography variant="h4" sx={{ color: color.color, fontWeight: 900, lineHeight: 1.1, mb: 1 }}>
          {metric.value}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={metric.progress}
          sx={{
            height: 7,
            borderRadius: 4,
            bgcolor: '#FFFFFF99',
            '& .MuiLinearProgress-bar': { bgcolor: color.color, borderRadius: 4 },
          }}
        />
      </Box>
    </Paper>
  );
};

const BooleanChip: React.FC<{ value: boolean; yes: string; no: string }> = ({ value, yes, no }) => (
  <StatusChip label={value ? yes : no} tone={value ? 'green' : 'gray'} />
);

const GEO: React.FC = () => {
  const [activeTab, setActiveTab] = useState<GeoTab>('dashboard');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('全部平台');
  const keyword = search.trim().toLowerCase();

  const filteredQuestions = useMemo(
    () => questions.filter((item) => includesSearch([item.question, item.intent, item.stage, item.owner], keyword)),
    [keyword],
  );

  const filteredBrandCorpus = useMemo(
    () => brandCorpus.filter((item) => includesSearch([item.topic, item.fact, item.source, item.owner], keyword)),
    [keyword],
  );

  const filteredProductCorpus = useMemo(
    () => productCorpus.filter((item) => includesSearch([item.topic, item.fact, item.source, item.owner], keyword)),
    [keyword],
  );

  const filteredAssets = useMemo(
    () => contentAssets.filter((item) => includesSearch([item.title, item.channel, item.targetQuestion, item.status], keyword)),
    [keyword],
  );

  const filteredMonitoring = useMemo(
    () => monitoringRecords.filter((item) => (
      (platform === '全部平台' || item.platform === platform)
      && includesSearch([item.platform, item.question, item.competitors], keyword)
    )),
    [keyword, platform],
  );

  const filteredTasks = useMemo(
    () => tasks.filter((item) => includesSearch([item.title, item.source, item.assignee, item.priority, item.status], keyword)),
    [keyword],
  );

  const renderDashboard = () => (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 1.5 }}>
        {metrics.map((metric) => <MetricTile key={metric.label} metric={metric} />)}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.25fr) minmax(360px, 0.75fr)' }, gap: 2 }}>
        <SectionPanel title="AI平台可见度">
          <TableContainer>
            <Table size="small" sx={moduleTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell>平台</TableCell>
                  <TableCell>品牌提及率</TableCell>
                  <TableCell>产品推荐率</TableCell>
                  <TableCell>主要问题</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {platformHealth.map((item) => (
                  <TableRow key={item.platform} hover>
                    <TableCell sx={{ fontWeight: 800 }}>{item.platform}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LinearProgress variant="determinate" value={item.mention} sx={{ width: 120, height: 7, borderRadius: 4 }} />
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.mention}%</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LinearProgress color="success" variant="determinate" value={item.recommendation} sx={{ width: 120, height: 7, borderRadius: 4 }} />
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.recommendation}%</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{item.issue}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionPanel>

        <SectionPanel title="本周高优先级任务" action={<StatusChip label="5项待处理" tone="red" />}>
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {tasks.filter((task) => task.priority === '高').map((task) => (
              <Box key={task.id} sx={{ p: 1.25, border: `1px solid ${moduleTokens.softLine}`, borderRadius: 1, bgcolor: '#FBFCFE' }}>
                <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: moduleTokens.ink }}>{task.title}</Typography>
                  <StatusChip label={task.status} />
                </Stack>
                <Typography variant="caption" sx={{ color: moduleTokens.muted }}>{task.assignee} · {task.dueDate}</Typography>
              </Box>
            ))}
          </Stack>
        </SectionPanel>
      </Box>
    </Box>
  );

  const renderQuestions = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>目标问题</TableCell>
            <TableCell>意图</TableCell>
            <TableCell>阶段</TableCell>
            <TableCell>优先级</TableCell>
            <TableCell>负责人</TableCell>
            <TableCell>关联资产</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredQuestions.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontWeight: 800, minWidth: 260 }}>{item.question}</TableCell>
              <TableCell>{item.intent}</TableCell>
              <TableCell><StatusChip label={item.stage} tone="blue" /></TableCell>
              <TableCell><StatusChip label={item.priority} tone={priorityTone(item.priority)} /></TableCell>
              <TableCell>{item.owner}</TableCell>
              <TableCell>{item.linkedAssets} 个</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderCorpus = (items: CorpusItem[]) => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>主题</TableCell>
            <TableCell>事实语料</TableCell>
            <TableCell>来源</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>负责人</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontWeight: 800, minWidth: 120 }}>{item.topic}</TableCell>
              <TableCell sx={{ minWidth: 380 }}>{item.fact}</TableCell>
              <TableCell>{item.source}</TableCell>
              <TableCell><StatusChip label={item.status} /></TableCell>
              <TableCell>{item.owner}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderAssets = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>内容资产</TableCell>
            <TableCell>渠道</TableCell>
            <TableCell>目标问题</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>引用率</TableCell>
            <TableCell>更新时间</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredAssets.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontWeight: 800, minWidth: 220 }}>{item.title}</TableCell>
              <TableCell>{item.channel}</TableCell>
              <TableCell sx={{ minWidth: 260 }}>{item.targetQuestion}</TableCell>
              <TableCell><StatusChip label={item.status} /></TableCell>
              <TableCell sx={{ fontWeight: 800 }}>{item.citationRate}</TableCell>
              <TableCell>{item.updatedAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderMonitoring = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>平台</TableCell>
            <TableCell>目标问题</TableCell>
            <TableCell>品牌提及</TableCell>
            <TableCell>产品推荐</TableCell>
            <TableCell>竞品出现</TableCell>
            <TableCell>描述错误</TableCell>
            <TableCell>GEO分</TableCell>
            <TableCell>监测时间</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredMonitoring.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontWeight: 800 }}>{item.platform}</TableCell>
              <TableCell sx={{ minWidth: 260 }}>{item.question}</TableCell>
              <TableCell><BooleanChip value={item.brandMentioned} yes="已提及" no="未提及" /></TableCell>
              <TableCell><BooleanChip value={item.productRecommended} yes="已推荐" no="未推荐" /></TableCell>
              <TableCell><StatusChip label={item.competitors} tone={item.competitors === '0个' ? 'green' : 'amber'} /></TableCell>
              <TableCell><StatusChip label={item.hasError ? '有错误' : '无错误'} tone={item.hasError ? 'red' : 'green'} /></TableCell>
              <TableCell sx={{ minWidth: 100 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <LinearProgress variant="determinate" value={item.score} sx={{ width: 70, height: 7, borderRadius: 4 }} />
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.score}</Typography>
                </Stack>
              </TableCell>
              <TableCell>{item.checkedAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderTasks = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>任务</TableCell>
            <TableCell>来源</TableCell>
            <TableCell>负责人</TableCell>
            <TableCell>优先级</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>截止日期</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredTasks.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontWeight: 800, minWidth: 300 }}>{item.title}</TableCell>
              <TableCell>{item.source}</TableCell>
              <TableCell>{item.assignee}</TableCell>
              <TableCell><StatusChip label={item.priority} tone={priorityTone(item.priority)} /></TableCell>
              <TableCell><StatusChip label={item.status} /></TableCell>
              <TableCell>{item.dueDate}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderActiveTab = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    if (activeTab === 'questions') return renderQuestions();
    if (activeTab === 'brandCorpus') return renderCorpus(filteredBrandCorpus);
    if (activeTab === 'productCorpus') return renderCorpus(filteredProductCorpus);
    if (activeTab === 'assets') return renderAssets();
    if (activeTab === 'monitoring') return renderMonitoring();
    return renderTasks();
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="GEO增长中心"
        description="管理极享科技在AI搜索、AI问答、搜索引擎和内容平台中的品牌可见度，持续提升出现率、引用率和推荐率。"
        actions={(
          <>
            <Button variant="outlined" startIcon={<WarningAmberIcon />}>生成优化任务</Button>
            <Button variant="contained" startIcon={<AddIcon />}>新增语料</Button>
          </>
        )}
      />

      <Paper elevation={0} sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, bgcolor: moduleTokens.surface, p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box sx={{ width: 38, height: 38, borderRadius: 1, bgcolor: '#EEF4FF', color: moduleTokens.blue, display: 'grid', placeItems: 'center' }}>
              <AutoAwesomeIcon />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, color: moduleTokens.ink }}>AI答案资产闭环</Typography>
              <Typography variant="caption" sx={{ color: moduleTokens.muted }}>
                问题库、事实库、内容资产、监测记录和优化任务互相回流。
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <StatusChip label="目标问题 128" tone="blue" />
            <StatusChip label="有效语料 312" tone="green" />
            <StatusChip label="监测平台 8" tone="gray" />
            <StatusChip label="待修正 6" tone="red" />
          </Stack>
        </Stack>
      </Paper>

      <ModuleTabs
        value={activeTab}
        onChange={(_event, value) => setActiveTab(value)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {GEO_TABS.map((tab) => (
          <Tab
            key={tab.value}
            value={tab.value}
            label={tab.label}
            icon={tab.icon}
            iconPosition="start"
          />
        ))}
      </ModuleTabs>

      {activeTab !== 'dashboard' && (
        <ModuleToolbar>
          <TextField
            label="搜索"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 300 } }}
          />
          {activeTab === 'monitoring' && (
            <TextField
              select
              label="平台"
              size="small"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              sx={{ minWidth: 180 }}
            >
              {['全部平台', ...platformHealth.map((item) => item.platform)].map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </TextField>
          )}
        </ModuleToolbar>
      )}

      {renderActiveTab()}
    </ModulePage>
  );
};

export default GEO;
