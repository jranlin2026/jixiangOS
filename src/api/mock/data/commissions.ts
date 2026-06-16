import type { Commission } from '../../../types/commission';
import { COMMISSION_RATES } from '../../../shared/utils/constants';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const commissionEntries: Array<{
  orderNo: string;
  customerName: string;
  productLevel: '899' | '课程' | '代理' | '贴牌' | '合伙人';
  orderAmount: number;
  owner: string;
  status: '待审核' | '待发放' | '已发放' | '已取消';
  commissionRuleId?: string;
}> = [
  { orderNo: 'ORD-202501-0001', customerName: '北京云端科技', productLevel: '899', orderAmount: 899, owner: '张伟', status: '已发放', commissionRuleId: 'rule-002' },
  { orderNo: 'ORD-202501-0002', customerName: '上海数联信息', productLevel: '代理', orderAmount: 9800, owner: '李娜', status: '已发放', commissionRuleId: 'rule-005' },
  { orderNo: 'ORD-202501-0003', customerName: '重庆智联教育', productLevel: '贴牌', orderAmount: 29800, owner: '李娜', status: '待发放', commissionRuleId: 'rule-006' },
  { orderNo: 'ORD-202501-0004', customerName: '深圳智创软件', productLevel: '课程', orderAmount: 2980, owner: '张伟', status: '已发放', commissionRuleId: 'rule-004' },
  { orderNo: 'ORD-202501-0005', customerName: '南京星辰数据', productLevel: '合伙人', orderAmount: 59800, owner: '王磊', status: '待审核', commissionRuleId: 'rule-007' },
  { orderNo: 'ORD-202501-0007', customerName: '天津华信网络', productLevel: '代理', orderAmount: 9800, owner: '张伟', status: '已发放', commissionRuleId: 'rule-005' },
  { orderNo: 'ORD-202501-0008', customerName: '武汉光电信息', productLevel: '课程', orderAmount: 2980, owner: '赵敏', status: '待审核', commissionRuleId: 'rule-003' },
  { orderNo: 'ORD-202501-0009', customerName: '厦门数字海洋', productLevel: '代理', orderAmount: 9800, owner: '李娜', status: '待发放', commissionRuleId: 'rule-005' },
  { orderNo: 'ORD-202501-0011', customerName: '济南天成教育', productLevel: '贴牌', orderAmount: 29800, owner: '赵敏', status: '已发放', commissionRuleId: 'rule-006' },
  { orderNo: 'ORD-202501-0012', customerName: '昆明春城软件', productLevel: '贴牌', orderAmount: 29800, owner: '王磊', status: '待审核', commissionRuleId: 'rule-006' },
  { orderNo: 'ORD-202501-0013', customerName: '乌鲁木齐西域', productLevel: '代理', orderAmount: 9800, owner: '李娜', status: '已发放', commissionRuleId: 'rule-005' },
  { orderNo: 'ORD-202501-0014', customerName: '石家庄冀云', productLevel: '899', orderAmount: 899, owner: '张伟', status: '待发放', commissionRuleId: 'rule-001' },
  { orderNo: 'ORD-202501-0015', customerName: '长沙融创智能', productLevel: '课程', orderAmount: 2980, owner: '王磊', status: '待审核', commissionRuleId: 'rule-004' },
  { orderNo: 'ORD-202501-0017', customerName: '银川宁创科技', productLevel: '代理', orderAmount: 9800, owner: '赵敏', status: '已发放', commissionRuleId: 'rule-005' },
  { orderNo: 'ORD-202501-0019', customerName: '海口椰城科技', productLevel: '代理', orderAmount: 9800, owner: '张伟', status: '待发放', commissionRuleId: 'rule-005' },
  { orderNo: 'ORD-202501-0020', customerName: '广州云图教育', productLevel: '贴牌', orderAmount: 29800, owner: '赵敏', status: '待审核', commissionRuleId: 'rule-006' },
  { orderNo: 'ORD-202501-0021', customerName: '南宁桂能科技', productLevel: '899', orderAmount: 899, owner: '张伟', status: '已取消', commissionRuleId: 'rule-001' },
  { orderNo: 'ORD-202501-0025', customerName: '兰州陇能科技', productLevel: '899', orderAmount: 899, owner: '赵敏', status: '待发放', commissionRuleId: 'rule-002' },
];

export const mockCommissions: Commission[] = commissionEntries.map((c, i) => {
  const rate = COMMISSION_RATES[c.productLevel];
  return {
    id: `comm-${String(i + 1).padStart(3, '0')}`,
    orderId: `order-${String(i + 1).padStart(3, '0')}`,
    orderNo: c.orderNo,
    customerName: c.customerName,
    productLevel: c.productLevel,
    orderAmount: c.orderAmount,
    commissionRate: rate,
    commissionAmount: Math.round(c.orderAmount * rate * 100) / 100,
    role: '销售',
    department: '销售部',
    scene: c.productLevel === '899' ? '899成交' : '新代理',
    resourceOwnership: '公司资源',
    proofStatus: '无需凭证',
    status: c.status,
    owner: c.owner,
    commissionRuleId: c.commissionRuleId,
    paidAt: c.status === '已发放' ? daysAgo(20 - i) : undefined,
    createdAt: daysAgo(30 - i),
    updatedAt: daysAgo(Math.max(0, 25 - i)),
  };
});
