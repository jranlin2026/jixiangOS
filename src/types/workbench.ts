import type { EmployeeTask } from './enterpriseBrain';

export const WORKBENCH_MAX_PAGE = 100_000;
export const WORKBENCH_MAX_PAGE_SIZE = 100;
export const WORKBENCH_DEFAULT_PAGE = 1;
export const WORKBENCH_DEFAULT_PAGE_SIZE = 20;

export type WorkbenchTaskStatus = EmployeeTask['status'];
export type WorkbenchTaskPriority = NonNullable<EmployeeTask['priority']>;
export type WorkbenchBooleanFilter = boolean | 'true' | 'false' | '1' | '0';
export type WorkbenchTaskListItem = Omit<EmployeeTask, 'evidence' | 'activities'>;

export type WorkbenchTaskFilters = {
  page?: number | string;
  pageSize?: number | string;
  dateFrom?: string;
  dateTo?: string;
  status?: WorkbenchTaskStatus | string;
  module?: string;
  priority?: WorkbenchTaskPriority | string;
  employeeId?: string;
  departmentId?: string;
  overdue?: WorkbenchBooleanFilter | string;
  confirmation?: WorkbenchBooleanFilter | string;
};

export type WorkbenchSummaryFilters = Omit<WorkbenchTaskFilters, 'page' | 'pageSize'>;
export type WorkbenchCockpitFilters = WorkbenchSummaryFilters;

export type WorkbenchPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: WorkbenchPagination;
};

export type WorkbenchMetricDefinition = {
  label: string;
  definition: string;
  unit: 'count' | 'percent' | 'minutes';
  numerator: string;
  denominator: string | null;
};

export type WorkbenchMetricDefinitions<Key extends string> = { [Metric in Key]: WorkbenchMetricDefinition };

export type WorkbenchSummaryMetricKey =
  | 'total' | 'pending' | 'inProgress' | 'awaitingConfirmation' | 'confirmed' | 'returned'
  | 'canceled' | 'overdue' | 'dueToday' | 'collaboration' | 'estimatedMinutes'
  | 'estimatedMinutesTaskCount';

export type WorkbenchSummary = {
  total: number;
  pending: number;
  inProgress: number;
  awaitingConfirmation: number;
  confirmed: number;
  returned: number;
  canceled: number;
  overdue: number;
  dueToday: number;
  collaboration: number;
  estimatedMinutes: number;
  estimatedMinutesTaskCount: number;
  metricDefinitions: WorkbenchMetricDefinitions<WorkbenchSummaryMetricKey>;
};

export type WorkbenchCockpitMetricKey =
  | 'created' | 'confirmed' | 'awaitingConfirmation' | 'canceled' | 'completionDenominator'
  | 'canceledDenominator' | 'completionRate' | 'onTime' | 'onTimeDenominator' | 'onTimeRate'
  | 'overdue' | 'overdueDenominator' | 'overdueRate' | 'returned' | 'historicalReturnEventCount'
  | 'returnedTaskCount' | 'returnDenominator' | 'returnRate' | 'blocked'
  | 'averageFirstActionMinutes' | 'firstActionDenominator' | 'averageConfirmationMinutes'
  | 'confirmationDurationDenominator';

export type WorkbenchCockpit = {
  range: {
    dateFrom: string;
    dateTo: string;
    timeZone: 'Asia/Shanghai';
    startAt: string;
    endAtExclusive: string;
  };
  created: number;
  confirmed: number;
  awaitingConfirmation: number;
  canceled: number;
  completionDenominator: number;
  canceledDenominator: 0;
  completionRate: number;
  onTime: number;
  onTimeDenominator: number;
  onTimeRate: number;
  overdue: number;
  overdueDenominator: number;
  overdueRate: number;
  returned: number;
  historicalReturnEventCount: number;
  returnedTaskCount: number;
  returnDenominator: number;
  returnRate: number;
  blocked: number;
  averageFirstActionMinutes: number;
  firstActionDenominator: number;
  averageConfirmationMinutes: number;
  confirmationDurationDenominator: number;
  metricDefinitions: WorkbenchMetricDefinitions<WorkbenchCockpitMetricKey>;
};
