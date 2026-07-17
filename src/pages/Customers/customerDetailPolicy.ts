import type { Customer } from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';
import { normalizeResourceOwnership } from '../../shared/utils/constants';
import { canCompleteContactField, canCompletePhoneField } from '../../shared/utils/contactEditLock';
import { normalizePhoneForStorage } from '../../shared/utils/phoneNumber';
import { completeCityFromPhone } from '../../shared/utils/mobileCityAttribution';

type BuildCustomerDetailPatchInput = {
  current: Customer;
  draft: Partial<Customer>;
  canEditProfile: boolean;
  canEditAttribution: boolean;
  canEditLockedContact: boolean;
};

type BuildCustomerDetailActionPolicyInput = {
  customer: Customer;
  manageableOwnerIds: ReadonlySet<string>;
  canEditProfile: boolean;
  canSetTodos: boolean;
  readOnly: boolean;
};

export type CustomerWriteLeafPermissions = {
  editProfile: boolean;
  editAttribution: boolean;
  setTags: boolean;
  setTodos: boolean;
  setProgress: boolean;
  transfer: boolean;
  release: boolean;
  delete: boolean;
};

type BuildCustomerWriteActionPolicyInput = {
  customer: Customer;
  manageableOwnerIds: ReadonlySet<string>;
  permissions: CustomerWriteLeafPermissions;
  readOnly: boolean;
};

export type CustomerTodoAction = 'complete' | 'reopen' | 'cancel' | 'edit';

const comparable = (value: unknown) => String(value ?? '');

export function buildManageableOwnerIds(
  currentUserId: string | undefined,
  assignableUsers: ReadonlyArray<{ id?: string }>,
): ReadonlySet<string> {
  return new Set([
    currentUserId,
    ...assignableUsers.map((user) => user.id),
  ].filter((id): id is string => Boolean(id)));
}

export function canManageCustomerWithOwnerIds(
  customer: Customer,
  manageableOwnerIds: ReadonlySet<string>,
): boolean {
  return !customer.deletedAt
    && customer.ownerIdentityStatus === 'resolved'
    && Boolean(customer.ownerId && manageableOwnerIds.has(customer.ownerId));
}

export function buildCustomerWriteActionPolicy({
  customer,
  manageableOwnerIds,
  permissions,
  readOnly,
}: BuildCustomerWriteActionPolicyInput) {
  const canManageCustomer = canManageCustomerWithOwnerIds(customer, manageableOwnerIds);
  const allowsWrite = !readOnly && canManageCustomer;
  return {
    canManageCustomer,
    actions: {
      editProfile: allowsWrite && permissions.editProfile,
      editAttribution: allowsWrite && permissions.editAttribution,
      setTags: allowsWrite && permissions.setTags,
      setTodos: allowsWrite && permissions.setTodos,
      setProgress: allowsWrite && permissions.setProgress,
      transfer: allowsWrite && permissions.transfer,
      release: allowsWrite && permissions.release,
      delete: allowsWrite && permissions.delete,
      addFollowUp: allowsWrite && permissions.editProfile,
    },
  };
}

function draftValue<K extends keyof Customer>(
  current: Customer,
  draft: Partial<Customer>,
  field: K,
): Customer[K] {
  return draft[field] === undefined ? current[field] : draft[field] as Customer[K];
}

function addChanged(
  patch: Partial<Customer>,
  current: Customer,
  field: keyof Customer,
  value: Customer[keyof Customer],
): void {
  if (comparable(current[field]) === comparable(value)) return;
  (patch as Record<string, unknown>)[field] = value;
}

/** Build the smallest patch authorized by the visible detail editor. */
export function buildCustomerDetailPatch({
  current,
  draft,
  canEditProfile,
  canEditAttribution,
  canEditLockedContact,
}: BuildCustomerDetailPatchInput): Partial<Customer> {
  const patch: Partial<Customer> = {};

  if (canEditProfile) {
    const plainProfileFields = [
      'name',
      'company',
      'customerLevel',
      'industry',
      'remark',
    ] as const;
    plainProfileFields.forEach((field) => addChanged(patch, current, field, draftValue(current, draft, field)));

    const draftPhone = String(draftValue(current, draft, 'phone') || '');
    const phoneInputWasEdited = comparable(draftPhone) !== comparable(current.phone);
    const phoneEditAllowed = canEditLockedContact || canCompletePhoneField(current.phone);
    const phoneEditAccepted = phoneInputWasEdited && phoneEditAllowed;
    const phone = phoneEditAccepted
      ? normalizePhoneForStorage(draftPhone)
      : current.phone;
    addChanged(patch, current, 'phone', phone);

    const draftWechat = String(draftValue(current, draft, 'wechat') || '');
    const wechatInputWasEdited = comparable(draftWechat) !== comparable(current.wechat);
    const wechat = wechatInputWasEdited && (canEditLockedContact || canCompleteContactField(current.wechat))
      ? draftWechat.trim()
      : current.wechat;
    addChanged(patch, current, 'wechat', wechat);

    const cityWasEdited = comparable(draftValue(current, draft, 'city')) !== comparable(current.city);
    const city = cityWasEdited || phoneEditAccepted
      ? completeCityFromPhone(String(draftValue(current, draft, 'city') || ''), phone)
      : current.city;
    addChanged(patch, current, 'city', city);
  }

  if (canEditAttribution) {
    const attributionFields = [
      'leadSource',
      'sourceName',
      'leadContributorId',
      'leadContributorName',
      'originalSalesTransferBy',
    ] as const;
    attributionFields.forEach((field) => addChanged(patch, current, field, draftValue(current, draft, field)));
    const draftSourceType = String(draftValue(current, draft, 'sourceType') || '');
    const sourceType = comparable(draftSourceType) === comparable(current.sourceType)
      ? current.sourceType
      : normalizeResourceOwnership(draftSourceType);
    addChanged(patch, current, 'sourceType', sourceType);
  }

  return patch;
}

export function buildCustomerDetailActionPolicy({
  customer,
  manageableOwnerIds,
  canEditProfile,
  canSetTodos,
  readOnly,
}: BuildCustomerDetailActionPolicyInput) {
  const canManageCustomer = canManageCustomerWithOwnerIds(customer, manageableOwnerIds);
  return {
    canManageCustomer,
    canAddFollowUp: !readOnly && canManageCustomer && canEditProfile,
    canManageTodos: !readOnly && canManageCustomer && canSetTodos,
  };
}

export function canRunCustomerTodoAction(
  action: CustomerTodoAction,
  todo: CustomerTodo,
  currentUserId: string | undefined,
  canManageTodos: boolean,
  readOnly: boolean,
): boolean {
  if (readOnly) return false;
  if (action === 'complete') {
    return todo.status === 'pending'
      && (canManageTodos || Boolean(currentUserId && todo.assigneeId === currentUserId));
  }
  if (action === 'reopen') return todo.status === 'completed' && canManageTodos;
  return todo.status === 'pending' && canManageTodos;
}
