import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type { BusinessAttachment } from '../types/businessAttachment';
import type {
  AcademyCourse,
  AcademyCourseCategory,
  AcademyCourseAsset,
  AcademyCourseStatus,
  AcademyDashboard,
  AcademyEngagement,
  AcademyPage,
  AcademyMyTask,
  AcademyPublicCalendarItem,
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
  getPublicCalendar(input: { start?: string; end?: string } = {}): Promise<ApiResponse<AcademyPublicCalendarItem[]>> {
    return backendRequest(`/academy/public-calendar?${query(input)}`);
  },
  listMyTasks(input: { page: number; pageSize: number; status?: string }): Promise<ApiResponse<AcademyPage<AcademyMyTask>>> {
    return backendRequest(`/academy/my-tasks?${query(input)}`);
  },
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
  listTaskAttachments(id: string): Promise<ApiResponse<BusinessAttachment[]>> {
    return backendRequest(`/academy/tasks/${encodeURIComponent(id)}/attachments`);
  },
  addTaskAttachment(id: string, attachmentIds: string[]): Promise<ApiResponse<BusinessAttachment[]>> {
    return backendRequest(`/academy/tasks/${encodeURIComponent(id)}/attachments`, {
      method: 'PUT',
      body: JSON.stringify({ attachmentIds }),
    });
  },
  removeTaskAttachment(id: string, attachmentIds: string[]): Promise<ApiResponse<BusinessAttachment[]>> {
    return backendRequest(`/academy/tasks/${encodeURIComponent(id)}/attachments`, {
      method: 'PUT',
      body: JSON.stringify({ attachmentIds }),
    });
  },
  saveEngagement(input: SaveAcademyEngagementInput): Promise<ApiResponse<AcademyEngagement>> {
    return backendRequest('/academy/engagements', { method: 'PUT', body: JSON.stringify(input) });
  },
  saveEngagementBatch(input: { sessionId: string; customerIds: string[]; invitationStatus?: string }): Promise<ApiResponse<{ created: AcademyEngagement[]; rejected: Array<{ customerId: string; message: string }> }>> {
    return backendRequest('/academy/engagements/batch', { method: 'PUT', body: JSON.stringify(input) });
  },
  quickFollowUp(id: string, input: { content: string; courseAssessment?: string; nextFollowUpAt?: string }): Promise<ApiResponse<AcademyEngagement>> {
    return backendRequest(`/academy/engagements/${encodeURIComponent(id)}/follow-up`, { method: 'POST', body: JSON.stringify(input) });
  },
  updateEngagementExecution(id: string, input: { attendanceStatus: string; interactionLevel?: string; courseAssessment?: string }): Promise<ApiResponse<AcademyEngagement>> {
    return backendRequest(`/academy/engagements/${encodeURIComponent(id)}/execution`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
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
