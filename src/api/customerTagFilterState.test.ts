import assert from 'node:assert/strict';
import { customerTagRequestSource, readCustomerTagFilterParams, writeCustomerTagFilterParams } from '../pages/Customers/customerTagFilterState';

const parsed = readCustomerTagFilterParams(new URLSearchParams('tagId=t-agent&tagId=t-private&tagMatch=any&withoutTags=true&missingTagGroupId=g-value'));
assert.deepEqual(parsed, { tagIds: ['t-agent', 't-private'], tagMatch: 'any', withoutTags: true, missingTagGroupId: 'g-value' });
assert.equal(writeCustomerTagFilterParams(new URLSearchParams('tab=public_pool&tagId=old'), parsed).toString(), 'tab=public_pool&tagId=t-agent&tagId=t-private&tagMatch=any&withoutTags=true&missingTagGroupId=g-value');
assert.deepEqual(readCustomerTagFilterParams(new URLSearchParams()), { tagIds: [], tagMatch: 'grouped', withoutTags: undefined, missingTagGroupId: undefined });
const current = new URLSearchParams('tagId=t-agent&tagMatch=grouped');
assert.equal(customerTagRequestSource(current, writeCustomerTagFilterParams(current, { tagIds: ['t-private'], tagMatch: 'grouped' })), 'url-effect', 'apply uses only the URL effect request');
assert.equal(customerTagRequestSource(current, writeCustomerTagFilterParams(current, {})), 'url-effect', 'clear uses only the URL effect request');
assert.equal(customerTagRequestSource(current, writeCustomerTagFilterParams(current, { tagIds: ['t-agent'], tagMatch: 'grouped' })), 'direct', 'unchanged URL needs one direct request');
