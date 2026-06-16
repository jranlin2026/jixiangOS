import type { Lead, FollowUpRecord } from '../../../types/lead';
import { v4 as uuidv4 } from 'uuid';

const now = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockFollowUpRecords: FollowUpRecord[] = [
  { id: uuidv4(), leadId: '', type: '电话', content: '客户对899产品感兴趣，需要进一步了解价格', nextFollowUpDate: daysAgo(2), createdBy: '张伟', createdAt: daysAgo(5) },
  { id: uuidv4(), leadId: '', type: '微信', content: '发送了产品介绍文档，客户表示需要内部讨论', nextFollowUpDate: daysAgo(1), createdBy: '张伟', createdAt: daysAgo(4) },
  { id: uuidv4(), leadId: '', type: '上门', content: '现场演示产品功能，客户反馈良好', createdBy: '李娜', createdAt: daysAgo(6) },
  { id: uuidv4(), leadId: '', type: '电话', content: '客户询问代理政策，需要准备方案', nextFollowUpDate: daysAgo(0), createdBy: '王磊', createdAt: daysAgo(3) },
  { id: uuidv4(), leadId: '', type: '会议', content: '线上会议讨论合作细节，客户预算约50万', createdBy: '赵敏', createdAt: daysAgo(2) },
];

export const mockLeads: Lead[] = [
  {
    id: 'lead-001', name: '陈明远', company: '北京云端科技有限公司', phone: '13800001001', email: 'chen@yunduan.com',
    source: '官网', status: '谈判中', owner: '张伟', estimatedAmount: 899,
    sourceType: '自拓', score: 72, wechat: 'chenmyuan', industry: '互联网', city: '北京', estimatedProductId: 'prod-001',
    aiAnalysis: { upgradeProbability: 0.72, reasons: ['多次主动咨询', '预算充足', '决策者参与'], suggestions: ['安排产品演示', '提供行业案例', '推进签约流程'], analyzedAt: now },
    tags: ['高意向', '代理潜力'], createdAt: daysAgo(12), updatedAt: daysAgo(1),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-001', type: '电话', content: '初次联系，客户对899产品感兴趣', nextFollowUpDate: daysAgo(10), createdBy: '张伟', createdAt: daysAgo(12) },
      { id: uuidv4(), leadId: 'lead-001', type: '微信', content: '发送产品手册，客户反馈积极', nextFollowUpDate: daysAgo(7), createdBy: '张伟', createdAt: daysAgo(10) },
      { id: uuidv4(), leadId: 'lead-001', type: '上门', content: '现场演示，客户对功能满意，进入谈判', createdBy: '张伟', createdAt: daysAgo(3) },
    ],
  },
  {
    id: 'lead-002', name: '林小芳', company: '上海数联信息技术有限公司', phone: '13900002002', email: 'lin@shulian.com',
    source: '转介绍', status: '方案中', owner: '李娜', estimatedAmount: 9800,
    sourceType: '转介绍', sourceName: '老客户推荐', score: 85, wechat: 'linxf2024', industry: '信息技术', city: '上海', estimatedProductId: 'prod-003',
    aiAnalysis: { upgradeProbability: 0.85, reasons: ['转介绍来源质量高', '明确需求', '预算充足'], suggestions: ['提供定制方案', '加速推进签约'], analyzedAt: now },
    tags: ['转介绍', '高预算'], createdAt: daysAgo(8), updatedAt: daysAgo(2),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-002', type: '电话', content: '老客户转介绍，需求明确', createdBy: '李娜', createdAt: daysAgo(8) },
      { id: uuidv4(), leadId: 'lead-002', type: '会议', content: '需求讨论会，确认代理方案', createdBy: '李娜', createdAt: daysAgo(4) },
    ],
  },
  {
    id: 'lead-003', name: '王建国', company: '深圳智创软件有限公司', phone: '13700003003', email: 'wang@zhichuang.com',
    source: '广告', status: '已联系', owner: '王磊', estimatedAmount: 2980,
    sourceType: '公司资源', score: 45, wechat: 'wjg_soft', industry: '软件开发', city: '深圳', estimatedProductId: 'prod-002',
    tags: ['新客户'], createdAt: daysAgo(15), updatedAt: daysAgo(5),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-003', type: '电话', content: '电话联系，了解基本需求', createdBy: '王磊', createdAt: daysAgo(14) },
    ],
  },
  {
    id: 'lead-004', name: '赵雪梅', company: '广州云图教育科技有限公司', phone: '13600004004', email: 'zhao@yuntu.com',
    source: '展会', status: '已验证', owner: '赵敏', estimatedAmount: 29800,
    sourceType: '公司资源', score: 65, industry: '教育', city: '广州', estimatedProductId: 'prod-004',
    aiAnalysis: { upgradeProbability: 0.65, reasons: ['展会接触', '教育行业需求强', '有贴牌意向'], suggestions: ['提供贴牌方案', '安排技术对接'], analyzedAt: now },
    tags: ['贴牌意向', '教育行业'], createdAt: daysAgo(20), updatedAt: daysAgo(3),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-004', type: '会议', content: '展会上深入交流，了解贴牌需求', createdBy: '赵敏', createdAt: daysAgo(20) },
      { id: uuidv4(), leadId: 'lead-004', type: '微信', content: '发送贴牌方案初稿', createdBy: '赵敏', createdAt: daysAgo(10) },
    ],
  },
  {
    id: 'lead-005', name: '刘洋', company: '成都未来视界科技有限公司', phone: '13500005005', email: 'liu@weilaishijie.com',
    source: '社交媒体', status: '新线索', owner: '张伟', estimatedAmount: 899,
    sourceType: '自拓', score: 20, wechat: 'liuyang_cd', industry: '科技', city: '成都', estimatedProductId: 'prod-001',
    tags: ['新线索'], createdAt: daysAgo(2), updatedAt: daysAgo(2),
    followUpRecords: [],
  },
  {
    id: 'lead-006', name: '孙丽丽', company: '杭州万物互联科技有限公司', phone: '13400006006',
    source: '电话营销', status: '已联系', owner: '李娜', estimatedAmount: 899,
    sourceType: '公司资源', score: 35, industry: '物联网', city: '杭州',
    tags: ['电话营销'], createdAt: daysAgo(10), updatedAt: daysAgo(6),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-006', type: '电话', content: '初步沟通，客户有兴趣了解', createdBy: '李娜', createdAt: daysAgo(10) },
    ],
  },
  {
    id: 'lead-007', name: '周志强', company: '南京星辰数据科技有限公司', phone: '13300007007', email: 'zhou@xingchen.com',
    source: '转介绍', status: '谈判中', owner: '王磊', estimatedAmount: 59800,
    sourceType: '转介绍', sourceName: '行业推荐', score: 90, wechat: 'zzq_data', industry: '大数据', city: '南京', estimatedProductId: 'prod-005',
    aiAnalysis: { upgradeProbability: 0.90, reasons: ['合伙人意向', '行业资源丰富', '多次主动推进'], suggestions: ['推进合伙人签约', '安排高层会面'], analyzedAt: now },
    tags: ['合伙人意向', '高价值'], createdAt: daysAgo(25), updatedAt: daysAgo(1),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-007', type: '上门', content: '深入沟通合伙人方案', createdBy: '王磊', createdAt: daysAgo(15) },
      { id: uuidv4(), leadId: 'lead-007', type: '会议', content: '方案评审，客户提出修改意见', createdBy: '王磊', createdAt: daysAgo(5) },
    ],
  },
  {
    id: 'lead-008', name: '吴秀英', company: '武汉光电信息科技有限公司', phone: '13200008008',
    source: '官网', status: '已流失', owner: '赵敏', estimatedAmount: 899,
    sourceType: '公司资源', score: 10, industry: '光电', city: '武汉',
    tags: ['已流失'], createdAt: daysAgo(30), updatedAt: daysAgo(10),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-008', type: '电话', content: '客户表示暂无预算', createdBy: '赵敏', createdAt: daysAgo(28) },
      { id: uuidv4(), leadId: 'lead-008', type: '微信', content: '多次跟进无回应', createdBy: '赵敏', createdAt: daysAgo(15) },
    ],
  },
  {
    id: 'lead-009', name: '郑海涛', company: '天津华信网络技术有限公司', phone: '13100009009', email: 'zheng@huaxin.com',
    source: '广告', status: '方案中', owner: '张伟', estimatedAmount: 9800,
    sourceType: '公司资源', score: 55, wechat: 'zht_huaxin', industry: '网络', city: '天津', estimatedProductId: 'prod-003',
    aiAnalysis: { upgradeProbability: 0.55, reasons: ['对代理产品感兴趣', '需要更多了解'], suggestions: ['提供代理案例', '安排技术交流'], analyzedAt: now },
    tags: ['代理意向'], createdAt: daysAgo(18), updatedAt: daysAgo(4),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-009', type: '电话', content: '了解代理产品详情', createdBy: '张伟', createdAt: daysAgo(18) },
    ],
  },
  {
    id: 'lead-010', name: '黄美丽', company: '重庆智联教育科技有限公司', phone: '13000010010', email: 'huang@zhilian.com',
    source: '展会', status: '已成交', owner: '李娜', estimatedAmount: 29800,
    sourceType: '公司资源', score: 88, industry: '教育', city: '重庆', estimatedProductId: 'prod-004',
    tags: ['已成交', '贴牌客户'], createdAt: daysAgo(40), updatedAt: daysAgo(5),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-010', type: '会议', content: '签约会议，确认贴牌合作', createdBy: '李娜', createdAt: daysAgo(7) },
    ],
  },
  {
    id: 'lead-011', name: '马天宇', company: '西安云帆信息科技有限公司', phone: '12900011011',
    source: '社交媒体', status: '已联系', owner: '王磊', estimatedAmount: 899,
    sourceType: '自拓', score: 30, wechat: 'mty_info', industry: '信息技术', city: '西安',
    tags: [], createdAt: daysAgo(7), updatedAt: daysAgo(3),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-011', type: '微信', content: '社媒引流客户，初步建立联系', createdBy: '王磊', createdAt: daysAgo(7) },
    ],
  },
  {
    id: 'lead-012', name: '杨晓燕', company: '长沙融创智能科技有限公司', phone: '12800012012', email: 'yang@rongchuang.com',
    source: '官网', status: '已验证', owner: '赵敏', estimatedAmount: 2980,
    sourceType: '自拓', score: 50, wechat: 'yxy_rc', industry: '智能制造', city: '长沙', estimatedProductId: 'prod-002',
    tags: ['官网注册'], createdAt: daysAgo(9), updatedAt: daysAgo(4),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-012', type: '电话', content: '验证客户需求，确认课程产品适用', createdBy: '赵敏', createdAt: daysAgo(8) },
    ],
  },
  {
    id: 'lead-013', name: '朱明', company: '合肥创新软件有限公司', phone: '12700013013',
    source: '电话营销', status: '新线索', owner: '张伟', estimatedAmount: 899,
    sourceType: '公司资源', score: 15, industry: '软件', city: '合肥',
    tags: [], createdAt: daysAgo(1), updatedAt: daysAgo(1),
    followUpRecords: [],
  },
  {
    id: 'lead-014', name: '胡红梅', company: '厦门数字海洋科技有限公司', phone: '12600014014', email: 'hu@shuziocean.com',
    source: '转介绍', status: '谈判中', owner: '李娜', estimatedAmount: 899,
    sourceType: '转介绍', score: 60, wechat: 'hhm_ocean', industry: '海洋科技', city: '厦门', estimatedProductId: 'prod-001',
    aiAnalysis: { upgradeProbability: 0.60, reasons: ['转介绍', '有一定意向'], suggestions: ['加强沟通频次', '展示成功案例'], analyzedAt: now },
    tags: ['转介绍'], createdAt: daysAgo(14), updatedAt: daysAgo(2),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-014', type: '电话', content: '转介绍客户，正在谈判价格', createdBy: '李娜', createdAt: daysAgo(5) },
    ],
  },
  {
    id: 'lead-015', name: '高峰', company: '福州博远信息技术有限公司', phone: '12500015015',
    source: '广告', status: '已联系', owner: '王磊', estimatedAmount: 9800,
    sourceType: '公司资源', score: 40, industry: '信息技术', city: '福州', estimatedProductId: 'prod-003',
    tags: ['代理意向'], createdAt: daysAgo(11), updatedAt: daysAgo(6),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-015', type: '电话', content: '对代理产品有兴趣，需要资料', createdBy: '王磊', createdAt: daysAgo(11) },
    ],
  },
  {
    id: 'lead-016', name: '谢丽华', company: '济南天成教育科技有限公司', phone: '12400016016', email: 'xie@tiancheng.com',
    source: '展会', status: '方案中', owner: '赵敏', estimatedAmount: 29800,
    sourceType: '公司资源', score: 70, wechat: 'xlh_edu', industry: '教育', city: '济南', estimatedProductId: 'prod-004',
    tags: ['教育行业'], createdAt: daysAgo(16), updatedAt: daysAgo(3),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-016', type: '上门', content: '现场需求调研，准备贴牌方案', createdBy: '赵敏', createdAt: daysAgo(8) },
    ],
  },
  {
    id: 'lead-017', name: '徐浩然', company: '沈阳北方数据科技有限公司', phone: '12300017017',
    source: '官网', status: '新线索', owner: '张伟', estimatedAmount: 899,
    sourceType: '自拓', score: 18, industry: '数据', city: '沈阳',
    tags: [], createdAt: daysAgo(3), updatedAt: daysAgo(3),
    followUpRecords: [],
  },
  {
    id: 'lead-018', name: '何秀兰', company: '哈尔滨冰城科技有限公司', phone: '12200018018',
    source: '社交媒体', status: '已联系', owner: '李娜', estimatedAmount: 899,
    sourceType: '自拓', score: 28, wechat: 'hxl_bing', industry: '科技', city: '哈尔滨',
    tags: [], createdAt: daysAgo(13), updatedAt: daysAgo(8),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-018', type: '微信', content: '微信沟通，了解基本需求', createdBy: '李娜', createdAt: daysAgo(12) },
    ],
  },
  {
    id: 'lead-019', name: '邓国强', company: '昆明春城软件有限公司', phone: '12100019019', email: 'deng@chuncheng.com',
    source: '转介绍', status: '已验证', owner: '王磊', estimatedAmount: 59800,
    sourceType: '转介绍', sourceName: '行业伙伴', score: 78, wechat: 'dgq_soft', industry: '软件', city: '昆明', estimatedProductId: 'prod-005',
    aiAnalysis: { upgradeProbability: 0.78, reasons: ['大额预算', '转介绍来源', '合伙人意向'], suggestions: ['安排合伙人方案', '快速推进'], analyzedAt: now },
    tags: ['高价值', '合伙人'], createdAt: daysAgo(22), updatedAt: daysAgo(2),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-019', type: '会议', content: '线上深入沟通，确认合伙人意向', createdBy: '王磊', createdAt: daysAgo(10) },
    ],
  },
  {
    id: 'lead-020', name: '曹美玲', company: '贵阳大数据科技有限公司', phone: '12000020020',
    source: '电话营销', status: '已流失', owner: '赵敏', estimatedAmount: 899,
    sourceType: '公司资源', score: 5, industry: '大数据', city: '贵阳',
    tags: ['已流失'], createdAt: daysAgo(35), updatedAt: daysAgo(12),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-020', type: '电话', content: '客户选择竞品', createdBy: '赵敏', createdAt: daysAgo(20) },
    ],
  },
  {
    id: 'lead-021', name: '彭亮', company: '南宁桂能科技有限公司', phone: '11900021021',
    source: '官网', status: '已联系', owner: '张伟', estimatedAmount: 9800,
    sourceType: '自拓', score: 42, wechat: 'pl_nanning', industry: '能源', city: '南宁', estimatedProductId: 'prod-003',
    tags: [], createdAt: daysAgo(6), updatedAt: daysAgo(3),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-021', type: '电话', content: '了解代理产品方案', createdBy: '张伟', createdAt: daysAgo(6) },
    ],
  },
  {
    id: 'lead-022', name: '韩晓东', company: '石家庄冀云科技有限公司', phone: '11800022022', email: 'han@jiyun.com',
    source: '广告', status: '方案中', owner: '李娜', estimatedAmount: 899,
    sourceType: '公司资源', score: 48, wechat: 'hxd_jiyun', industry: '云计算', city: '石家庄', estimatedProductId: 'prod-001',
    tags: [], createdAt: daysAgo(17), updatedAt: daysAgo(5),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-022', type: '会议', content: '方案讲解，客户需要时间考虑', createdBy: '李娜', createdAt: daysAgo(7) },
    ],
  },
  {
    id: 'lead-023', name: '冯雅琴', company: '太原晋创科技有限公司', phone: '11700023023',
    source: '展会', status: '已验证', owner: '王磊', estimatedAmount: 29800,
    sourceType: '公司资源', score: 62, wechat: 'fyq_jin', industry: '科技', city: '太原', estimatedProductId: 'prod-004',
    tags: ['贴牌意向'], createdAt: daysAgo(19), updatedAt: daysAgo(4),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-023', type: '上门', content: '展会后续上门拜访，确认需求', createdBy: '王磊', createdAt: daysAgo(12) },
    ],
  },
  {
    id: 'lead-024', name: '蒋文斌', company: '兰州陇能科技有限公司', phone: '11600024024',
    source: '社交媒体', status: '新线索', owner: '赵敏', estimatedAmount: 899,
    sourceType: '自拓', score: 12, industry: '能源', city: '兰州',
    tags: [], createdAt: daysAgo(4), updatedAt: daysAgo(4),
    followUpRecords: [],
  },
  {
    id: 'lead-025', name: '沈桂芳', company: '呼和浩特北疆科技有限公司', phone: '11500025025',
    source: '转介绍', status: '已联系', owner: '张伟', estimatedAmount: 899,
    sourceType: '转介绍', score: 38, wechat: 'sgf_bj', industry: '科技', city: '呼和浩特',
    tags: [], createdAt: daysAgo(8), updatedAt: daysAgo(5),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-025', type: '电话', content: '转介绍初联，客户有兴趣', createdBy: '张伟', createdAt: daysAgo(8) },
    ],
  },
  {
    id: 'lead-026', name: '罗志华', company: '乌鲁木齐西域科技有限公司', phone: '11400026026', email: 'luo@xiyu.com',
    source: '官网', status: '谈判中', owner: '李娜', estimatedAmount: 9800,
    sourceType: '自拓', score: 68, wechat: 'lzh_xiyu', industry: '科技', city: '乌鲁木齐', estimatedProductId: 'prod-003',
    aiAnalysis: { upgradeProbability: 0.68, reasons: ['持续关注', '代理需求明确'], suggestions: ['提供试用', '强化优势对比'], analyzedAt: now },
    tags: ['代理'], createdAt: daysAgo(21), updatedAt: daysAgo(1),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-026', type: '微信', content: '持续跟进，进入价格谈判', createdBy: '李娜', createdAt: daysAgo(3) },
    ],
  },
  {
    id: 'lead-027', name: '梁秀英', company: '银川宁创科技有限公司', phone: '11300027027',
    source: '电话营销', status: '已验证', owner: '王磊', estimatedAmount: 899,
    sourceType: '公司资源', score: 32, industry: '科技', city: '银川',
    tags: [], createdAt: daysAgo(11), updatedAt: daysAgo(6),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-027', type: '电话', content: '验证需求后确认有意向', createdBy: '王磊', createdAt: daysAgo(9) },
    ],
  },
  {
    id: 'lead-028', name: '宋德明', company: '西宁青能科技有限公司', phone: '11200028028',
    source: '广告', status: '新线索', owner: '赵敏', estimatedAmount: 899,
    sourceType: '公司资源', score: 8, industry: '能源', city: '西宁',
    tags: [], createdAt: daysAgo(2), updatedAt: daysAgo(2),
    followUpRecords: [],
  },
  {
    id: 'lead-029', name: '唐丽萍', company: '海口椰城科技有限公司', phone: '11100029029', email: 'tang@yecheng.com',
    source: '展会', status: '已联系', owner: '张伟', estimatedAmount: 9800,
    sourceType: '公司资源', score: 44, wechat: 'tlp_yecheng', industry: '科技', city: '海口', estimatedProductId: 'prod-003',
    tags: [], createdAt: daysAgo(9), updatedAt: daysAgo(4),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-029', type: '会议', content: '展会上交流，后续跟进', createdBy: '张伟', createdAt: daysAgo(9) },
    ],
  },
  {
    id: 'lead-030', name: '许建平', company: '拉萨雪域科技有限公司', phone: '11000030030',
    source: '官网', status: '已成交', owner: '李娜', estimatedAmount: 899,
    sourceType: '自拓', score: 82, industry: '科技', city: '拉萨', estimatedProductId: 'prod-001',
    tags: ['已成交'], createdAt: daysAgo(45), updatedAt: daysAgo(3),
    followUpRecords: [
      { id: uuidv4(), leadId: 'lead-030', type: '会议', content: '最终签约', createdBy: '李娜', createdAt: daysAgo(5) },
    ],
  },
];
