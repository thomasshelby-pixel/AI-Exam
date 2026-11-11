import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../api/client.js';
import { CA_CURRICULUM } from '../../data/caCurriculum.js';
import { CALevel } from '../../types/index.js';
import { Plus, Users, FileText, UploadCloud, RefreshCw, CheckCircle2, AlertCircle, Trash2, Pencil, X } from 'lucide-react';

type Faculty = { id: string; name: string; description?: string | null; status: 'ACTIVE' | 'INACTIVE' };
type MockTest = {
  id: string; faculty_id: string; faculty_name: string; course_level: CALevel; attempt: string;
  model_group?: string | null; subject_key: string; subject_name: string; paper: string;
  mock_number: number; title: string; maximum_marks: number; status: string;
  question_paper_file_name?: string;
  question_paper_reference_file_name?: string | null;
  suggested_answer_file_name?: string | null;
  marking_scheme_file_name?: string | null;
  access_type?: 'FREE' | 'PAID';
  unlock_price_inr?: number;
};
type StoredPdf = { name: string; type: string; size: number; base64: string };
type StoredText = { name: string; type: 'text/plain'; size: number; base64: string; text: string };
type FacultyMockEditability = {
  verified: boolean;
  hasEvaluation: boolean;
  hasIssuedStudentEntitlement: boolean;
  scoringInputsLocked: boolean;
  accessTypeLocked: boolean;
  evaluationInProgress: boolean;
  hasPendingReviewRetry: boolean;
  hasUnconsumedPaidCopy: boolean;
};



async function fileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

export const AdminFacultyMockSection: React.FC<{ onNotify?: (message: string, type: 'success' | 'error') => void }> = ({ onNotify }) => {
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [tests, setTests] = useState<MockTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFaculty, setSavingFaculty] = useState(false);
  const [savingTest, setSavingTest] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editingMockRecord, setEditingMockRecord] = useState<MockTest | null>(null);
  const [editability, setEditability] = useState<FacultyMockEditability | null>(null);
  const [checkingEditability, setCheckingEditability] = useState(false);
  const editabilityRequestRef = useRef(0);
  const [deletingFacultyId, setDeletingFacultyId] = useState<string | null>(null);
  const [unlockPriceINR, setUnlockPriceINR] = useState(35);
  const [facultyName, setFacultyName] = useState('');
  const [facultyDescription, setFacultyDescription] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [courseLevel, setCourseLevel] = useState<CALevel>('INTERMEDIATE');
  const [attempt, setAttempt] = useState('');
  const [subjectKey, setSubjectKey] = useState(CA_CURRICULUM.INTERMEDIATE.subjects[0]?.key || '');
  const [paper, setPaper] = useState('Paper 1');
  const [mockNumber, setMockNumber] = useState('');
  const [title, setTitle] = useState('');
  const [maximumMarks, setMaximumMarks] = useState('100');
  const [accessType, setAccessType] = useState<'FREE' | 'PAID'>('FREE');
  const [questionPaper, setQuestionPaper] = useState<StoredPdf | null>(null);
  const [questionPaperReference, setQuestionPaperReference] = useState<StoredText | null>(null);
  const [suggestedAnswersReference, setSuggestedAnswersReference] = useState<StoredText | null>(null);
  const [markingSchemeReference, setMarkingSchemeReference] = useState<StoredText | null>(null);
  const [readingFile, setReadingFile] = useState<string | null>(null);
  const [filterFaculty, setFilterFaculty] = useState('ALL');
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [error, setError] = useState('');

  const subjects = CA_CURRICULUM[courseLevel].subjects;
  const selectedSubject = subjects.find((item) => item.key === subjectKey) || subjects[0];

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [facultyRes, testRes] = await Promise.all([
        apiRequest<{ faculties: Faculty[] }>('/api/admin/faculty-mocks/faculties'),
        apiRequest<{ tests: MockTest[]; unlockPriceINR?: number }>('/api/admin/faculty-mocks/tests'),
      ]);
      setFaculties(facultyRes.faculties || []);
      setTests(testRes.tests || []);
      setUnlockPriceINR(Number(testRes.unlockPriceINR || 35));
      if (!facultyId && facultyRes.faculties?.length) setFacultyId(facultyRes.faculties.find((f) => f.status === 'ACTIVE')?.id || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load faculty mock data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (editingTestId) return;
    const nextSubjects = CA_CURRICULUM[courseLevel].subjects;
    const nextSubject = nextSubjects.find((item) => item.key === subjectKey) || nextSubjects[0];
    if (nextSubject) {
      setSubjectKey(nextSubject.key);
      setPaper(`Paper ${nextSubject.paperNumber}`);
      setMaximumMarks(String(nextSubject.maximumMarks));
    }
  }, [courseLevel, editingTestId]);

  useEffect(() => {
    if (editingTestId) return;
    if (selectedSubject) {
      setPaper(`Paper ${selectedSubject.paperNumber}`);
      setMaximumMarks(String(selectedSubject.maximumMarks));
    }
  }, [subjectKey, editingTestId]);

  const scoringInputsLocked = Boolean(editingTestId && (
    checkingEditability || !editability?.verified || editability.scoringInputsLocked
  ));
  const accessTypeLocked = Boolean(editingTestId && (
    checkingEditability || !editability?.verified || editability.accessTypeLocked
  ));

  const filteredTests = useMemo(() => tests.filter((test) =>
    (filterFaculty === 'ALL' || test.faculty_id === filterFaculty) &&
    (filterLevel === 'ALL' || test.course_level === filterLevel)
  ), [tests, filterFaculty, filterLevel]);

  const addFaculty = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingFaculty(true);
    setError('');
    try {
      const result = await apiRequest<{ faculty: Faculty }>('/api/admin/faculty-mocks/faculties', {
        method: 'POST',
        body: JSON.stringify({ name: facultyName, description: facultyDescription }),
      });
      setFacultyName('');
      setFacultyDescription('');
      setFacultyId(result.faculty.id);
      onNotify?.(`Faculty “${result.faculty.name}” added. It is now available in the student faculty dropdown once a mock is published.`, 'success');
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add faculty.';
      setError(message);
    } finally {
      setSavingFaculty(false);
    }
  };

  const choosePdf = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload the original Question Paper PDF.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Question Paper PDF must be 20 MB or smaller.');
      return;
    }
    setReadingFile('QUESTION_PAPER');
    try {
      const [base64, signature] = await Promise.all([fileToBase64(file), file.slice(0, 4).text()]);
      if (signature !== '%PDF') throw new Error('The selected file does not contain a valid PDF header.');
      // The PDF is only stored unchanged for student download. Evaluation text
      // comes entirely from the separately uploaded TXT reference.
      setQuestionPaper({ name: file.name, type: 'application/pdf', size: file.size, base64 });
      onNotify?.(`${file.name} selected for student download. No PDF extraction or AI call was made.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read the Question Paper PDF.';
      setError(message);
    } finally {
      setReadingFile(null);
    }
  };

  const chooseReferenceText = async (
    kind: 'QUESTION_PAPER_TEXT' | 'SUGGESTED_ANSWERS' | 'MARKING_SCHEME',
    file?: File,
  ) => {
    if (!file) return;
    setError('');

    const referenceConfig = {
      QUESTION_PAPER_TEXT: { label: 'Question Paper Text', minimumCharacters: 50, setter: setQuestionPaperReference },
      SUGGESTED_ANSWERS: { label: 'Suggested Answers', minimumCharacters: 50, setter: setSuggestedAnswersReference },
      MARKING_SCHEME: { label: 'Marking Scheme', minimumCharacters: 10, setter: setMarkingSchemeReference },
    } as const;
    const config = referenceConfig[kind];

    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError(`${config.label} must be uploaded as a plain .txt file.`);
      return;
    }
    // Together with the 20 MB original PDF, three 4 MB TXT files stay below
    // the server's existing 50 MB JSON request-body limit after base64 encoding.
    if (file.size > 4 * 1024 * 1024) {
      setError(`${config.label} TXT must be 4 MB or smaller.`);
      return;
    }

    setReadingFile(kind);
    try {
      const [rawText, base64] = await Promise.all([file.text(), fileToBase64(file)]);
      const text = rawText.replace(/^\uFEFF/, '').trim();
      if (text.includes('\0')) {
        throw new Error(`${config.label} TXT contains invalid binary characters. Upload a UTF-8 plain-text file.`);
      }
      if (text.length < config.minimumCharacters) {
        throw new Error(`${config.label} must contain at least ${config.minimumCharacters} characters.`);
      }

      config.setter({ name: file.name, type: 'text/plain', size: file.size, base64, text });
      onNotify?.(`${config.label} TXT loaded (${text.length.toLocaleString()} characters). It remains private and is not extracted from a PDF.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not read ${config.label} TXT.`;
      setError(message);
    } finally {
      setReadingFile(null);
    }
  };

  const resetMockForm = () => {
    editabilityRequestRef.current += 1;
    setEditingTestId(null);
    setEditingMockRecord(null);
    setEditability(null);
    setCheckingEditability(false);
    setMockNumber('');
    setTitle('');
    setAccessType('FREE');
    setQuestionPaper(null);
    setQuestionPaperReference(null);
    setSuggestedAnswersReference(null);
    setMarkingSchemeReference(null);
  };

  const startEditingMock = async (test: MockTest) => {
    const requestId = editabilityRequestRef.current + 1;
    editabilityRequestRef.current = requestId;
    setError('');
    setEditingTestId(test.id);
    setEditingMockRecord(test);
    setEditability(null);
    setCheckingEditability(true);
    setFacultyId(test.faculty_id);
    setCourseLevel(test.course_level);
    setAttempt(test.attempt);
    setSubjectKey(test.subject_key);
    setPaper(test.paper);
    setMockNumber(String(test.mock_number));
    setTitle(test.title || '');
    setMaximumMarks(String(test.maximum_marks));
    setAccessType(String(test.access_type || 'FREE').toUpperCase() === 'PAID' ? 'PAID' : 'FREE');
    setQuestionPaper(null);
    setQuestionPaperReference(null);
    setSuggestedAnswersReference(null);
    setMarkingSchemeReference(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const result = await apiRequest<{ editability: FacultyMockEditability }>(
        `/api/admin/faculty-mocks/tests/${encodeURIComponent(test.id)}/editability`,
      );
      if (editabilityRequestRef.current !== requestId) return;
      setEditability(result.editability);
      if (result.editability.evaluationInProgress) {
        setError('An evaluation is in progress for this mock. Wait for it to finish before saving any changes.');
      }
    } catch (err) {
      if (editabilityRequestRef.current !== requestId) return;
      const message = err instanceof Error ? err.message : 'Could not verify student evaluation and entitlement history.';
      setEditability({
        verified: false,
        hasEvaluation: false,
        hasIssuedStudentEntitlement: false,
        hasPendingReviewRetry: false,
        hasUnconsumedPaidCopy: false,
        scoringInputsLocked: true,
        accessTypeLocked: true,
        evaluationInProgress: false,
      });
      setError(message + ' Maximum marks, student access and source files are locked until verification succeeds. You can still edit the title.');
    } finally {
      if (editabilityRequestRef.current === requestId) setCheckingEditability(false);
    }
  };

  const publishMock = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!facultyId) return setError('Add/select a faculty first.');
    if (!attempt.trim()) return setError('Enter the exam attempt, for example May 2027.');
    if (!editingTestId && (!questionPaper || !questionPaperReference || !suggestedAnswersReference || !markingSchemeReference)) {
      return setError('Upload the original Question Paper PDF and all three private reference TXT files.');
    }
    setSavingTest(true);
    try {
      const payload: Record<string, unknown> = {
        facultyId, courseLevel, attempt: attempt.trim(), modelGroup: selectedSubject?.group || '',
        subjectKey, subjectName: selectedSubject?.name || '', paper, mockNumber, title,
        maximumMarks: Number(maximumMarks), accessType, syllabusVersion: 'New Scheme 2024',
      };
      if (questionPaper) payload.questionPaperFile = questionPaper;
      if (questionPaperReference) payload.questionPaperReferenceFile = questionPaperReference;
      if (suggestedAnswersReference) payload.suggestedAnswersFile = suggestedAnswersReference;
      if (markingSchemeReference) payload.markingSchemeFile = markingSchemeReference;
      const endpoint = editingTestId ? '/api/admin/faculty-mocks/tests/' + encodeURIComponent(editingTestId) : '/api/admin/faculty-mocks/tests';
      const result = await apiRequest<{ test: MockTest }>(endpoint, { method: editingTestId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const label = result.test.faculty_name + ': Mock ' + String(result.test.mock_number).padStart(2, '0');
      onNotify?.(editingTestId ? label + ' updated successfully.' : label + ' published for ' + attempt + '.', 'success');
      resetMockForm();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : (editingTestId ? 'Could not update mock test.' : 'Could not publish mock test.');
      setError(message);
    } finally {
      setSavingTest(false);
    }
  };
  const toggleFaculty = async (faculty: Faculty) => {
    try {
      await apiRequest(`/api/admin/faculty-mocks/faculties/${faculty.id}/status`, {
        method: 'PUT', body: JSON.stringify({ status: faculty.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update faculty.'); }
  };

  const deleteFaculty = async (faculty: Faculty) => {
    const confirmed = window.confirm(
      `Permanently delete ${faculty.name} and all of its faculty mocks and uploaded source files? Existing student evaluation reports and payment transaction history will be retained. Deletion is blocked while students have unused paid copies.`
    );
    if (!confirmed) return;
    setDeletingFacultyId(faculty.id);
    try {
      const result = await apiRequest<{ deletedMockCount: number }>(`/api/admin/faculty-mocks/faculties/${faculty.id}`, {
        method: 'DELETE',
      });
      if (facultyId === faculty.id) setFacultyId('');
      if (filterFaculty === faculty.id) setFilterFaculty('ALL');
      onNotify?.(`Deleted ${faculty.name} and ${result.deletedMockCount} associated mock(s). Historical evaluation reports and payment records were retained.`, 'success');
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete faculty and its mocks.';
      setError(message);
      await loadData();
    } finally {
      setDeletingFacultyId(null);
    }
  };

  const toggleTest = async (test: MockTest) => {
    try {
      await apiRequest(`/api/admin/faculty-mocks/tests/${test.id}/status`, {
        method: 'PUT', body: JSON.stringify({ status: test.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED' }),
      });
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update mock test.'); }
  };

  const renderPdfInput = (label: string, value: StoredPdf | null, disabled = false, existingName = '') => (
    <label className={`block rounded-xl border border-dashed p-3 transition ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-75' : 'cursor-pointer border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'}`}>
      <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><UploadCloud className="h-4 w-4 text-blue-600" />{label}{disabled ? ' (locked)' : editingTestId ? ' (optional replacement)' : ' *'}</span>
      <span className="mt-1 block text-[11px] text-slate-500">{value ? value.name : disabled ? `Locked — stored file: ${existingName || 'current Question Paper PDF'}.` : editingTestId ? `No replacement selected — ${existingName || 'the currently stored PDF'} will be kept.` : 'Choose original PDF (max 20 MB). It will be stored without conversion.'}</span>
      {value && <span className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Stored unchanged for student download only · not sent for AI extraction</span>}
      <input disabled={disabled} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => { void choosePdf(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
  );

  const renderTextInput = (
    label: string,
    kind: 'QUESTION_PAPER_TEXT' | 'SUGGESTED_ANSWERS' | 'MARKING_SCHEME',
    value: StoredText | null,
    description: string,
    disabled = false,
    existingName = '',
  ) => (
    <label className={`block rounded-xl border border-dashed p-3 transition ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-75' : 'cursor-pointer border-violet-300 bg-violet-50/60 hover:border-violet-500 hover:bg-violet-50'}`}>
      <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><UploadCloud className="h-4 w-4 text-violet-600" />{label}{disabled ? ' (locked)' : editingTestId ? ' (optional replacement)' : ' *'}</span>
      <span className="mt-1 block text-[11px] text-slate-500">{value ? value.name : disabled ? `Locked — stored file: ${existingName || 'current private TXT reference'}.` : editingTestId ? `No replacement selected — ${existingName || 'the currently stored private TXT'} will be kept.` : description}</span>
      {value && <span className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{value.text.length.toLocaleString()} characters · private · separate source</span>}
      <input disabled={disabled} className="hidden" type="file" accept=".txt,text/plain" onChange={(event) => { void chooseReferenceText(kind, event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
  );

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Faculty Mock Evaluation</h2>
          <p className="text-xs text-slate-500">Upload the student-download PDF and three private TXT references separately for accurate, independently validated evaluation inputs.</p>
          <p className="mt-1 text-[11px] font-semibold text-indigo-700">Student access: first copy of each faculty mock is free; repeat copies are ₹35 each (same as the current custom evaluation rate).</p>
        </div>
        <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-bold">1. Faculty Directory</h3></div>
        <form onSubmit={addFaculty} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <input value={facultyName} onChange={(e) => setFacultyName(e.target.value)} placeholder="Faculty name" maxLength={100} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" required />
          <input value={facultyDescription} onChange={(e) => setFacultyDescription(e.target.value)} placeholder="Optional description / specialization" maxLength={500} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          <button disabled={savingFaculty} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4" />{savingFaculty ? 'Adding…' : 'Add Faculty'}</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {faculties.map((faculty) => (
            <div key={faculty.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold">{faculty.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${faculty.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{faculty.status}</span>
              <button type="button" onClick={() => void toggleFaculty(faculty)} className="text-[10px] font-semibold text-blue-700">{faculty.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
              <button type="button" disabled={deletingFacultyId === faculty.id} onClick={() => void deleteFaculty(faculty)} title="Delete faculty and all its mocks" className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                <Trash2 className="h-3 w-3" />{deletingFacultyId === faculty.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ))}
          {!loading && !faculties.length && <p className="text-xs text-slate-400">No faculties added yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-bold">2. {editingTestId ? 'Edit Faculty Mock' : 'Add Faculty Mock'}</h3></div>
        {editingTestId && (
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>Editing keeps the same mock ID and past student records. Faculty, course, attempt, subject, paper and mock number stay fixed. Replace only selected files; blank file inputs keep the existing source.</span>
            <button type="button" onClick={resetMockForm} className="inline-flex shrink-0 items-center gap-1 self-start font-bold text-amber-800 hover:text-amber-950"><X className="h-3.5 w-3.5" />Cancel edit</button>
          </div>
        )}
        <form onSubmit={publishMock} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[11px] font-semibold text-slate-600">Faculty
              <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} disabled={!!editingTestId} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs disabled:bg-slate-100 disabled:text-slate-500" required>
                <option value="">Select faculty</option>{faculties.filter((f) => f.status === 'ACTIVE').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">CA Course
              <select value={courseLevel} onChange={(e) => setCourseLevel(e.target.value as CALevel)} disabled={!!editingTestId} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs disabled:bg-slate-100 disabled:text-slate-500">
                <option value="FOUNDATION">CA Foundation</option><option value="INTERMEDIATE">CA Intermediate</option><option value="FINAL">CA Final</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Exam Attempt
              <input value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="e.g. May 2027" maxLength={40} disabled={!!editingTestId} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-100 disabled:text-slate-500" required />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Subject
              <select value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} disabled={!!editingTestId} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs disabled:bg-slate-100 disabled:text-slate-500">
                {subjects.map((subject) => <option key={subject.key} value={subject.key}>{subject.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Paper
              <input value={paper} onChange={(e) => setPaper(e.target.value)} maxLength={40} disabled={!!editingTestId} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-100 disabled:text-slate-500" required />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Mock Number
              <input type="number" min="1" max="99" value={mockNumber} onChange={(e) => setMockNumber(e.target.value)} placeholder="Auto next number" disabled={!!editingTestId} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-100 disabled:text-slate-500" />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">{scoringInputsLocked ? 'Maximum Marks (locked)' : 'Maximum Marks'}
              <input type="number" min="1" max="500" value={maximumMarks} onChange={(e) => setMaximumMarks(e.target.value)} disabled={scoringInputsLocked} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" required />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Test Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated if blank" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">{accessTypeLocked ? 'Student Access (locked)' : 'Student Access'}
              <select value={accessType} onChange={(e) => setAccessType(e.target.value as 'FREE' | 'PAID')} disabled={accessTypeLocked} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500">
                <option value="FREE">Free — first copy free, repeats ₹{unlockPriceINR}</option>
                <option value="PAID">Unlock by Paying — ₹{unlockPriceINR} per copy</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {renderPdfInput('Downloadable Question Paper PDF', questionPaper, scoringInputsLocked, editingMockRecord?.question_paper_file_name)}
            {renderTextInput('Private Question Paper Text TXT', 'QUESTION_PAPER_TEXT', questionPaperReference, 'Upload the exact question text matching the downloadable PDF (max 4 MB).', scoringInputsLocked, editingMockRecord?.question_paper_reference_file_name || '')}
            {renderTextInput('Private Suggested Answers TXT', 'SUGGESTED_ANSWERS', suggestedAnswersReference, 'Upload model answers, workings and conclusions (max 4 MB).', scoringInputsLocked, editingMockRecord?.suggested_answer_file_name || '')}
            {renderTextInput('Private Marking Scheme TXT', 'MARKING_SCHEME', markingSchemeReference, 'Upload step-wise marks, criteria and partial-credit rules (max 4 MB).', scoringInputsLocked, editingMockRecord?.marking_scheme_file_name || '')}
          </div>
          {editingTestId && (
            <div className={`rounded-lg border px-3 py-2.5 text-[10px] leading-5 ${checkingEditability || !editability?.verified || editability.scoringInputsLocked ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {checkingEditability
                ? 'Checking shared evaluation and student-copy entitlement history. Maximum marks, student access and all source files remain disabled until verification completes.'
                : !editability?.verified
                  ? 'Student history could not be verified. Maximum marks, student access and all source files remain locked for safety. You can still edit the test title; retry by cancelling and opening Edit again.'
                  : editability.evaluationInProgress
                    ? 'An evaluation is currently in progress. Wait for it to finish before changing maximum marks or source files.'
                    : editability.hasPendingReviewRetry
                      ? 'A student copy is marked NEEDS_REVIEW and its one-time retry is still available. Keep the current marking references unchanged until that retry is completed.'
                      : editability.hasUnconsumedPaidCopy
                        ? 'A student has an unused paid copy. Keep the Question Paper and scoring references unchanged until that purchased copy is used or refunded.'
                        : editability.scoringInputsLocked
                          ? 'Student history could not be verified. Maximum marks and source files remain locked for safety; retry Edit after the shared database is available.'
                          : editability.accessTypeLocked
                            ? 'A payment checkout is still pending. You can correct maximum marks and source files, but Free/Paid access must remain unchanged until the order settles.'
                            : 'Completed, failed or already-retried evaluations do not permanently lock this mock. Historical source files are retained with their evaluation records; maximum marks, references and student access can be edited.'}
            </div>
          )}
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[10px] leading-5 text-slate-600">
            <strong className="text-slate-800">Reference separation:</strong> The original PDF is stored unchanged for student download only and is never extracted or sent to AI. The three private TXT files are stored independently and supply the exact Question Paper text, Suggested Answers and Marking Scheme to the existing evaluator. Keep the Question Paper TXT identical to the downloadable PDF; verify all three references before publishing.
          </div>
          <button disabled={savingTest || !!readingFile || checkingEditability || Boolean(editability?.evaluationInProgress) || !facultyId || !attempt.trim() || (!editingTestId && (!questionPaper || !questionPaperReference || !suggestedAnswersReference || !markingSchemeReference))} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {savingTest ? <RefreshCw className="h-4 w-4 animate-spin" /> : editingTestId ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {savingTest ? (editingTestId ? 'Saving changes…' : 'Publishing mock…') : readingFile ? 'Reading ' + readingFile.replace('_', ' ').toLowerCase() + '…' : editingTestId ? 'Save Changes' : 'Publish Faculty Mock'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">3. Published Mock Tests ({tests.length})</h3>
          <div className="flex gap-2">
            <select value={filterFaculty} onChange={(e) => setFilterFaculty(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="ALL">All faculties</option>{faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="ALL">All courses</option><option value="FOUNDATION">Foundation</option><option value="INTERMEDIATE">Intermediate</option><option value="FINAL">Final</option></select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Faculty</th><th>Course / Attempt</th><th>Subject</th><th>Mock No.</th><th>Marks</th><th>Access</th><th>Status</th><th className="text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTests.map((test) => (
                <tr key={test.id}>
                  <td className="py-3 font-semibold">{test.faculty_name}</td>
                  <td>{test.course_level} · {test.attempt}</td>
                  <td>{test.subject_name} · {test.paper}</td>
                  <td><span className="rounded-md bg-indigo-50 px-2 py-1 font-mono font-bold text-indigo-700">Mock {String(test.mock_number).padStart(2, '0')}</span></td>
                  <td>{test.maximum_marks}</td>
                  <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${String(test.access_type || 'FREE').toUpperCase() === 'PAID' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{String(test.access_type || 'FREE').toUpperCase() === 'PAID' ? `PAID · ₹${test.unlock_price_inr || unlockPriceINR}` : 'FREE'}</span></td>
                  <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${test.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{test.status}</span></td>
                  <td className="py-2 text-right"><div className="inline-flex items-center gap-1"><button type="button" onClick={() => startEditingMock(test)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold text-violet-700"><Pencil className="h-3 w-3" />Edit</button><button type="button" onClick={() => void toggleTest(test)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">{test.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}</button></div></td>
                </tr>
              ))}
              {!loading && !filteredTests.length && <tr><td colSpan={8} className="py-8 text-center text-slate-400">No faculty mocks match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminFacultyMockSection;
