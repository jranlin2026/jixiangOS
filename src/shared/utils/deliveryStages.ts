import type { Product } from '../../types/product';

const DEFAULT_STAGES_BY_LEVEL: Record<string, string[]> = {
  '899': ['合同签订', '需求确认', '系统部署', '培训交付', '验收完成'],
  '课程': ['合同签订', '课程安排', '授课进行', '培训完成', '验收完成'],
  '代理': ['合同签订', '代理授权', '系统开通', '培训完成', '运营支持'],
  '贴牌': ['合同签订', '品牌定制', '系统部署', '测试验收', '上线运营'],
  '合伙人': ['合同签订', '需求确认', '系统部署', '培训交付', '验收完成'],
};

export function resolveProductDeliveryStages(product: Pick<Product, 'level' | 'deliveryStages'>): string[] {
  const configured = (product.deliveryStages || [])
    .map((stage) => String(stage || '').trim())
    .filter(Boolean);
  if (configured.length) return configured;
  return [...(DEFAULT_STAGES_BY_LEVEL[String(product.level || '').trim()] || [
    '合同签订', '需求确认', '交付实施', '验收完成',
  ])];
}
