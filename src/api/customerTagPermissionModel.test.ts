import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Customer, CustomerFilters } from '../types/customer';
import type { Lead } from '../types/lead';
import type {
  CustomerTag,
  CustomerTagCatalog,
  CustomerTagFilterMode,
  CustomerTagGroup,
  CustomerTagMigrationPreview,
  ManualTagScope,
  ManualTagSelectionMode,
} from '../types/tag';

assert.equal(PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, '系统设置/客户设置/客户标签');
assert.equal(STORAGE_KEYS.TAG_GROUPS, 'aaos_tag_groups');

export type ExpectedContracts =
  | ManualTagScope
  | ManualTagSelectionMode
  | CustomerTagFilterMode
  | CustomerTagGroup
  | CustomerTag
  | CustomerTagCatalog
  | CustomerTagMigrationPreview
  | Pick<Customer, 'manualTagIds'>
  | Pick<Lead, 'manualTagIds'>
  | Pick<CustomerFilters, 'tagIds' | 'tagMatch' | 'withoutTags' | 'missingTagGroupId' | 'tag'>;
