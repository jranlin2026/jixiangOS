import assert from 'node:assert/strict';
import {
  resolveProtectedFormClose,
  shouldMarkAutocompleteInputDirty,
  shouldMarkProtectedFormButtonClick,
} from './protectedFormClose';

assert.equal(
  resolveProtectedFormClose({ reason: 'backdropClick', dirty: true, submitting: false }),
  'ignore',
  '点击表单外部遮罩层必须忽略，不能销毁已填写资料',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'backdropClick', dirty: false, submitting: false }),
  'ignore',
  '即使尚未填写，点击遮罩也不应意外关闭写入型弹窗',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'escapeKeyDown', dirty: true, submitting: false }),
  'ignore',
  '按 Esc 必须忽略，不能销毁已填写资料',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'escapeKeyDown', dirty: false, submitting: false }),
  'ignore',
  '即使尚未填写，Esc 也不应关闭写入型弹窗',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'explicit', dirty: false, submitting: false }),
  'close',
  '未填写内容时，点击关闭或取消应直接关闭',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'explicit', dirty: true, submitting: false }),
  'confirm',
  '已填写内容时，点击关闭或取消必须先确认',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'explicit', dirty: true, submitting: true }),
  'ignore',
  '提交过程中必须阻止任何关闭操作',
);

assert.equal(
  resolveProtectedFormClose({ reason: 'explicit', dirty: false, submitting: true }),
  'ignore',
  '提交过程中即使表单尚未标脏，也必须阻止显式关闭',
);

assert.equal(
  shouldMarkProtectedFormButtonClick({ markButtonClicksDirty: false, isButton: true }),
  false,
  '即时保存型详情页点击状态或关闭按钮时，不应被误判为尚未提交的表单修改',
);

assert.equal(
  shouldMarkProtectedFormButtonClick({ markButtonClicksDirty: true, isButton: true }),
  true,
  '普通写入型表单仍应保留按钮操作的脏数据保护',
);

assert.equal(
  shouldMarkAutocompleteInputDirty('reset'),
  false,
  'Autocomplete 初始化或受控值同步产生的 reset 事件不属于用户修改',
);

assert.equal(
  shouldMarkAutocompleteInputDirty('input'),
  true,
  '用户真实输入应继续触发脏数据保护',
);
