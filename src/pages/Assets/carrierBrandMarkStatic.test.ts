import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./CarrierBrandMark.tsx', import.meta.url), 'utf8');

assert.match(source, /variant === 'mobile'[\s\S]*?viewBox="0 0 1552 1538"[\s\S]*?1516\.3 966\.9/, '中国移动分支应使用标准双色标识轮廓');
assert.match(source, /variant === 'telecom'[\s\S]*?viewBox="0 0 1589 1540"[\s\S]*?1004\.4 258\.8/, '中国电信分支应使用标准交叉 C 形标识轮廓');
assert.match(source, /variant === 'unicom'[\s\S]*?viewBox="0 0 1551 1172"[\s\S]*?393\.2 680\.3/, '中国联通分支应使用标准中国结标识轮廓');
assert.match(source, /#95C11F/, '中国移动标识应保留官方绿色');
assert.match(source, /fillRule="evenodd"/, '中国联通标识应保留中国结的完整镂空结构');
