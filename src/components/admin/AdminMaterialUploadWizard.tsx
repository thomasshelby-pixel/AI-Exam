import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  X,
  Eye,
  Edit3,
  Check,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  HelpCircle,
  Clock,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import {
  mcqApi,
  ExtractedQuestionDraft,
  CaseGroupDraft,
  MaterialFlowProcessResponse,
} from '../../api/mcqClient.js';
import { McqCourse } from '../../types/index.js';
import {
  CANONICAL_COURSE_OPTIONS,
  getCourseSubjects,
  getSubjectChapters,
  CANONICAL_SOURCE_CATEGORIES,
  CanonicalSourceCategory,
  isAttemptRequiredSource,
  getAttemptSuggestions,
} from '../../data/caCurriculum.js';

interface AdminMaterialUploadWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const AdminMaterialUploadWizard: React.FC<AdminMaterialUploadWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [maxCompletedStep, setMaxCompletedStep] = useState<number>(0);

  // STEP 1: Details
  const [course, setCourse] = useState<McqCourse>('CA_INTERMEDIATE');
  const [subject, setSubject] = useState<string>('Corporate and Other Laws');
  const [sourceCategory, setSourceCategory] = useState<CanonicalSourceCategory>('MTP');
  const [attempt, setAttempt] = useState<string>('May 2026 - Series 1');
  const [materialName, setMaterialName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // STEP 2: Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileType, setFileType] = useState<'PDF' | 'TXT'>('PDF');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // STEP 3: Validate & Processing State
  const [validating, setValidating] = useState<boolean>(false);
  const [validationProgress, setValidationProgress] = useState<number>(0);
  const [validationTasks, setValidationTasks] = useState<{ label: string; done: boolean }[]>([
    { label: 'Reads PDF/TXT', done: false },
    { label: 'Finds questions', done: false },
    { label: 'Finds options (A-D)', done: false },
    { label: 'Finds answers (if available)', done: false },
    { label: 'Detects chapters (if possible)', done: false },
    { label: 'Detects question type (normal / case)', done: false },
    { label: 'Extracts page number', done: false },
    { label: 'Checks for duplicates', done: false },
  ]);

  // STEP 4: Preview Data
  const [processedData, setProcessedData] = useState<MaterialFlowProcessResponse | null>(null);

  // STEP 5: Saved Draft State
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);
  const [savedQuestionIds, setSavedQuestionIds] = useState<string[]>([]);
  const [isDraftSaved, setIsDraftSaved] = useState<boolean>(false);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);

  // STEP 6: Review & Edit State
  const [questions, setQuestions] = useState<ExtractedQuestionDraft[]>([]);
  const [cases, setCases] = useState<CaseGroupDraft[]>([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(0);
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'DUPLICATES'>('ALL');
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // STEP 7: Approve State
  const [approving, setApproving] = useState<boolean>(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [approvalErrors, setApprovalErrors] = useState<string[]>([]);

  // STEP 8: Publish State
  const [publishing, setPublishing] = useState<boolean>(false);
  const [isPublished, setIsPublished] = useState<boolean>(false);

  // Course subjects & chapters
  const courseSubjects = useMemo(() => getCourseSubjects(course), [course]);
  const subjectChapters = useMemo(() => getSubjectChapters(course, subject), [course, subject]);

  const isAttemptVisible = isAttemptRequiredSource(sourceCategory);

  const handleSourceCategoryChange = (newCat: CanonicalSourceCategory) => {
    setSourceCategory(newCat);
    if (isAttemptRequiredSource(newCat)) {
      if (!attempt) {
        setAttempt(getAttemptSuggestions(newCat)[0] || 'May 2026');
      }
    } else {
      setAttempt('');
    }
  };

  const handleCourseChange = (newCourse: McqCourse) => {
    setCourse(newCourse);
    const subs = getCourseSubjects(newCourse);
    setSubject(subs[0] || '');
  };

  // STEP 1 -> STEP 2
  const handleProceedToUpload = () => {
    setDetailsError(null);
    if (!materialName.trim()) {
      setDetailsError('Please enter a Material Name.');
      return;
    }
    if (!course || !subject || !sourceCategory) {
      setDetailsError('Please fill all required details.');
      return;
    }
    if (isAttemptVisible && !attempt.trim()) {
      setDetailsError('Attempt / Year is required for RTP, MTP, and PYQ.');
      return;
    }
    setMaxCompletedStep((prev) => Math.max(prev, 1));
    setCurrentStep(2);
  };

  // File selection handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.txt')) {
      setUploadError('Unsupported format. Material Upload strictly accepts PDF (.pdf) or TXT (.txt) files. For CSV/XLSX, use Bulk Import MCQs.');
      setSelectedFile(null);
      setFileBase64('');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 50MB.`);
      setSelectedFile(null);
      setFileBase64('');
      return;
    }

    setSelectedFile(file);
    setFileType(lowerName.endsWith('.pdf') ? 'PDF' : 'TXT');

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  // STEP 2 -> STEP 3 (Trigger Process)
  const handleStartProcessing = async () => {
    if (!selectedFile || !fileBase64) {
      setUploadError('Please select a PDF or TXT file to process.');
      return;
    }

    setCurrentStep(3);
    setValidating(true);
    setValidationProgress(15);

    // Animated visual tasks
    const updateTask = (index: number) => {
      setValidationTasks((prev) =>
        prev.map((t, idx) => (idx <= index ? { ...t, done: true } : t))
      );
    };

    try {
      setTimeout(() => { updateTask(1); setValidationProgress(35); }, 300);
      setTimeout(() => { updateTask(3); setValidationProgress(60); }, 600);
      setTimeout(() => { updateTask(5); setValidationProgress(85); }, 900);

      const res = await mcqApi.processMaterialFlow({
        materialName,
        course,
        subject,
        sourceCategory,
        attempt: isAttemptVisible ? attempt : undefined,
        fileBase64,
        originalFilename: selectedFile.name,
      });

      setValidationTasks((prev) => prev.map((t) => ({ ...t, done: true })));
      setValidationProgress(100);
      setProcessedData(res);
      setQuestions(res.questions);
      setCases(res.cases);
      setMaxCompletedStep((prev) => Math.max(prev, 3));

      // Brief delay to showcase completed checklist before preview
      setTimeout(() => {
        setValidating(false);
        setCurrentStep(4);
      }, 700);
    } catch (err: any) {
      console.error('Processing error:', err);
      setUploadError(err.message || 'Failed to process material file.');
      setValidating(false);
      setCurrentStep(2);
    }
  };

  // STEP 4 -> STEP 5 (Save as Draft)
  const handleSaveDraft = async () => {
    if (!processedData || questions.length === 0) return;

    setSavingDraft(true);
    try {
      const res = await mcqApi.saveMaterialDraft({
        materialName,
        course,
        subject,
        sourceCategory,
        attempt: isAttemptVisible ? attempt : undefined,
        description,
        fileBase64,
        originalFilename: selectedFile?.name || `${materialName}.pdf`,
        questions,
        cases,
      });

      setSavedMaterialId(res.materialId);
      setSavedQuestionIds(res.savedQuestionIds);
      setIsDraftSaved(true);
      setMaxCompletedStep((prev) => Math.max(prev, 5));
      setCurrentStep(5);
    } catch (err: any) {
      alert(err.message || 'Failed to save questions as draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  // STEP 5 -> STEP 6 (Proceed to Review)
  const handleProceedToReview = () => {
    setMaxCompletedStep((prev) => Math.max(prev, 5));
    setCurrentStep(6);
  };

  // Question editing within Review
  const currentQuestion = questions[selectedQuestionIndex];

  const handleUpdateQuestion = (updated: Partial<ExtractedQuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === selectedQuestionIndex ? { ...q, ...updated, needsReview: false } : q))
    );
    setEditSuccessMsg('Changes saved for this question.');
    setTimeout(() => setEditSuccessMsg(null), 2000);
  };

  // Duplicate resolution
  const handleSkipQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
    if (selectedQuestionIndex >= questions.length - 1) {
      setSelectedQuestionIndex(Math.max(0, questions.length - 2));
    }
  };

  const handleKeepAsNew = (index: number) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === index ? { ...q, isDuplicate: false, needsReview: false } : q))
    );
  };

  // STEP 6 -> STEP 7 (Approve)
  const handleProceedToApprove = () => {
    // Client pre-validation
    const errors: string[] = [];
    questions.forEach((q, idx) => {
      if (!q.questionText || q.questionText.trim().length < 5) {
        errors.push(`Question ${idx + 1}: Question prompt is too short.`);
      }
      if (!q.optionA || !q.optionB) {
        errors.push(`Question ${idx + 1}: Missing Option A or Option B.`);
      }
      if (!['A', 'B', 'C', 'D'].includes((q.correctAnswer || '').trim().toUpperCase())) {
        errors.push(`Question ${idx + 1}: Correct answer must be chosen (A, B, C, or D).`);
      }
      if (q.questionType === 'case_based' && (!q.caseId || !q.caseSequence)) {
        errors.push(`Question ${idx + 1}: Case-based question requires Case ID and Sequence.`);
      }
    });

    setApprovalErrors(errors);
    setMaxCompletedStep((prev) => Math.max(prev, 6));
    setCurrentStep(7);
  };

  const handleExecuteApproval = async () => {
    if (approvalErrors.length > 0) return;
    setApproving(true);
    try {
      const qIds = questions.map((q) => q.id);
      const caseIds = cases.map((c) => c.caseId);

      await mcqApi.approveMaterialQuestions({ questionIds: qIds, caseIds });
      setIsApproved(true);
      setMaxCompletedStep((prev) => Math.max(prev, 7));
      setCurrentStep(8);
    } catch (err: any) {
      alert(err.message || 'Failed to approve questions.');
    } finally {
      setApproving(false);
    }
  };

  // STEP 8 (Publish)
  const handleExecutePublish = async () => {
    setPublishing(true);
    try {
      const qIds = questions.map((q) => q.id);
      const caseIds = cases.map((c) => c.caseId);

      await mcqApi.publishMaterialQuestions({
        questionIds: qIds,
        materialId: savedMaterialId || undefined,
        caseIds,
      });

      setIsPublished(true);
      setMaxCompletedStep(8);
    } catch (err: any) {
      alert(err.message || 'Failed to publish questions.');
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  const STEPS_LIST = [
    { num: 1, label: 'Details' },
    { num: 2, label: 'Upload' },
    { num: 3, label: 'Validate' },
    { num: 4, label: 'Preview' },
    { num: 5, label: 'Save Draft' },
    { num: 6, label: 'Review' },
    { num: 7, label: 'Approve' },
    { num: 8, label: 'Publish' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER & 100% AI-FREE BADGE */}
        <div className="px-6 py-4 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">Material Content Workflow</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  100% AI-Free • Rule-Based
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload official ICAI papers & modules into the canonical Question Bank.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 8-STEP REAL FUNCTIONAL STEPPER */}
        <div className="bg-slate-950/70 border-b border-slate-800 px-6 py-3 overflow-x-auto scrollbar-none">
          <div className="flex items-center justify-between min-w-[720px] gap-2">
            {STEPS_LIST.map((step) => {
              const isActive = currentStep === step.num;
              const isDone = currentStep > step.num || maxCompletedStep >= step.num;
              const isLocked = step.num > maxCompletedStep + 1 && step.num > currentStep;

              return (
                <button
                  key={step.num}
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) setCurrentStep(step.num as WizardStep);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                      : isDone
                      ? 'text-emerald-400 hover:bg-slate-800 cursor-pointer'
                      : 'text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isActive
                        ? 'bg-white text-blue-600'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isDone && !isActive ? '✓' : step.num}
                  </span>
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP CONTENT BODY */}
        <div className="p-6 overflow-y-auto flex-1 text-slate-300 text-xs">
          
          {/* ========================================================================= */}
          {/* STEP 1 — DETAILS */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white text-sm">Step 1 — Basic Material Details</h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Only basic details required. No need to select chapter, topic, or difficulty at this stage — the system will automatically detect them.
                  </p>
                </div>
              </div>

              {detailsError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{detailsError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Course *</label>
                  <select
                    value={course}
                    onChange={(e) => handleCourseChange(e.target.value as McqCourse)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CANONICAL_COURSE_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Subject *</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {courseSubjects.map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Source Category *</label>
                  <select
                    value={sourceCategory}
                    onChange={(e) => handleSourceCategoryChange(e.target.value as CanonicalSourceCategory)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CANONICAL_SOURCE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {isAttemptVisible ? (
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Attempt / Year * <span className="text-amber-400 font-normal">(Required for {sourceCategory})</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. May 2026 - Series 1"
                      value={attempt}
                      onChange={(e) => setAttempt(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center text-slate-500 text-[11px]">
                    Attempt / Year is only applicable for RTP, MTP, and PYQ sources.
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Material Name *</label>
                <input
                  type="text"
                  placeholder="e.g. PW Revizer Economics, ICAI MTP Series 1 2026"
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Description / Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Internal notes or edition details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleProceedToUpload}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition cursor-pointer shadow-lg shadow-blue-500/20"
                >
                  <span>Continue to Upload</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2 — UPLOAD */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-[11px] uppercase font-bold">Target Material</div>
                  <div className="text-white font-bold text-sm mt-0.5">{materialName}</div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    {course.replace('_', ' ')} • {subject} • {sourceCategory} {attempt && `(${attempt})`}
                  </div>
                </div>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-blue-400 hover:underline cursor-pointer"
                >
                  Edit Details
                </button>
              </div>

              {uploadError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Upload Dropzone strictly PDF / TXT */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-blue-500/80 bg-slate-950/60 hover:bg-slate-950/90 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FileText className="w-7 h-7" />
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white">Choose PDF / TXT Source Document</h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Upload official PDF or clean TXT document containing MCQs or Case Studies. Max 50MB.
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition">
                  <Upload className="w-4 h-4" />
                  <span>Browse Document</span>
                </div>

                <div className="text-[11px] text-slate-500">
                  Strictly PDF or TXT only. (For structured CSV/XLSX spreadsheets, use Bulk Import MCQs).
                </div>
              </div>

              {/* Selected File Card */}
              {selectedFile && (
                <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {fileType}
                    </span>
                    <div>
                      <div className="font-bold text-white">{selectedFile.name}</div>
                      <div className="text-slate-400 text-[11px]">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Ready for deterministic extraction
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
              )}

              <div className="pt-4 flex items-center justify-between">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white font-bold transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Details</span>
                </button>

                <button
                  onClick={handleStartProcessing}
                  disabled={!selectedFile || !fileBase64}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>Process Material</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3 — VALIDATE (System Reads File - no AI, rule-based only) */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div className="max-w-xl mx-auto py-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <h3 className="text-base font-black text-white">System Reads File (Rule-Based Only)</h3>
                <p className="text-slate-400 text-xs">
                  Deterministic extraction running locally without external AI APIs...
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-2.5 transition-all duration-300"
                  style={{ width: `${validationProgress}%` }}
                />
              </div>

              {/* Task list matching reference image */}
              <div className="bg-slate-950/70 p-5 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  System Automatically:
                </div>
                {validationTasks.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs">
                    {t.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
                      </div>
                    )}
                    <span className={t.done ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                      {t.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4 — PREVIEW */}
          {/* ========================================================================= */}
          {currentStep === 4 && processedData && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Image-based / Scanned PDF Alert if applicable */}
              {processedData.pdfDiagnosis?.isImageBasedOrScanned && (
                <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-start gap-3 text-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm">Image-Based / Scanned PDF Detected</div>
                    <div className="text-xs text-amber-300/90 mt-1">
                      This PDF appears to be image-based or contains no extractable text. Automatic rule-based MCQ extraction is not available for this document.
                    </div>
                  </div>
                </div>
              )}

              {/* Header card matching reference image */}
              <div className="bg-slate-850 p-5 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Material Document</span>
                    <h3 className="text-lg font-black text-white">{processedData.materialName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {processedData.course.replace('_', ' ')} • {processedData.subject} • {processedData.sourceCategory}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {processedData.fileType} • {processedData.pageCount} Pages
                  </span>
                </div>

                {/* 3 Metric Boxes matching reference image */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 text-center">
                    <div className="text-2xl font-black text-white">{processedData.totalDetected}</div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase mt-1">Questions Detected</div>
                  </div>
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 text-center">
                    <div className="text-2xl font-black text-blue-400">{processedData.normalCount}</div>
                    <div className="text-[11px] font-bold text-blue-300 uppercase mt-1">Normal MCQ</div>
                  </div>
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 text-center">
                    <div className="text-2xl font-black text-purple-400">{processedData.caseBasedCount}</div>
                    <div className="text-[11px] font-bold text-purple-300 uppercase mt-1">Case-Based</div>
                  </div>
                </div>

                {/* Chapter Mapping Status Banner */}
                <div className="p-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-slate-300">Extraction Breakdown:</span>
                  </div>
                  <div className="flex items-center gap-3 font-semibold text-[11px]">
                    <span className="text-white">
                      <strong className="text-blue-400 font-bold">{processedData.totalDetected}</strong> Detected
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-emerald-300">
                      <strong className="text-emerald-400 font-bold">
                        {processedData.chapterAssignedCount ?? (processedData.totalDetected - (processedData.needsChapterReviewCount || 0))}
                      </strong> Chapter Assigned
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className={(processedData.needsChapterReviewCount || 0) > 0 ? 'text-amber-300' : 'text-slate-400'}>
                      <strong className={(processedData.needsChapterReviewCount || 0) > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                        {processedData.needsChapterReviewCount ?? 0}
                      </strong> Need Chapter Review
                    </span>
                  </div>
                </div>

                {/* Audit Grid (Valid, Needs Review, Rejected, Duplicates) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Valid MCQs:</span>
                    <span className="font-bold text-emerald-400">
                      {processedData.validCount ?? (processedData.totalDetected - processedData.needsReviewCount)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Needs Review:</span>
                    <span className="font-bold text-amber-400">{processedData.needsReviewCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Duplicates:</span>
                    <span className="font-bold text-slate-300">{processedData.duplicateCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Rejected Non-MCQ:</span>
                    <span className="font-bold text-slate-500">{processedData.rejectedCount || 0}</span>
                  </div>
                </div>
              </div>

              {/* Duplicate advisory alert if found */}
              {processedData.duplicateCount > 0 && (
                <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs">
                        {processedData.duplicateCount} Possible Duplicate Question(s) Detected
                      </div>
                      <div className="text-[11px] text-amber-300/80 mt-0.5">
                        These match existing questions in the Question Bank. You can inspect and Skip or Import them in Step 6.
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold shrink-0">
                    Warning
                  </span>
                </div>
              )}

              {/* Chapter-wise breakdown matching reference image */}
              <div className="bg-slate-850 p-5 rounded-2xl border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-white">Chapter-wise Questions</h4>
                  <span className="text-[11px] text-slate-400">
                    Total: <strong className="text-white">{processedData.totalDetected}</strong>
                  </span>
                </div>
                <div className="divide-y divide-slate-800">
                  {Object.entries(processedData.chapterDistribution).map(([ch, count]) => {
                    const isReview = ch === 'Needs Review';
                    return (
                      <div key={ch} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={isReview ? 'font-bold text-amber-300' : 'font-semibold text-slate-300'}>
                            {ch}
                          </span>
                          {isReview && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Requires Admin Assignment in Step 6
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-black px-2 py-0.5 rounded border ${
                            isReview
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                  {Object.keys(processedData.chapterDistribution).length === 0 && (
                    <div className="py-4 text-center text-slate-500 text-xs">
                      General Syllabus Distribution
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white font-bold transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Upload</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleProceedToReview}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Review Questions First</span>
                  </button>

                  <button
                    onClick={handleSaveDraft}
                    disabled={savingDraft}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition cursor-pointer"
                  >
                    <span>{savingDraft ? 'Saving Draft...' : 'Save as Draft'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 5 — SAVE DRAFT CONFIRMATION */}
          {/* ========================================================================= */}
          {currentStep === 5 && (
            <div className="max-w-xl mx-auto py-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-black text-white">Questions Saved as DRAFT</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {questions.length} questions from <span className="text-white font-bold">{materialName}</span> have been saved to the canonical Question Bank with status <span className="text-amber-400 font-bold">DRAFT</span>.
                </p>
              </div>

              {/* Status Flow Indicator matching reference image */}
              <div className="bg-slate-850 p-5 rounded-2xl border border-slate-700 text-left space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Status Flow:
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                    1. Draft
                    <div className="text-[10px] text-amber-400/80 font-normal">After processing</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-slate-400 border border-slate-800">
                    2. Review
                    <div className="text-[10px] text-slate-500">Admin checks</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-slate-400 border border-slate-800">
                    3. Approved
                    <div className="text-[10px] text-slate-500">Ready to live</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-slate-500 border border-slate-800 opacity-60">
                    4. Published
                    <div className="text-[10px] text-slate-600">Visible to student</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  onClick={handleProceedToReview}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition cursor-pointer"
                >
                  <span>Proceed to Review & Edit</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 6 — REVIEW (Edit if Needed) */}
          {/* ========================================================================= */}
          {currentStep === 6 && currentQuestion && (
            <div className="space-y-4">
              {/* Review Subheader */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-850 p-4 rounded-xl border border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-lg bg-blue-600 text-white font-black text-xs">
                    Q{selectedQuestionIndex + 1} of {questions.length}
                  </span>
                  <span className="text-slate-400 text-xs font-semibold">
                    {currentQuestion.chapter} • {currentQuestion.questionType.toUpperCase()}
                  </span>
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-2">
                  {(['ALL', 'NEEDS_REVIEW', 'DUPLICATES'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setReviewFilter(mode)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        reviewFilter === mode
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === 'ALL' && `All (${questions.length})`}
                      {mode === 'NEEDS_REVIEW' && `Needs Review (${questions.filter((q) => q.needsReview).length})`}
                      {mode === 'DUPLICATES' && `Duplicates (${questions.filter((q) => q.isDuplicate).length})`}
                    </button>
                  ))}
                </div>
              </div>

              {editSuccessMsg && (
                <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editSuccessMsg}</span>
                </div>
              )}

              {/* Duplicate warning bar if active question is duplicate */}
              {currentQuestion.isDuplicate && (
                <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl flex items-center justify-between gap-3 text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Possible Duplicate: This question matches existing {currentQuestion.duplicateExistingId} from {currentQuestion.duplicateExistingSource || 'library'}.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSkipQuestion(selectedQuestionIndex)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => handleKeepAsNew(selectedQuestionIndex)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition"
                    >
                      Import as New
                    </button>
                  </div>
                </div>
              )}

              {/* Main Question Editor Panel matching reference image panel 5 */}
              <div className="bg-slate-850 p-5 rounded-2xl border border-slate-700 space-y-4">
                {/* Metadata controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Chapter</label>
                    <select
                      value={currentQuestion.chapter}
                      onChange={(e) => handleUpdateQuestion({ chapter: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {subjectChapters.map((ch) => (
                        <option key={ch} value={ch}>{ch}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Question Type</label>
                    <select
                      value={currentQuestion.questionType}
                      onChange={(e) => handleUpdateQuestion({ questionType: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="normal">Normal MCQ</option>
                      <option value="case_based">Case-Based MCQ</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Difficulty</label>
                    <select
                      value={currentQuestion.difficulty}
                      onChange={(e) => handleUpdateQuestion({ difficulty: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="easy">Easy</option>
                      <option value="moderate">Moderate</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                {/* Case Scenario if case-based */}
                {currentQuestion.questionType === 'case_based' && (
                  <div className="p-3.5 bg-purple-950/40 border border-purple-800/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-300">
                      <span>Case Scenario ({currentQuestion.caseId || 'CASE-001'})</span>
                      <span>Sequence Q{currentQuestion.caseSequence || 1}</span>
                    </div>
                    <textarea
                      rows={3}
                      value={currentQuestion.caseScenario || ''}
                      onChange={(e) => handleUpdateQuestion({ caseScenario: e.target.value })}
                      placeholder="Integrated Case Scenario text..."
                      className="w-full bg-slate-900 border border-purple-900 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}

                {/* Question Prompt */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Question Prompt</label>
                  <textarea
                    rows={2}
                    value={currentQuestion.questionText}
                    onChange={(e) => handleUpdateQuestion({ questionText: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Options A, B, C, D */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                    const optKey = `option${opt}` as keyof ExtractedQuestionDraft;
                    return (
                      <div key={opt}>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Option {opt}
                        </label>
                        <input
                          type="text"
                          value={(currentQuestion[optKey] as string) || ''}
                          onChange={(e) => handleUpdateQuestion({ [optKey]: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Correct Answer & Explanation */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Correct Answer *
                    </label>
                    <select
                      value={currentQuestion.correctAnswer}
                      onChange={(e) => handleUpdateQuestion({ correctAnswer: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Answer</option>
                      <option value="A">Option A</option>
                      <option value="B">Option B</option>
                      <option value="C">Option C</option>
                      <option value="D">Option D</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Statutory Explanation
                    </label>
                    <input
                      type="text"
                      value={currentQuestion.explanation}
                      onChange={(e) => handleUpdateQuestion({ explanation: e.target.value })}
                      placeholder="As per ICAI guidelines..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Navigation Bar across questions */}
              <div className="pt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    disabled={selectedQuestionIndex === 0}
                    onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    ← Previous Q
                  </button>
                  <button
                    disabled={selectedQuestionIndex === questions.length - 1}
                    onClick={() => setSelectedQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next Q →
                  </button>
                </div>

                <button
                  onClick={handleProceedToApprove}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition cursor-pointer"
                >
                  <span>Proceed to Approval</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 7 — APPROVE */}
          {/* ========================================================================= */}
          {currentStep === 7 && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white text-sm">Step 7 — Syllabus Validation & Approval</h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Verify that all questions meet the required examination standards (prompt, 4 options, valid correct answer, course & subject).
                  </p>
                </div>
              </div>

              {approvalErrors.length > 0 ? (
                <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-xl space-y-2 text-rose-200 text-xs">
                  <div className="font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Approval Blocked: Please resolve the following before approval:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {approvalErrors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {approvalErrors.length > 5 && (
                      <li>...and {approvalErrors.length - 5} more issues.</li>
                    )}
                  </ul>
                  <button
                    onClick={() => setCurrentStep(6)}
                    className="mt-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition"
                  >
                    Go back to Step 6 to Fix
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-300 text-xs font-semibold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>All {questions.length} questions successfully validated. Ready for Admin Approval.</span>
                </div>
              )}

              {/* Status Flow Indicator */}
              <div className="bg-slate-850 p-5 rounded-2xl border border-slate-700 space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Status Flow:
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 border border-slate-800 font-bold">
                    1. Draft ✓
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 border border-slate-800 font-bold">
                    2. Review ✓
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                    3. Approved
                    <div className="text-[10px] text-purple-400/80 font-normal">Active Step</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-slate-500 border border-slate-800 opacity-60">
                    4. Published
                    <div className="text-[10px] text-slate-600">Pending</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  onClick={() => setCurrentStep(6)}
                  className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white font-bold transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Review</span>
                </button>

                <button
                  onClick={handleExecuteApproval}
                  disabled={approving || approvalErrors.length > 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>{approving ? 'Approving...' : 'Approve All Questions'}</span>
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 8 — PUBLISH (Matching Reference Image Panel 6) */}
          {/* ========================================================================= */}
          {currentStep === 8 && (
            <div className="max-w-xl mx-auto py-8 text-center space-y-6">
              {!isPublished ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-white">All questions reviewed?</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Publishing will immediately make these {questions.length} questions live for student practice sessions and mock tests.
                    </p>
                  </div>

                  {/* Big Green Publish Button matching reference image */}
                  <button
                    onClick={handleExecutePublish}
                    disabled={publishing}
                    className="w-full sm:w-auto px-10 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black rounded-xl shadow-xl shadow-emerald-500/30 transition transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    {publishing ? 'Publishing...' : 'Publish'}
                  </button>

                  <div className="text-[11px] text-slate-500">
                    Questions will be assigned status: <span className="text-emerald-400 font-bold uppercase">Published</span>.
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto animate-in zoom-in-50 duration-300">
                    <Check className="w-12 h-12 stroke-[3]" />
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-white">Questions Are Now Live!</h3>
                    <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                      All {questions.length} questions from <span className="text-white font-bold">{materialName}</span> are now accessible to students in MCQ Arena.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        onComplete();
                        onClose();
                      }}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition cursor-pointer"
                    >
                      Return to Material Library
                    </button>
                  </div>
                </>
              )}

              {/* Status Flow Indicator */}
              <div className="bg-slate-850 p-5 rounded-2xl border border-slate-700 text-left space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Status Flow:
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 border border-slate-800 font-bold">
                    1. Draft ✓
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 border border-slate-800 font-bold">
                    2. Review ✓
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 border border-slate-800 font-bold">
                    3. Approved ✓
                  </div>
                  <div className={`p-2.5 rounded-xl font-bold border transition ${
                    isPublished
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-emerald-600 text-white border-emerald-500'
                  }`}>
                    4. Published
                    <div className="text-[10px] opacity-80 font-normal">Visible to students</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
