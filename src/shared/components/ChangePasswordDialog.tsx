import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import DialogCloseTitle from './DialogCloseTitle';
import { authApi } from '../../api/authApi';

interface ChangePasswordDialogProps {
  open: boolean;
  forced?: boolean;
  onClose?: () => void;
  onChanged: () => void | Promise<void>;
}

const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ open, forced = false, onClose, onChanged }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }, [open]);

  const submit = async () => {
    if (newPassword.length < 8) return setError('新密码至少 8 位');
    if (newPassword !== confirmPassword) return setError('两次输入的新密码不一致');
    setSubmitting(true);
    setError('');
    try {
      const result = await authApi.changePassword(currentPassword, newPassword);
      if (result.code !== 0) return setError(result.message || '修改密码失败');
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={forced || submitting ? undefined : onClose} maxWidth="xs" fullWidth disableEscapeKeyDown={forced}>
      {forced
        ? <DialogTitle>修改登录密码</DialogTitle>
        : <DialogCloseTitle onClose={onClose || (() => undefined)}>修改登录密码</DialogCloseTitle>}
      <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
        {forced && <Alert severity="warning">这是首次登录或管理员刚重置了密码，请先设置只有你知道的新密码。</Alert>}
        <Typography variant="body2" color="text.secondary">新密码至少 8 位。修改成功后需使用新密码重新登录。</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="当前密码" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} fullWidth autoFocus />
        <TextField label="新密码" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} fullWidth />
        <TextField label="再次输入新密码" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} fullWidth />
      </DialogContent>
      <DialogActions>
        {!forced && <Button onClick={onClose} disabled={submitting}>取消</Button>}
        <Button variant="contained" onClick={submit} disabled={submitting || !currentPassword || !newPassword || !confirmPassword}>
          {submitting ? '正在修改…' : '确认修改'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ChangePasswordDialog;
