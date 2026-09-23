import { apiRequest } from './client.js';
import {
  McqQuestion,
  McqSession,
  McqSessionType,
  McqCourse,
  McqQuestionType,
  McqDifficulty,
  McqStatus,
  McqStudentProgress,
  McqBookmarkItem,
  McqWrongVaultItem,
  McqAdminStats,
} from '../types/index.js';

export interface CurriculumStatRow {
  course: string;
  subject: string;
  chapter: string;
  question_type: string;
  difficulty: string;
  count: number;
}

export const mcqApi = {
  // Curriculum stats
  getCurriculum: async () => {
    return apiRequest<{ stats: CurriculumStatRow[] }>('/api/mcq/curriculum');
  },

  // Sessions
  createSession: async (params: {
    course: McqCourse;
    subject: string;
    chapter?: string;
    topic?: string;
    questionType?: McqQuestionType | 'mixed';
    difficulty?: McqDifficulty | 'mixed';
    sessionType: McqSessionType;
    requestedCount?: number;
    durationMinutes?: number;
  }) => {
    return apiRequest<{ session: McqSession; questions: any[] }>('/api/mcq/sessions/create', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  getSession: async (sessionId: string) => {
    return apiRequest<{ session: McqSession; questions: any[] }>(`/api/mcq/sessions/${sessionId}`);
  },

  submitAnswer: async (
    sessionId: string,
    payload: {
      questionId: string;
      selectedOption: 'A' | 'B' | 'C' | 'D' | null;
      isMarkedForReview?: boolean;
      eliminatedOptions?: ('A' | 'B' | 'C' | 'D')[];
      timeTakenSeconds?: number;
    }
  ) => {
    return apiRequest<{
      isCorrect: boolean;
      correctAnswer: 'A' | 'B' | 'C' | 'D';
      explanation: string;
      reference?: string;
    }>(`/api/mcq/sessions/${sessionId}/submit-answer`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  finishSession: async (sessionId: string, timeSpentSeconds: number) => {
    return apiRequest<{ session: McqSession; questions: any[] }>(`/api/mcq/sessions/${sessionId}/finish`, {
      method: 'POST',
      body: JSON.stringify({ timeSpentSeconds }),
    });
  },

  // Progress
  getProgress: async () => {
    return apiRequest<McqStudentProgress>('/api/mcq/progress');
  },

  // Bookmarks
  getBookmarks: async () => {
    return apiRequest<{ bookmarks: McqBookmarkItem[] }>('/api/mcq/bookmarks');
  },

  toggleBookmark: async (questionId: string, notes?: string) => {
    return apiRequest<{ bookmarked: boolean }>('/api/mcq/bookmarks/toggle', {
      method: 'POST',
      body: JSON.stringify({ questionId, notes }),
    });
  },

  // Mistake Vault / Wrong Questions
  getWrongVault: async (includeResolved: boolean = false) => {
    return apiRequest<{ wrongVault: McqWrongVaultItem[] }>(`/api/mcq/wrong-vault?includeResolved=${includeResolved}`);
  },

  resolveWrongQuestion: async (questionId: string) => {
    return apiRequest<{ success: boolean }>('/api/mcq/wrong-vault/resolve', {
      method: 'POST',
      body: JSON.stringify({ questionId }),
    });
  },

  // MCQ Admin
  getAdminStats: async () => {
    return apiRequest<McqAdminStats>('/api/mcq/admin/stats');
  },

  getAdminQuestions: async (params: {
    course?: string;
    subject?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.course) q.set('course', params.course);
    if (params.subject) q.set('subject', params.subject);
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    return apiRequest<{ questions: McqQuestion[]; total: number; page: number; totalPages: number }>(
      `/api/mcq/admin/questions?${q.toString()}`
    );
  },

  createAdminQuestion: async (data: Partial<McqQuestion>) => {
    return apiRequest<{ question: McqQuestion }>('/api/mcq/admin/questions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAdminQuestion: async (id: string, data: Partial<McqQuestion>) => {
    return apiRequest<{ question: McqQuestion }>(`/api/mcq/admin/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteAdminQuestion: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/mcq/admin/questions/${id}`, {
      method: 'DELETE',
    });
  },

  bulkUpdateStatus: async (ids: string[], status: McqStatus) => {
    return apiRequest<{ updatedCount: number }>('/api/mcq/admin/questions/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
  },
};
