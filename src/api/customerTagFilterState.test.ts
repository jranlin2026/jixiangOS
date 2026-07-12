import assert from 'node:assert/strict';
import { readCustomerTagFilterParams, writeCustomerTagFilterParams } from '../pages/Customers/customerTagFilterState';

const parsed = readCustomerTagFilterParams(new URLSearchParams('tagId=t-agent&tagId=t-private&tagMatch=any&withoutTags=true&missingTagGroupId=g-value'));
assert.deepEqual(parsed, { tagIds: ['t-agent', 't-private'], tagMatch: 'any', withoutTags: true, missingTagGroupId: 'g-value' });
assert.equal(writeCustomerTagFilterParams(new URLSearchParams('tab=public_pool&tagId=old'), parsed).toString(), 'tab=public_pool&tagId=t-agent&tagId=t-private&tagMatch=any&withoutTags=true&missingTagGroupId=g-value');
assert.deepEqual(readCustomerTagFilterParams(new URLSearchParams()), { tagIds: [], tagMatch: 'grouped', withoutTags: undefined, missingTagGroupId: undefined });
