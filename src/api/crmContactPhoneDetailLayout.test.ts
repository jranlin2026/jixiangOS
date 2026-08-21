import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { default: ContactPhoneDetailRows } = await vite.ssrLoadModule('/src/shared/components/ContactPhoneDetailRows.tsx') as any;

const noop = () => undefined;
const readOnlyMarkup = renderToStaticMarkup(React.createElement(ContactPhoneDetailRows, {
  primaryPhone: '+8613800138000',
  alternatePhone: '+8613900139000',
  editing: false,
  primaryEditable: false,
  alternateEditable: false,
  onPrimaryChange: noop,
  onAlternateChange: noop,
}));

assert.match(readOnlyMarkup, /data-testid="contact-phone-detail-primary-row"[\s\S]*手机[\s\S]*\+8613800138000/);
assert.match(readOnlyMarkup, /data-testid="contact-phone-detail-alternate-row"[\s\S]*备用手机[\s\S]*\+8613900139000/);

const emptyAlternateMarkup = renderToStaticMarkup(React.createElement(ContactPhoneDetailRows, {
  primaryPhone: '+8613800138000',
  alternatePhone: '',
  editing: true,
  primaryEditable: false,
  alternateEditable: true,
  onPrimaryChange: noop,
  onAlternateChange: noop,
}));

assert.match(emptyAlternateMarkup, /data-testid="contact-phone-detail-alternate-row"/);
assert.match(emptyAlternateMarkup, /添加备用手机号/);
assert.doesNotMatch(emptyAlternateMarkup, /设为主号/);
assert.doesNotMatch(emptyAlternateMarkup, /label="主手机号"/);

console.log('CRM contact phone detail rows render independently: ok');
await vite.close();
