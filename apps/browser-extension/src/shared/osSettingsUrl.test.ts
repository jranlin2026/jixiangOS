import assert from 'node:assert/strict';
import { scriptLibrarySettingsUrl } from './osSettingsUrl';

assert.equal(
  scriptLibrarySettingsUrl('http://127.0.0.1:3012/api'),
  'http://127.0.0.1:3002/settings?group=aiEmployee&tab=scriptLibrary',
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
