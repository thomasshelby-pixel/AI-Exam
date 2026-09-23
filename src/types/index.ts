export type UserRole = 'STUDENT' | 'INSTITUTE_ADMIN' | 'SUPER_ADMIN' | 'MCQ_ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'REMOVED';

export type CALevel = 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';

export type MaterialType = 'MODEL' | 'MTP' | 'RTP' | 'PYQ' | 'MODEL_TEST_PAPER' | 'QUESTION_PAPER' | 'SUGGESTED_ANSWER';

export type ModelGroup = 'GROUP_1' | 'GROUP_2' | 'OTHER';

export type CheckingMode = 'standard' | 'strict' | 'lenient';

export type EvaluationStatus = 
  | 'PENDING'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'READING_ANSWER_SHEET'
  | 'IDENTIFYING_QUESTIONS'
  | 'EVALUATING_ANSWERS'
  | 'CALCULATING_MARKS'
  | 'GENERATING_FEEDBACK'
  | 'FINALIZING_REPORT'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export type InstituteStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  hasPermanentFreeAccess?: boolean;
  mfaEnabled?: boolean;
  mfaPhone?: string | null;
  mfaVerified?: boolean;
  mfaMandatory?: boolean;
}

export interface MfaRecoveryCodeStatus {
  total: number;
  remaining: number;
  hasCodes: boolean;
  generatedAt: string | null;
}

export interface MfaAuthenticatorItem {
  id: string;
  userId: string;
  factorType: 'PRIMARY_TOTP' | 'BACKUP_TOTP';
  label: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface MfaAuditLogItem {
  id: string;
  userId: string;
  eventType: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: string;
  createdAt: string;
}

export interface MfaRecoveryRequest {
  id: string;
  userId?: string;
  email: string;
  phone?: string;
  srnRegNo?: string;
  reason: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface StudentProfile {
  userId: string;
  icaiRegistrationNumber: string;
  caLevel: CALevel;
  freeEvaluationsUsed: number;
  freeEvaluationsRemaining: number;
  purchasedCredits: number;
  instituteSponsoredCredits: number;
  hasPermanentFreeAccess: boolean;
  instituteId?: string;
  instituteName?: string;
  batchId?: string;
  batchName?: string;
}

export interface Institute {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  email: string;
  phone: string;
  address?: string;
  website?: string;
  contactPerson: string;
  status: InstituteStatus;
  subscriptionPlan: string;
  subscriptionExpiresAt?: string;
  maxStudents: number;
  totalStudents?: number;
  activeStudents?: number;
  createdAt: string;
}

export interface Batch {
  id: string;
  instituteId: string;
  name: string;
  courseLevel: CALevel;
  description?: string;
  studentCount?: number;
  createdAt: string;
}

export type MarkingComponentType =
  | 'PROVISION'
  | 'PRINCIPLE'
  | 'CONDITION'
  | 'APPLICATION'
  | 'CALCULATION'
  | 'WORKING'
  | 'TREATMENT'
  | 'REASONING'
  | 'CONCLUSION'
  | 'PRESENTATION'
  | 'MCQ';

export type AssessmentStatus = 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' | 'OMITTED';

export interface BoundingBox {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface MarkingComponent {
  componentId: string;
  componentType: MarkingComponentType;
  expectedRequirement: string;
  studentEvidence: string;
  assessment: AssessmentStatus;
  marksAvailable: number;
  marksAwarded: number;
  marksDeducted: number;
  deductionReason?: string;
  supportingProvision?: string;
  confidence: number;
  pageNumber?: number;
  boundingBox?: BoundingBox;
  annotationInstructions?: string;
  modeDifferenceCategory?: string;
  modeDifferenceJustification?: string;
}

export interface StructuredMarkingEvidence {
  questionId: string;
  subQuestionId?: string;
  questionNumber: string;
  subQuestion?: string;
  maxMarks: number;
  obtainedMarks: number;
  marksAwarded: number;
  marksLost: number;
  markingComponents: MarkingComponent[];
  finalConclusionAssessment: string;
  overallReason: string;
  confidence: number;
  flags: string[];
  isDerivedAllocation?: boolean;
}

export interface ReferenceTrace {
  materialId?: string;
  materialTitle?: string;
  materialVersion?: string;
  contentHash?: string;
  retrievedCharacterCount?: number;
  markingSchemeSection?: string;
  suggestedAnswerSection?: string;
  suggestedAnswerRef?: string;
  verifiedTruthSnippet?: string;
  verifiedGroundTruthSnippet?: string;
  deductionReason?: string;
}

export type PYQSourceFormat = 'SEPARATE' | 'COMBINED' | 'LEGACY';

export interface EvaluationReferencePackage {
  packageId: string;
  evaluationId?: string;
  sourceFormat: PYQSourceFormat;
  level: CALevel;
  subjectKey: string;
  subjectName: string;
  paper: string;
  attempt: string;
  materialType: MaterialType;
  mtpSeries?: 1 | 2;
  materialVersion: string;
  sourceMaterialIds: {
    questionMaterialId?: string;
    suggestedAnswerMaterialId?: string;
    combinedSourceMaterialId?: string;
    markingSchemeMaterialId?: string;
  };
  questionPaper: {
    questions: Array<{
      questionId: string;
      parentQuestionId?: string;
      subQuestionId?: string;
      exactQuestionText: string;
      maximumMarks: number;
      options?: string[];
      questionType?: string;
    }>;
    rawText: string;
  };
  suggestedAnswers: {
    answers: Array<{
      questionId: string;
      subQuestionId?: string;
      referenceAnswer: string;
      workingNotes?: string;
      journalEntries?: string;
      calculations?: string;
      conclusions?: string;
    }>;
    rawText: string;
  };
  markingScheme: {
    questions: Array<{
      questionId: string;
      subQuestionId?: string;
      maximumMarks: number;
      markableComponents?: string[];
      stepGuidance?: string;
    }>;
    rawText: string;
  };
  retrievalTimestamp: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
}

export interface QuestionEvaluation {
  questionNumber: string;
  subQuestion?: string;
  questionId?: string;
  subQuestionId?: string;
  questionSource?: string;
  suggestedAnswerSource?: string;
  markingSchemeSource?: string;
  sourceFormat?: PYQSourceFormat;
  maximumMarks: number;
  marksAwarded: number;
  marksLost: number;
  status: 'correct' | 'partially_correct' | 'incorrect' | 'not_attempted' | 'unclear';
  reasonForDeduction: string;
  detailedFeedback: string;
  confidence?: number;
  technicalEvaluation?: string;
  missingRequirements?: string[];
  validAlternativeRecognition?: string;
  examinerComment?: string;
  consequentialErrorDetected?: boolean;
  consequentialErrorNotes?: string;
  markingComponents?: MarkingComponent[];
  structuredEvidence?: StructuredMarkingEvidence;
  referenceTrace?: ReferenceTrace;
  finalConclusionAssessment?: string;
  overallReason?: string;
  flags?: string[];
  isDerivedAllocation?: boolean;
  pageNumber?: number;
  boundingBox?: BoundingBox;
  stepMarkingBreakdown?: {
    step: string;
    marksAwarded: number;
    maximumMarks: number;
    remarks: string;
  }[];
  applicableProvisions?: string[];
  accountingStandardNotes?: string;
  candidateSelectedOption?: string;
  officialCorrectOption?: string;
  isCorrect?: boolean;
  topic?: string;
  markingRule?: string;
  negativeMarking?: number;
  sourceMaterialId?: string;
  sourceMaterialVersion?: string;
  sources?: {
    questionSourceId?: string;
    suggestedAnswerSourceId?: string;
    markingSchemeSourceId?: string;
    sourceFormat?: string;
  };
  suggestedAnswerReference?: string;
  explanation?: string;
  reviewerAdjustmentNotes?: string;
  modeDifferenceCategory?: string;
  modeDifferenceJustification?: string;
}

export interface ScoreCalculationAuditItem {
  questionNumber: string;
  subQuestion?: string;
  maxMarks: number;
  awardedMarks: number;
  deductions: number;
  componentsCount: number;
  consequentialCredited?: boolean;
}

export interface EvaluationResult {
  evaluationId: string;
  studentName: string;
  icaiRegistrationNumber: string;
  caLevel: CALevel;
  subjectKey: string;
  subjectName: string;
  materialType: MaterialType;
  mtpSeries?: 1 | 2;
  pyqSourceFormat?: PYQSourceFormat;
  sourceFormat?: PYQSourceFormat | 'SEPARATE' | 'COMBINED' | 'LEGACY';
  sourceMaterialIds?: {
    combinedSourceMaterialId?: string;
    questionMaterialId?: string;
    suggestedAnswerMaterialId?: string;
    markingSchemeMaterialId?: string;
  };
  normalizedPackageId?: string;
  paper?: string;
  attempt?: string;
  evaluationDate: string;
  totalMarks: number;
  maximumMarks: number;
  officialPaperMaxMarks?: number;
  selectedEvaluatedMaxMarks?: number;
  attemptedMaxMarks?: number;
  percentage: number;
  grade: string;
  confidenceScore: number;
  evaluationSource?: 'PUBLIC' | 'INSTITUTE';
  materialSource?: 'GLOBAL' | 'INSTITUTE';
  instituteId?: string;
  instituteName?: string;
  sponsoringInstituteId?: string;
  sponsoringInstituteName?: string;
  entitlementSource?: string;
  batchId?: string;
  batchName?: string;
  overallSummary: string;
  strengths: string[];
  weaknesses: string[];
  topicPerformance: {
    topic: string;
    marksObtained: number;
    maximumMarks: number;
    percentage: number;
    status: 'STRONG' | 'AVERAGE' | 'WEAK';
  }[];
  presentationAnalysis: {
    score: number;
    feedback: string;
    workingNotesQuality: string;
    handwritingLegibility: string;
  };
  accuracyAnalysis: {
    calculationAccuracy: string;
    provisionsAccuracy: string;
    methodologyCorrectness: string;
  };
  recommendations: string[];
  questions: QuestionEvaluation[];
  structuredMarkingEvidence?: StructuredMarkingEvidence[];
  scoreCalculationAudit?: ScoreCalculationAuditItem[];
  evaluationStandardDisclaimer?: string;
  isMcqPaper?: boolean;
  modelUsed?: string;
  modelDisplayName?: string;
  modelProvider?: string;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
  routingReason?: string;
  originalModel?: string;
  fallbackModel?: string;
  retryCount?: number;
  evaluationEngineVersion?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  fallbackOccurred?: boolean;
  fallbackReason?: string;
  mcqScoringRuleApplied?: {
    ruleId: string;
    level: string;
    paper: string;
    attempt: string;
    syllabusVersion: string;
    wrongPenalty: number;
    description?: string;
  };
  attemptedPercentage?: number;
  checkingMode?: CheckingMode;
  modeBreakdown?: {
    standard: {
      checkingMode: CheckingMode | string;
      displayName: string;
      totalMarks: number;
      maximumMarks: number;
      attemptedMaxMarks: number;
      percentage: number;
      attemptedPercentage: number;
      grade: string;
      philosophy: string;
    };
    strict: {
      checkingMode: CheckingMode | string;
      displayName: string;
      totalMarks: number;
      maximumMarks: number;
      attemptedMaxMarks: number;
      percentage: number;
      attemptedPercentage: number;
      grade: string;
      philosophy: string;
    };
    moderate: {
      checkingMode: CheckingMode | string;
      displayName: string;
      totalMarks: number;
      maximumMarks: number;
      attemptedMaxMarks: number;
      percentage: number;
      attemptedPercentage: number;
      grade: string;
      philosophy: string;
    };
  };
  coverageMap?: any;
  completionGateReport?: HardCompletionGateReport;
  validationStatus?: 'VALID' | 'NEEDS_REVIEW';
  validationErrors?: string[];
  integrityAudit?: any;
  version?: 'v1' | 'v2' | string;
  recheckStatus?: 'PENDING' | 'RECHECK_AFFIRMED' | 'RECHECKED_ACCEPTED' | 'RECHECKED_REJECTED';
  recheckResolutionDate?: string;
  recheckDelta?: number;
  reviewerNotes?: string;
  originalTotalMarks?: number;
  recheckHistory?: Array<{
    recheckId: string;
    requestedAt: string;
    resolvedAt?: string;
    requestedQuestions: string[];
    subQuestion?: string;
    reason: string;
    studentNotes?: string;
    status: string;
    reviewerId?: string;
    reviewerNotes?: string;
    originalScore?: number;
    recheckedScore?: number;
    scoreDelta?: number;
    overallOldTotal?: number;
    overallNewTotal?: number;
  }>;
  originalEvaluationSnapshot?: any;
}

export interface HardCompletionGateCheck {
  ruleId: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface HardCompletionGateReport {
  isPassed: boolean;
  passedCount: number;
  failedCount: number;
  checks: HardCompletionGateCheck[];
  timestamp: string;
}

export interface McqScoringRule {
  id: string;
  courseLevel: 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';
  paperNumber: string;
  paperName: string;
  attempt: string;
  syllabusVersion: string;
  wrongPenalty: number;
  correctScoreRule: string;
  unattemptedScoreRule: string;
  isActive: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExamAttempt {
  id: string;
  course: 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';
  month: string;
  year: number;
  displayName: string;
  syllabusVersion: string;
  applicableMaterialVersion?: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
}

export interface InstitutePlan {
  id: string;
  name: string;
  priceInr: number;
  billingPeriod: 'MONTHLY' | 'ANNUAL';
  studentQuota: number;
  evaluationCredits: number;
  features: string[];
  assignmentsEnabled: boolean;
  testsEnabled: boolean;
  analyticsEnabled: boolean;
  supportTier: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ReferralCampaign {
  code: string;
  campaignName: string;
  benefitType: string;
  benefitDurationDays: number;
  maxRedemptions: number;
  currentRedemptions: number;
  isActive: boolean;
}

export interface SupportTicketItem {
  id: string;
  ticketNumber?: string;
  userId?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  category?: string;
  priority?: string;
  role?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  adminReply?: string;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface EvaluationRecord {
  id: string;
  studentId: string;
  studentName: string;
  icaiRegistrationNumber: string;
  level: CALevel;
  materialType: MaterialType;
  modelGroup?: ModelGroup;
  subjectKey: string;
  subjectName: string;
  paper?: string;
  attempt?: string;
  mtpSeries?: 1 | 2;
  mtp_series?: 1 | 2;
  syllabusVersion?: string;
  materialId?: string;
  materialVersion?: string;
  modelUsed?: string;
  checkingMode: CheckingMode;
  originalFilename: string;
  status: EvaluationStatus;
  rejectionReason?: string;
  totalMarks?: number;
  maximumMarks?: number;
  percentage?: number;
  confidenceScore?: number;
  resultJson?: EvaluationResult;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CreditLedgerEntry {
  id: string;
  studentId: string;
  amount: number;
  source: 'FREE_TIER' | 'PURCHASED' | 'INSTITUTE_SPONSORED' | 'CONSUMED_EVALUATION' | 'REFUND_FAILED';
  balanceAfter: number;
  orderId?: string;
  paymentId?: string;
  evaluationId?: string;
  note: string;
  createdAt: string;
}

export interface PaymentOrder {
  id: string;
  razorpayOrderId: string;
  quantity: number;
  amountPaise: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  keyId?: string;
  createdAt: string;
}

export interface EvaluationMaterial {
  id: string;
  level: CALevel;
  materialType?: MaterialType;
  material_type?: MaterialType;
  modelGroup?: ModelGroup;
  model_group?: ModelGroup;
  subjectKey?: string;
  subject_key?: string;
  subjectName?: string;
  subject_name?: string;
  paper?: string;
  attempt?: string;
  mtpSeries?: 1 | 2;
  mtp_series?: 1 | 2 | string;
  sourceFormat?: PYQSourceFormat;
  source_format?: PYQSourceFormat;
  combinedSourceMaterialId?: string;
  combined_source_material_id?: string;
  questionMaterialId?: string;
  question_material_id?: string;
  suggestedAnswerMaterialId?: string;
  suggested_answer_material_id?: string;
  markingSchemeMaterialId?: string;
  marking_scheme_material_id?: string;
  syllabusVersion?: string;
  syllabus_version?: string;
  chapterTopic?: string;
  chapter_topic?: string;
  questionPaperTitle?: string;
  question_paper_title?: string;
  questionPaperText?: string;
  question_paper_text?: string;
  suggestedAnswersText?: string;
  suggested_answers_text?: string;
  markingSchemeText?: string;
  marking_scheme_text?: string;
  referenceGuidanceText?: string;
  reference_guidance_text?: string;
  amendmentsProvisionsText?: string;
  amendments_provisions_text?: string;
  effectiveDate?: string;
  effective_date?: string;
  version?: string;
  status: 'ACTIVE' | 'INACTIVE';
  hasQuestionPaper?: boolean;
  hasSuggestedAnswer?: boolean;
  uploadedBy?: string;
  uploaded_by?: string;
  file_id?: string;
  storage_path?: string;
  file_name?: string;
  file_size?: number;
  download_url?: string;
  qp_chars?: number;
  sa_chars?: number;
  ms_chars?: number;
  rg_chars?: number;
  ap_chars?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface InstituteAssignment {
  id: string;
  instituteId: string;
  batchId?: string;
  batchName?: string;
  title: string;
  subjectKey: string;
  subjectName: string;
  maximumMarks: number;
  instructions: string;
  timeLimitMinutes?: number;
  deadline: string;
  submissionsCount?: number;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'EVALUATION' | 'PAYMENT' | 'CREDIT' | 'INSTITUTE' | 'ASSIGNMENT' | 'SYSTEM';
  read: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  evaluationId?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  adminReply?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PermanentFreeEntitlement {
  id: string;
  email: string;
  reason: string;
  grantedBy: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

export type LegalDocType = 'TERMS' | 'PRIVACY' | 'REFUND';
export type LegalDocStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface LegalDocument {
  id: string;
  doc_type: LegalDocType;
  title: string;
  version: string;
  effective_date: string;
  last_updated_date: string;
  content: string;
  raw_content?: string;
  status: LegalDocStatus;
  changelog?: string;
  published_by?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface LegalSettings {
  legal_entity_name: string;
  business_address: string;
  privacy_email: string;
  support_email: string;
  instagram_url: string;
  governing_law: string;
  dispute_jurisdiction: string;
  updated_at?: string;
}

export interface LegalAcknowledgement {
  id: string;
  user_id: string;
  doc_type: LegalDocType;
  version: string;
  acknowledged_at: string;
  ip_address?: string;
}

/**
 * Universal question display formatter ensuring sub-question granularity (e.g. Q4(a), Q4(b), Q6(a)(2), MCQ1).
 * Never truncates sub-questions to Q4 or 4.
 */
export function formatQuestionDisplayCode(q: any): string {
  if (!q) return 'Q';
  if (typeof q === 'string') {
    const trimmed = q.trim();
    if (trimmed.startsWith('MCQ') || trimmed.startsWith('Q')) return trimmed;
    if (/^\d/.test(trimmed)) return `Q${trimmed}`;
    return trimmed;
  }
  if (q.fullQuestionCode && typeof q.fullQuestionCode === 'string') {
    const code = q.fullQuestionCode.trim();
    if (code.startsWith('MCQ') || code.startsWith('Q')) return code;
    if (/^\d/.test(code)) return `Q${code}`;
    return code;
  }
  const rawQNum = String(q.questionNumber || '').trim();
  const qNum = rawQNum.replace(/^Q/i, '');
  const subQ = q.subQuestion || q.subQuestionNumber;

  if (q.isMcq || subQ === 'MCQ' || rawQNum.toUpperCase().startsWith('MCQ')) {
    const num = rawQNum.replace(/[^0-9]/g, '') || '1';
    return `MCQ${num}`;
  }

  if (!qNum) return 'Q';

  if (subQ) {
    const cleanSub = String(subQ).trim().replace(/^\((.*)\)$/, '$1');
    return `Q${qNum}(${cleanSub})`;
  }
  return `Q${qNum}`;
}

export type ReviewStatus = 'PUBLISHED' | 'HIDDEN' | 'REMOVED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type ReviewVoteType = 'LIKE' | 'DISLIKE';

export interface StudentReview {
  id: string;
  userId: string;
  studentName?: string;
  studentEmail?: string;
  displayName: string;
  caLevel: CALevel | string;
  rating: number;
  reviewText: string;
  experienceTags?: string[];
  status: ReviewStatus;
  likesCount?: number;
  dislikesCount?: number;
  userVote?: ReviewVoteType | null;
  adminReply?: string | null;
  adminReplyAt?: string | null;
  adminReplyBy?: string | null;
  adminReplyName?: string | null;
  moderationReason?: string | null;
  moderatedAt?: string | null;
  moderatedBy?: string | null;
  isVerifiedEvaluation?: boolean;
  moderationNote?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicReview {
  id: string;
  displayName: string;
  caLevel: string;
  rating: number;
  reviewText: string;
  experienceTags?: string[];
  likesCount: number;
  dislikesCount: number;
  userVote?: ReviewVoteType | null;
  isVerifiedEvaluation: boolean;
  adminReply?: string | null;
  adminReplyAt?: string | null;
  adminReplyName?: string | null;
  date: string;
}

export interface PublicReviewsResponse {
  reviews: PublicReview[];
  stats: {
    totalReviews: number;
    averageRating: number;
    ratingBreakdown: Record<number, number>;
  };
}

export interface ReviewEligibilityResponse {
  eligible: boolean;
  completedEvaluationsCount: number;
  message?: string;
}

// ==========================================
// MCQ ARENA TYPES & INTERFACES
// ==========================================
export type McqCourse = 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL';
export type McqQuestionType = 'normal' | 'case_based';
export type McqDifficulty = 'easy' | 'moderate' | 'hard';
export type McqSource = 'ICAI Module' | 'PYQ' | 'RTP' | 'MTP' | 'Conceptual' | 'Practical';
export type McqStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

export interface McqQuestion {
  id: string;
  course: McqCourse;
  subject: string;
  chapter: string;
  topic?: string;
  questionType: McqQuestionType;
  caseStudyScenario?: string;
  difficulty: McqDifficulty;
  source: McqSource;
  attempt?: string;
  applicableFrom?: string;
  applicableTill?: string;
  amendmentVersion?: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  reference?: string;
  status: McqStatus;
  createdBy?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type McqSessionType = 'practice' | 'quick' | 'mock' | 'revision' | 'wrong_review' | 'weak_area';
export type McqSessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface McqSessionQuestion extends McqQuestion {
  userResponse?: {
    selectedOption: 'A' | 'B' | 'C' | 'D' | null;
    isCorrect?: boolean;
    isMarkedForReview?: boolean;
    eliminatedOptions?: ('A' | 'B' | 'C' | 'D')[];
    timeTakenSeconds?: number;
  };
  isBookmarked?: boolean;
}

export interface McqSession {
  id: string;
  studentId: string;
  sessionType: McqSessionType;
  course: McqCourse;
  subject: string;
  chapter?: string;
  topic?: string;
  difficulty?: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  score: number;
  accuracyPercentage: number;
  timeSpentSeconds: number;
  durationSeconds?: number;
  status: McqSessionStatus;
  createdAt: string;
  completedAt?: string;
  questions?: McqSessionQuestion[];
}

export interface McqBookmarkItem {
  id: string;
  studentId: string;
  questionId: string;
  notes?: string;
  createdAt: string;
  question?: McqQuestion;
}

export interface McqWrongVaultItem {
  id: string;
  studentId: string;
  questionId: string;
  lastWrongOption?: string;
  wrongCount: number;
  resolved: boolean;
  lastAttemptedAt: string;
  question?: McqQuestion;
}

export interface McqStudentProgress {
  totalAttempted: number;
  totalCorrect: number;
  totalIncorrect: number;
  overallAccuracy: number;
  streakDays: number;
  totalPracticeTimeSeconds: number;
  subjectBreakdown: Array<{
    subject: string;
    total: number;
    correct: number;
    accuracy: number;
  }>;
  recentSessions: McqSession[];
  wrongVaultCount: number;
  bookmarkCount: number;
}

export interface McqAdminStats {
  totalQuestions: number;
  publishedCount: number;
  reviewCount: number;
  draftCount: number;
  archivedCount: number;
  byCourse: {
    CA_FOUNDATION: number;
    CA_INTERMEDIATE: number;
    CA_FINAL: number;
  };
  byType: {
    normal: number;
    case_based: number;
  };
  byDifficulty: {
    easy: number;
    moderate: number;
    hard: number;
  };
  totalSessionsAttempted: number;
}


