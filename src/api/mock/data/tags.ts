import type { CustomerTag } from '../../../types/tag';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockTags: CustomerTag[] = [
  { id: 'tag-001', name: '教育', category: '行业', color: '#2196F3', usageCount: 15, isActive: true, createdAt: daysAgo(300) },
  { id: 'tag-002', name: '实体店', category: '行业', color: '#4CAF50', usageCount: 8, isActive: true, createdAt: daysAgo(280) },
  { id: 'tag-003', name: '高客单', category: '价值', color: '#FF9800', usageCount: 12, isActive: true, createdAt: daysAgo(250) },
  { id: 'tag-004', name: '代理意向', category: '行为', color: '#9C27B0', usageCount: 6, isActive: true, createdAt: daysAgo(200) },
  { id: 'tag-005', name: '高活跃', category: '行为', color: '#4CAF50', usageCount: 10, isActive: true, createdAt: daysAgo(180) },
  { id: 'tag-006', name: '制造业', category: '行业', color: '#795548', usageCount: 5, isActive: true, createdAt: daysAgo(150) },
  { id: 'tag-007', name: '电商', category: '行业', color: '#FF5722', usageCount: 7, isActive: true, createdAt: daysAgo(120) },
  { id: 'tag-008', name: '零售', category: '行业', color: '#009688', usageCount: 4, isActive: true, createdAt: daysAgo(100) },
  { id: 'tag-009', name: 'SaaS', category: '行业', color: '#3F51B5', usageCount: 9, isActive: true, createdAt: daysAgo(80) },
  { id: 'tag-010', name: '咨询', category: '行业', color: '#607D8B', usageCount: 3, isActive: true, createdAt: daysAgo(60) },
  { id: 'tag-011', name: '连锁', category: '属性', color: '#E91E63', usageCount: 6, isActive: true, createdAt: daysAgo(40) },
  { id: 'tag-012', name: '初创', category: '属性', color: '#00BCD4', usageCount: 11, isActive: true, createdAt: daysAgo(20) },
];
