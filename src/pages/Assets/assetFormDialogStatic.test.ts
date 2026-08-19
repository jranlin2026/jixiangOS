import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const assetApiSource = readFileSync(new URL('../../api/assetApi.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../../../server/index.ts', import.meta.url), 'utf8');
const formModelSource = readFileSync(new URL('./assetFormModel.ts', import.meta.url), 'utf8');
const formDialog = source.match(/<ProtectedFormDialog[\s\S]*?<\/ProtectedFormDialog>/)?.[0] || '';
const phoneFields = source.match(/const renderPhoneFields[\s\S]*?const renderAccountFields/)?.[0] || '';
const phonePackageSection = phoneFields.match(/<BusinessFormSection step=\{4\}[\s\S]*?<\/BusinessFormSection>/)?.[0] || '';
const accountFields = source.match(/const renderAccountFields[\s\S]*?const renderImportDialog/)?.[0] || '';
const accountOperationsSection = accountFields.match(/<BusinessFormSection step=\{4\}[\s\S]*?<\/BusinessFormSection>/)?.[0] || '';
const accountColumns = source.match(/const ACCOUNT_COLUMNS[\s\S]*?const DEFAULT_ACCOUNT_VISIBLE_COLUMN_IDS/)?.[0] || '';

assert.match(formDialog, /maxWidth="md"/, '资产录入弹窗应限制为中等桌面宽度，避免输入框过宽');
assert.match(formDialog, /markButtonClicksDirty=\{false\}/, '关闭、取消和分区按钮不应把空白表单误判为已填写');
assert.match(source, /createAssetFormDefaults\(formState\.type\)[\s\S]*?value !== String\(defaults\[field\]/, '新增表单的系统默认值不应被统计为用户已填写');
assert.match(source, /label=\{formState\.mode === 'edit' \? '新服务密码（留空不修改）' : '服务密码'\}/, '编辑态应说明留空保留原服务密码');
assert.match(source, /clearServicePassword/, '手机号表单应支持明确清除已存服务密码');
assert.match(source, /servicePassword \|\| formState\.values\.servicePasswordMasked/, '编辑态分区统计应识别已存服务密码');
assert.match(formModelSource, /套餐与状态'[\s\S]*?归属地 \/ 服务密码/, '折叠摘要应把服务密码归入套餐与状态');
assert.ok(
  phonePackageSection.indexOf("renderTextField('attributionLocation', '归属地')")
    < phonePackageSection.indexOf("label={formState.mode === 'edit' ? '新服务密码（留空不修改）' : '服务密码'}"),
  '服务密码应放在套餐与状态分区的归属地后面',
);
assert.match(source, /formatPhoneSlotImeiLabel/, '设备卡槽选项应显示对应的 IMEI 标识');
assert.match(source, /gridTemplateColumns: '64px 72px minmax\(0, 1fr\)'/, '卡槽、IMEI序号和号码应使用固定列对齐');
assert.match(source, /fontVariantNumeric: 'tabular-nums'/, 'IMEI 号码应使用等宽数字对齐');
assert.match(phoneFields, /MenuProps=\{phoneSlotMenuProps\}/, '卡槽下拉层应使用收紧的统一弹层样式');
assert.match(source, /id: 'imei', label: '卡槽 \/ IMEI'/, '设备列表应将 IMEI 字段明确配置到卡槽');
assert.match(source, /id: 'simType', label: '对应手机号'/, '设备列表手机号字段应表达与卡槽的对应关系');
assert.match(source, /<Autocomplete[\s\S]*?freeSolo[\s\S]*?normalizeDeviceBrand/, '设备品牌应使用可搜索且允许自定义的标准化输入');
assert.match(source, /buildDeviceSlotRows[\s\S]*?卡槽与通信绑定/, '设备详情应按卡槽组织 IMEI 和手机号关系');
assert.match(source, /设备身份[\s\S]*?归属与使用[\s\S]*?取得与状态/, '设备详情应按业务语义分区');
assert.match(source, /renderPhoneSummaryCard[\s\S]*?SIM身份信息[\s\S]*?设备绑定关系[\s\S]*?归属与使用[\s\S]*?套餐与状态/, '手机号详情应参考设备详情按业务语义分区');
assert.match(source, /displayPhoneNumber[\s\S]*?renderCopyButton/, '手机号等运营字段应直接显示完整值并支持复制');
assert.doesNotMatch(source, /label: '手机号', value: renderSensitiveInline/, '完整手机号不应继续依赖敏感字段查看按钮');
assert.doesNotMatch(source, /label: '登录账号', value: renderSensitiveInline/, '登录账号不应继续依赖敏感字段查看按钮');
assert.match(source, /renderIdentityAccountSelect\('Apple ID', 'appleIdentityAccountId'/, '账号表单应支持选择已建档 Apple ID');
assert.match(source, /renderIdentityAccountSelect\('Google账号', 'googleIdentityAccountId'/, '账号表单应支持选择已建档 Google 账号');
assert.doesNotMatch(phoneFields, /\? renderTextField\([\s\S]*?: <Box \/>/, '隐藏的账号安全字段不应继续占用表单栅格');
assert.match(source, /togglePasswordVisibility/, '密码输入应支持切换明文与密文');
assert.match(source, /InputAdornment position="end"[\s\S]*?VisibilityOffIcon/, '密码输入框应在末尾显示可见性按钮');
assert.match(source, /visiblePasswordFields\[field\] \? <VisibilityIcon[\s\S]*?: <VisibilityOffIcon/, '明文状态应显示睁眼，密文状态应显示闭眼');
assert.match(source, /servicePassword[\s\S]*?passwordEndAdornment\('servicePassword'\)/, '手机号服务密码也应支持明文校对');
assert.match(source, /renderAccountIdentityCard/, '账号详情应展示身份账号的正向和反向关联');
assert.match(source, /<PlatformBrandMark/, '互联网账号应使用品牌图标而不是字母占位');
assert.match(source, /renderPlatformSelectField[\s\S]*?renderValue[\s\S]*?<PlatformBrandMark/, '业务平台选中后应在字段内显示品牌 Logo');
assert.match(source, /platformOptions\.map[\s\S]*?<PlatformBrandMark/, '业务平台下拉选项左侧应显示品牌 Logo');
assert.match(source, /label="登录设备（可多选）"[\s\S]*?multiple[\s\S]*?loginDeviceIds/, '互联网账号应能独立多选登录设备');
assert.match(source, /case 'device':[\s\S]*?normalizeAccountLoginDeviceIds\(account\.loginDeviceIds\)/, '账号列表的登录设备不得再通过绑定手机号反推');
assert.match(accountColumns, /id: 'device', label: '登录设备'/, '互联网账号设备列应明确称为登录设备');
assert.match(
  accountOperationsSection,
  /gridColumn: '1 \/ -1'[\s\S]*?gridTemplateColumns: \{ xs: '1fr', md: '1fr 1fr' \}[\s\S]*?renderTextField\('purpose', '用途', \{ multiline: true \}\)[\s\S]*?renderTextField\('remark', '备注', \{ multiline: true \}\)/,
  '用途和备注应组成全宽双列字段组，桌面端同排、移动端纵向排列',
);
assert.match(source, /appleIdentityAccountId: _appleIdentityAccountId[\s\S]*?googleIdentityAccountId: _googleIdentityAccountId[\s\S]*?\.\.\.accountValues/, '表单专用的 Apple\/Google 选择字段不应持久化到账号资产');
assert.match(source, /detailSaveNotice[\s\S]*?资料已更新/, '编辑成功应在详情页内非阻断提示');
assert.match(assetApiSource, /reveal\/service-password/, '后端模式应通过独立接口查看服务密码');
assert.match(serverSource, /requireAssetSensitiveViewAccess[\s\S]*?revealPhoneServicePassword/, '服务密码查看接口应校验敏感字段权限');
