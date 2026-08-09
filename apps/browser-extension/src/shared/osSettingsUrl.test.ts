import assert from 'node:assert/strict';
import { browserAgentConnectUrl, scriptLibrarySettingsUrl } from './osSettingsUrl';

assert.equal(
  scriptLibrarySettingsUrl('http://127.0.0.1:3012/api'),
  'http://127.0.0.1:3002/settings?group=aiEmployee&tab=scriptLibrary',
);

assert.equal(
  browserAgentConnectUrl('http://127.0.0.1:3001/api', { state: 's1', redirect_uri: 'https://ext.chromiumapp.org/browser-agent' }),
  'http://127.0.0.1:3002/browser-agent/connect?state=s1&redirect_uri=https%3A%2F%2Fext.chromiumapp.org%2Fbrowser-agent',
  '本地插件授权必须打开OS前端连接页并保留授权参数',
);
assert.equal(
  scriptLibrarySettingsUrl('http://localhost:3001/api'),
  'http://localhost:3002/settings?group=aiEmployee&tab=scriptLibrary',
);
assert.equal(
  scriptLibrarySettingsUrl('https://os.example.com/api'),
  'https://os.example.com/settings?group=aiEmployee&tab=scriptLibrary',
);

console.log('browser extension OS settings URL: ok');
