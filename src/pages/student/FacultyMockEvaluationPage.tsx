import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest, downloadAuthenticatedFile } from '../../api/client.js';
import { DisclaimerModal } from '../../components/student/DisclaimerModal.js';
import { Download, UploadCloud, CheckCircle2, AlertCircle, RefreshCw, GraduationCap, BookOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import { CALevel } from '../../types/index.js';
import { loadRazorpayScript } from '../../utils/loadRazorpay.js';

type Faculty = { id: string; name: string; description?: string | null; attempts: string[] };
type FacultyMockTest = {
  id: string; faculty_id: string; faculty_name: string; course_level: CALevel; attempt: string;
  model_group?: string | null; subject_key: string; subject_name: string; paper: string;
  mock_number: number; title: string; maximum_marks: number; syllabus_version: string;
  question_paper_file_name: string;
};

interface FacultyMockRazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

function normaliseCourse(value: unknown): CALevel | null {
  const normal = String(value || '').trim().toUpperCase();
  return normal === 'FOUNDATION' || normal === 'INTERMEDIATE' || normal === 'FINAL' ? normal : null;
}

export const FacultyMockEvaluationPage: React.FC = () => {
  const { user, profile, refreshUser } = useAuth();
  const navigate = useNavigate();
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
  const [checkingDisclaimer, setCheckingDisclaimer] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const downloadQuestionPaper = async () => {
    if (!selectedTest) return;
    setError('');
    try {
      await downloadAuthenticatedFile(
        `/api/student/faculty-mocks/tests/${selectedTest.id}/question-paper`,
        { filename: selectedTest.question_paper_file_name || `${selectedTest.faculty_name}_Mock_${selectedTest.mock_number}_Question_Paper.pdf` }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Question Paper download failed.');
    }
  };

  const submitAnswerSheet = async (facultyMockPaymentOrderId?: string) => {
    if (!selectedTest || !answerFile || !fileBase64 || !user?.id) {
      setError('Select a mock test and upload your handwritten answer sheet first.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const evaluationId = `eval_faculty_mock_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
      const response = await apiRequest<{
        success: boolean; evaluationId: string; displayId?: string; status?: string;
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
          checkingMode: 'standard',
          fileBase64,
          mimeType: answerFile.type || 'application/pdf',
          filename: answerFile.name,
          evaluationSource: 'FACULTY_MOCK',
          facultyMockTestId: selectedTest.id,
          ...(facultyMockPaymentOrderId ? { facultyMockPaymentOrderId } : {}),
        }),
      });
      await refreshUser();
      const reportId = response.displayId || response.evaluationId;
      if (!reportId) throw new Error('Evaluation was accepted but no report ID was returned. Check My Evaluations.');
      navigate(`/student/evaluations/${encodeURIComponent(reportId)}`);
    } catch (err) {
      const apiError = err as Error & { code?: string; data?: any };
      if (!facultyMockPaymentOrderId && apiError?.code === 'FACULTY_MOCK_REPEAT_PAYMENT_REQUIRED') {
        setError('First copy already used. Complete the one-copy payment to evaluate this mock again.');
        await startRepeatCopyPayment();
      } else {
        setError(err instanceof Error ? err.message : 'Faculty mock submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startRepeatCopyPayment = async () => {
    if (!selectedTest || !user) return;
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
        setError('Razorpay is not configured for live payments. Please contact the administrator.');
        return;
      }
      if (!window.Razorpay) {
        const loaded = await loadRazorpayScript();
        if (!loaded || !window.Razorpay) {
          setError('Razorpay checkout could not be loaded. Check your internet connection and retry.');
          return;
        }
      }

      const order = response.order;
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'CA Exam Checker AI',
        description: order.description || 'Faculty Mock Repeat Copy',
        order_id: order.razorpayOrderId,
        prefill: {
          name: user.fullName || '',
          email: user.email || '',
          contact: (profile as any)?.phone || '',
        },
        theme: { color: '#2563eb' },
        modal: {
          ondismiss: () => setSubmitting(false),
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
            setSuccess('Payment verified. Starting your repeat-copy evaluation…');
            await submitAnswerSheet(order.orderId);
          } catch (paymentError) {
            setError(paymentError instanceof Error ? paymentError.message : 'Payment verification or evaluation submission failed.');
            setSubmitting(false);
          }
        },
      });
      checkout.open();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Could not start Faculty Mock repeat-copy payment.');
      setSubmitting(false);
    }
  };

  const handleSubmitClick = async () => {
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
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-bold">Select your mock test</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{courseLevel}</span></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Faculty
                <select value={facultyId} onChange={(e) => { setFacultyId(e.target.value); setTestId(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                  {faculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Exam Attempt
                <select value={attempt} onChange={(e) => { setAttempt(e.target.value); setTestId(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                  {availableAttempts.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Subject
                <select value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); setTestId(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                  {subjects.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mock Number
                <select value={testId} onChange={(e) => setTestId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                  {subjectTests.map((item) => <option key={item.id} value={item.id}>Mock {String(item.mock_number).padStart(2, '0')} — {item.title}</option>)}
                </select>
              </label>
            </div>
            {!subjectTests.length && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">No published mocks for this faculty, attempt and subject yet. Choose another filter.</p>}

            {selectedTest && (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{selectedTest.faculty_name} · {selectedTest.attempt}</div>
                    <h3 className="mt-1 text-base font-black text-slate-900">{selectedTest.title}</h3>
                    <p className="mt-1 text-xs text-slate-600">{selectedTest.subject_name} · {selectedTest.paper} · {selectedTest.maximum_marks} marks</p>
                  </div>
                  <span className="rounded-lg bg-indigo-600 px-3 py-2 font-mono text-sm font-black text-white">MOCK {String(selectedTest.mock_number).padStart(2, '0')}</span>
                </div>
                <button type="button" onClick={() => void downloadQuestionPaper()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Download className="h-4 w-4" />Download Question Paper</button>
              </div>
            )}
          </section>

          {selectedTest && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <h2 className="text-sm font-bold">Upload handwritten answer sheet</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Write the selected paper by hand, scan all pages into one PDF (or upload JPG/PNG pages), then submit. The AI checker will use this exact mock's Suggested Answer and marking reference.</p>
              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center transition hover:border-blue-400 hover:bg-blue-50/50">
                <UploadCloud className="h-7 w-7 text-blue-600" />
                <span className="mt-2 text-sm font-bold text-slate-800">{answerFile?.name || 'Choose answer sheet PDF / image'}</span>
                <span className="mt-1 text-[10px] text-slate-500">{answerFile ? `${(answerFile.size / 1024 / 1024).toFixed(2)} MB selected` : 'PDF, JPG or PNG · up to 50 MB'}</span>
                <input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => { void selectAnswerFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              </label>
              {loadingFile && <p className="mt-2 text-xs text-blue-600">Reading your answer sheet…</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />One free copy per student for this exact faculty mock. Further copies cost ₹35 each and do not use your general evaluation credits.</div>
                <button type="button" disabled={!answerFile || !fileBase64 || submitting || loadingFile || checkingDisclaimer} onClick={() => void handleSubmitClick()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting || checkingDisclaimer ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {submitting ? 'Submitting…' : checkingDisclaimer ? 'Checking…' : 'Submit for AI Evaluation'}
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
