import type { CustomerTag } from '../../../types/tag';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const createTag = (
  tag: Omit<CustomerTag, 'sortOrder' | 'updatedAt'>,
  sortOrder: number,
): CustomerTag => ({ ...tag, sortOrder, updatedAt: tag.createdAt });

export const mockTags: CustomerTag[] = [
  createTag({ id: 'tag-001', groupId: 'tag-group-industry', name: '教育', color: '#2196F3', usageCount: 15, isActive: true, createdAt: daysAgo(300) }, 1),
  createTag({ id: 'tag-002', groupId: 'tag-group-industry', name: '实体店', color: '#4CAF50', usageCount: 8, isActive: true, createdAt: daysAgo(280) }, 2),
  createTag({ id: 'tag-003', groupId: 'tag-group-value', name: '高客单', color: '#FF9800', usageCount: 12, isActive: true, createdAt: daysAgo(250) }, 1),
  createTag({ id: 'tag-004', groupId: 'tag-group-behavior', name: '代理意向', color: '#9C27B0', usageCount: 6, isActive: true, createdAt: daysAgo(200) }, 1),
  createTag({ id: 'tag-005', groupId: 'tag-group-behavior', name: '高活跃', color: '#4CAF50', usageCount: 10, isActive: true, createdAt: daysAgo(180) }, 2),
  createTag({ id: 'tag-006', groupId: 'tag-group-industry', name: '制造业', color: '#795548', usageCount: 5, isActive: true, createdAt: daysAgo(150) }, 3),
  createTag({ id: 'tag-007', groupId: 'tag-group-industry', name: '电商', color: '#FF5722', usageCount: 7, isActive: true, createdAt: daysAgo(120) }, 4),
  createTag({ id: 'tag-008', groupId: 'tag-group-industry', name: '零售', color: '#009688', usageCount: 4, isActive: true, createdAt: daysAgo(100) }, 5),
  createTag({ id: 'tag-009', groupId: 'tag-group-industry', name: 'SaaS', color: '#3F51B5', usageCount: 9, isActive: true, createdAt: daysAgo(80) }, 6),
  createTag({ id: 'tag-010', groupId: 'tag-group-industry', name: '咨询', color: '#607D8B', usageCount: 3, isActive: true, createdAt: daysAgo(60) }, 7),
  createTag({ id: 'tag-011', groupId: 'tag-group-attribute', name: '连锁', color: '#E91E63', usageCount: 6, isActive: true, createdAt: daysAgo(40) }, 1),
  createTag({ id: 'tag-012', groupId: 'tag-group-attribute', name: '初创', color: '#00BCD4', usageCount: 11, isActive: true, createdAt: daysAgo(20) }, 2),
];
