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
  source?: string;
  attempt?: string | null;
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
    chapters?: string[];
    topic?: string;
    questionType?: McqQuestionType | 'mixed';
    difficulty?: McqDifficulty | 'mixed';
    source?: string;
    sourceCategory?: string;
    attempt?: string;
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
      questionId: string;
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

  bulkDeleteQuestions: async (ids: string[]) => {
    return apiRequest<{
      success: boolean;
      deletedCount: number;
      normalCount: number;
      caseCount: number;
      affectedCasesCount: number;
      publishedCount: number;
      draftOrReviewCount: number;
    }>('/api/mcq/admin/questions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  getDeleteAllSummary: async (filters: {
    course?: string;
    subject?: string;
    status?: string;
    search?: string;
    questionType?: string;
    difficulty?: string;
    chapter?: string;
    topic?: string;
  }) => {
    return apiRequest<{
      totalMatching: number;
      normalCount: number;
      caseCount: number;
      affectedCasesCount: number;
      publishedCount: number;
      draftOrReviewCount: number;
      hasActiveFilters: boolean;
    }>('/api/mcq/admin/questions/delete-all-summary', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  },

  deleteAllMatchingQuestions: async (filters: {
    course?: string;
    subject?: string;
    status?: string;
    search?: string;
    questionType?: string;
    difficulty?: string;
    chapter?: string;
    topic?: string;
    allowUnfiltered?: boolean;
  }) => {
    return apiRequest<{
      success: boolean;
      deletedCount: number;
      normalCount: number;
      caseCount: number;
      affectedCasesCount: number;
      publishedCount: number;
      draftOrReviewCount: number;
    }>('/api/mcq/admin/questions/delete-all-matching', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  },

  bulkUpdateStatus: async (ids: string[], status: McqStatus) => {
    return apiRequest<{ updatedCount: number }>('/api/mcq/admin/questions/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
  },

  // MCQ Admin Material Library
  validateMaterialPreview: async (payload: {
    fileBase64: string;
    filename: string;
    mimeType?: string;
    course: string;
    subject: string;
    materialType: string;
    attempt?: string;
    overrideDuplicate?: boolean;
    overrideReason?: string;
  }) => {
    return apiRequest<McqMaterialPreviewResponse>('/api/mcq/admin/materials/validate-preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createMaterial: async (data: {
    materialName: string;
    course: string;
    subject: string;
    chapter?: string;
    topic?: string;
    materialType: string;
    source?: string;
    attempt?: string;
    applicableFrom?: string;
    applicableTill?: string;
    amendmentVersion?: string;
    description?: string;
    status?: McqMaterialStatus;
    fileBase64: string;
    originalFilename: string;
    mimeType?: string;
    overrideDuplicate?: boolean;
    overrideReason?: string;
  }) => {
    return apiRequest<{ material: McqMaterial }>('/api/mcq/admin/materials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 8-Step Reference Content Flow
  processMaterialFlow: async (data: {
    materialName: string;
    course: string;
    subject: string;
    sourceCategory: string;
    attempt?: string;
    fileBase64: string;
    originalFilename: string;
    mimeType?: string;
  }) => {
    return apiRequest<MaterialFlowProcessResponse>('/api/mcq/admin/material-flow/process', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  saveMaterialDraft: async (data: {
    materialName: string;
    course: string;
    subject: string;
    sourceCategory: string;
    attempt?: string;
    description?: string;
    fileBase64?: string;
    originalFilename?: string;
    mimeType?: string;
    questions: ExtractedQuestionDraft[];
    cases: CaseGroupDraft[];
  }) => {
    return apiRequest<{ success: boolean; materialId: string; savedQuestionCount: number; savedQuestionIds: string[]; status: string }>(
      '/api/mcq/admin/material-flow/save-draft',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  approveMaterialQuestions: async (data: { questionIds: string[]; caseIds?: string[] }) => {
    return apiRequest<{ success: boolean; approvedCount: number; status: string }>(
      '/api/mcq/admin/material-flow/approve',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  publishMaterialQuestions: async (data: { questionIds: string[]; materialId?: string; caseIds?: string[] }) => {
    return apiRequest<{ success: boolean; publishedCount: number; status: string }>(
      '/api/mcq/admin/material-flow/publish',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  getMaterials: async (params: {
    course?: string;
    subject?: string;
    materialType?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.course) q.set('course', params.course);
    if (params.subject) q.set('subject', params.subject);
    if (params.materialType) q.set('materialType', params.materialType);
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    return apiRequest<{ materials: McqMaterial[]; total: number; page: number; totalPages: number }>(
      `/api/mcq/admin/materials?${q.toString()}`
    );
  },

  getMaterial: async (id: string) => {
    return apiRequest<{ material: McqMaterial }>(`/api/mcq/admin/materials/${id}`);
  },

  updateMaterial: async (id: string, updates: Partial<McqMaterial>) => {
    return apiRequest<{ material: McqMaterial }>(`/api/mcq/admin/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteMaterial: async (id: string, linkedAction?: 'keep_intact' | 'unlink' | 'archive') => {
    return apiRequest<{ success: boolean; materialId?: string }>(`/api/mcq/admin/materials/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ linkedAction: linkedAction || 'keep_intact' }),
    });
  },

  getMaterialLinkedSummary: async (id: string) => {
    return apiRequest<{
      materialId: string;
      materialName: string;
      linkedQuestionsCount: number;
      linkedCasesCount: number;
    }>(`/api/mcq/admin/materials/${id}/linked-summary`);
  },

  getBulkMaterialsLinkedSummary: async (materialIds: string[]) => {
    return apiRequest<{
      totalMaterials: number;
      linkedQuestionsCount: number;
      linkedCasesCount: number;
      items: Array<{
        materialId: string;
        materialName: string;
        linkedQuestionsCount: number;
        linkedCasesCount: number;
      }>;
    }>('/api/mcq/admin/materials/linked-summary', {
      method: 'POST',
      body: JSON.stringify({ materialIds }),
    });
  },

  bulkDeleteMaterials: async (materialIds: string[], linkedAction?: 'keep_intact' | 'unlink' | 'archive') => {
    return apiRequest<{
      success: boolean;
      deletedCount: number;
      totalRequested: number;
      results: Array<{ id: string; success: boolean; error?: string }>;
    }>('/api/mcq/admin/materials/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ materialIds, linkedAction: linkedAction || 'keep_intact' }),
    });
  },

  // Structured MCQ Bulk Import (CSV / XLSX)
  validateBulkImport: async (
    input: string | { csvText?: string; base64File?: string; fileFormat?: 'CSV' | 'XLSX'; defaultValues?: any },
    defaultValues?: any
  ) => {
    let payload: any = {};
    if (typeof input === 'string') {
      payload = { csvText: input, defaultValues };
    } else {
      payload = input;
    }
    return apiRequest<BulkImportPreviewResult>('/api/mcq/admin/bulk-import/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  commitBulkImport: async (validRows: any[], status: 'draft' | 'published' = 'draft') => {
    return apiRequest<{ importedCount: number; casesCount: number; importedIds: string[] }>('/api/mcq/admin/bulk-import/commit', {
      method: 'POST',
      body: JSON.stringify({ validRows, status }),
    });
  },

  // Case Bundles
  getAdminCases: async (params: {
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
    return apiRequest<{ cases: any[]; total: number; page: number; totalPages: number }>(
      `/api/mcq/admin/cases?${q.toString()}`
    );
  },

  getAdminCase: async (id: string) => {
    return apiRequest<{ case: any }>(`/api/mcq/admin/cases/${id}`);
  },

  bulkUpdateCaseStatus: async (ids: string[], status: McqStatus) => {
    return apiRequest<{ updatedCount: number }>('/api/mcq/admin/cases/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
  },

  deleteAdminCase: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/mcq/admin/cases/${id}`, {
      method: 'DELETE',
    });
  },
};

export type McqMaterialStatus = 'Draft' | 'Review' | 'Approved' | 'Published' | 'Archived';

export interface McqMaterial {
  id: string;
  material_name: string;
  course: string;
  subject: string;
  chapter?: string | null;
  topic?: string | null;
  material_type: string;
  source: string;
  attempt?: string | null;
  applicable_from?: string | null;
  applicable_till?: string | null;
  amendment_version?: string | null;
  description?: string | null;
  status: McqMaterialStatus;
  file_type: 'PDF' | 'TXT';
  file_name: string;
  file_size: number;
  file_hash: string;
  content_hash?: string | null;
  extracted_text?: string | null;
  page_count: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  linked_mcq_count?: number;
  linked_case_count?: number;
  linkedMcqCount?: number;
  linkedCaseCount?: number;
}

export interface McqMaterialPreviewResponse {
  valid: boolean;
  fileType: 'PDF' | 'TXT';
  fileName: string;
  fileSize: number;
  fileHash: string;
  pageCount: number;
  extractedTextSnippet: string;
  fullExtractedText: string;
  titleHint?: string;
  duplicateCheck: {
    status: 'NEW' | 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'SIMILAR' | 'REPLACEMENT_VERSION';
    isDuplicate: boolean;
    canOverride: boolean;
    similarity: number;
    message: string;
    existingMaterial?: any;
  };
}

export interface BulkImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: Array<{
    rowNumber: number;
    isValid: boolean;
    errors: string[];
    data: any;
  }>;
  detectedColumns: string[];
}

export interface ExtractedQuestionDraft {
  id: string;
  tempId: string;
  course: string;
  subject: string;
  chapter: string;
  topic: string;
  questionType: 'normal' | 'case_based';
  caseId?: string;
  caseTitle?: string;
  caseScenario?: string;
  caseSequence?: number;
  difficulty: 'easy' | 'moderate' | 'hard';
  source: string;
  attempt?: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | '';
  explanation: string;
  reference: string;
  sourceMaterialName: string;
  sourceMaterialId?: string;
  sourcePage?: number;
  isDuplicate: boolean;
  duplicateExistingId?: string;
  duplicateExistingSource?: string;
  needsReview: boolean;
  reviewReason?: string;
  validationErrors: string[];
}

export interface CaseGroupDraft {
  caseId: string;
  caseTitle: string;
  caseScenario: string;
  chapter: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  questions: ExtractedQuestionDraft[];
}

export interface MaterialFlowProcessResponse {
  materialName: string;
  course: string;
  subject: string;
  sourceCategory: string;
  attempt?: string;
  totalDetected: number;
  normalCount: number;
  caseBasedCount: number;
  validCount?: number;
  chapterAssignedCount?: number;
  needsChapterReviewCount?: number;
  rejectedCount?: number;
  chapterDistribution: Record<string, number>;
  questions: ExtractedQuestionDraft[];
  cases: CaseGroupDraft[];
  rawTextSnippet: string;
  needsReviewCount: number;
  duplicateCount: number;
  fileHash: string;
  fileType: 'PDF' | 'TXT';
  fileName: string;
  fileSize: number;
  pageCount: number;
  rejectionReasons?: string[];
  pdfDiagnosis?: {
    pageCount: number;
    pagesWithText: number;
    totalExtractedChars: number;
    totalExtractedLines: number;
    zeroTextPages: number[];
    lowTextPages: number[];
    candidateMarkersFound: number;
    isImageBasedOrScanned: boolean;
    status: 'SUCCESS' | 'IMAGE_BASED' | 'EMPTY' | 'PARSER_ISSUE';
    diagnosisMessage: string;
  };
}


