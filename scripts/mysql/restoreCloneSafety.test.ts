import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./restore-clone.sh', import.meta.url), 'utf8');
assert.match(source, /127\.0\.0\.1[\s\S]*localhost/);
assert.match(source, /jixiang_os_prod_clone_test/);
assert.match(source, /Refusing to restore with the MySQL root account/);
assert.match(source, /sha256sum -c/);
assert.match(source, /gzip -t/);
assert.match(source, /information_schema\.tables/);
assert.match(source, /Refusing to restore into a non-empty database/);
assert.match(source, /JIXIANG_CONFIRM_RESTORE/);
console.log('restore clone safety contract tests passed');
