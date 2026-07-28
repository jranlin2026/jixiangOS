import React, { useEffect, useState } from 'react';
import OperationFeedbackDialog from './OperationFeedbackDialog';
import {
  clearStorageSyncFailure,
  subscribeStorageSyncFailures,
  type StorageSyncFailure,
} from '../../api/storageSyncStatus';

const StorageSyncFailureNotice: React.FC = () => {
  const [failure, setFailure] = useState<StorageSyncFailure | null>(null);

  useEffect(() => subscribeStorageSyncFailures(setFailure), []);

  return (
    <OperationFeedbackDialog
      open={Boolean(failure)}
      severity="error"
      title="数据保存失败"
      message={`数据未保存：${failure?.message || '请重试'}`}
      onClose={clearStorageSyncFailure}
    />
  );
};

export default StorageSyncFailureNotice;
