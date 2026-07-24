import React from 'react';
import Checkbox from '@mui/material/Checkbox';
import type { BusinessImportType } from '../../types/businessImport';
import {
  isImportedPendingReviewRecord,
  updateImportedReviewPageSelection,
  type BusinessImportReviewSelection,
} from '../utils/businessImportReviewModel';

type ReviewPageRecord = {
  id: string;
  importBatchId?: string;
  status?: string;
};

type BusinessImportReviewPageCheckboxProps = {
  module: BusinessImportType;
  canReview: boolean;
  records: ReviewPageRecord[];
  selection: BusinessImportReviewSelection;
  onSelectionChange: (selection: BusinessImportReviewSelection) => void;
  ariaLabel: string;
};

const BusinessImportReviewPageCheckbox: React.FC<BusinessImportReviewPageCheckboxProps> = ({
  module,
  canReview,
  records,
  selection,
  onSelectionChange,
  ariaLabel,
}) => {
  const selectableIds = records
    .filter((record) => isImportedPendingReviewRecord(record, module))
    .map((record) => record.id);
  const selectedIds = selection.mode === 'ids' ? selection.ids : [];
  const hasSelected = selectableIds.some((id) => selectedIds.includes(id));
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  return (
    <Checkbox
      aria-label={ariaLabel}
      disabled={!canReview || selection.mode === 'batch' || selectableIds.length === 0}
      checked={canReview && selection.mode === 'ids' && allSelected}
      indeterminate={canReview && selection.mode === 'ids' && hasSelected && !allSelected}
      onChange={(event) => {
        const next = updateImportedReviewPageSelection(selection, records, module, event.target.checked, canReview);
        if (next !== selection) onSelectionChange(next);
      }}
    />
  );
};

export default BusinessImportReviewPageCheckbox;
