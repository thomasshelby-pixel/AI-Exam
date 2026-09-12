export type UserRole = 'STUDENT' | 'INSTITUTE_ADMIN' | 'SUPER_ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'REMOVED';

export type CALevel = 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';

export type MaterialType = 'MODEL' | 'MTP' | 'RTP' | 'PYQ' | 'MODEL_TEST_PAPER';

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

export interface QuestionEvaluation {
  questionNumber: string;
  subQuestion?: string;
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

