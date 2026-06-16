import type { Delivery } from '../../../types/delivery';
import { DELIVERY_STAGES_899, DELIVERY_STAGES_COURSE, DELIVERY_STAGES_AGENT, DELIVERY_STAGES_OEM } from '../../../shared/utils/constants';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const stageMap899 = [...DELIVERY_STAGES_899];
const stageMapCourse = [...DELIVERY_STAGES_COURSE];
const stageMapAgent = [...DELIVERY_STAGES_AGENT];
const stageMapOem = [...DELIVERY_STAGES_OEM];

/** 根据产品类型和当前阶段索引生成子任务 */
function generateTasks(
  productType: string,
  stages: readonly string[],
  currentStageIndex: number,
): Delivery['tasks'] {
  return stages.map((stage, idx) => {
    const isCompleted = idx < currentStageIndex;
    const isCurrent = idx === currentStageIndex;
    return {
      id: `task-${productType}-${idx}`,
      title: stage,
      description: `${stage}阶段相关任务`,
      assigneeName: ['张伟', '李娜', '王磊', '赵敏'][idx % 4],
      status: isCompleted ? '已完成' as const : isCurrent ? '进行中' as const : '待开始' as const,
      dueDate: daysAgo(30 - idx * 5),
      completedAt: isCompleted ? daysAgo(30 - idx * 5 - 2) : undefined,
      records: isCompleted
        ? [{
            id: `rec-${productType}-${idx}`,
            content: `${stage}阶段已完成`,
            createdBy: ['张伟', '李娜', '王磊', '赵敏'][idx % 4],
            createdAt: daysAgo(30 - idx * 5 - 1),
          }]
        : [],
    };
  });
}

const deliveryData: Array<{
  orderNo: string;
  customerName: string;
  productType: '899' | '课程' | '代理' | '贴牌' | '合伙人';
  currentStageIndex: number;
  owner: string;
}> = [
  { orderNo: 'ORD-202501-0001', customerName: '北京云端科技', productType: '899', currentStageIndex: 2, owner: '张伟' },
  { orderNo: 'ORD-202501-0002', customerName: '上海数联信息', productType: '代理', currentStageIndex: 1, owner: '李娜' },
  { orderNo: 'ORD-202501-0003', customerName: '重庆智联教育', productType: '贴牌', currentStageIndex: 3, owner: '李娜' },
  { orderNo: 'ORD-202501-0004', customerName: '深圳智创软件', productType: '课程', currentStageIndex: 2, owner: '张伟' },
  { orderNo: 'ORD-202501-0005', customerName: '南京星辰数据', productType: '合伙人', currentStageIndex: 0, owner: '王磊' },
  { orderNo: 'ORD-202501-0006', customerName: '杭州万物互联', productType: '899', currentStageIndex: 1, owner: '李娜' },
  { orderNo: 'ORD-202501-0007', customerName: '天津华信网络', productType: '代理', currentStageIndex: 3, owner: '张伟' },
  { orderNo: 'ORD-202501-0008', customerName: '武汉光电信息', productType: '课程', currentStageIndex: 3, owner: '赵敏' },
  { orderNo: 'ORD-202501-0009', customerName: '厦门数字海洋', productType: '代理', currentStageIndex: 2, owner: '李娜' },
  { orderNo: 'ORD-202501-0010', customerName: '福州博远信息', productType: '899', currentStageIndex: 0, owner: '王磊' },
  { orderNo: 'ORD-202501-0011', customerName: '济南天成教育', productType: '贴牌', currentStageIndex: 4, owner: '赵敏' },
  { orderNo: 'ORD-202501-0012', customerName: '昆明春城软件', productType: '贴牌', currentStageIndex: 2, owner: '王磊' },
  { orderNo: 'ORD-202501-0013', customerName: '乌鲁木齐西域', productType: '代理', currentStageIndex: 1, owner: '李娜' },
  { orderNo: 'ORD-202501-0014', customerName: '石家庄冀云', productType: '899', currentStageIndex: 3, owner: '张伟' },
  { orderNo: 'ORD-202501-0015', customerName: '长沙融创智能', productType: '课程', currentStageIndex: 1, owner: '王磊' },
  { orderNo: 'ORD-202501-0016', customerName: '西安云帆信息', productType: '899', currentStageIndex: 0, owner: '王磊' },
  { orderNo: 'ORD-202501-0017', customerName: '银川宁创科技', productType: '代理', currentStageIndex: 4, owner: '赵敏' },
  { orderNo: 'ORD-202501-0019', customerName: '海口椰城科技', productType: '代理', currentStageIndex: 2, owner: '张伟' },
  { orderNo: 'ORD-202501-0020', customerName: '广州云图教育', productType: '贴牌', currentStageIndex: 1, owner: '赵敏' },
  { orderNo: 'ORD-202501-0021', customerName: '南宁桂能科技', productType: '899', currentStageIndex: 2, owner: '张伟' },
  { orderNo: 'ORD-202501-0023', customerName: '沈阳北方数据', productType: '899', currentStageIndex: 1, owner: '张伟' },
  { orderNo: 'ORD-202501-0024', customerName: '合肥创新软件', productType: '899', currentStageIndex: 0, owner: '张伟' },
  { orderNo: 'ORD-202501-0025', customerName: '兰州陇能科技', productType: '899', currentStageIndex: 2, owner: '赵敏' },
];

function getStages(productType: string): readonly string[] {
  switch (productType) {
    case '课程': return stageMapCourse;
    case '代理': return stageMapAgent;
    case '贴牌': return stageMapOem;
    case '合伙人': return stageMapAgent; // 合伙人使用代理流程
    default: return stageMap899;
  }
}

export const mockDeliveries: Delivery[] = deliveryData.map((d, i) => {
  const stages = getStages(d.productType);
  const safeIndex = Math.min(d.currentStageIndex, stages.length - 1);
  const tasks = generateTasks(d.productType, stages, safeIndex);

  return {
    id: `delivery-${String(i + 1).padStart(3, '0')}`,
    orderId: `order-${String(i + 1).padStart(3, '0')}`,
    orderNo: d.orderNo,
    customerId: `cust-${String((i % 25) + 1).padStart(3, '0')}`,
    customerName: d.customerName,
    productType: d.productType,
    currentStage: stages[safeIndex],
    stages: [...stages],
    tasks,
    owner: d.owner,
    notes: i % 4 === 0 ? '加急处理' : undefined,
    createdAt: daysAgo(30 - i),
    updatedAt: daysAgo(Math.max(0, 25 - i)),
  };
});
