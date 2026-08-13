import { backendRequest } from "./backendClient";
import type { ApiResponse } from "./types";
import type {
  CreateOkrCheckInInput,
  CreateOkrCycleInput,
  CreateOkrKeyResultInput,
  CreateOkrObjectiveInput,
  OkrCheckIn,
  OkrCycle,
  OkrCycleStatus,
  OkrObjective,
  OkrObjectiveListInput,
  OkrPage,
  OkrKeyResult,
  OkrDirectoryUser,
  OkrDueCheckInItem,
  OkrMetricBinding,
  OkrMetricCatalogItem,
  OkrTaskLink,
  OkrAlignmentObjective,
} from "../types/okr";

const base = "/okr";

const query = (input: object) => {
  const params = new URLSearchParams();
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim())
      params.set(key, String(value));
  });
  return params.toString();
};

export const okrApi = {
  listCycles(input: {
    page: number;
    pageSize: number;
    status?: OkrCycleStatus;
  }): Promise<ApiResponse<OkrPage<OkrCycle>>> {
    return backendRequest(`${base}/cycles?${query(input)}`);
  },
  listDirectoryUsers(): Promise<ApiResponse<OkrDirectoryUser[]>> {
    return backendRequest(`${base}/directory/users`);
  },
  listAlignmentObjectives(input: {
    cycleId: string;
    childScope: "DEPARTMENT" | "INDIVIDUAL";
  }): Promise<ApiResponse<OkrAlignmentObjective[]>> {
    return backendRequest(
      `${base}/directory/alignment-objectives?${query(input)}`,
    );
  },
  createCycle(input: CreateOkrCycleInput): Promise<ApiResponse<OkrCycle>> {
    return backendRequest(`${base}/cycles`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  activateCycle(id: string): Promise<ApiResponse<OkrCycle>> {
    return backendRequest(`${base}/cycles/${encodeURIComponent(id)}/activate`, {
      method: "POST",
    });
  },
  startCycleScoring(id: string): Promise<ApiResponse<OkrCycle>> {
    return backendRequest(`${base}/cycles/${encodeURIComponent(id)}/scoring`, {
      method: "POST",
    });
  },
  closeCycle(id: string): Promise<ApiResponse<OkrCycle>> {
    return backendRequest(`${base}/cycles/${encodeURIComponent(id)}/close`, {
      method: "POST",
    });
  },
  listObjectives(
    input: OkrObjectiveListInput,
  ): Promise<ApiResponse<OkrPage<OkrObjective>>> {
    return backendRequest(`${base}/objectives?${query(input)}`);
  },
  listDueCheckIns(input: {
    page: number;
    pageSize: number;
    cycleId: string;
  }): Promise<ApiResponse<OkrPage<OkrDueCheckInItem>>> {
    return backendRequest(`${base}/check-ins/due?${query(input)}`);
  },
  getObjective(id: string): Promise<ApiResponse<OkrObjective>> {
    return backendRequest(`${base}/objectives/${encodeURIComponent(id)}`);
  },
  createObjective(
    input: CreateOkrObjectiveInput,
  ): Promise<ApiResponse<OkrObjective>> {
    return backendRequest(`${base}/objectives`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  createKeyResult(
    objectiveId: string,
    input: CreateOkrKeyResultInput,
  ): Promise<ApiResponse<OkrKeyResult>> {
    return backendRequest(
      `${base}/objectives/${encodeURIComponent(objectiveId)}/key-results`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  createCheckIn(
    keyResultId: string,
    input: CreateOkrCheckInInput,
  ): Promise<
    ApiResponse<{
      checkIn: OkrCheckIn;
      keyResult: OkrKeyResult;
      objectiveProgress: number;
    }>
  > {
    return backendRequest(
      `${base}/key-results/${encodeURIComponent(keyResultId)}/check-ins`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  linkTask(
    keyResultId: string,
    taskId: string,
  ): Promise<ApiResponse<OkrTaskLink>> {
    return backendRequest(
      `${base}/key-results/${encodeURIComponent(keyResultId)}/tasks`,
      { method: "POST", body: JSON.stringify({ taskId }) },
    );
  },
  submitReview(
    objectiveId: string,
    input: { score: number; summary: string; lessons?: string },
  ): Promise<ApiResponse<OkrObjective>> {
    return backendRequest(
      `${base}/objectives/${encodeURIComponent(objectiveId)}/reviews`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  listTaskLinks(keyResultId: string): Promise<ApiResponse<OkrTaskLink[]>> {
    return backendRequest(
      `${base}/key-results/${encodeURIComponent(keyResultId)}/tasks`,
    );
  },
  listMetrics(): Promise<ApiResponse<OkrMetricCatalogItem[]>> {
    return backendRequest(`${base}/metrics/catalog`);
  },
  bindMetric(
    keyResultId: string,
    metricCode: OkrMetricCatalogItem["code"],
  ): Promise<ApiResponse<OkrMetricBinding>> {
    return backendRequest(
      `${base}/key-results/${encodeURIComponent(keyResultId)}/metric-binding`,
      { method: "POST", body: JSON.stringify({ metricCode }) },
    );
  },
  refreshMetric(keyResultId: string): Promise<ApiResponse<unknown>> {
    return backendRequest(
      `${base}/key-results/${encodeURIComponent(keyResultId)}/metric-refresh`,
      { method: "POST" },
    );
  },
};
