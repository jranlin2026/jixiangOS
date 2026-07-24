import { Button } from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import type { AuthenticatedUser } from '../../types/auth';
import type { BusinessImportType } from '../../types/businessImport';
import { hasPermission, PERMISSION_KEYS } from '../utils/permissions';

type Props = {
  type: BusinessImportType;
  active: boolean;
  user: AuthenticatedUser | null;
  onClick: () => void;
};

export default function BusinessImportEntryButton({ type, active, user, onClick }: Props) {
  const permission = type === 'orders'
    ? PERMISSION_KEYS.ORDER_IMPORT
    : PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT;
  if (!active || !hasPermission(user, permission, 'write')) return null;
  return (
    <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={onClick}>
      {type === 'orders' ? '导入订单' : '导入售后挽回订单'}
    </Button>
  );
}
