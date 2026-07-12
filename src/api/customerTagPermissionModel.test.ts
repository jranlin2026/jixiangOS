import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
type Assert<T extends true> = T;
type IsEqual<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2) ? true : false;

export type RequiredCustomerTagFields =
  | Assert<IsEqual<IsOptional<CustomerTag, 'groupId'>, false>>
  | Assert<IsEqual<IsOptional<CustomerTag, 'sortOrder'>, false>>
  | Assert<IsEqual<IsOptional<CustomerTag, 'updatedAt'>, false>>;

const customerTagSource = readFileSync(new URL('../types/tag.ts', import.meta.url), 'utf8');
assert.doesNotMatch(customerTagSource, /\b(?:groupId|sortOrder|updatedAt)\?:/);
assert.doesNotMatch(customerTagSource, /interface CustomerTag\s*{[^}]*\bcategory\??:/s);

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
