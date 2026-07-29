import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./verify-clone-restore.sh', import.meta.url), 'utf8');

assert.match(source, /127\.0\.0\.1[\s\S]*localhost/);
assert.match(source, /jixiang_os_prod_clone_test/);
assert.match(source, /Refusing to verify a non-loopback MySQL host/);
assert.match(source, /Refusing to verify with the MySQL root account/);
assert.match(source, /information_schema\.tables/);
assert.match(source, /_prisma_migrations/);
assert.match(source, /\.manifest/);
assert.match(source, /sha256sum -c/);
assert.match(source, /EXPECTED_USER_COUNT/);
assert.match(source, /EXPECTED_POSITION_COUNT/);
assert.match(source, /JIXIANG_VERIFICATION_ACTOR/);
assert.match(source, /COUNT_CONSISTENCY/);
assert.match(source, /WRITE_PAUSED/);
assert.match(source, /rolled_back_at IS NULL/);
assert.match(source, /finished_at IS NULL/);
assert.match(source, /Clone restore verification passed/);

console.log('clone restore verification contract tests passed');
