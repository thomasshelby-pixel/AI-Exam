import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { CA_SUBJECTS, CASubject } from '../../data/caCurriculum.js';
import { CALevel, MaterialType, CheckingMode, EvaluationResult } from '../../types/index.js';
import { fetchExamAttempts, getAttemptsForLevel, ExamAttempt } from '../../lib/attempts.js';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Zap,
  Info,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Scale,
  Building2,
  Globe,
  BookOpen,
  Clock,
} from 'lucide-react';

interface UploadEvaluationProps {
  onEvaluationComplete: (evaluationId: string, result: EvaluationResult) => void;
  onOpenCreditsModal: () => void;
}

export type EvaluationStep =
  | 'IDLE'
  | 'VALIDATING_DOCUMENT'
  | 'READING_SOLUTIONS'
  | 'IDENTIFYING_QUESTIONS'
  | 'EVALUATING_STEPS'
  | 'CALCULATING_MARKS'
  | 'FINALIZING_REPORT'
  | 'FINALIZING_CONSISTENCY';

interface EvaluationStageItem {
  key: EvaluationStep;
  label: string;
  minSeconds: number;
  description: string;
}

const EVALUATION_PROGRESS_STAGES: EvaluationStageItem[] = [
  {
    key: 'VALIDATING_DOCUMENT',
    label: '1. Document validated & authenticated',
    minSeconds: 0,
    description: 'Verifying answer sheet structure, page integrity and vision safeguard',
  },
  {
    key: 'READING_SOLUTIONS',
    label: '2. Answer sheet transcribed / vision extracted',
    minSeconds: 15,
    description: 'High-fidelity transcription of handwritten solutions, ledger tables and annotations',
  },
  {
    key: 'IDENTIFYING_QUESTIONS',
    label: '3. Questions and sub-questions identified',
    minSeconds: 38,
    description: 'Mapping answers to question numbers, compulsory questions and working notes',
  },
  {
    key: 'EVALUATING_STEPS',
    label: '4. Checking provisions, reasoning & step-wise calculations',
    minSeconds: 72,
    description: 'ICAI step-marking: verifying legal provisions, Standards on Auditing/AS/Ind AS & calculations',
  },
  {
    key: 'CALCULATING_MARKS',
    label: '5. Applying deterministic MCQ rules & consequential marking',
    minSeconds: 110,
    description: 'Authoritative scoring without hallucinations; protecting downstream arithmetic steps',
  },
  {
    key: 'FINALIZING_REPORT',
    label: '6. Generating checked copy & detailed diagnostic report',
    minSeconds: 155,
    description: 'Synthesizing examiner annotations, margin ticks, diagnostic insights and strengths',
  },
  {
    key: 'FINALIZING_CONSISTENCY',
    label: '7. Finalizing mathematical and marking consistency',
    minSeconds: 195,
    description: 'Strict cross-validation of paper totals against official paper maximum (100 marks)',
  },
];

export const UploadEvaluation: React.FC<UploadEvaluationProps> = ({
  onEvaluationComplete,
  onOpenCreditsModal,
}) => {
  const { user, profile, refreshUser } = useAuth();
  const location = useLocation();
  const navState = (location.state || {}) as {
    initialEvaluationType?: 'PUBLIC' | 'INSTITUTE';
    instituteId?: string;
    materialId?: string;
    subjectKey?: string;
    level?: CALevel;
  };

  // Dual Evaluation state
  const [evaluationSource, setEvaluationSource] = useState<'PUBLIC' | 'INSTITUTE'>(
    navState.initialEvaluationType || 'PUBLIC'
  );
  const [enrolledInstitutes, setEnrolledInstitutes] = useState<any[]>([]);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>(navState.instituteId || '');
  const [instituteMaterials, setInstituteMaterials] = useState<any[]>([]);
  const [selectedInstituteMaterialId, setSelectedInstituteMaterialId] = useState<string>(navState.materialId || '');
  const [loadingEnrollments, setLoadingEnrollments] = useState<boolean>(true);

  // Form states
  const [level, setLevel] = useState<CALevel>(navState.level || 'INTERMEDIATE');
  const [selectedGroup, setSelectedGroup] = useState<'GROUP_1' | 'GROUP_2' | 'ALL'>('GROUP_1');
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>(
    navState.subjectKey || 'inter_advanced_accounting'
  );
  const [materialType, setMaterialType] = useState<MaterialType>('MTP');
  const [mtpSeries, setMtpSeries] = useState<1 | 2>(1);
  const [pyqSourceFormat, setPyqSourceFormat] = useState<'AUTO' | 'COMBINED' | 'SEPARATE'>('AUTO');
  const [detectedSourceFormat, setDetectedSourceFormat] = useState<'COMBINED' | 'SEPARATE' | null>(null);
  const [attempt, setAttempt] = useState<string>('May 2026');
  const [availableAttempts, setAvailableAttempts] = useState<ExamAttempt[]>(() =>
    getAttemptsForLevel(navState.level || 'INTERMEDIATE')
  );
  const [checkingMode, setCheckingMode] = useState<CheckingMode>('standard');

  // File upload states
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Material check status
  const [materialAvailable, setMaterialAvailable] = useState<boolean>(true);
  const [materialTitle, setMaterialTitle] = useState<string>('');
  const [checkingMaterial, setCheckingMaterial] = useState<boolean>(false);

  // Progress states
  const [evalStep, setEvalStep] = useState<EvaluationStep>('IDLE');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeEvaluationId, setActiveEvaluationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [rejectionDetails, setRejectionDetails] = useState<string>('');

  // Resilience: Check for existing in-flight evaluation on mount (resilience to page refresh / tab navigation)
  useEffect(() => {
    const savedEvalId = localStorage.getItem('ca_active_eval_id');
    const savedStartTime = localStorage.getItem('ca_active_eval_start');
    if (savedEvalId) {
      setActiveEvaluationId(savedEvalId);
      if (savedStartTime) {
        const elapsed = Math.max(0, Math.floor((Date.now() - parseInt(savedStartTime, 10)) / 1000));
        setElapsedSeconds(elapsed);
      }
      setEvalStep('VALIDATING_DOCUMENT');
    }
  }, []);

  // Elapsed timer tick when evaluating
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (evalStep !== 'IDLE') {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [evalStep]);

  // Dynamically update evalStep based on elapsed time across realistic stages
  useEffect(() => {
    if (evalStep === 'IDLE') return;
    for (let i = EVALUATION_PROGRESS_STAGES.length - 1; i >= 0; i--) {
      if (elapsedSeconds >= EVALUATION_PROGRESS_STAGES[i].minSeconds) {
        setEvalStep(EVALUATION_PROGRESS_STAGES[i].key);
        break;
      }
    }
  }, [elapsedSeconds, evalStep]);

  // Polling hook when activeEvaluationId is set
  useEffect(() => {
    if (!activeEvaluationId) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const data = await apiRequest<{
          evaluation: {
            id: string;
            status: string;
            progress_stage?: string;
            progress_percentage?: number;
            progress_message?: string;
            rejection_reason?: string;
            error_message?: string;
            resultJson?: EvaluationResult;
          };
        }>(`/api/student/evaluations/${activeEvaluationId}`);

        if (!isSubscribed) return;

        if (data.evaluation?.status === 'COMPLETED' || data.evaluation?.status === 'NEEDS_REVIEW') {
          clearInterval(interval);
          localStorage.removeItem('ca_active_eval_id');
          localStorage.removeItem('ca_active_eval_start');
          setEvalStep('IDLE');
          setActiveEvaluationId(null);
          await refreshUser();
          if (data.evaluation.resultJson) {
            onEvaluationComplete(activeEvaluationId, data.evaluation.resultJson);
          }
        } else if (data.evaluation?.status === 'REJECTED' || data.evaluation?.status === 'FAILED') {
          clearInterval(interval);
          localStorage.removeItem('ca_active_eval_id');
          localStorage.removeItem('ca_active_eval_start');
          setEvalStep('IDLE');
          setActiveEvaluationId(null);
          setErrorMessage(data.evaluation.rejection_reason || data.evaluation.error_message || 'Evaluation could not be completed.');
          if (data.evaluation.status === 'REJECTED') {
            setRejectionDetails(
              'Document validation safeguard triggered: Admit cards, certificates, hall tickets, and blank documents are strictly rejected. No evaluation credits have been deducted.'
            );
          }
        } else if (data.evaluation?.progress_stage) {
          const matchedStage = EVALUATION_PROGRESS_STAGES.find((s) => s.key === data.evaluation.progress_stage);
          if (matchedStage) {
            setEvalStep(matchedStage.key);
          }
        }
      } catch (pollErr) {
        console.warn('Polling active evaluation error:', pollErr);
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeEvaluationId, onEvaluationComplete, refreshUser]);

  const studentProfile = profile as {
    free_evaluations_used?: number;
    purchased_credits?: number;
    icai_registration_number?: string;
    institute_name?: string;
  } | null;

  const freeRemaining = Math.max(0, 2 - (studentProfile?.free_evaluations_used || 0));
  const purchasedCredits = studentProfile?.purchased_credits || 0;

  // Active membership check
  const activeInstitute = enrolledInstitutes.find((inst) => inst.institute_id === selectedInstituteId) || enrolledInstitutes[0];
  const isInstituteEnrolled = enrolledInstitutes.length > 0;
  const hasAccess =
    isInstituteEnrolled || user?.hasPermanentFreeAccess || freeRemaining > 0 || purchasedCredits > 0;

  // Fetch student enrollments
  useEffect(() => {
    const fetchEnrollments = async () => {
      try {
        setLoadingEnrollments(true);
        const res = await apiRequest<{ enrollments: any[] }>('/api/student/enrollments');
        const active = (res.enrollments || []).filter((e: any) => e.status === 'ACTIVE');
        setEnrolledInstitutes(active);
        if (active.length > 0 && !selectedInstituteId) {
          setSelectedInstituteId(navState.instituteId || active[0].institute_id);
        }
        if (navState.initialEvaluationType === 'INSTITUTE' && active.length > 0) {
          setEvaluationSource('INSTITUTE');
        }
      } catch (err) {
        console.warn('Could not load student enrollments:', err);
      } finally {
        setLoadingEnrollments(false);
      }
    };
    fetchEnrollments();
  }, []);

  // Sync available exam attempts dynamically when CA level changes
  useEffect(() => {
    let isMounted = true;
    fetchExamAttempts(level).then((attempts) => {
      if (isMounted && attempts.length > 0) {
        setAvailableAttempts(attempts);
        if (!attempts.some((a) => a.attemptLabel === attempt)) {
          const defaultMay26 = attempts.find((a) => a.attemptLabel === 'May 2026');
          setAttempt(defaultMay26 ? defaultMay26.attemptLabel : attempts[0].attemptLabel);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [level]);

  // Fetch materials for selected institute
  useEffect(() => {
    if (evaluationSource !== 'INSTITUTE' || !selectedInstituteId) {
      setInstituteMaterials([]);
      return;
    }
    const fetchInstMaterials = async () => {
      try {
        const res = await apiRequest<{ materials: any[] }>(
          `/api/student/institute-materials?instituteId=${selectedInstituteId}`
        );
        const mats = res.materials || [];
        setInstituteMaterials(mats);
        if (mats.length > 0) {
          const match = navState.materialId ? mats.find((m: any) => m.id === navState.materialId) : null;
          const chosen = match || mats[0];
          setSelectedInstituteMaterialId(chosen.id);
          if (chosen.level) setLevel(chosen.level as CALevel);
          if (chosen.subject_key) setSelectedSubjectKey(chosen.subject_key);
        }
      } catch (err) {
        console.warn('Could not load institute materials:', err);
      }
    };
    fetchInstMaterials();
  }, [evaluationSource, selectedInstituteId]);

  // Filter subjects based on level and group
  const filteredSubjects = CA_SUBJECTS.filter((s) => {
    if (s.level !== level) return false;
    if (level === 'FOUNDATION') return true;
    if (selectedGroup === 'ALL') return true;
    return s.group === selectedGroup;
  });

  // Selected subject object
  const currentSubject = CA_SUBJECTS.find((s) => s.id === selectedSubjectKey) || filteredSubjects[0];

  // Auto update selected subject when level/group changes
  useEffect(() => {
    if (evaluationSource === 'PUBLIC' && filteredSubjects.length > 0 && !filteredSubjects.some((s) => s.id === selectedSubjectKey)) {
      setSelectedSubjectKey(filteredSubjects[0].id);
    }
  }, [level, selectedGroup, filteredSubjects, selectedSubjectKey, evaluationSource]);

  // Check material availability from server
  useEffect(() => {
    if (evaluationSource === 'INSTITUTE') {
      if (selectedInstituteMaterialId) {
        const sel = instituteMaterials.find((m: any) => m.id === selectedInstituteMaterialId);
        if (sel) {
          setMaterialAvailable(true);
          setMaterialTitle(sel.title || sel.subject_name);
          return;
        }
      }
      if (instituteMaterials.length > 0) {
        setMaterialAvailable(true);
        setMaterialTitle(instituteMaterials[0].title || 'Institute Test Series Paper');
      } else {
        setMaterialAvailable(false);
        setMaterialTitle('');
      }
      return;
    }

    const checkMaterial = async () => {
      if (!selectedSubjectKey) return;
      setCheckingMaterial(true);
      try {
        const res = await apiRequest<{
          available: boolean;
          material?: {
            question_paper_title: string;
            attempt: string;
            source_format?: 'COMBINED' | 'SEPARATE';
          };
        }>(
          `/api/public/materials-check?level=${level}&subjectKey=${selectedSubjectKey}&attempt=${encodeURIComponent(
            attempt
          )}&materialType=${materialType}${materialType === 'MTP' ? `&mtpSeries=${mtpSeries}` : ''}${
            materialType === 'PYQ' && pyqSourceFormat !== 'AUTO' ? `&sourceFormat=${pyqSourceFormat}` : ''
          }`
        );

        setMaterialAvailable(res.available);
        setMaterialTitle(res.material?.question_paper_title || '');
        setDetectedSourceFormat(res.material?.source_format || null);
      } catch {
        setMaterialAvailable(false);
        setDetectedSourceFormat(null);
      } finally {
        setCheckingMaterial(false);
      }
    };

    checkMaterial();
  }, [
    evaluationSource,
    selectedInstituteMaterialId,
    instituteMaterials,
    level,
    selectedSubjectKey,
    attempt,
    materialType,
    mtpSeries,
    pyqSourceFormat,
  ]);

  // Handle file drop & selection
  const processFile = (selectedFile: File) => {
    setErrorMessage('');
    setRejectionDetails('');

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds 50MB limit. Please upload a compressed PDF or images.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1] || '';
      setFileBase64(base64Data);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Submit evaluation
  const handleStartEvaluation = async () => {
    if (!file || !fileBase64) {
      setErrorMessage('Please upload your handwritten CA answer sheet file (PDF or image).');
      return;
    }

    if (!materialAvailable) {
      setErrorMessage(
        evaluationSource === 'INSTITUTE'
          ? 'No test materials are available for this coaching institute. Please contact your faculty to upload test questions.'
          : 'Evaluation material is not available for the selected paper and attempt yet. Please try again once the required material has been uploaded.'
      );
      return;
    }

    if (!hasAccess) {
      if (evaluationSource === 'INSTITUTE') {
        setErrorMessage('You are not actively enrolled in this coaching institute.');
      } else {
        onOpenCreditsModal();
      }
      return;
    }

    const newEvaluationId = `eval_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;

    try {
      setErrorMessage('');
      setRejectionDetails('');
      setElapsedSeconds(0);
      setActiveEvaluationId(newEvaluationId);
      localStorage.setItem('ca_active_eval_id', newEvaluationId);
      localStorage.setItem('ca_active_eval_start', Date.now().toString());
      setEvalStep('VALIDATING_DOCUMENT');

      const response = await apiRequest<{
        success: boolean;
        evaluationId: string;
        status?: string;
        result?: EvaluationResult;
      }>('/api/student/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          evaluationId: newEvaluationId,
          studentName: user?.fullName,
          icaiRegistrationNumber: studentProfile?.icai_registration_number || 'N/A',
          level,
          materialType: evaluationSource === 'INSTITUTE' ? 'MOCK_EXAM' : materialType,
          mtpSeries: evaluationSource !== 'INSTITUTE' && materialType === 'MTP' ? mtpSeries : undefined,
          modelGroup: selectedGroup !== 'ALL' ? selectedGroup : undefined,
          subjectKey: selectedSubjectKey,
          subjectName: currentSubject?.name || 'CA Subject',
          attempt: evaluationSource === 'INSTITUTE' ? 'Institute Series' : attempt,
          checkingMode,
          sourceFormat: materialType === 'PYQ'
            ? (pyqSourceFormat !== 'AUTO' ? pyqSourceFormat : (detectedSourceFormat || undefined))
            : undefined,
          fileBase64,
          mimeType: file.type || 'application/pdf',
          filename: file.name,
          evaluationSource,
          instituteId: selectedInstituteId || undefined,
          sponsoringInstituteId: isInstituteEnrolled ? selectedInstituteId : undefined,
          instituteMaterialId: evaluationSource === 'INSTITUTE' ? selectedInstituteMaterialId : undefined,
        }),
      });

      if (response.result) {
        localStorage.removeItem('ca_active_eval_id');
        localStorage.removeItem('ca_active_eval_start');
        setActiveEvaluationId(null);
        setEvalStep('IDLE');
        await refreshUser();
        onEvaluationComplete(response.evaluationId, response.result);
      } else {
        // Backend started async job! Keep activeEvaluationId active, and let polling take over.
        setEvalStep('EVALUATING_ANSWERS');
      }
    } catch (err: unknown) {
      // Resilience check: verify if the evaluation was enqueued and is running in backend
      try {
        const verifyRes = await apiRequest<{ evaluation?: { id: string; status: string } }>(
          `/api/student/evaluations/${newEvaluationId}`
        );
        if (
          verifyRes.evaluation &&
          verifyRes.evaluation.status !== 'FAILED' &&
          verifyRes.evaluation.status !== 'REJECTED'
        ) {
          console.log('[UploadEvaluation] Evaluation is actively running in background:', newEvaluationId);
          setEvalStep('EVALUATING_ANSWERS');
          return;
        }
      } catch {
        // Fall through to error
      }

      localStorage.removeItem('ca_active_eval_id');
      localStorage.removeItem('ca_active_eval_start');
      setActiveEvaluationId(null);
      setEvalStep('IDLE');
      const msg = err instanceof Error ? err.message : 'Evaluation could not be completed.';
      setErrorMessage(msg);
      if (msg.includes('Subject Mismatch Detected')) {
        setRejectionDetails(
          'Subject validation safeguard triggered: The uploaded answer sheet does not match your selected subject. No evaluation credits or institute quotas have been deducted.'
        );
      } else if (msg.toLowerCase().includes('not appear to be a valid ca answer sheet') || msg.toLowerCase().includes('reject')) {
        setRejectionDetails(
          'Document validation safeguard triggered: Admit cards, certificates, hall tickets, and blank documents are strictly rejected. No evaluation credits have been deducted.'
        );
      } else if (msg.includes('prepayment credits are depleted') || msg.includes('Google AI Studio prepayment credits')) {
        setRejectionDetails(
          'Google AI Studio API quota/billing limit reached. Please visit AI Studio at https://ai.studio/projects to manage project billing. No student credits have been deducted.'
        );
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 text-slate-800 dark:text-slate-100 space-y-6">
      {/* Title & ICAI Disclaimer Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>Evaluate Handwritten Answer Sheet</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold uppercase tracking-wider">
              ICAI Pattern
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload your mock test, model test, or test series solutions for line-by-line step marking.
          </p>
        </div>

        {/* Entitlement Counter Box */}
        <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/50 dark:border-blue-700/50">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Available Balance</p>
            <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
              {isInstituteEnrolled ? (
                <span className="text-blue-600 dark:text-blue-400">Sponsored ({activeInstitute?.institute_name || 'Institute'})</span>
              ) : user?.hasPermanentFreeAccess ? (
                <span className="text-blue-600 dark:text-blue-400">Active</span>
              ) : studentProfile?.institute_name ? (
                <span className="text-blue-600 dark:text-blue-400">Institute Sponsored</span>
              ) : freeRemaining > 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">{freeRemaining} Free Left</span>
              ) : (
                <span className="text-slate-900 dark:text-white">{purchasedCredits} Credits</span>
              )}
            </p>
          </div>
          {!isInstituteEnrolled && !user?.hasPermanentFreeAccess && !studentProfile?.institute_name && freeRemaining === 0 && purchasedCredits === 0 && (
            <button
              onClick={onOpenCreditsModal}
              className="ml-1 px-2.5 py-1 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm cursor-pointer"
            >
              Buy (₹10)
            </button>
          )}
        </div>
      </div>

      {/* Evaluation Progress State Overlay */}
      {evalStep !== 'IDLE' && (
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 shadow-xl space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/40 border border-blue-100 dark:border-blue-800 mt-0.5">
                <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">ICAI Examiner Evaluation in Progress</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Deep evaluation in progress. CA papers with extensive working notes take 2–4 minutes to evaluate with step-wise precision.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60 < 10 ? '0' : ''}{elapsedSeconds % 60}s
              </span>
              <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 px-3 py-1 rounded bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800">
                Typical evaluation time: 2–5 minutes
              </span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {EVALUATION_PROGRESS_STAGES.map((st, idx) => {
              const currentIndex = EVALUATION_PROGRESS_STAGES.findIndex((s) => s.key === evalStep);
              const thisIndex = idx;
              const isDone = currentIndex > thisIndex;
              const isCurrent = currentIndex === thisIndex;

              return (
                <div key={st.key} className="flex items-start gap-3 text-xs">
                  <div className="mt-0.5 shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : isCurrent ? (
                      <div className="w-4 h-4 rounded-full border-2 border-blue-600 dark:border-blue-400 border-t-transparent animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <span className={isDone ? 'text-slate-400 dark:text-slate-500 font-medium' : isCurrent ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                      {st.label}
                    </span>
                    <p className={`text-[11px] ${isCurrent ? 'text-blue-600/90 dark:text-blue-300/90 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                      {st.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>Evaluation persists in background if you navigate away. Results are automatically saved to your dashboard.</span>
            {activeEvaluationId && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('ca_active_eval_id');
                  localStorage.removeItem('ca_active_eval_start');
                  setActiveEvaluationId(null);
                  setEvalStep('IDLE');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer text-left sm:text-right"
              >
                Reset upload session
              </button>
            )}
          </div>
        </div>
      )}

      {/* Errors & Validation Rejection Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-sm space-y-2">
          <div className="flex items-start gap-2 font-bold">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span className="whitespace-pre-line leading-relaxed">{errorMessage}</span>
          </div>
          {errorMessage.includes('prepayment credits') && (
            <div className="pl-6 pt-1">
              <a
                href="https://ai.studio/projects"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:underline"
              >
                Go to Google AI Studio Project Billing &rarr;
              </a>
            </div>
          )}
          {rejectionDetails && <p className="text-xs text-rose-600 dark:text-rose-400 pl-6 leading-relaxed">{rejectionDetails}</p>}
        </div>
      )}

      {/* Dual Evaluation Mode Selector Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Evaluation Benchmark Mode
          </h3>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {evaluationSource === 'INSTITUTE' ? 'Sponsored by Coaching Academy' : 'Standard ICAI Public Model'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Public AI Evaluation Option */}
          <button
            type="button"
            onClick={() => setEvaluationSource('PUBLIC')}
            className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
              evaluationSource === 'PUBLIC'
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Public AI Evaluation
              </span>
              {evaluationSource === 'PUBLIC' && (
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Checked against official ICAI MTP, RTP & Suggested Answers. {isInstituteEnrolled ? 'Fully covered by institute evaluation allocation.' : 'Uses personal evaluation credits.'}
            </p>
            <div className="mt-2 text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 rounded px-2 py-0.5 inline-block">
              {isInstituteEnrolled
                ? `Sponsored by ${activeInstitute?.institute_name || 'Institute'} (0 Personal Credits)`
                : user?.hasPermanentFreeAccess
                ? 'Unlimited Access'
                : freeRemaining > 0
                ? `${freeRemaining} Free Left`
                : `${purchasedCredits} Credits Available`}
            </div>
          </button>

          {/* Institute Sponsored Evaluation Option */}
          <button
            type="button"
            onClick={() => {
              if (enrolledInstitutes.length > 0) {
                setEvaluationSource('INSTITUTE');
                if (!selectedInstituteId && enrolledInstitutes[0]) {
                  setSelectedInstituteId(enrolledInstitutes[0].institute_id);
                }
              }
            }}
            disabled={enrolledInstitutes.length === 0}
            className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
              evaluationSource === 'INSTITUTE'
                ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 shadow-xs ring-1 ring-indigo-500/20'
                : enrolledInstitutes.length === 0
                ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Institute Evaluation
              </span>
              {evaluationSource === 'INSTITUTE' && (
                <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Checked against your enrolled coaching academy's custom test papers & approved marking schemes.
            </p>
            <div className="mt-2 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100/60 dark:bg-indigo-900/40 rounded px-2 py-0.5 inline-block">
              {enrolledInstitutes.length > 0
                ? `100% Institute Sponsored (${enrolledInstitutes.length} ${
                    enrolledInstitutes.length === 1 ? 'Academy' : 'Academies'
                  })`
                : 'Not Enrolled in any Academy'}
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Paper & Subject Configuration */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              {evaluationSource === 'INSTITUTE' ? '1. Institute Paper Selection' : '1. Paper Specification'}
            </h3>

            {evaluationSource === 'INSTITUTE' ? (
              <div className="space-y-3.5">
                {/* Institute Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Enrolled Coaching Academy
                  </label>
                  {enrolledInstitutes.length > 0 ? (
                    <select
                      value={selectedInstituteId}
                      onChange={(e) => setSelectedInstituteId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-900 font-medium"
                    >
                      {enrolledInstitutes.map((inst) => (
                        <option key={inst.institute_id} value={inst.institute_id}>
                          {inst.institute_name} {inst.batch_name ? `(${inst.batch_name})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                      You are not currently enrolled in any coaching academy. Please join an institute using an invite code.
                    </div>
                  )}
                </div>

                {/* Test Paper / Material Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Institute Test Paper / Mock Series
                  </label>
                  {instituteMaterials.length > 0 ? (
                    <select
                      value={selectedInstituteMaterialId}
                      onChange={(e) => {
                        setSelectedInstituteMaterialId(e.target.value);
                        const sel = instituteMaterials.find((m) => m.id === e.target.value);
                        if (sel) {
                          if (sel.level) setLevel(sel.level as CALevel);
                          if (sel.subject_key) setSelectedSubjectKey(sel.subject_key);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-900 font-medium"
                    >
                      {instituteMaterials.map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.title} ({mat.level} • {mat.subject_name})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-500 dark:text-slate-400">
                      No test papers uploaded by this institute yet. Please contact your coordinator.
                    </div>
                  )}
                </div>

                {/* Selected Paper Details Preview */}
                {selectedInstituteMaterialId && (
                  <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg text-[11px] space-y-1 text-slate-600 dark:text-slate-300">
                    <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center justify-between">
                      <span>Curriculum: CA {level}</span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded font-bold">
                        Sponsored
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Subject: {currentSubject?.name || 'Selected Paper'}</p>
                    <p className="text-[10px] text-indigo-700 dark:text-indigo-400">Evaluated using verified faculty marking scheme</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Institute Sponsorship info banner for Public Evaluation */}
                {isInstituteEnrolled && (
                  <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-900 dark:text-blue-300 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5 text-blue-900 dark:text-blue-200">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Coaching Institute Sponsorship
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                        0 Personal Credits
                      </span>
                    </div>
                    {enrolledInstitutes.length > 1 ? (
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1 font-medium">Charge Evaluation to Academy:</label>
                        <select
                          value={selectedInstituteId}
                          onChange={(e) => setSelectedInstituteId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 font-medium"
                        >
                          {enrolledInstitutes.map((inst) => (
                            <option key={inst.institute_id} value={inst.institute_id}>
                              {inst.institute_name} {inst.batch_name ? `(${inst.batch_name})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-[11px] text-blue-800 dark:text-blue-300 font-medium">
                        Sponsored by {activeInstitute?.institute_name || enrolledInstitutes[0]?.institute_name}
                      </p>
                    )}
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">
                      Evaluated using official global ICAI papers. Cost is billed to your academy's allocation.
                    </p>
                  </div>
                )}

                {/* Level selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">CA Examination Level</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['FOUNDATION', 'INTERMEDIATE', 'FINAL'] as CALevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLevel(lvl)}
                        className={`py-1.5 px-1 text-xs font-bold rounded-lg border transition text-center cursor-pointer ${
                          level === lvl
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {lvl === 'FOUNDATION' ? 'Foundation' : lvl === 'INTERMEDIATE' ? 'Inter' : 'Final'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Group selection (if Inter or Final) */}
                {level !== 'FOUNDATION' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Group</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'GROUP_1', label: 'Group 1' },
                        { id: 'GROUP_2', label: 'Group 2' },
                        { id: 'ALL', label: 'All Papers' },
                      ].map((grp) => (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => setSelectedGroup(grp.id as 'GROUP_1' | 'GROUP_2' | 'ALL')}
                          className={`py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                            selectedGroup === grp.id
                              ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-600 text-blue-700 dark:text-blue-300'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {grp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subject Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Subject & Paper</label>
                  <select
                    value={selectedSubjectKey}
                    onChange={(e) => setSelectedSubjectKey(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900"
                  >
                    {filteredSubjects.map((subj) => (
                      <option key={subj.id} value={subj.id}>
                        Paper {subj.paperNumber}: {subj.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Paper Type & Attempt */}
                <div className={`grid ${materialType === 'MTP' || materialType === 'PYQ' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'} gap-2.5`}>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Paper Type</label>
                    <select
                      id="evaluation-paper-type-select"
                      value={materialType}
                      onChange={(e) => setMaterialType(e.target.value as MaterialType)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900"
                    >
                      <option value="MTP">MTP (Mock Test Paper)</option>
                      <option value="PYQ">PYQ (Past Year Question Paper)</option>
                      <option value="MODEL_TEST_PAPER">Model Test Paper</option>
                    </select>
                  </div>

                  {materialType === 'MTP' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>MTP Series</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">Required</span>
                      </label>
                      <select
                        id="evaluation-mtp-series-select"
                        value={mtpSeries}
                        onChange={(e) => setMtpSeries(Number(e.target.value) as 1 | 2)}
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 font-semibold text-blue-600 dark:text-blue-400"
                      >
                        <option value={1}>Series 1</option>
                        <option value={2}>Series 2</option>
                      </select>
                    </div>
                  )}

                  {materialType === 'PYQ' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Source Format</span>
                        <span className="text-[10px] text-slate-500 font-medium">Grounding</span>
                      </label>
                      <select
                        id="evaluation-pyq-source-format-select"
                        value={pyqSourceFormat}
                        onChange={(e) => setPyqSourceFormat(e.target.value as 'AUTO' | 'COMBINED' | 'SEPARATE')}
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900"
                      >
                        <option value="AUTO">Auto-detect from Library</option>
                        <option value="SEPARATE">Separate QP & Answers</option>
                        <option value="COMBINED">Combined QP + Answers</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Target Attempt</label>
                    <select
                      id="evaluation-target-attempt-select"
                      value={attempt}
                      onChange={(e) => setAttempt(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900"
                    >
                      {availableAttempts.map((att) => (
                        <option key={att.id} value={att.attemptLabel}>
                          {att.attemptLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Checking Mode */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Evaluator Strictness</span>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">ICAI Standard</span>
              </label>
              <select
                value={checkingMode}
                onChange={(e) => setCheckingMode(e.target.value as CheckingMode)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900"
              >
                <option value="standard">Standard ICAI Marking (Balanced & Realistic)</option>
                <option value="strict">Strict Head Examiner (Conservative on Working Notes)</option>
                <option value="lenient">Moderate Guidance (Emphasizes Partial Step Marks)</option>
              </select>
            </div>

            {/* Reference Material Status Badge */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {checkingMaterial ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Verifying Reference Material...
                </p>
              ) : materialAvailable ? (
                <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-2.5 rounded-lg font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">
                    {evaluationSource === 'INSTITUTE'
                      ? 'Institute Question Paper & Model Answers Loaded'
                      : materialType === 'PYQ' && detectedSourceFormat
                        ? `ICAI PYQ Loaded (${detectedSourceFormat === 'COMBINED' ? 'Combined QP & Answers Document' : 'Separate QP & Suggested Answers'})`
                        : 'ICAI Suggested Answers & Marking Scheme Loaded'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 rounded-lg">
                  <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    {evaluationSource === 'INSTITUTE'
                      ? 'Test material pending upload by academy.'
                      : 'Evaluation material is pending upload for this paper.'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ICAI Exam Rules Highlights */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-300 shadow-sm">
            <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              ICAI Rule Adherence
            </h4>
            <ul className="space-y-1.5 list-disc list-inside text-slate-500 dark:text-slate-400 text-[11px]">
              <li>Step-by-step marking awarded for correct intermediate calculations.</li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200 font-bold">Paper-Specific MCQ Rules:</strong> 0 negative marking for Inter/Final; -0.25 on Foundation QA &amp; Eco.
              </li>
              <li>Working Notes evaluated alongside Main Financial Statements.</li>
              <li>Alternative correct methods and interpretations accepted.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: File Upload Area & Submit */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                2. Upload Handwritten Answer Sheet
              </h3>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">PDF, JPG, PNG (Max 50MB)</span>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition flex flex-col items-center justify-center min-h-[260px] cursor-pointer ${
                dragOver
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40'
                  : file
                  ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30'
                  : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/20'
              }`}
              onClick={() => document.getElementById('answer-sheet-file-input')?.click()}
            >
              <input
                id="answer-sheet-file-input"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processFile(e.target.files[0]);
                  }
                }}
              />

              {file ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white max-w-sm truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for ICAI step-evaluation
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setFileBase64('');
                    }}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:underline inline-block mt-2 font-semibold cursor-pointer"
                  >
                    Remove & choose another file
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center mx-auto">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Drag & drop your handwritten CA answer sheet here
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">or click to browse from your computer or phone</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Admit cards, certificates & blank documents are rejected automatically</span>
                  </div>
                </div>
              )}
            </div>

            {/* Material Unavailable Alert */}
            {!materialAvailable && !checkingMaterial && (
              <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-900 dark:text-rose-200">Evaluation Material Not Uploaded Yet</p>
                  <p className="mt-0.5 leading-relaxed">
                    Evaluation material is not available for the selected paper and attempt yet. Please try again once the required material has been uploaded.
                  </p>
                </div>
              </div>
            )}

            {/* Action CTA Button */}
            <div className="pt-2">
              <button
                id="start-evaluation-btn"
                onClick={handleStartEvaluation}
                disabled={evalStep !== 'IDLE' || !file || !materialAvailable || checkingMaterial}
                className={`w-full py-3.5 px-6 rounded-lg text-white font-bold text-sm sm:text-base transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                  evaluationSource === 'INSTITUTE'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {evalStep !== 'IDLE' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Evaluating Answer Sheet...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {evaluationSource === 'INSTITUTE'
                        ? 'Start Institute Evaluation (0 Credits)'
                        : 'Start ICAI Step Evaluation'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
