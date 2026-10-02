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

/**
 * Immutable Single Evaluation Source Binding Bundle
 * Strictly binds authoritative reference documents to an evaluation run.
 */
export interface EvaluationSourceBundle {
  readonly evaluationId: string;
  readonly paperId: string;
  readonly paperVersion: string;
  readonly course: string;
  readonly level: string;
  readonly subject: string;
  readonly examType: string;
  readonly examSession: string;
  readonly mtpSeries?: number | null;

  readonly questionPaperSourceId: string;
  readonly questionPaperVersionId: string;
  readonly questionPaperContentHash: string;

  readonly suggestedAnswerSourceId: string;
  readonly suggestedAnswerVersionId: string;
  readonly suggestedAnswerContentHash: string;

  readonly markingSchemeSourceId?: string;
  readonly markingSchemeVersionId?: string;
  readonly markingSchemeContentHash?: string;

  readonly mcqAnswerKeySourceId?: string;
  readonly mcqAnswerKeyVersionId?: string;
  readonly mcqAnswerKeyContentHash?: string;

  readonly questionPaperFilename?: string;
  readonly suggestedAnswerFilename?: string;
  readonly markingSchemeFilename?: string;
  readonly mcqAnswerKeyFilename?: string;

  readonly sourceBindingHash: string;
}

/**
 * Supported Generic Transformation Types across CA Foundation, Intermediate, and Final.
 * Never subject-specific; encompasses all source-defined transformations.
 */
export type TransformationType =
  | 'GROSS_UP'
  | 'TAX_ADJUSTMENT'
  | 'GST_ADJUSTMENT'
  | 'ACCOUNTING_ADJUSTMENT'
  | 'DEPRECIATION'
  | 'PROVISION'
  | 'PERCENTAGE_REVERSE_CALCULATION'
  | 'DISCOUNTING'
  | 'COMPOUNDING'
  | 'WORKING_CAPITAL_ADJUSTMENT'
  | 'CASH_FLOW_ADJUSTMENT'
  | 'CONSOLIDATION'
  | 'RECONCILIATION'
  | 'LEGAL_EXCEPTION'
  | 'PROVISO_APPLICATION'
  | 'THRESHOLD_APPLICATION'
  | 'ALLOWABLE_DEDUCTION'
  | 'SET_OFF'
  | 'CARRY_FORWARD'
  | 'OTHER_SOURCE_DEFINED_TRANSFORMATION';

/**
 * Generic Internal Structure for Source-Grounded Transformations.
 * Evaluator must identify the source-defined transformation between raw input fact
 * and expected intermediate / final result.
 */
export interface SourceGroundedTransformation {
  readonly questionId: string;
  readonly criterionId?: string;
  readonly inputFact: string;
  readonly inputFactSource: 'QUESTION_PAPER' | 'ASSUMPTION' | 'GIVEN_FACT' | string;
  readonly transformationType: TransformationType;
  readonly sourceRule: string;
  readonly sourceFormula?: string;
  readonly sourceCalculation?: string;
  readonly expectedIntermediateResult?: string | number;
  readonly expectedFinalResult?: string | number;
  readonly sourceLocation: string;
  readonly sourceVersion?: string;
  readonly referenceHash: string;
}

/**
 * Categorization of numerical reasoning errors to prevent double-penalties
 * and ensure own-figure rule / consequential credit.
 */
export type NumericalReasoningErrorType =
  | 'NONE'
  | 'INTERPRETATION_MISTAKE'
  | 'FORMULA_ERROR'
  | 'ARITHMETIC_SLIP'
  | 'CONSEQUENTIAL_CONTINUATION'
  | 'OMITTED_TRANSFORMATION';

export interface IntermediateResultIntegrityRecord {
  readonly transformationId?: string;
  readonly transformationType: TransformationType;
  readonly inputFact: string;
  readonly expectedValue: string | number;
  readonly studentValue?: string | number;
  readonly errorType: NumericalReasoningErrorType;
  readonly isMethodValid: boolean;
  readonly isAlternativeMethod: boolean;
  readonly isConsequentialCreditAwarded: boolean;
  readonly marksImpacted: number;
  readonly auditExplanation: string;
}

/**
 * Question-Wise Bound Reference Bundle
 * Strictly binds authoritative question context and suggested answer segment.
 */
export interface QuestionReferenceBundle {
  readonly canonicalQuestionId: string;
  readonly questionPaperText: string;
  readonly questionPaperSourceLocation: string;
  readonly maximumMarks: number;

  readonly suggestedAnswerText: string;
  readonly suggestedAnswerSourceLocation: string;

  readonly officialMarkingCriteria?: string;
  readonly officialMcqKey?: string;

  readonly referenceSourceId: string;
  readonly referenceVersionId: string;
  readonly referenceContentHash: string;

  /**
   * Source-grounded transformations identified for this question
   */
  readonly sourceTransformations?: readonly SourceGroundedTransformation[];
}

/**
 * Authoritative Traceability Record for Evaluated Criteria
 */
export interface EvaluationReferenceTraceRecord {
  readonly canonicalQuestionId: string;
  readonly criterionId: string;

  readonly questionPaperSourceId: string;
  readonly questionPaperVersionId: string;
  readonly questionPaperLocation: string;

  readonly suggestedAnswerSourceId: string;
  readonly suggestedAnswerVersionId: string;
  readonly suggestedAnswerLocation: string;

  readonly markingSchemeSourceId?: string;
  readonly markingSchemeVersionId?: string;

  readonly mcqAnswerKeySourceId?: string;
  readonly mcqAnswerKeyVersionId?: string;

  readonly referenceContentHash: string;
}

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
  canonicalId?: string;
  parentQuestionId?: string;
  fullQuestionCode?: string;
  questionSource?: string;
  suggestedAnswerSource?: string;
  markingSchemeSource?: string;
  sourceFormat?: PYQSourceFormat;
  maximumMarks: number;
  marksAwarded: number;
  marksLost: number;
  status: 'correct' | 'partially_correct' | 'incorrect' | 'not_attempted' | 'unclear';
  reasonForDeduction?: string;
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
  sourcePages?: number[];
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
  sourceTransformations?: SourceGroundedTransformation[];
  numericalIntegrityRecords?: IntermediateResultIntegrityRecord[];
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
  canonicalLedger?: CanonicalEvaluationLedger;
  reconciliationSection?: EvaluationReconciliationSection;
  evaluationRunPackage?: EvaluationRunPackage;
}

export type CanonicalQuestionType = 'DESCRIPTIVE' | 'MCQ' | 'CASE_SCENARIO' | 'PRACTICAL';

export interface CanonicalQuestionInventoryItem {
  readonly questionId: string;
  readonly parentQuestionId?: string;
  readonly subQuestionId?: string;
  readonly questionType: CanonicalQuestionType;
  readonly maxMarks: number;
  readonly sourcePage?: number;
  readonly sourceOrder: number;
  readonly alternativeGroupId?: string;
  readonly canonicalTextAnchor?: string;
  readonly sourceAnchor?: string;
  readonly sourceVersion?: string;
  readonly canonicalTextFingerprint?: string;
  readonly isAlternative?: boolean;
  readonly isRequiredOrOptional: 'REQUIRED' | 'OPTIONAL';
}

export interface CanonicalQuestionInventory {
  readonly inventoryId: string;
  readonly paperTitle?: string;
  readonly totalPaperMaxMarks: number;
  readonly items: CanonicalQuestionInventoryItem[];
  readonly referenceHash: string;
}

export interface StudentAttemptManifestItem {
  readonly questionId: string;
  readonly attempted: boolean;
  readonly confidence: number;
  readonly sourcePages: number[];
  readonly evidence: string;
  readonly isPartial: boolean;
  readonly isContinuation: boolean;
  readonly selectedAlternative?: string | number;
  readonly studentSnippet?: string;
  readonly studentSelectedOption?: string;
  readonly isCrossedOutWithNoReplacement?: boolean;
  readonly isMcq?: boolean;
}

export interface PageCoverageAuditItem {
  readonly pageNumber: number;
  readonly hasStudentContent: boolean;
  readonly detectedQuestionIds: string[];
  readonly evaluatedQuestionIds: string[];
  readonly renderedQuestionIds: string[];
}

export interface StudentAttemptManifest {
  readonly manifestId: string;
  readonly evaluationRunId: string;
  readonly totalPages: number;
  readonly attempts: StudentAttemptManifestItem[];
  readonly pageCoverageAudit: PageCoverageAuditItem[];
}

export interface FourSetReconciliationReport {
  readonly attemptedSet: string[];
  readonly evaluatedSet: string[];
  readonly renderedSet: string[];
  readonly countedSet: string[];
  readonly isAttemptedSubsetOfEvaluated: boolean;
  readonly isEvaluatedEqualToRendered: boolean;
  readonly isRenderedEqualToCounted: boolean;
  readonly canonicalLedgerTotal: number;
  readonly scorecardTotal: number;
  readonly evaluationReportTotal: number;
  readonly checkedCopyTotal: number;
  readonly finalDisplayedTotal: number;
  readonly isScoresReconciled: boolean;
  readonly isFullyReconciled: boolean;
  readonly mismatches: string[];
  readonly diagnosticTable: DiagnosticLedgerRow[];
}

export type EvaluationFinalizationStatus =
  | 'INITIALIZED'
  | 'IN_EVALUATION'
  | 'PERSISTED'
  | 'FINALIZED'
  | 'REJECTED'
  | 'PERSISTENCE_FAILED'
  | 'INTEGRITY_FAILED';

export interface EvaluationIntegrityFailureDiagnostic {
  readonly failureCode: 'EVALUATION_INTEGRITY_FAILURE';
  readonly questionId: string;
  readonly stageOfFailure: 'AI_EVALUATION' | 'PERSISTENCE' | 'RENDERING' | 'COUNTING' | 'RECONCILIATION';
  readonly studentPages: number[];
  readonly detectedEvidence?: string;
  readonly expectedState: string;
  readonly actualState: string;
  readonly reason: string;
}

export interface EvaluationRunPackage {
  readonly runId: string;
  readonly evaluationId: string;
  readonly sourceBundleId: string;
  readonly questionInventory: CanonicalQuestionInventory;
  readonly studentAttemptManifest: StudentAttemptManifest;
  readonly evaluationRecords: CanonicalEvaluationRecord[];
  readonly scoreLedger: CanonicalEvaluationLedger;
  readonly pageCoverageAudit: PageCoverageAuditItem[];
  readonly reconciliation: FourSetReconciliationReport;
  readonly finalizationStatus: EvaluationFinalizationStatus;
  readonly durablePersistenceConfirmed: boolean;
  readonly renderManifest?: RenderManifest;
  readonly integrityDiagnostics?: EvaluationIntegrityFailureDiagnostic[];
  readonly persistedAt?: string;
  readonly finalizedAt?: string;
  readonly auditTrail: string[];
}

export type CanonicalEvaluationStatus =
  | 'EVALUATED'
  | 'FAILED_TO_EVALUATE'
  | 'NEEDS_MAPPING_REVIEW'
  | 'UNATTEMPTED'
  | 'EXCLUDED_ALTERNATIVE'
  | 'RENDER_FAILED';

export interface AnnotationAnchor {
  readonly pageNumber: number;
  readonly x?: number;
  readonly y?: number;
  readonly region: 'TOP_MARGIN' | 'RIGHT_MARGIN' | 'INLINE' | 'BOTTOM_MARGIN';
  readonly annotationType: 'SCORE_BOX' | 'STEP_BREAKDOWN' | 'MCQ_BADGE' | 'EVALUATION_NOTE';
  readonly height?: number;
  readonly width?: number;
}

export interface CanonicalEvaluationRecord {
  readonly questionId: string;
  readonly parentQuestionId?: string;
  readonly subQuestionId?: string;
  readonly questionType?: CanonicalQuestionType;
  readonly attempted: boolean;
  readonly evaluated?: boolean;
  readonly sourcePages: number[];
  readonly studentPages?: number[];
  readonly maxMarks: number;
  readonly awardedMarks: number;
  readonly evaluationStatus: CanonicalEvaluationStatus;
  readonly annotationRequired?: boolean;
  readonly annotationPage?: number;
  readonly annotationAnchor?: AnnotationAnchor;
  readonly renderOrder?: number;
  readonly rendered: boolean;
  readonly counted: boolean;
  readonly selectedAlternative?: string | number;
  readonly isAlternative?: boolean;
  readonly alternativeGroupId?: string;
  readonly studentSelectedOption?: string;
  readonly officialAnswer?: string;
  readonly evidence?: string;
  readonly stepMarkingBreakdown?: any[];
  readonly markingComponents?: MarkingComponent[];
  readonly reconciliationNotes?: string[];
}

export interface RenderManifestItem {
  readonly questionId: string;
  readonly evaluated: boolean;
  readonly annotationRequired: boolean;
  readonly rendered: boolean;
  readonly renderedPages: number[];
  readonly annotationCount: number;
  readonly renderAnchorValid: boolean;
  readonly status: CanonicalEvaluationStatus;
}

export interface RenderManifest {
  readonly evaluationId: string;
  readonly runId: string;
  readonly items: RenderManifestItem[];
  readonly totalEvaluated: number;
  readonly totalRendered: number;
  readonly isRenderValid: boolean;
  readonly orphanAnnotations: string[];
  readonly renderErrors: string[];
  readonly timestamp: string;
}

export interface CanonicalEvaluationLedger {
  readonly ledgerId: string;
  readonly evaluationRunId: string;
  readonly records: CanonicalEvaluationRecord[];
  readonly totalCanonicalQuestions: number;
  readonly totalAttempted: number;
  readonly totalEvaluated: number;
  readonly totalRendered: number;
  readonly totalCounted: number;
  readonly totalMaxMarks: number;
  readonly totalAwardedMarks: number;
  readonly isReconciled: boolean;
  readonly reconciliationErrors: string[];
}

export interface DiagnosticLedgerRow {
  readonly questionId: string;
  readonly attempted: boolean;
  readonly evaluated: boolean;
  readonly rendered: boolean;
  readonly counted: boolean;
  readonly maxMarks: number;
  readonly awardedMarks: number;
  readonly status: CanonicalEvaluationStatus;
}

export interface EvaluationReconciliationSection {
  readonly totalCanonicalQuestions: number;
  readonly totalAttempted: number;
  readonly totalEvaluated: number;
  readonly totalRendered: number;
  readonly totalCounted: number;
  readonly totalMaxMarks: number;
  readonly totalAwardedMarks: number;
  readonly allAttemptedCountedExactlyOnce: boolean;
  readonly diagnosticTable: DiagnosticLedgerRow[];
  readonly ledgerSummary: string;
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
export type McqSource =
  | 'RTP'
  | 'MTP'
  | 'PYQ'
  | 'ICAI Module'
  | 'Self-Created'
  | 'Conceptual Practice'
  | 'Other'
  | 'Conceptual'
  | 'Practical';
export type McqStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived' | 'deleted' | 'DELETED';
export type McqGenerationMethod = 'MANUAL' | 'AI_GENERATED' | 'IMPORTED';

export interface McqQuestion {
  id: string;
  course: McqCourse;
  subject: string;
  chapter: string;
  topic?: string;
  questionType: McqQuestionType;
  caseId?: string;
  caseTitle?: string;
  caseSequence?: number;
  caseStudyScenario?: string;
  difficulty: McqDifficulty;
  source: McqSource;
  attempt?: string;
  applicableFrom?: string;
  applicableTill?: string;
  amendmentVersion?: string;
  generationMethod?: McqGenerationMethod;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  reference?: string;
  status: McqStatus;
  source_material_id?: string;
  sourceMaterialId?: string;
  createdBy?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McqCase {
  caseId: string;
  caseTitle: string;
  caseScenario: string;
  caseDifficulty: McqDifficulty;
  course: McqCourse;
  subject: string;
  chapter: string;
  topic?: string;
  source?: string;
  attempt?: string;
  applicableFrom?: string;
  applicableTill?: string;
  amendmentVersion?: string;
  generationMethod?: McqGenerationMethod;
  status: McqStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  questions?: McqQuestion[];
}

export interface McqImportBatch {
  id: string;
  batchNumber?: string;
  course: McqCourse;
  subject?: string;
  materialType: 'SINGLE' | 'CASE_BASED' | 'MIXED';
  difficulty: McqDifficulty | 'mixed';
  source: McqSource;
  attempt?: string;
  sourceMaterialId?: string;
  generationMethod: McqGenerationMethod;
  uploadedBy: string;
  status: McqStatus;
  rowCount: number;
  validCount: number;
  invalidCount: number;
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
  currentQuestionId?: string | null;
  currentQuestionIndex?: number;
  currentCaseId?: string | null;
  questionIds?: string[];
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


