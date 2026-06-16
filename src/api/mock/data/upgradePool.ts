import type { UpgradeOpportunity } from '../../../types/upgrade';
import { v4 as uuidv4 } from 'uuid';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockUpgradePool: UpgradeOpportunity[] = [
  {
    id: 'upgrade-001', customerId: 'cust-001', customerName: '陈明远', currentLevel: 'L2', currentProduct: '899', targetProduct: '代理', targetLevel: 'L3',
    probability: 85, estimatedAmount: 9800, reason: '使用频率高，多次咨询代理政策', suggestions: ['安排代理方案演示', '提供行业案例'],
    status: '跟进中', ownerName: '张伟', lastFollowUpAt: daysAgo(2), followUpCount: 3,
    followUpRecords: [
      { id: uuidv4(), content: '电话沟通代理政策，客户表示兴趣', createdBy: '张伟', createdAt: daysAgo(5) },
      { id: uuidv4(), content: '发送代理方案文档', createdBy: '张伟', createdAt: daysAgo(3) },
      { id: uuidv4(), content: '客户反馈预算已批，等待签约', createdBy: '张伟', createdAt: daysAgo(2) },
    ],
    aiAnalyzedAt: daysAgo(1), createdAt: daysAgo(10), updatedAt: daysAgo(2),
  },
  {
    id: 'upgrade-002', customerId: 'cust-010', customerName: '高峰', currentLevel: 'L2', currentProduct: '899', targetProduct: '代理', targetLevel: 'L3',
    probability: 82, estimatedAmount: 9800, reason: '使用频率高，积极反馈，多次咨询代理', suggestions: ['安排产品演示', '推荐代理版本'],
    status: '跟进中', ownerName: '王磊', lastFollowUpAt: daysAgo(4), followUpCount: 2,
    followUpRecords: [
      { id: uuidv4(), content: '微信沟通升级事宜', createdBy: '王磊', createdAt: daysAgo(6) },
      { id: uuidv4(), content: '客户表示考虑中', createdBy: '王磊', createdAt: daysAgo(4) },
    ],
    aiAnalyzedAt: daysAgo(2), createdAt: daysAgo(8), updatedAt: daysAgo(4),
  },
  {
    id: 'upgrade-003', customerId: 'cust-003', customerName: '黄美丽', currentLevel: 'L4', currentProduct: '贴牌', targetProduct: '合伙人', targetLevel: 'L5',
    probability: 75, estimatedAmount: 59800, reason: '品牌定制需求强，教育行业深耕，多次续约', suggestions: ['提供合伙人方案', '安排高层会面'],
    status: '跟进中', ownerName: '李娜', lastFollowUpAt: daysAgo(3), followUpCount: 4,
    followUpRecords: [
      { id: uuidv4(), content: '讨论合伙人方案初稿', createdBy: '李娜', createdAt: daysAgo(8) },
      { id: uuidv4(), content: '客户提出定制需求', createdBy: '李娜', createdAt: daysAgo(5) },
      { id: uuidv4(), content: '修改方案中', createdBy: '李娜', createdAt: daysAgo(3) },
    ],
    aiAnalyzedAt: daysAgo(1), createdAt: daysAgo(12), updatedAt: daysAgo(3),
  },
  {
    id: 'upgrade-004', customerId: 'cust-007', customerName: '郑海涛', currentLevel: 'L3', currentProduct: '代理', targetProduct: '贴牌', targetLevel: 'L4',
    probability: 68, estimatedAmount: 29800, reason: '使用稳定，有贴牌意向', suggestions: ['提供贴牌案例', '安排技术对接'],
    status: '待跟进', ownerName: '张伟', followUpCount: 1,
    followUpRecords: [
      { id: uuidv4(), content: '客户咨询贴牌方案', createdBy: '张伟', createdAt: daysAgo(7) },
    ],
    aiAnalyzedAt: daysAgo(3), createdAt: daysAgo(9), updatedAt: daysAgo(7),
  },
  {
    id: 'upgrade-005', customerId: 'cust-012', customerName: '邓国强', currentLevel: 'L4', currentProduct: '贴牌', targetProduct: '合伙人', targetLevel: 'L5',
    probability: 72, estimatedAmount: 59800, reason: '业务扩张快，有合伙人意向', suggestions: ['推进合伙人签约', '安排高层会面'],
    status: '跟进中', ownerName: '王磊', lastFollowUpAt: daysAgo(1), followUpCount: 2,
    followUpRecords: [
      { id: uuidv4(), content: '深入沟通合伙人模式', createdBy: '王磊', createdAt: daysAgo(5) },
      { id: uuidv4(), content: '客户表示近期有决策时间', createdBy: '王磊', createdAt: daysAgo(1) },
    ],
    aiAnalyzedAt: daysAgo(2), createdAt: daysAgo(7), updatedAt: daysAgo(1),
  },
  {
    id: 'upgrade-006', customerId: 'cust-019', customerName: '唐丽萍', currentLevel: 'L3', currentProduct: '代理', targetProduct: '贴牌', targetLevel: 'L4',
    probability: 78, estimatedAmount: 29800, reason: '业务增长快，有升级意向', suggestions: ['展示贴牌成功案例', '提供ROI分析'],
    status: '跟进中', ownerName: '张伟', lastFollowUpAt: daysAgo(5), followUpCount: 2,
    followUpRecords: [
      { id: uuidv4(), content: '客户表达品牌需求', createdBy: '张伟', createdAt: daysAgo(8) },
      { id: uuidv4(), content: '发送贴牌方案', createdBy: '张伟', createdAt: daysAgo(5) },
    ],
    aiAnalyzedAt: daysAgo(3), createdAt: daysAgo(11), updatedAt: daysAgo(5),
  },
  {
    id: 'upgrade-007', customerId: 'cust-009', customerName: '胡红梅', currentLevel: 'L3', currentProduct: '代理', targetProduct: '贴牌', targetLevel: 'L4',
    probability: 55, estimatedAmount: 29800, reason: '使用一般，偶有问题，但有品牌需求', suggestions: ['加强使用培训', '展示贴牌价值'],
    status: '待跟进', ownerName: '李娜', followUpCount: 0,
    followUpRecords: [],
    aiAnalyzedAt: daysAgo(5), createdAt: daysAgo(6), updatedAt: daysAgo(5),
  },
  {
    id: 'upgrade-008', customerId: 'cust-020', customerName: '赵雪梅', currentLevel: 'L4', currentProduct: '贴牌', targetProduct: '合伙人', targetLevel: 'L5',
    probability: 90, estimatedAmount: 59800, reason: '教育行业领先，品牌需求强，高满意度', suggestions: ['推进合伙人签约', '定制合作方案'],
    status: '跟进中', ownerName: '赵敏', lastFollowUpAt: daysAgo(2), followUpCount: 3,
    followUpRecords: [
      { id: uuidv4(), content: '深度讨论合作模式', createdBy: '赵敏', createdAt: daysAgo(6) },
      { id: uuidv4(), content: '客户表示很有兴趣', createdBy: '赵敏', createdAt: daysAgo(4) },
      { id: uuidv4(), content: '安排高层会面', createdBy: '赵敏', createdAt: daysAgo(2) },
    ],
    aiAnalyzedAt: daysAgo(1), createdAt: daysAgo(8), updatedAt: daysAgo(2),
  },
  {
    id: 'upgrade-009', customerId: 'cust-008', customerName: '杨晓燕', currentLevel: 'L2', currentProduct: '899', targetProduct: '课程', targetLevel: 'L2',
    probability: 65, estimatedAmount: 2980, reason: '活跃使用，偶有反馈，对AI课程感兴趣', suggestions: ['推荐课程产品', '提供学习路径'],
    status: '待跟进', ownerName: '赵敏', followUpCount: 1,
    followUpRecords: [
      { id: uuidv4(), content: '客户询问培训课程', createdBy: '赵敏', createdAt: daysAgo(4) },
    ],
    aiAnalyzedAt: daysAgo(3), createdAt: daysAgo(5), updatedAt: daysAgo(4),
  },
  {
    id: 'upgrade-010', customerId: 'cust-004', customerName: '王建国', currentLevel: 'L2', currentProduct: '899', targetProduct: '课程', targetLevel: 'L2',
    probability: 50, estimatedAmount: 2980, reason: '使用频率一般，偶有反馈', suggestions: ['加强互动', '推送课程优惠'],
    status: '待跟进', ownerName: '王磊', followUpCount: 0,
    followUpRecords: [],
    aiAnalyzedAt: daysAgo(4), createdAt: daysAgo(4), updatedAt: daysAgo(4),
  },
  {
    id: 'upgrade-011', customerId: 'cust-014', customerName: '韩晓东', currentLevel: 'L2', currentProduct: '899', targetProduct: '代理', targetLevel: 'L3',
    probability: 45, estimatedAmount: 9800, reason: '新客户，使用频率偏低', suggestions: ['增加使用指导', '展示代理优势'],
    status: '待跟进', ownerName: '张伟', followUpCount: 0,
    followUpRecords: [],
    aiAnalyzedAt: daysAgo(6), createdAt: daysAgo(3), updatedAt: daysAgo(6),
  },
  {
    id: 'upgrade-012', customerId: 'cust-017', customerName: '梁秀英', currentLevel: 'L3', currentProduct: '代理', targetProduct: '贴牌', targetLevel: 'L4',
    probability: 40, estimatedAmount: 29800, reason: '使用稳定但活跃度一般', suggestions: ['提升使用深度', '引导品牌意识'],
    status: '待跟进', ownerName: '赵敏', followUpCount: 0,
    followUpRecords: [],
    aiAnalyzedAt: daysAgo(7), createdAt: daysAgo(5), updatedAt: daysAgo(7),
  },
  {
    id: 'upgrade-013', customerId: 'cust-016', customerName: '马天宇', currentLevel: 'L2', currentProduct: '899', targetProduct: '课程', targetLevel: 'L2',
    probability: 58, estimatedAmount: 2980, reason: '使用正常，有扩展意向', suggestions: ['推荐课程升级', '提供组合优惠'],
    status: '待跟进', ownerName: '王磊', followUpCount: 0,
    followUpRecords: [],
    aiAnalyzedAt: daysAgo(4), createdAt: daysAgo(3), updatedAt: daysAgo(4),
  },
  {
    id: 'upgrade-014', customerId: 'cust-011', customerName: '谢丽华', currentLevel: 'L4', currentProduct: '贴牌', targetProduct: '合伙人', targetLevel: 'L5',
    probability: 62, estimatedAmount: 59800, reason: '定制需求满足，教育行业深耕', suggestions: ['推荐战略合伙人模式', '展示长期收益'],
    status: '跟进中', ownerName: '赵敏', lastFollowUpAt: daysAgo(6), followUpCount: 1,
    followUpRecords: [
      { id: uuidv4(), content: '客户表示观望中', createdBy: '赵敏', createdAt: daysAgo(6) },
    ],
    aiAnalyzedAt: daysAgo(4), createdAt: daysAgo(9), updatedAt: daysAgo(6),
  },
  {
    id: 'upgrade-015', customerId: 'cust-015', customerName: '彭亮', currentLevel: 'L2', currentProduct: '899', targetProduct: '代理', targetLevel: 'L3',
    probability: 35, estimatedAmount: 9800, reason: '新客户，尚未深度使用', suggestions: ['加强培训', '等待使用成熟后再推荐'],
    status: '待跟进', ownerName: '张伟', followUpCount: 0,
    followUpRecords: [],
    aiAnalyzedAt: daysAgo(5), createdAt: daysAgo(2), updatedAt: daysAgo(5),
  },
];
