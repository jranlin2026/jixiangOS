import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type {
  AcademyCourse,
  AcademyCourseCategory,
  AcademyCourseAsset,
  AcademyCourseStatus,
  AcademyDashboard,
  AcademyEngagement,
  AcademyPage,
  AcademySession,
  AcademySessionDetail,
  AcademySessionStatus,
  AcademySessionTask,
  AcademyTaskStatus,
  CreateAcademyCourseInput,
  CreateAcademySessionInput,
  SaveAcademyEngagementInput,
  SaveAcademyCourseAssetInput,
  SaveAcademyCourseCategoryInput,
  SaveAcademyReviewInput,
} from '../types/academy';

const query = (input: Record<string, unknown>) => {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) params.set(key, String(value));
  });
  return params.toString();
};

export const academyApi = {
  getDashboard(): Promise<ApiResponse<AcademyDashboard>> {
    return backendRequest('/academy/dashboard');
  },
  listCourses(input: { page: number; pageSize: number; search?: string; status?: string }): Promise<ApiResponse<AcademyPage<AcademyCourse>>> {
    return backendRequest(`/academy/courses?${query(input)}`);
  },
  listCourseCategories(): Promise<ApiResponse<AcademyCourseCategory[]>> {
    return backendRequest('/academy/course-categories');
  },
  saveCourseCategory(input: SaveAcademyCourseCategoryInput): Promise<ApiResponse<AcademyCourseCategory>> {
    return backendRequest('/academy/course-categories', { method: 'PUT', body: JSON.stringify(input) });
  },
  createCourse(input: CreateAcademyCourseInput): Promise<ApiResponse<AcademyCourse>> {
    return backendRequest('/academy/courses', { method: 'POST', body: JSON.stringify(input) });
  },
  updateCourse(id: string, input: CreateAcademyCourseInput): Promise<ApiResponse<AcademyCourse>> {
    return backendRequest(`/academy/courses/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
  },
  changeCourseStatus(id: string, status: AcademyCourseStatus): Promise<ApiResponse<AcademyCourse>> {
    return backendRequest(`/academy/courses/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },
  listCourseAssets(courseId: string): Promise<ApiResponse<AcademyCourseAsset[]>> {
    return backendRequest(`/academy/courses/${encodeURIComponent(courseId)}/assets`);
  },
  saveCourseAsset(courseId: string, input: SaveAcademyCourseAssetInput): Promise<ApiResponse<AcademyCourseAsset>> {
    return backendRequest(`/academy/courses/${encodeURIComponent(courseId)}/assets`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  listSessions(input: { page: number; pageSize: number; search?: string; status?: string }): Promise<ApiResponse<AcademyPage<AcademySession>>> {
    return backendRequest(`/academy/sessions?${query(input)}`);
  },
  createSession(input: CreateAcademySessionInput): Promise<ApiResponse<AcademySession>> {
    return backendRequest('/academy/sessions', { method: 'POST', body: JSON.stringify(input) });
  },
  getSessionDetail(id: string): Promise<ApiResponse<AcademySessionDetail>> {
    return backendRequest(`/academy/sessions/${encodeURIComponent(id)}`);
  },
  changeSessionStatus(id: string, status: AcademySessionStatus): Promise<ApiResponse<AcademySession>> {
    return backendRequest(`/academy/sessions/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },
  updateTask(id: string, input: { status: AcademyTaskStatus; note?: string; submissionNote?: string; reviewNote?: string }): Promise<ApiResponse<AcademySessionTask>> {
    return backendRequest(`/academy/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  saveEngagement(input: SaveAcademyEngagementInput): Promise<ApiResponse<AcademyEngagement>> {
    return backendRequest('/academy/engagements', { method: 'PUT', body: JSON.stringify(input) });
  },
  linkEngagementOrder(id: string, input: { orderId: string }): Promise<ApiResponse<AcademyEngagement>> {
    return backendRequest(`/academy/engagements/${encodeURIComponent(id)}/order`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  saveReview(input: SaveAcademyReviewInput): Promise<ApiResponse<unknown>> {
    return backendRequest('/academy/reviews', { method: 'PUT', body: JSON.stringify(input) });
  },
};
