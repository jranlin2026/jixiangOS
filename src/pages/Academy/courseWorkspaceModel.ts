import type { AcademyCourse } from "../../types/academy";

export interface CourseStatusAction {
  nextStatus: AcademyCourse["status"];
  label: "发布" | "归档" | "恢复";
  confirmationRequired: boolean;
}

export const getCourseStatusAction = (
  course: AcademyCourse,
): CourseStatusAction => {
  if (course.status === "DRAFT") {
    return {
      nextStatus: "ACTIVE",
      label: "发布",
      confirmationRequired: true,
    };
  }
  if (course.status === "ACTIVE") {
    return {
      nextStatus: "ARCHIVED",
      label: "归档",
      confirmationRequired: true,
    };
  }
  return {
    nextStatus: "ACTIVE",
    label: "恢复",
    confirmationRequired: false,
  };
};

export const replaceCourseById = (
  courses: AcademyCourse[],
  updatedCourse: AcademyCourse,
) => courses.map((course) => (
  course.id === updatedCourse.id ? updatedCourse : course
));

export const updatePendingCourseIds = (
  courseIds: ReadonlySet<string>,
  courseId: string,
  pending: boolean,
) => {
  const next = new Set(courseIds);
  if (pending) next.add(courseId);
  else next.delete(courseId);
  return next;
};

export const clampPageIndex = (
  currentPage: number,
  itemCount: number,
  pageSize: number,
) => {
  const safePageSize = Math.max(1, pageSize);
  const lastPage = Math.max(0, Math.ceil(Math.max(0, itemCount) / safePageSize) - 1);
  return Math.min(Math.max(0, currentPage), lastPage);
};
