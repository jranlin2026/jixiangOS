import type { Delivery, DeliveryAttachment } from '../../types/delivery';
import type { Order, OrderApplication, OrderPayment } from '../../types/order';
import type { RecoveryOrder } from '../../types/recoveryOrder';
import type { BusinessAttachment } from '../../types/businessAttachment';

function compactBusinessAttachment(attachment: BusinessAttachment): BusinessAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    category: attachment.category,
    uploadedById: attachment.uploadedById,
    uploadedByName: attachment.uploadedByName,
    uploadedAt: attachment.uploadedAt,
  };
}

function withoutInlinePayload(value?: string): string | undefined {
  const normalized = String(value || '').trim().toLocaleLowerCase();
  return normalized.startsWith('data:') || normalized.startsWith('blob:') ? undefined : value;
}

function compactPayment(payment: OrderPayment): OrderPayment {
  return { ...payment, voucherPreview: withoutInlinePayload(payment.voucherPreview), attachments: payment.attachments?.map(compactBusinessAttachment) };
}

export function compactOrderListItem(order: Order): Order {
  return {
    ...order,
    dealEvidencePreview: withoutInlinePayload(order.dealEvidencePreview),
    dealEvidenceAttachments: order.dealEvidenceAttachments?.map(compactBusinessAttachment),
    payments: (order.payments || []).map(compactPayment),
  };
}

export function compactOrderApplicationListItem(application: OrderApplication): OrderApplication {
  return {
    ...application,
    orderData: compactOrderListItem(application.orderData as Order) as OrderApplication['orderData'],
  };
}

export function compactRecoveryOrderListItem(order: RecoveryOrder): RecoveryOrder {
  return {
    ...order,
    paymentVoucherPreview: withoutInlinePayload(order.paymentVoucherPreview),
    chatEvidencePreview: withoutInlinePayload(order.chatEvidencePreview),
    paymentAttachments: order.paymentAttachments?.map(compactBusinessAttachment),
    chatAttachments: order.chatAttachments?.map(compactBusinessAttachment),
  };
}

export function compactRecoverySettlementListItem(order: RecoveryOrder): RecoveryOrder {
  return {
    ...compactRecoveryOrderListItem(order),
    customerPhone: undefined,
    customerWechat: undefined,
    remark: undefined,
  };
}

function compactAttachment(attachment: DeliveryAttachment): DeliveryAttachment {
  return { ...attachment, url: withoutInlinePayload(attachment.url) };
}

export function compactDeliveryListItem(delivery: Delivery): Delivery {
  return {
    ...delivery,
    tasks: (delivery.tasks || []).map((task) => ({
      ...task,
      attachments: task.attachments?.map(compactAttachment),
      records: (task.records || []).map((record) => ({
        ...record,
        attachments: record.attachments?.filter((attachment) => Boolean(withoutInlinePayload(attachment))),
      })),
    })),
    materialItems: delivery.materialItems?.map((item) => ({
      ...item,
      attachments: item.attachments?.map(compactAttachment),
    })),
  };
}
