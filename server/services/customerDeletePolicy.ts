import {
  findBlockingCustomerAssociations,
  type CustomerAssociationReader,
} from './customerAssociationRegistry';

export async function assertCustomerCanBeSoftDeleted(
  tx: CustomerAssociationReader,
  customerId: string,
  options: { cascadeLinkedLeads?: boolean } = {},
): Promise<void> {
  const blockingDomains = await findBlockingCustomerAssociations(tx, customerId, options);
  if (blockingDomains.length > 0) {
    throw new Error(`存在关联业务，不能删除：${blockingDomains.join('、')}`);
  }
}
