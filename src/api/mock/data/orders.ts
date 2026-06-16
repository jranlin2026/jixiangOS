import type { Order } from '../../../types/order';
import { v4 as uuidv4 } from 'uuid';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function genOrderNo(index: number): string {
  return `ORD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(index).padStart(4, '0')}`;
}

const levels: Array<'899' | '课程' | '代理' | '贴牌' | '合伙人'> = ['899', '课程', '代理', '贴牌', '合伙人'];
const amounts: Record<string, number> = { '899': 899, '课程': 2980, '代理': 9800, '贴牌': 29800, '合伙人': 59800 };
const orderTypes = ['新购', '续费', '升级', '增购', '试用转正'] as const;
const paymentMethods = ['银行转账', '支付宝', '微信支付', '对公转账', '现金'] as const;

const customers = [
  { id: 'cust-001', name: '北京云端科技' },
  { id: 'cust-002', name: '上海数联信息' },
  { id: 'cust-003', name: '重庆智联教育' },
  { id: 'cust-004', name: '深圳智创软件' },
  { id: 'cust-005', name: '南京星辰数据' },
  { id: 'cust-006', name: '杭州万物互联' },
  { id: 'cust-007', name: '天津华信网络' },
  { id: 'cust-008', name: '长沙融创智能' },
  { id: 'cust-009', name: '厦门数字海洋' },
  { id: 'cust-010', name: '福州博远信息' },
  { id: 'cust-011', name: '济南天成教育' },
  { id: 'cust-012', name: '昆明春城软件' },
  { id: 'cust-013', name: '乌鲁木齐西域' },
  { id: 'cust-014', name: '石家庄冀云' },
  { id: 'cust-015', name: '南宁桂能科技' },
  { id: 'cust-016', name: '西安云帆信息' },
  { id: 'cust-017', name: '银川宁创科技' },
  { id: 'cust-018', name: '拉萨雪域科技' },
  { id: 'cust-019', name: '海口椰城科技' },
  { id: 'cust-020', name: '广州云图教育' },
];

const owners = ['张伟', '李娜', '王磊', '赵敏'];
const statuses: Array<'待确认' | '已确认' | '处理中' | '已完成' | '退款中' | '已退款' | '已取消'> = ['待确认', '已确认', '处理中', '已完成', '退款中', '已退款', '已取消'];

export const mockOrders: Order[] = Array.from({ length: 40 }, (_, i) => {
  const level = levels[i % 5];
  const customer = customers[i % customers.length];
  const status = i < 25 ? '已完成' : i < 30 ? '处理中' : i < 34 ? '已确认' : i < 37 ? '待确认' : statuses[i % statuses.length];
  const refundStatus = i === 5 ? '退款已完成' : i === 12 ? '退款申请中' : i === 28 ? '退款已拒绝' : '无';
  const isRefund = refundStatus !== '无';
  const amount = amounts[level] + (i % 3 === 0 ? 500 : 0);
  const orderType = i < 25 ? '新购' : orderTypes[i % orderTypes.length];
  const paymentMethod = paymentMethods[i % paymentMethods.length];

  return {
    id: `order-${String(i + 1).padStart(3, '0')}`,
    orderNo: genOrderNo(i + 1),
    customerId: customer.id,
    customerName: customer.name,
    productLevel: level,
    productId: `prod-00${(i % 5) + 1}`,
    orderType,
    amount,
    actualAmount: amount,
    paymentMethod,
    status,
    refundStatus,
    refundAmount: isRefund ? Math.round(amount * 0.8) : undefined,
    refundReason: isRefund ? (i === 5 ? '产品不满足需求' : i === 12 ? '预算调整' : '服务不满意') : undefined,
    owner: owners[i % owners.length],
    salesId: `user-00${(i % 4) + 1}`,
    salesName: owners[i % owners.length],
    sourceType: i % 3 === 0 ? '公司资源' : '自拓',
    payments: [{
      id: uuidv4(),
      amount,
      paymentMethod,
      paidAt: daysAgo(35 - i),
      remark: '',
    }],
    notes: i % 5 === 0 ? '重点客户，优先处理' : undefined,
    createdAt: daysAgo(35 - i),
    updatedAt: daysAgo(Math.max(0, 35 - i - 2)),
  };
});
