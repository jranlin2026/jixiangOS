import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomerIntelPrompt,
  buildCustomerSearchQueries,
  parseDuckDuckGoHtml,
  type PublicSearchResult,
} from './publicCustomerIntelService';

test('buildCustomerSearchQueries uses all useful customer fields and prioritizes company context', () => {
  const queries = buildCustomerSearchQueries({
    subjectType: 'customer',
    subjectId: 'cust-012',
    name: '邓国强',
    company: '昆明春城软件有限公司',
    phone: '+8613328951873',
    wechat: 'denggq_oem',
    industry: '软件',
    city: '昆明',
    notes: '客户关注AI获客和OEM贴牌',
  });

  assert.equal(queries[0], '昆明春城软件有限公司 昆明 软件');
  assert.ok(queries.includes('昆明春城软件有限公司 邓国强'));
  assert.ok(queries.includes('昆明春城软件有限公司 AI获客 OEM贴牌'));
  assert.ok(queries.includes('denggq_oem 昆明春城软件有限公司'));
  assert.ok(queries.length <= 6);
});

test('parseDuckDuckGoHtml extracts public evidence title, link, and snippet', () => {
  const html = `
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fcompany">昆明春城软件有限公司 - 企业介绍</a>
    <a class="result__snippet">春城软件是一家位于昆明的软件服务公司，提供企业数字化服务。</a>
  `;

  const results = parseDuckDuckGoHtml(html);

  assert.equal(results.length, 1);
  assert.equal(results[0].title, '昆明春城软件有限公司 - 企业介绍');
  assert.equal(results[0].url, 'https://example.com/company');
  assert.match(results[0].snippet || '', /企业数字化服务/);
});

test('buildCustomerIntelPrompt separates public evidence from AI inference requirements', () => {
  const results: PublicSearchResult[] = [{
    title: '昆明春城软件有限公司 - 企业介绍',
    url: 'https://example.com/company',
    snippet: '位于昆明的软件服务公司',
  }];

  const prompt = buildCustomerIntelPrompt({
    subjectType: 'customer',
    subjectId: 'cust-012',
    name: '邓国强',
    company: '昆明春城软件有限公司',
    phone: '+8613328951873',
    industry: '软件',
    city: '昆明',
  }, ['昆明春城软件有限公司 昆明 软件'], results);

  assert.match(prompt, /客户资料/);
  assert.match(prompt, /联网公开信息/);
  assert.match(prompt, /confidence/);
  assert.match(prompt, /publicFacts/);
  assert.match(prompt, /微信开场/);
});
