import assert from 'node:assert/strict';
import { matchScript, type ScriptLibrary } from './scriptLibrary';

const library: ScriptLibrary = {
  schemaVersion: 1,
  revision: 3,
  updatedAt: '2026-08-08T00:00:00.000Z',
  updatedBy: { id: 'admin-1', name: '管理员' },
  groups: [{
    id: 'paid', name: '已付款', enabled: true, sortOrder: 10,
    scripts: [
      {
        id: 'script-general', title: '通用', content: '您好', enabled: true, sortOrder: 30, priority: 10,
        match: { orderStatuses: ['已付款'], productKeywords: [], contactState: 'ANY' },
      },
      {
        id: 'script-paid-product-missing-contact', title: '索要联系方式', content: '请提供手机号', enabled: true, sortOrder: 20, priority: 20,
        match: { orderStatuses: ['已付款'], productKeywords: ['IP口播'], contactState: 'MISSING' },
      },
      {
        id: 'script-contact-present', title: '已留资', content: '已收到', enabled: true, sortOrder: 10, priority: 30,
        match: { orderStatuses: ['已付款'], productKeywords: [], contactState: 'PRESENT' },
      },
      {
        id: 'script-disabled', title: '禁用', content: '不应命中', enabled: false, sortOrder: 1, priority: 100,
        match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
      },
    ],
  }],
};

const best = matchScript(library, {
  orderStatus: '已付款', productName: 'N哥IP口播智能体', hasContact: false,
});
assert.equal(best?.script.id, 'script-paid-product-missing-contact');
assert.deepEqual(best?.reasons, ['订单状态：已付款', '商品关键词：IP口播', '客户未提供联系方式']);

assert.equal(matchScript(library, {
  orderStatus: '', productName: 'N哥IP口播智能体', hasContact: false,
}), null, '未识别订单状态时不能自动推荐');

assert.equal(matchScript(library, {
  orderStatus: '已付款', productName: 'N哥IP口播智能体', hasContact: true,
})?.script.id, 'script-contact-present');

assert.equal(matchScript(library, {
  orderStatus: '已付款', productName: '其他商品', hasContact: false,
})?.script.id, 'script-general', '商品关键词不匹配时回退到通用话术');

const tied: ScriptLibrary = {
  ...library,
  groups: [{
    id: 'later-group', name: '后组', enabled: true, sortOrder: 20,
    scripts: [{ ...library.groups[0].scripts[0], id: 'b', sortOrder: 10 }],
  }, {
    id: 'earlier-group', name: '先组', enabled: true, sortOrder: 10,
    scripts: [
      { ...library.groups[0].scripts[0], id: 'z', sortOrder: 20 },
      { ...library.groups[0].scripts[0], id: 'a', sortOrder: 20 },
    ],
  }],
};
assert.equal(matchScript(tied, {
  orderStatus: '已付款', productName: '', hasContact: false,
})?.script.id, 'a', '同分时依次按分组、话术排序和ID稳定选择');

console.log('browser script matcher: ok');
