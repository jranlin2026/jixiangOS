import type { Customer, GrowthMilestone, CustomerGrowthRecord } from '../../../types/customer';
import type { CustomerLevel } from '../../../types/common';
import { v4 as uuidv4 } from 'uuid';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const now = new Date().toISOString();

const levelMap: Record<string, CustomerLevel> = { '899': 'L2', '课程': 'L2', '代理': 'L3', '贴牌': 'L4', '合伙人': 'L5' };

export const mockCustomers: Customer[] = [
  {
    id: 'cust-001', name: '陈明远', company: '北京云端科技有限公司', phone: '13800001001', email: 'chen@yunduan.com',
    productLevel: '899', customerLevel: 'L2', wechat: 'chenmy899', industry: '科技', city: '北京',
    sourceType: '官网', sourceName: '官网注册', sourceAccount: 'web-001', score: 85,
    owner: '张伟', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(60), title: '签约899产品', description: '首次购买899基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '高', satisfaction: 85, predictedNextPurchase: '代理升级', keyInsights: ['使用频率高', '多次咨询代理政策', '行业资源丰富'], analyzedAt: now, teamSize: '11-50人', accountCount: 25, budgetLevel: '中', activityLevel: '高', upgradeProbability: 0.85, aiSummary: '客户使用899产品活跃，多次咨询代理政策，升级概率高，建议重点跟进。' },
    tags: ['高升级潜力'], createdAt: daysAgo(60), updatedAt: daysAgo(5),
  },
  {
    id: 'cust-002', name: '林小芳', company: '上海数联信息技术有限公司', phone: '13900002002', email: 'lin@shulian.com',
    productLevel: '代理', customerLevel: 'L3', wechat: 'linxf_proxy', industry: '信息技术', city: '上海',
    sourceType: '转介绍', sourceName: '老客户转介绍', score: 90,
    owner: '李娜', totalSpent: 150000, orderCount: 2,
    growthPath: [
      { id: uuidv4(), date: daysAgo(90), title: '签约899产品', description: '首次购买899基础版', productLevel: '899' },
      { id: uuidv4(), date: daysAgo(30), title: '升级为代理', description: '业务增长，升级代理版', productLevel: '代理' },
    ],
    growthRecords: [
      { fromLevel: 'L2', toLevel: 'L3', fromProduct: '899', toProduct: '代理', orderId: 'order-002', upgradeAmount: 9800, reason: '业务增长', createdAt: daysAgo(30) },
    ],
    aiPortrait: { riskLevel: '低', upgradePotential: '中', satisfaction: 90, keyInsights: ['续约率高', '转介绍能力强'], analyzedAt: now, teamSize: '11-50人', accountCount: 35, budgetLevel: '高', activityLevel: '高', upgradeProbability: 0.65, aiSummary: '代理客户，活跃稳定，有贴牌升级潜力。' },
    tags: ['代理客户', '优质'], createdAt: daysAgo(90), updatedAt: daysAgo(10),
  },
  {
    id: 'cust-003', name: '黄美丽', company: '重庆智联教育科技有限公司', phone: '13000010010', email: 'huang@zhilian.com',
    productLevel: '贴牌', customerLevel: 'L4', wechat: 'huangml_oem', industry: '教育', city: '重庆',
    sourceType: '展会', sourceName: '教育展会', score: 95,
    owner: '李娜', totalSpent: 280000, orderCount: 2,
    growthPath: [
      { id: uuidv4(), date: daysAgo(120), title: '签约899产品', description: '首次购买', productLevel: '899' },
      { id: uuidv4(), date: daysAgo(60), title: '升级代理', description: '升级代理版', productLevel: '代理' },
      { id: uuidv4(), date: daysAgo(15), title: '升级贴牌', description: '定制品牌，升级贴牌版', productLevel: '贴牌' },
    ],
    growthRecords: [
      { fromLevel: 'L2', toLevel: 'L3', fromProduct: '899', toProduct: '代理', upgradeAmount: 9800, reason: '业务扩展', createdAt: daysAgo(60) },
      { fromLevel: 'L3', toLevel: 'L4', fromProduct: '代理', toProduct: '贴牌', upgradeAmount: 29800, reason: '品牌定制需求', createdAt: daysAgo(15) },
    ],
    aiPortrait: { riskLevel: '低', upgradePotential: '高', satisfaction: 92, predictedNextPurchase: '合伙人升级', keyInsights: ['品牌定制需求强', '教育行业深耕', '多次续约'], analyzedAt: now, teamSize: '51-200人', accountCount: 80, budgetLevel: '高', activityLevel: '高', upgradeProbability: 0.75, aiSummary: '教育行业优质贴牌客户，有合伙人升级潜力。' },
    tags: ['贴牌客户', '教育行业', '高价值'], createdAt: daysAgo(120), updatedAt: daysAgo(5),
  },
  {
    id: 'cust-004', name: '王建国', company: '深圳智创软件有限公司', phone: '13700003003', email: 'wang@zhichuang.com',
    productLevel: '899', customerLevel: 'L2', wechat: 'wangjg_899', industry: '软件', city: '深圳',
    sourceType: '广告', sourceName: '百度SEM', score: 65,
    owner: '王磊', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(45), title: '签约899产品', description: '购买899基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '中', upgradePotential: '中', satisfaction: 70, keyInsights: ['使用频率一般', '偶有反馈'], analyzedAt: now, activityLevel: '中', upgradeProbability: 0.45, aiSummary: '客户使用频率一般，需加强互动提升活跃度。' },
    tags: [], createdAt: daysAgo(45), updatedAt: daysAgo(8),
  },
  {
    id: 'cust-005', name: '周志强', company: '南京星辰数据科技有限公司', phone: '13300007007', email: 'zhou@xingchen.com',
    productLevel: '合伙人', customerLevel: 'L5', wechat: 'zhouzq_partner', industry: '数据', city: '南京',
    sourceType: '转介绍', sourceName: '高层介绍', score: 98,
    owner: '王磊', totalSpent: 450000, orderCount: 3,
    growthPath: [
      { id: uuidv4(), date: daysAgo(180), title: '签约899', description: '首次购买', productLevel: '899' },
      { id: uuidv4(), date: daysAgo(120), title: '升级代理', description: '业务扩展', productLevel: '代理' },
      { id: uuidv4(), date: daysAgo(45), title: '升级贴牌', description: '品牌定制', productLevel: '贴牌' },
      { id: uuidv4(), date: daysAgo(10), title: '升级合伙人', description: '深度战略合作', productLevel: '合伙人' },
    ],
    growthRecords: [
      { fromLevel: 'L2', toLevel: 'L3', fromProduct: '899', toProduct: '代理', upgradeAmount: 9800, reason: '业务扩展', createdAt: daysAgo(120) },
      { fromLevel: 'L3', toLevel: 'L4', fromProduct: '代理', toProduct: '贴牌', upgradeAmount: 29800, reason: '品牌定制', createdAt: daysAgo(45) },
      { fromLevel: 'L4', toLevel: 'L5', fromProduct: '贴牌', toProduct: '合伙人', upgradeAmount: 59800, reason: '战略合伙', createdAt: daysAgo(10) },
    ],
    aiPortrait: { riskLevel: '低', upgradePotential: '低', satisfaction: 95, keyInsights: ['顶级客户', '战略合作伙伴', '行业影响力强'], analyzedAt: now, teamSize: '51-200人', accountCount: 120, budgetLevel: '高', activityLevel: '高', upgradeProbability: 0.15, aiSummary: '顶级合伙人客户，重点维护关系。' },
    tags: ['合伙人', '顶级客户', '战略合作伙伴'], createdAt: daysAgo(180), updatedAt: daysAgo(3),
  },
  {
    id: 'cust-006', name: '孙丽丽', company: '杭州万物互联科技有限公司', phone: '13400006006',
    productLevel: '899', customerLevel: 'L2', wechat: 'sunll_899', industry: '物联网', city: '杭州',
    sourceType: '电话营销', score: 40,
    owner: '李娜', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(25), title: '签约899', description: '购买899基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '高', upgradePotential: '低', satisfaction: 55, keyInsights: ['使用频率低', '反馈较少', '可能流失'], analyzedAt: now, activityLevel: '低', upgradeProbability: 0.20, aiSummary: '客户活跃度低，有流失风险，建议加强跟进。' },
    tags: ['风险客户'], createdAt: daysAgo(25), updatedAt: daysAgo(12),
  },
  {
    id: 'cust-007', name: '郑海涛', company: '天津华信网络技术有限公司', phone: '13100009009', email: 'zheng@huaxin.com',
    productLevel: '代理', customerLevel: 'L3', wechat: 'zhenght_agent', industry: '网络', city: '天津',
    sourceType: '官网', sourceName: '官网注册', score: 75,
    owner: '张伟', totalSpent: 150000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(50), title: '签约代理', description: '直接购买代理版', productLevel: '代理' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '中', satisfaction: 80, keyInsights: ['使用稳定', '有贴牌意向'], analyzedAt: now, activityLevel: '中', upgradeProbability: 0.55, aiSummary: '代理客户使用稳定，有贴牌升级意向。' },
    tags: ['代理客户'], createdAt: daysAgo(50), updatedAt: daysAgo(7),
  },
  {
    id: 'cust-008', name: '杨晓燕', company: '长沙融创智能科技有限公司', phone: '12800012012', email: 'yang@rongchuang.com',
    productLevel: '899', customerLevel: 'L2', wechat: 'yangxy_899', industry: '智能', city: '长沙',
    sourceType: '官网', sourceName: '官网注册', score: 72,
    owner: '赵敏', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(30), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '中', satisfaction: 78, keyInsights: ['活跃使用', '偶有反馈'], analyzedAt: now, activityLevel: '中', upgradeProbability: 0.50, aiSummary: '899客户使用正常，有课程升级潜力。' },
    tags: [], createdAt: daysAgo(30), updatedAt: daysAgo(6),
  },
  {
    id: 'cust-009', name: '胡红梅', company: '厦门数字海洋科技有限公司', phone: '12600014014', email: 'hu@shuziocean.com',
    productLevel: '代理', customerLevel: 'L3', wechat: 'huhm_proxy', industry: '数字', city: '厦门',
    sourceType: '广告', score: 68,
    owner: '李娜', totalSpent: 150000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(70), title: '签约代理', description: '直接购买代理版', productLevel: '代理' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '中', upgradePotential: '中', satisfaction: 72, keyInsights: ['使用一般', '偶有问题'], analyzedAt: now, activityLevel: '中', upgradeProbability: 0.40, aiSummary: '代理客户使用一般，需加强服务。' },
    tags: [], createdAt: daysAgo(70), updatedAt: daysAgo(9),
  },
  {
    id: 'cust-010', name: '高峰', company: '福州博远信息技术有限公司', phone: '12500015015',
    productLevel: '899', customerLevel: 'L2', wechat: 'gaof_899', industry: '信息', city: '福州',
    sourceType: '转介绍', sourceName: '客户转介绍', score: 82,
    owner: '王磊', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(35), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '高', satisfaction: 82, predictedNextPurchase: '代理升级', keyInsights: ['使用频率高', '积极反馈', '多次咨询代理'], analyzedAt: now, activityLevel: '高', upgradeProbability: 0.82, aiSummary: '899客户高活跃，有代理升级意向，建议重点跟进。' },
    tags: ['高升级潜力'], createdAt: daysAgo(35), updatedAt: daysAgo(4),
  },
  {
    id: 'cust-011', name: '谢丽华', company: '济南天成教育科技有限公司', phone: '12400016016', email: 'xie@tiancheng.com',
    productLevel: '贴牌', customerLevel: 'L4', wechat: 'xielh_oem', industry: '教育', city: '济南',
    sourceType: '展会', sourceName: '教育展会', score: 88,
    owner: '赵敏', totalSpent: 280000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(55), title: '签约贴牌', description: '直接购买贴牌版', productLevel: '贴牌' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '中', satisfaction: 88, keyInsights: ['定制需求满足', '教育行业深耕'], analyzedAt: now, activityLevel: '高', upgradeProbability: 0.62, aiSummary: '教育行业贴牌客户，有合伙人升级潜力。' },
    tags: ['贴牌客户', '教育行业'], createdAt: daysAgo(55), updatedAt: daysAgo(8),
  },
  {
    id: 'cust-012', name: '邓国强', company: '昆明春城软件有限公司', phone: '12100019019', email: 'deng@chuncheng.com',
    productLevel: '贴牌', customerLevel: 'L4', wechat: 'denggq_oem', industry: '软件', city: '昆明',
    sourceType: '转介绍', score: 85,
    owner: '王磊', totalSpent: 280000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(65), title: '签约贴牌', description: '购买贴牌版', productLevel: '贴牌' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '高', satisfaction: 85, predictedNextPurchase: '合伙人升级', keyInsights: ['业务扩张快', '有合伙人意向'], analyzedAt: now, activityLevel: '高', upgradeProbability: 0.72, aiSummary: '贴牌客户业务扩张快，有合伙人升级意向。' },
    tags: ['高升级潜力', '贴牌客户'], createdAt: daysAgo(65), updatedAt: daysAgo(3),
  },
  {
    id: 'cust-013', name: '罗志华', company: '乌鲁木齐西域科技有限公司', phone: '11400026026', email: 'luo@xiyu.com',
    productLevel: '代理', customerLevel: 'L3', wechat: 'luozh_agent', industry: '科技', city: '乌鲁木齐',
    sourceType: '广告', score: 70,
    owner: '李娜', totalSpent: 150000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(40), title: '签约代理', description: '购买代理版', productLevel: '代理' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '低', satisfaction: 75, keyInsights: ['使用稳定', '区域市场良好'], analyzedAt: now, activityLevel: '中', upgradeProbability: 0.30, aiSummary: '区域代理客户使用稳定，升级意愿不高。' },
    tags: ['区域客户'], createdAt: daysAgo(40), updatedAt: daysAgo(10),
  },
  {
    id: 'cust-014', name: '韩晓东', company: '石家庄冀云科技有限公司', phone: '11800022022', email: 'han@jiyun.com',
    productLevel: '899', customerLevel: 'L2', wechat: 'hanxd_899', industry: '科技', city: '石家庄',
    sourceType: '官网', score: 55,
    owner: '张伟', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(20), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '中', upgradePotential: '中', satisfaction: 68, keyInsights: ['新客户', '使用频率偏低'], analyzedAt: now, activityLevel: '低', upgradeProbability: 0.35, aiSummary: '新客户活跃度低，需引导使用。' },
    tags: [], createdAt: daysAgo(20), updatedAt: daysAgo(5),
  },
  {
    id: 'cust-015', name: '彭亮', company: '南宁桂能科技有限公司', phone: '11900021021',
    productLevel: '899', customerLevel: 'L2', industry: '能源', city: '南宁',
    sourceType: '电话营销', score: 45,
    owner: '张伟', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(15), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    tags: [], createdAt: daysAgo(15), updatedAt: daysAgo(7),
  },
  {
    id: 'cust-016', name: '马天宇', company: '西安云帆信息科技有限公司', phone: '12900011011',
    productLevel: '899', customerLevel: 'L2', industry: '信息', city: '西安',
    sourceType: '社交媒体', score: 60,
    owner: '王磊', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(22), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '中', satisfaction: 76, keyInsights: ['使用正常', '有扩展意向'], analyzedAt: now, activityLevel: '中', upgradeProbability: 0.50, aiSummary: '899客户使用正常，有课程升级潜力。' },
    tags: [], createdAt: daysAgo(22), updatedAt: daysAgo(6),
  },
  {
    id: 'cust-017', name: '梁秀英', company: '银川宁创科技有限公司', phone: '11300027027',
    productLevel: '代理', customerLevel: 'L3', industry: '科技', city: '银川',
    sourceType: '电话营销', score: 62,
    owner: '赵敏', totalSpent: 150000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(48), title: '签约代理', description: '购买代理版', productLevel: '代理' },
    ],
    growthRecords: [],
    tags: [], createdAt: daysAgo(48), updatedAt: daysAgo(11),
  },
  {
    id: 'cust-018', name: '许建平', company: '拉萨雪域科技有限公司', phone: '11000030030',
    productLevel: '899', customerLevel: 'L2', industry: '科技', city: '拉萨',
    sourceType: '官网', score: 50,
    owner: '李娜', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(32), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    tags: [], createdAt: daysAgo(32), updatedAt: daysAgo(8),
  },
  {
    id: 'cust-019', name: '唐丽萍', company: '海口椰城科技有限公司', phone: '11100029029', email: 'tang@yecheng.com',
    productLevel: '代理', customerLevel: 'L3', industry: '科技', city: '海口',
    sourceType: '展会', score: 78,
    owner: '张伟', totalSpent: 150000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(42), title: '签约代理', description: '购买代理版', productLevel: '代理' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '低', upgradePotential: '高', satisfaction: 83, keyInsights: ['业务增长快', '有升级意向'], analyzedAt: now, activityLevel: '高', upgradeProbability: 0.78, aiSummary: '代理客户业务增长快，有贴牌升级意向。' },
    tags: ['高升级潜力'], createdAt: daysAgo(42), updatedAt: daysAgo(4),
  },
  {
    id: 'cust-020', name: '赵雪梅', company: '广州云图教育科技有限公司', phone: '13600004004', email: 'zhao@yuntu.com',
    productLevel: '贴牌', customerLevel: 'L4', industry: '教育', city: '广州',
    sourceType: '转介绍', score: 92,
    owner: '赵敏', totalSpent: 280000, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(80), title: '签约899', description: '首次购买', productLevel: '899' },
      { id: uuidv4(), date: daysAgo(40), title: '升级贴牌', description: '品牌定制升级', productLevel: '贴牌' },
    ],
    growthRecords: [
      { fromLevel: 'L2', toLevel: 'L4', fromProduct: '899', toProduct: '贴牌', upgradeAmount: 29800, reason: '品牌定制需求', createdAt: daysAgo(40) },
    ],
    aiPortrait: { riskLevel: '低', upgradePotential: '高', satisfaction: 91, keyInsights: ['教育行业领先', '品牌需求强', '高满意度'], analyzedAt: now, activityLevel: '高', upgradeProbability: 0.90, aiSummary: '教育行业贴牌客户，满意度高，有合伙人升级意向。' },
    tags: ['贴牌客户', '教育行业', '优质'], createdAt: daysAgo(80), updatedAt: daysAgo(6),
  },
  {
    id: 'cust-021', name: '宋德明', company: '西宁青能科技有限公司', phone: '11200028028',
    productLevel: '899', customerLevel: 'L2', industry: '能源', city: '西宁',
    sourceType: '广告', score: 42,
    owner: '赵敏', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(18), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    tags: [], createdAt: daysAgo(18), updatedAt: daysAgo(9),
  },
  {
    id: 'cust-022', name: '吴秀英', company: '武汉光电信息科技有限公司', phone: '13200008008',
    productLevel: '899', customerLevel: 'L2', industry: '光电', city: '武汉',
    sourceType: '官网', score: 30,
    owner: '赵敏', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(55), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    aiPortrait: { riskLevel: '高', upgradePotential: '低', satisfaction: 40, keyInsights: ['使用极低', '长期未登录', '可能流失'], analyzedAt: now, activityLevel: '低', upgradeProbability: 0.10, aiSummary: '客户使用极低，流失风险高。' },
    tags: ['风险客户', '可能流失'], createdAt: daysAgo(55), updatedAt: daysAgo(20),
  },
  {
    id: 'cust-023', name: '徐浩然', company: '沈阳北方数据科技有限公司', phone: '12300017017',
    productLevel: '899', customerLevel: 'L2', industry: '数据', city: '沈阳',
    sourceType: '社交媒体', score: 55,
    owner: '张伟', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(28), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    tags: [], createdAt: daysAgo(28), updatedAt: daysAgo(10),
  },
  {
    id: 'cust-024', name: '朱明', company: '合肥创新软件有限公司', phone: '12700013013',
    productLevel: '899', customerLevel: 'L2', industry: '软件', city: '合肥',
    sourceType: '广告', score: 50,
    owner: '张伟', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(12), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    tags: ['新客户'], createdAt: daysAgo(12), updatedAt: daysAgo(3),
  },
  {
    id: 'cust-025', name: '蒋文斌', company: '兰州陇能科技有限公司', phone: '11600024024',
    productLevel: '899', customerLevel: 'L2', industry: '能源', city: '兰州',
    sourceType: '社交媒体', score: 48,
    owner: '赵敏', totalSpent: 89900, orderCount: 1,
    growthPath: [
      { id: uuidv4(), date: daysAgo(16), title: '签约899', description: '购买基础版', productLevel: '899' },
    ],
    growthRecords: [],
    tags: [], createdAt: daysAgo(16), updatedAt: daysAgo(7),
  },
];
