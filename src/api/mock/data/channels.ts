import type { ChannelConfig } from '../../../types/settings';
import { v4 as uuidv4 } from 'uuid';

export const mockChannels: ChannelConfig[] = [
  {
    id: uuidv4(),
    name: '百度搜索',
    type: '搜索引擎',
    budget: 30000,
    isActive: true,
    description: '百度SEM竞价广告，覆盖核心关键词',
  },
  {
    id: uuidv4(),
    name: '抖音推广',
    type: '社交媒体',
    budget: 20000,
    isActive: true,
    description: '抖音信息流广告，触达中小企业主',
  },
  {
    id: uuidv4(),
    name: '行业展会',
    type: '展会',
    budget: 50000,
    isActive: true,
    description: '参加SaaS行业展会，获取高质量线索',
  },
  {
    id: uuidv4(),
    name: '客户转介绍',
    type: '转介绍',
    budget: 10000,
    isActive: true,
    description: '老客户推荐新客户，返利激励计划',
  },
  {
    id: uuidv4(),
    name: '直销团队',
    type: '直销',
    budget: 25000,
    isActive: true,
    description: '销售团队主动拓客，电话+上门',
  },
  {
    id: uuidv4(),
    name: '微信推广',
    type: '社交媒体',
    budget: 15000,
    isActive: false,
    description: '微信公众号+朋友圈广告',
  },
];
