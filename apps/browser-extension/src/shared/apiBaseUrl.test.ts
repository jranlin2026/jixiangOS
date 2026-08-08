import assert from 'node:assert/strict';
import { normalizedApiBaseUrl } from './apiBaseUrl';

assert.equal(normalizedApiBaseUrl('http://127.0.0.1:3001/api/'), 'http://127.0.0.1:3001/api');
assert.equal(normalizedApiBaseUrl('http://localhost:3001/api'), 'http://localhost:3001/api');
assert.equal(normalizedApiBaseUrl('https://os.jixiang.example/api/'), 'https://os.jixiang.example/api');
assert.throws(() => normalizedApiBaseUrl('http://os.jixiang.example/api'), /必须使用HTTPS/);
assert.throws(() => normalizedApiBaseUrl('ftp://os.jixiang.example/api'), /HTTP或HTTPS/);

console.log('browser extension API base URL safety: ok');
