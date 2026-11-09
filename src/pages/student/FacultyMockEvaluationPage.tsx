import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest, downloadAuthenticatedFile } from '../../api/client.js';
import { DisclaimerModal } from '../../components/student/DisclaimerModal.js';
import { Download, UploadCloud, CheckCircle2, AlertCircle, RefreshCw, GraduationCap, BookOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import { CALevel, CheckingMode } from '../../types/index.js';
import { loadRazorpayScript } from '../../utils/loadRazorpay.js';

type Faculty = { id: string; name: string; description?: string | null; attempts: string[] };
type FacultyMockTest = {
  id: string; faculty_id: string; faculty_name: string; course_level: CALevel; attempt: string;
  model_group?: string | null; subject_key: string; subject_name: string; paper: string;
  mock_number: number; title: string; maximum_marks: number; syllabus_version: string;
  question_paper_file_name: string; access_type?: 'FREE' | 'PAID'; unlock_price_inr?: number;
};

interface FacultyMockRazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

type FacultyMockProgressStage = { key: string; label: string; description: string };

const FACULTY_MOCK_PROGRESS_STAGES: FacultyMockProgressStage[] = [
  { key: 'QUEUED', label: 'Submission received & queued', description: 'Your answer sheet is securely registered for checking.' },
  { key: 'READING_ANSWER_SHEET', label: 'Reading handwritten answers', description: 'Reading pages, calculations, tables and handwritten working notes.' },
  { key: 'IDENTIFYING_QUESTIONS', label: 'Matching questions and sub-parts', description: 'Mapping attempted answers to the exact faculty mock paper structure.' },
  { key: 'EVALUATING_ANSWERS', label: 'Step-wise answer evaluation', description: 'Checking concepts, workings, provisions and conclusions against the faculty reference.' },
  { key: 'CALCULATING_MARKS', label: 'Verifying marks and totals', description: 'Checking step allocations, question maximums and total marks.' },
  { key: 'FINALIZING_REPORT', label: 'Preparing your checked report', description: 'Finalizing examiner remarks, checked copy and diagnostic feedback.' },
  { key: 'COMPLETED', label: 'Evaluation verified', description: 'Your evaluation is complete. Opening your report.' },
];

function normaliseCourse(value: unknown): CALevel | null {
  const normal = String(value || '').trim().toUpperCase();
  return normal === 'FOUNDATION' || normal === 'INTERMEDIATE' || normal === 'FINAL' ? normal : null;
}

export const FacultyMockEvaluationPage: React.FC = () => {
  const { user, profile, refreshUser } = useAuth();
  const navigate = useNavigate();
  const activeEvaluationStorageKey = user?.id ? `faculty_mock_active_eval_${user.id}` : null;
  const activeEvaluationStartStorageKey = user?.id ? `faculty_mock_active_eval_started_${user.id}` : null;
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [tests, setTests] = useState<FacultyMockTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [facultyId, setFacultyId] = useState('');
  const [attempt, setAttempt] = useState('');
  const [subjectKey, setSubjectKey] = useState('');
  const [testId, setTestId] = useState('');
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unlockingMock, setUnlockingMock] = useState(false);
  const [checkingDisclaimer, setCheckingDisclaimer] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [checkingMode, setCheckingMode] = useState<CheckingMode>('standard');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeEvaluationId, setActiveEvaluationId] = useState<string | null>(null);
  const [evaluationProgressStage, setEvaluationProgressStage] = useState('QUEUED');
  const [evaluationProgressPercentage, setEvaluationProgressPercentage] = useState(5);
  const [evaluationProgressMessage, setEvaluationProgressMessage] = useState('Your answer sheet is securely registered for checking.');
  const [evaluationStartedAt, setEvaluationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const courseLevel = normaliseCourse((profile as any)?.ca_level ?? (profile as any)?.caLevel);
  const selectedFaculty = faculties.find((item) => item.id === facultyId);
  const availableAttempts = useMemo(() => selectedFaculty?.attempts || [], [selectedFaculty]);
  const facultyTests = useMemo(() => tests.filter((item) => item.faculty_id === facultyId), [tests, facultyId]);
  const attemptTests = useMemo(() => facultyTests.filter((item) => item.attempt === attempt), [facultyTests, attempt]);
  const subjects = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of attemptTests) unique.set(item.subject_key, item.subject_name);
    return [...unique.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [attemptTests]);
  const subjectTests = useMemo(() => attemptTests.filter((item) => item.subject_key === subjectKey), [attemptTests, subjectKey]);
  const selectedTest = tests.find((item) => item.id === testId) || null;

  const loadCatalogue = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest<{ courseLevel: string; faculties: Faculty[]; tests: FacultyMockTest[] }>('/api/student/faculty-mocks/catalogue');
      setFaculties(response.faculties || []);
      setTests(response.tests || []);
      setFacultyId((current) => response.faculties?.some((f) => f.id === current) ? current : response.faculties?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Faculty mock catalogue could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCatalogue(); }, [user?.id]);

  // Resume this student's own Faculty Mock evaluation after a refresh.
  useEffect(() => {
    // Clear any previous account's progress before restoring the current account's job.
    setActiveEvaluationId(null);
    setEvaluationStartedAt(null);
    setElapsedSeconds(0);
    setSubmitting(false);
    if (!activeEvaluationStorageKey || !activeEvaluationStartStorageKey) return;
    const savedId = localStorage.getItem(activeEvaluationStorageKey);
    if (!savedId) return;
    const savedStart = Number(localStorage.getItem(activeEvaluationStartStorageKey) || Date.now());
    setActiveEvaluationId(savedId);
    setEvaluationStartedAt(Number.isFinite(savedStart) ? savedStart : Date.now());
    setEvaluationProgressStage('QUEUED');
    setEvaluationProgressPercentage(5);
    setEvaluationProgressMessage('Reconnecting to your evaluation progress…');
  }, [user?.id, activeEvaluationStorageKey, activeEvaluationStartStorageKey]);

  useEffect(() => {
    if (!activeEvaluationId || !evaluationStartedAt) return;
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - evaluationStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [activeEvaluationId, evaluationStartedAt]);

  // Read authoritative backend stages rather than simulating completion.
  useEffect(() => {
    if (!activeEvaluationId || !user?.id) return;
    let subscribed = true;
    let handledTerminalState = false;
    const clearSavedEvaluation = () => {
      if (activeEvaluationStorageKey) localStorage.removeItem(activeEvaluationStorageKey);
      if (activeEvaluationStartStorageKey) localStorage.removeItem(activeEvaluationStartStorageKey);
    };
    const pollEvaluation = async () => {
      if (!subscribed || handledTerminalState) return;
      try {
        const response = await apiRequest<{ evaluation: {
          id: string; displayId?: string; display_id?: string; status: string;
          progress_stage?: string; progress_percentage?: number; progress_message?: string;
          resultJson?: unknown; rejection_reason?: string; error_message?: string;
        } }>(`/api/student/evaluations/${encodeURIComponent(activeEvaluationId)}`);
        if (!subscribed || !response.evaluation) return;
        const evaluation = response.evaluation;
        const status = String(evaluation.status || '').toUpperCase();
        const backendStage = String(evaluation.progress_stage || '').toUpperCase();
        setEvaluationProgressStage(status === 'COMPLETED' ? 'COMPLETED' : status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : backendStage || 'QUEUED');
        setEvaluationProgressPercentage(Math.max(0, Math.min(100, Number(evaluation.progress_percentage ?? 5))));
        setEvaluationProgressMessage(String(evaluation.progress_message || 'Your answer sheet is being evaluated.'));

        if (['COMPLETED', 'NEEDS_REVIEW'].includes(status)) {
          handledTerminalState = true;
          clearSavedEvaluation();
          setEvaluationProgressPercentage(100);
          setEvaluationProgressStage(status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'COMPLETED');
          setActiveEvaluationId(null);
          setSubmitting(false);
          try {
            await refreshUser();
          } catch (refreshError) {
            console.warn('[FacultyMock] Could not refresh student credits after evaluation:', refreshError);
          }
          if (!subscribed) return;
          const reportId = evaluation.displayId || evaluation.display_id || evaluation.id || activeEvaluationId;
          navigate(`/student/evaluations/${encodeURIComponent(reportId)}`);
          return;
        }

        if (['FAILED', 'REJECTED', 'PERSISTENCE_FAILED', 'CANCELLED'].includes(status)) {
          handledTerminalState = true;
          clearSavedEvaluation();
          setActiveEvaluationId(null);
          setSubmitting(false);
          setError(evaluation.rejection_reason || evaluation.error_message || 'Evaluation could not be completed. Your submission status is available in My Evaluations.');
        }
      } catch (pollError) {
        console.warn('[FacultyMock] Evaluation progress polling failed; will retry:', pollError);
      }
    };
    void pollEvaluation();
    const interval = window.setInterval(() => { void pollEvaluation(); }, 3000);
    return () => {
      subscribed = false;
      window.clearInterval(interval);
    };
  }, [activeEvaluationId, user?.id, activeEvaluationStorageKey, activeEvaluationStartStorageKey, navigate, refreshUser]);

  useEffect(() => {
    if (!availableAttempts.includes(attempt)) setAttempt(availableAttempts[0] || '');
  }, [facultyId, availableAttempts]);

  useEffect(() => {
    if (!subjects.some((item) => item.key === subjectKey)) setSubjectKey(subjects[0]?.key || '');
  }, [attempt, subjects]);

  useEffect(() => {
    if (!subjectTests.some((item) => item.id === testId)) setTestId(subjectTests[0]?.id || '');
  }, [subjectKey, subjectTests]);

  const selectAnswerFile = async (file?: File) => {
    setError('');
    setSuccess('');
    setAnswerFile(null);
    setFileBase64('');
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = ['image/jpeg', 'image/png'].includes(file.type);
    if (!isPdf && !isImage) {
      setError('Upload your handwritten answer sheet as PDF, JPG or PNG.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Answer sheet exceeds 50 MB. Please compress it and try again.');
      return;
    }
    setLoadingFile(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read your answer sheet.'));
        reader.readAsDataURL(file);
      });
        setAnswerFile(file);
      setFileBase64(base64);
      setSuccess('Answer sheet is ready to submit.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the selected file.');
    } finally {
      setLoadingFile(false);
    }
  };

  const startMockCopyPayment = async (
    onPaymentVerified: (orderId: string) => Promise<void>,
    purpose: 'DOWNLOAD' | 'EVALUATION',
  ) => {
    if (!selectedTest || !user) return;
    setUnlockingMock(true);
    let checkoutOpened = false;
    try {
      const response = await apiRequest<{
        success: boolean;
        isConfigured: boolean;
        keyId: string;
        order: {
          orderId: string;
          razorpayOrderId: string;
          amountPaise: number;
          amountINR: number;
          currency: string;
          keyId: string;
          description: string;
        };
      }>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ purchaseType: 'FACULTY_MOCK_COPY', facultyMockTestId: selectedTest.id }),
      });

      if (!response.isConfigured) {
        throw new Error('Razorpay is not configured for live payments. Please contact the administrator.');
      }
      if (!window.Razorpay) {
        const loaded = await loadRazorpayScript();
        if (!loaded || !window.Razorpay) {
          throw new Error('Razorpay checkout could not be loaded. Check your internet connection and retry.');
        }
      }

      const order = response.order;
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'EXAM CHECKER AI',
        description: order.description || (purpose === 'DOWNLOAD' ? 'Faculty Mock Paper Unlock' : 'Faculty Mock Evaluation Copy'),
        order_id: order.razorpayOrderId,
        prefill: {
          name: user.fullName || '',
          email: user.email || '',
          contact: (profile as any)?.phone || '',
        },
        theme: { color: '#2563eb' },
        modal: {
          ondismiss: () => setUnlockingMock(false),
        },
        handler: async (payment: FacultyMockRazorpayResponse) => {
          try {
            await apiRequest('/api/payments/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpayOrderId: payment.razorpay_order_id,
                razorpayPaymentId: payment.razorpay_payment_id,
                razorpaySignature: payment.razorpay_signature,
              }),
            });
            setSuccess(purpose === 'DOWNLOAD'
              ? 'Payment verified. Your paper is now unlocked.'
              : 'Payment verified. Starting your evaluation…');
            await onPaymentVerified(order.orderId);
          } catch (paymentError) {
            setError(paymentError instanceof Error ? paymentError.message : 'Payment verification or Faculty Mock unlock failed.');
          } finally {
            setUnlockingMock(false);
          }
        },
      });
      checkout.open();
      checkoutOpened = true;
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Could not start Faculty Mock payment.');
    } finally {
      if (!checkoutOpened) setUnlockingMock(false);
    }
  };

  const downloadQuestionPaper = async (afterPayment = false) => {
    if (!selectedTest) return;
    setError('');
    try {
      await downloadAuthenticatedFile(
        `/api/student/faculty-mocks/tests/${selectedTest.id}/question-paper`,
        { filename: selectedTest.question_paper_file_name || `${selectedTest.faculty_name}_Mock_${selectedTest.mock_number}_Question_Paper.pdf` }
      );
      if (afterPayment) setSuccess('Question Paper downloaded. Upload your answer sheet when ready.');
    } catch (err) {
      const apiError = err as Error & { code?: string };
      if (!afterPayment && selectedTest.access_type === 'PAID' && apiError?.code === 'FACULTY_MOCK_PAYMENT_REQUIRED') {
        await startMockCopyPayment(() => downloadQuestionPaper(true), 'DOWNLOAD');
        return;
      }
      setError(err instanceof Error ? err.message : 'Question Paper download failed.');
    }
  };

  const submitAnswerSheet = async (facultyMockPaymentOrderId?: string) => {
    if (!selectedTest || !answerFile || !fileBase64 || !user?.id) {
      setError('Select a mock test and upload your handwritten answer sheet first.');
      return;
    }
    if (activeEvaluationId) {
      setError('One Faculty Mock evaluation is already in progress. You can continue tracking it here.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    let submissionEvaluationId: string | null = null;
    try {
      const evaluationId = `eval_faculty_mock_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
      submissionEvaluationId = evaluationId;
      const response = await apiRequest<{
        success: boolean; evaluationId: string; displayId?: string; status?: string;
        progressStage?: string; progressPercentage?: number; message?: string; result?: unknown;
      }>('/api/student/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          evaluationId,
          studentName: user.fullName,
          icaiRegistrationNumber: (profile as any)?.icai_registration_number || 'N/A',
          level: selectedTest.course_level,
          materialType: 'FACULTY_MOCK_TEST',
          modelGroup: selectedTest.model_group || undefined,
          subjectKey: selectedTest.subject_key,
          subjectName: selectedTest.subject_name,
          paper: selectedTest.paper,
          attempt: selectedTest.attempt,
          checkingMode,
          fileBase64,
          mimeType: answerFile.type || 'application/pdf',
          filename: answerFile.name,
          evaluationSource: 'FACULTY_MOCK',
          facultyMockTestId: selectedTest.id,
          ...(facultyMockPaymentOrderId ? { facultyMockPaymentOrderId } : {}),
        }),
      });
      const acceptedEvaluationId = response.evaluationId || evaluationId;
      if (response.result) {
        await refreshUser();
        const reportId = response.displayId || acceptedEvaluationId;
        navigate(`/student/evaluations/${encodeURIComponent(reportId)}`);
        return;
      }
      if (!acceptedEvaluationId) throw new Error('Evaluation was accepted but no report ID was returned. Check My Evaluations.');
      const startedAt = Date.now();
      if (activeEvaluationStorageKey) localStorage.setItem(activeEvaluationStorageKey, acceptedEvaluationId);
      if (activeEvaluationStartStorageKey) localStorage.setItem(activeEvaluationStartStorageKey, String(startedAt));
      setEvaluationStartedAt(startedAt);
      setElapsedSeconds(0);
      setEvaluationProgressStage(response.progressStage || 'QUEUED');
      setEvaluationProgressPercentage(Number(response.progressPercentage ?? 5));
      setEvaluationProgressMessage(response.message || 'Your answer sheet has been securely queued for checking.');
      setActiveEvaluationId(acceptedEvaluationId);
      setSuccess('Answer sheet submitted successfully. You can track each evaluation stage below.');
    } catch (err) {
      const apiError = err as Error & { code?: string; data?: any };
      if (!facultyMockPaymentOrderId && ['FACULTY_MOCK_REPEAT_PAYMENT_REQUIRED', 'FACULTY_MOCK_PAYMENT_REQUIRED'].includes(String(apiError?.code || ''))) {
        setError(selectedTest.access_type === 'PAID'
          ? `This is a paid faculty mock. Pay ₹${selectedTest.unlock_price_inr || 35} to unlock this evaluation.`
          : `Your free copy has already been used. Pay ₹${selectedTest.unlock_price_inr || 35} to evaluate this mock again.`);
        await startRepeatCopyPayment();
      } else {
        // A network timeout may happen after the server has already accepted the job.
        // Verify before asking the student to submit again, preventing duplicate copies.
        let recovered = false;
        if (submissionEvaluationId) {
          try {
            const verify = await apiRequest<{ evaluation?: {
              id: string; status: string; progress_stage?: string;
              progress_percentage?: number; progress_message?: string;
            } }>(`/api/student/evaluations/${encodeURIComponent(submissionEvaluationId)}`);
            const evaluation = verify.evaluation;
            const status = String(evaluation?.status || '').toUpperCase();
            if (evaluation && !['FAILED', 'REJECTED', 'PERSISTENCE_FAILED', 'CANCELLED'].includes(status)) {
              const startedAt = Date.now();
              if (activeEvaluationStorageKey) localStorage.setItem(activeEvaluationStorageKey, submissionEvaluationId);
              if (activeEvaluationStartStorageKey) localStorage.setItem(activeEvaluationStartStorageKey, String(startedAt));
              setEvaluationStartedAt(startedAt);
              setEvaluationProgressStage(evaluation.progress_stage || 'QUEUED');
              setEvaluationProgressPercentage(Number(evaluation.progress_percentage ?? 5));
              setEvaluationProgressMessage(evaluation.progress_message || 'Submission accepted. Reconnecting to live progress…');
              setActiveEvaluationId(submissionEvaluationId);
              setSuccess('The server accepted your answer sheet. Live evaluation tracking has been restored.');
              recovered = true;
            }
          } catch {
            // Keep the original submission error when the job cannot be verified.
          }
        }
        if (!recovered) setError(err instanceof Error ? err.message : 'Faculty mock submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startRepeatCopyPayment = async () => {
    await startMockCopyPayment(
      (orderId) => submitAnswerSheet(orderId),
      'EVALUATION',
    );
  };

  const handleSubmitClick = async () => {
    if (activeEvaluationId) {
      setError('Your previous Faculty Mock evaluation is still in progress. Track it below before starting another.');
      return;
    }
    if (!selectedTest || !answerFile) {
      setError('Choose a faculty mock and upload your handwritten answer sheet.');
      return;
    }
    setCheckingDisclaimer(true);
    setError('');
    try {
      const status = await apiRequest<{ acknowledged: boolean; currentVersion: string }>('/api/student/disclaimer/status');
      if (!status.acknowledged) setShowDisclaimer(true);
      else await submitAnswerSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify your evaluation disclaimer.');
    } finally {
      setCheckingDisclaimer(false);
    }
  };

  if (!courseLevel) {
    return <div className="mx-auto max-w-3xl p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Complete your CA course profile and ICAI registration details before attempting faculty mock tests.</div></div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 text-slate-800 dark:text-slate-100">
      <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950 to-blue-950 p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-200"><GraduationCap className="h-4 w-4" />Faculty Mock Evaluation</div>
        <h1 className="mt-2 text-xl font-black sm:text-2xl">Practice faculty mock papers</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">Choose a faculty, attempt, subject and numbered mock. Download the Question Paper, write your answers by hand, then submit the scanned answer sheet for AI evaluation against the faculty's uploaded Suggested Answer and marking reference.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200">First copy of each mock is free</span>
          <span className="rounded-full border border-blue-300/30 bg-blue-400/10 px-2.5 py-1 text-[10px] font-bold text-blue-100">Repeat copy: ₹35</span>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" />{success}</div>}

      {activeEvaluationId && (
                      <div className="mt-5 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white shadow-lg sm:p-5" aria-live="polite">
                        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-200">
                              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-300 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-300" /></span>
                              Live evaluation progress
                            </div>
                            <h3 className="mt-2 text-base font-black text-white">Your Faculty Mock is being checked</h3>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">You can stay on this page while each stage is completed. Your report opens automatically when ready.</p>
                          </div>
                          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                            <div className="text-xl font-black tabular-nums text-white">{Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:{(elapsedSeconds % 60).toString().padStart(2, '0')}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Elapsed</div>
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between gap-3 text-[10px]">
                            <span className="font-semibold text-slate-300">{evaluationProgressMessage}</span>
                            <span className="shrink-0 font-black tabular-nums text-indigo-200">{evaluationProgressPercentage}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 transition-all duration-700" style={{ width: evaluationProgressPercentage + '%' }} />
                          </div>
                        </div>
                        <div className="mt-5 space-y-3">
                          {FACULTY_MOCK_PROGRESS_STAGES.map((stage, index) => {
                            const resolvedStage = evaluationProgressStage === 'NEEDS_REVIEW' ? 'COMPLETED' : evaluationProgressStage;
                            const foundIndex = FACULTY_MOCK_PROGRESS_STAGES.findIndex((item) => item.key === resolvedStage);
                            const currentIndex = foundIndex < 0 ? 0 : foundIndex;
                            const complete = currentIndex > index || (stage.key === 'COMPLETED' && ['COMPLETED', 'NEEDS_REVIEW'].includes(evaluationProgressStage));
                            const current = currentIndex === index && !complete;
                            return (
                              <div key={stage.key} className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                                  {complete ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : current ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" /> : <span className="h-3 w-3 rounded-full border border-slate-600" />}
                                </div>
                                <div className="min-w-0">
                                  <div className={complete ? 'text-[11px] font-semibold text-emerald-200' : current ? 'text-[11px] font-black text-indigo-200' : 'text-[11px] font-medium text-slate-500'}>{stage.label}</div>
                                  <p className={current ? 'mt-0.5 text-[10px] leading-relaxed text-slate-300' : 'mt-0.5 text-[10px] leading-relaxed text-slate-500'}>{stage.description}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {elapsedSeconds > 180 && <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[10px] leading-relaxed text-amber-100">This answer sheet is taking longer than usual. Your evaluation remains saved and the status will keep updating.</p>}
                        <div className="mt-4 border-t border-white/10 pt-3 text-[10px] text-slate-400">Your evaluation continues securely in the background if you move to another page. It will remain available in My Evaluations.</div>
                      </div>
                    )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading available faculty mocks…</div>
      ) : !faculties.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 text-base font-bold text-slate-800">No faculty mocks published yet</h2>
          <p className="mt-1 text-xs text-slate-500">New faculty mock tests for {courseLevel} will appear here after the Admin publishes them.</p>
          <button type="button" onClick={() => void loadCatalogue()} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-700">Refresh catalogue</button>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-indigo-500 dark:text-indigo-300">Your practice workspace</p><h2 className="mt-1 text-sm font-bold">Select your mock test</h2></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">{courseLevel}</span></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Faculty
                <select value={facultyId} onChange={(e) => { setFacultyId(e.target.value); setTestId(''); }} disabled={!!activeEvaluationId} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm font-medium text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20">
                  {faculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Exam Attempt
                <select value={attempt} onChange={(e) => { setAttempt(e.target.value); setTestId(''); }} disabled={!!activeEvaluationId} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm font-medium text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20">
                  {availableAttempts.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Subject
                <select value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); setTestId(''); }} disabled={!!activeEvaluationId} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm font-medium text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20">
                  {subjects.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mock Number
                <select value={testId} onChange={(e) => setTestId(e.target.value)} disabled={!!activeEvaluationId} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm font-medium text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20">
                  {subjectTests.map((item) => <option key={item.id} value={item.id}>Mock {String(item.mock_number).padStart(2, '0')} — {item.title} ({String(item.access_type || 'FREE').toUpperCase() === 'PAID' ? `Unlock ₹${item.unlock_price_inr || 35}` : 'Free first copy'})</option>)}
                </select>
              </label>
            </div>
            {!subjectTests.length && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">No published mocks for this faculty, attempt and subject yet. Choose another filter.</p>}

            {selectedTest && (
              <div className="relative mt-5 overflow-hidden rounded-2xl border border-indigo-300/20 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-4 text-white shadow-lg shadow-indigo-950/20 sm:p-5">
                <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-indigo-200">
                      <GraduationCap className="h-3.5 w-3.5" /> {selectedTest.faculty_name} <span className="text-indigo-300/60">·</span> {selectedTest.attempt}
                    </div>
                    <h3 className="mt-3 text-lg font-black tracking-tight text-white sm:text-xl">{selectedTest.title}</h3>
                    <p className="mt-1.5 text-xs text-slate-300">{selectedTest.subject_name} <span className="mx-1 text-slate-500">·</span> {selectedTest.paper} <span className="mx-1 text-slate-500">·</span> {selectedTest.maximum_marks} marks</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 font-mono text-sm font-black tracking-wide text-white">MOCK {String(selectedTest.mock_number).padStart(2, '0')}</span>
                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-black tracking-wide ${String(selectedTest.access_type || 'FREE').toUpperCase() === 'PAID' ? 'bg-amber-300 text-amber-950' : 'bg-emerald-300 text-emerald-950'}`}>
                      {String(selectedTest.access_type || 'FREE').toUpperCase() === 'PAID' ? `PAID · ₹${selectedTest.unlock_price_inr || 35}` : 'FREE'}
                    </span>
                  </div>
                </div>
                <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div className="flex items-center gap-2 text-[10px] text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Faculty reference remains the scoring authority</div>
                  <button type="button" disabled={unlockingMock || !!activeEvaluationId} onClick={() => void downloadQuestionPaper()} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />{unlockingMock ? 'Unlocking…' : selectedTest.access_type === 'PAID' ? `Unlock ₹${selectedTest.unlock_price_inr || 35} & Download Paper` : 'Download Question Paper'}</button>
                </div>
              </div>
            )}
          </section>

          {selectedTest && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <h2 className="text-sm font-bold">Upload handwritten answer sheet</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Write the selected paper by hand, scan all pages into one PDF (or upload JPG/PNG pages), then submit. The AI checker will use this exact mock's Suggested Answer and marking reference.</p>
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-300" />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-200">Checking preferences</span>
                  </div>
                  <label htmlFor="faculty-mock-checking-mode" className="mt-4 block text-xs font-bold text-slate-100">Evaluation strictness</label>
                  <select
                    id="faculty-mock-checking-mode"
                    value={checkingMode}
                    onChange={(event) => setCheckingMode(event.target.value as CheckingMode)}
                    disabled={submitting || checkingDisclaimer || !!activeEvaluationId}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="standard">Standard ICAI Marking</option>
                    <option value="strict">Strict Head Examiner</option>
                    <option value="lenient">Moderate Guidance</option>
                  </select>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                    This changes the checking approach only. The faculty's answer key, marking scheme and maximum marks remain authoritative.
                  </p>
                  <div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-3 py-2.5 text-[10px] leading-relaxed text-emerald-100/90">
                    Your mock is evaluated against its own uploaded Question Paper, Suggested Answers and Marking Scheme.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <UploadCloud className="h-4 w-4 text-indigo-300" />
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-200">Your answer sheet</span>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[9px] font-bold text-slate-300">MAX 50 MB</span>
                  </div>
                  <label className="mt-4 flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-950/70 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-950/40">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-400/10">
                      <UploadCloud className="h-6 w-6 text-indigo-300" />
                    </span>
                    <span className="mt-3 max-w-full break-all text-sm font-bold text-slate-100">{answerFile?.name || 'Choose your scanned answer sheet'}</span>
                    <span className="mt-1 text-[10px] text-slate-400">{answerFile ? (answerFile.size / 1024 / 1024).toFixed(2) + ' MB selected' : 'PDF, JPG or PNG · all pages in one PDF is recommended'}</span>
                    <input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" disabled={submitting || !!activeEvaluationId} onChange={(e) => { void selectAnswerFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                  </label>
                  {loadingFile && <p className="mt-2 text-xs text-indigo-300">Reading and preparing your answer sheet…</p>}
                  {answerFile && !loadingFile && !activeEvaluationId && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Ready to submit</p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{String(selectedTest.access_type || 'FREE').toUpperCase() === 'PAID' ? `This mock requires ₹${selectedTest.unlock_price_inr || 35} per evaluation. Payment unlocks one copy and does not use general evaluation credits.` : `First copy is free for each student. Further copies cost ₹${selectedTest.unlock_price_inr || 35} each and do not use general evaluation credits.`}</span>
                </div>
                <button type="button" disabled={!answerFile || !fileBase64 || submitting || loadingFile || checkingDisclaimer || !!activeEvaluationId} onClick={() => void handleSubmitClick()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-xs font-black text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting || checkingDisclaimer ? <RefreshCw className="h-4 w-4 animate-spin" /> : activeEvaluationId ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  {activeEvaluationId ? 'Evaluation in progress' : submitting ? 'Submitting answer sheet…' : checkingDisclaimer ? 'Checking disclaimer…' : selectedTest.access_type === 'PAID' ? `Unlock ₹${selectedTest.unlock_price_inr || 35} & Submit` : 'Submit for AI Evaluation'}
                </button>
              </div>


            </section>
          )}
        </>
      )}

      <DisclaimerModal
        isOpen={showDisclaimer}
        disclaimerVersion="v1.0"
        onAcknowledged={() => { setShowDisclaimer(false); void submitAnswerSheet(); }}
      />
    </div>
  );
};

export default FacultyMockEvaluationPage;
