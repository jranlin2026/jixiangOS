import type { Product } from '../../../types/product';
import { DELIVERY_STAGES_899, DELIVERY_STAGES_COURSE, DELIVERY_STAGES_AGENT, DELIVERY_STAGES_OEM } from '../../../shared/utils/constants';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockProducts: Product[] = [
  {
    id: 'prod-001', name: '899智能体', level: '899', price: 899, originalPrice: 1299,
    description: '基础AI智能体，适合个人和小团队使用',
    features: ['AI对话', '知识库', '基础分析'],
    deliveryStages: [...DELIVERY_STAGES_899],
    isActive: true, sortOrder: 1, createdAt: daysAgo(365), updatedAt: daysAgo(5),
  },
  {
    id: 'prod-002', name: '2980课程', level: '课程', price: 2980, originalPrice: 3980,
    description: 'AI运营实战课程，系统学习AI应用方法',
    features: ['在线课程', '实操指导', '社群答疑'],
    deliveryStages: [...DELIVERY_STAGES_COURSE],
    isActive: true, sortOrder: 2, createdAt: daysAgo(300), updatedAt: daysAgo(8),
  },
  {
    id: 'prod-003', name: '9800代理', level: '代理', price: 9800, originalPrice: 12800,
    description: '区域代理授权，享受代理分销权益',
    features: ['代理授权', '系统开通', '培训支持', '运营指导'],
    deliveryStages: [...DELIVERY_STAGES_AGENT],
    isActive: true, sortOrder: 3, createdAt: daysAgo(280), updatedAt: daysAgo(10),
  },
  {
    id: 'prod-004', name: '29800贴牌', level: '贴牌', price: 29800, originalPrice: 39800,
    description: '品牌定制版，打造专属AI品牌',
    features: ['品牌定制', '独立部署', '技术支持', '持续升级'],
    deliveryStages: [...DELIVERY_STAGES_OEM],
    isActive: true, sortOrder: 4, createdAt: daysAgo(250), updatedAt: daysAgo(7),
  },
  {
    id: 'prod-005', name: '59800合伙人', level: '合伙人', price: 59800, originalPrice: 79800,
    description: '战略合伙人，深度合作共享收益',
    features: ['战略合伙', '利益共享', '优先支持', '定制开发'],
    deliveryStages: [...DELIVERY_STAGES_899],
    isActive: true, sortOrder: 5, createdAt: daysAgo(200), updatedAt: daysAgo(3),
  },
];
