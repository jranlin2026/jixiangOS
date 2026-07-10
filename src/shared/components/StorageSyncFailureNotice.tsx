import React, { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import {
  clearStorageSyncFailure,
  subscribeStorageSyncFailures,
  type StorageSyncFailure,
} from '../../api/storageSyncStatus';

const StorageSyncFailureNotice: React.FC = () => {
  const [failure, setFailure] = useState<StorageSyncFailure | null>(null);

  useEffect(() => subscribeStorageSyncFailures(setFailure), []);

  return (
    <Snackbar
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      autoHideDuration={8000}
      open={Boolean(failure)}
      onClose={clearStorageSyncFailure}
    >
      <Alert severity="error" variant="filled" onClose={clearStorageSyncFailure}>
        数据未保存：{failure?.message || '请重试'}
      </Alert>
    </Snackbar>
  );
};

export default StorageSyncFailureNotice;
