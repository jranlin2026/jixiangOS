import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInterviewMessages, parseInterviewTurn } from './interviewEngine';

test('prompt requires one employee-friendly question and separates evidence from hypotheses', () => {
  const messages = buildInterviewMessages({ title: '每天整理报表', messages: [] });
  const system = messages[0]?.content || '';
  assert.match(system, /一次只问一个问题/);
  assert.match(system, /员工陈述/);
  assert.match(system, /AI假设/);
  assert.match(system, /证据/);
  assert.match(system, /不要直接设计功能/);
});

test('parses a strict interview turn', () => {
  const result = parseInterviewTurn(JSON.stringify({
    reply: '这个整理工作通常在什么时候发生？你可以这样回答：每天几点，由谁开始整理。',
    phase: 'CURRENT_WORKFLOW',
    completeness: 35,
    extractedFacts: ['员工每天整理报表'],
    hypotheses: ['可能存在重复复制'],
    briefReady: false,
  }));
  assert.equal(result.reply.includes('？'), true);
  assert.equal(result.completeness, 35);
  assert.deepEqual(result.extractedFacts, ['员工每天整理报表']);
  assert.deepEqual(result.hypotheses, ['可能存在重复复制']);
  assert.equal(result.briefReady, false);
});

test('falls back safely when DeepSeek does not return JSON', () => {
  const result = parseInterviewTurn('请讲一个最近发生的真实例子。');
  assert.equal(result.reply, '请讲一个最近发生的真实例子。');
  assert.equal(result.briefReady, false);
  assert.deepEqual(result.extractedFacts, []);
});
