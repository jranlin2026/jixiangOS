import type { Customer } from '../../types/customer';
import {
  CUSTOMER_MERGE_FIELDS,
  type CustomerMergeField,
  type CustomerMergeFieldDecision,
  type CustomerMergePrecheckInput,
} from '../../types/customerMerge';

export const normalizeMergeCustomerIds = (customerIds: string[]) => (
  Array.from(new Set(customerIds.map((id) => id.trim()).filter(Boolean))).slice(0, 10)
);

export const isCustomerMergeSelectionReady = (customerIds: string[], customers: Customer[]) => {
  const requestedIds = normalizeMergeCustomerIds(customerIds);
  const loadedIds = new Set(customers.map((customer) => customer.id));
  return requestedIds.length >= 2
    && requestedIds.length === loadedIds.size
    && requestedIds.every((id) => loadedIds.has(id));
};

export const buildInitialMergeDecisions = (
  mainCustomerId: string,
): Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>> => Object.fromEntries(
  CUSTOMER_MERGE_FIELDS.map((field) => [field, { sourceCustomerId: mainCustomerId }]),
) as Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>;

export const buildCustomerMergeInput = (
  customers: Customer[],
  mainCustomerId: string,
  fieldDecisions: Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>,
  reason: string,
): CustomerMergePrecheckInput => ({
  mainCustomerId,
  secondaryCustomerIds: customers.map((customer) => customer.id).filter((id) => id !== mainCustomerId),
  fieldDecisions,
  tagDecision: {
    selectedTagIds: Array.from(new Set(customers.flatMap((customer) => customer.manualTagIds || []))),
  },
  reason: reason.trim(),
});
