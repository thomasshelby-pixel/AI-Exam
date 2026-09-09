export type UserRole = 'STUDENT' | 'INSTITUTE_ADMIN' | 'SUPER_ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'REMOVED';

export type CALevel = 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';

export type MaterialType = 'MODEL' | 'MTP' | 'RTP' | 'PYQ';

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
  stepMarkingBreakdown?: {
    step: string;
    marksAwarded: number;
    maximumMarks: number;
    remarks: string;
  }[];
  applicableProvisions?: string[];
  accountingStandardNotes?: string;
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
  percentage: number;
  grade: string;
  confidenceScore: number;
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
  isMcqPaper?: boolean;
  modelUsed?: string;
  modelDisplayName?: string;
  modelProvider?: string;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
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
  materialType: MaterialType;
  modelGroup?: ModelGroup;
  subjectKey: string;
  subjectName: string;
  paper?: string;
  attempt?: string;
  syllabusVersion?: string;
  chapterTopic?: string;
  questionPaperTitle: string;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  markingSchemeText?: string;
  referenceGuidanceText?: string;
  amendmentsProvisionsText?: string;
  effectiveDate?: string;
  version?: string;
  status: 'ACTIVE' | 'INACTIVE';
  hasQuestionPaper?: boolean;
  hasSuggestedAnswer?: boolean;
  uploadedBy: string;
  createdAt: string;
  updatedAt?: string;
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
