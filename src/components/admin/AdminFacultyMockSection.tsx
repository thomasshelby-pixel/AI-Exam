import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../api/client.js';
import { CA_CURRICULUM } from '../../data/caCurriculum.js';
import { CALevel } from '../../types/index.js';
import { Plus, Users, FileText, UploadCloud, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

type Faculty = { id: string; name: string; description?: string | null; status: 'ACTIVE' | 'INACTIVE' };
type MockTest = {
  id: string; faculty_id: string; faculty_name: string; course_level: CALevel; attempt: string;
  model_group?: string | null; subject_key: string; subject_name: string; paper: string;
  mock_number: number; title: string; maximum_marks: number; status: string;
  question_paper_file_name?: string;
};
type StoredPdf = { name: string; type: string; size: number; base64: string };
type StoredText = { name: string; type: 'text/plain'; size: number; base64: string; text: string };


function detectFacultyReferenceSections(rawText: string) {
  const aliases = {
    questionPaper: new Set(['QUESTION PAPER', 'QUESTION PAPER TEXT']),
    suggestedAnswers: new Set(['SUGGESTED ANSWER', 'SUGGESTED ANSWERS', 'SUGGESTED ANSWER TEXT', 'SUGGESTED ANSWERS TEXT']),
    markingScheme: new Set(['MARKING SCHEME', 'MARKING SCHEME TEXT']),
  };
  const headings = rawText.split(/\r?\n/).map((line) => line.trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[=\-_*]{2,}\s*/, '')
    .replace(/\s*[=\-_*]{2,}\s*$/, '')
    .replace(/^\d+[.)\-]\s*/, '')
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^SECTION\s*:\s*/i, '')
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase());
  const locate = (set: Set<string>) => headings.findIndex((heading) => set.has(heading));
  const markers = [
    { key: 'questionPaper', line: locate(aliases.questionPaper) },
    { key: 'suggestedAnswers', line: locate(aliases.suggestedAnswers) },
    { key: 'markingScheme', line: locate(aliases.markingScheme) },
  ];
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
  const sections: Record<string, string> = {};
  for (const marker of markers) {
    if (marker.line < 0) { sections[marker.key] = ''; continue; }
    const nextLines = markers.filter((item) => item.line > marker.line).map((item) => item.line);
    const nextLine = nextLines.length ? Math.min(...nextLines) : lines.length;
    sections[marker.key] = lines.slice(marker.line + 1, nextLine).join('\n').trim();
  }
  return sections as { questionPaper: string; suggestedAnswers: string; markingScheme: string };
}

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
  const [questionPaper, setQuestionPaper] = useState<StoredPdf | null>(null);
  const [evaluationReference, setEvaluationReference] = useState<StoredText | null>(null);
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
        apiRequest<{ tests: MockTest[] }>('/api/admin/faculty-mocks/tests'),
      ]);
      setFaculties(facultyRes.faculties || []);
      setTests(testRes.tests || []);
      if (!facultyId && facultyRes.faculties?.length) setFacultyId(facultyRes.faculties.find((f) => f.status === 'ACTIVE')?.id || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load faculty mock data.';
      setError(message);
      onNotify?.(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    const nextSubjects = CA_CURRICULUM[courseLevel].subjects;
    const nextSubject = nextSubjects.find((item) => item.key === subjectKey) || nextSubjects[0];
    if (nextSubject) {
      setSubjectKey(nextSubject.key);
      setPaper(`Paper ${nextSubject.paperNumber}`);
      setMaximumMarks(String(nextSubject.maximumMarks));
    }
  }, [courseLevel]);

  useEffect(() => {
    if (selectedSubject) {
      setPaper(`Paper ${selectedSubject.paperNumber}`);
      setMaximumMarks(String(selectedSubject.maximumMarks));
    }
  }, [subjectKey]);

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
      onNotify?.(message, 'error');
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
      onNotify?.(message, 'error');
    } finally {
      setReadingFile(null);
    }
  };

  const chooseEvaluationReference = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('AI Evaluation Reference must be a .txt file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('AI Evaluation Reference TXT must be 10 MB or smaller.');
      return;
    }
    setReadingFile('EVALUATION_REFERENCE');
    try {
      const [rawText, base64] = await Promise.all([file.text(), fileToBase64(file)]);
      const text = rawText.replace(/^\uFEFF/, '').trim();
      const sections = detectFacultyReferenceSections(text);
      if (!sections.questionPaper || !sections.suggestedAnswers || !sections.markingScheme) {
        throw new Error('The TXT must contain all three headings: [QUESTION PAPER], [SUGGESTED ANSWERS], and [MARKING SCHEME].');
      }
      if (sections.questionPaper.length < 50 || sections.suggestedAnswers.length < 50 || sections.markingScheme.length < 10) {
        throw new Error('Add enough content under each TXT heading: Question Paper (50+ chars), Suggested Answers (50+ chars), Marking Scheme (10+ chars).');
      }
      setEvaluationReference({ name: file.name, type: 'text/plain', size: file.size, base64, text });
      onNotify?.(`${file.name} loaded. All three evaluation sections are present; no AI extraction is used.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read the AI Evaluation Reference TXT.';
      setError(message);
      onNotify?.(message, 'error');
    } finally {
      setReadingFile(null);
    }
  };

  const publishMock = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!facultyId) return setError('Add/select a faculty first.');
    if (!attempt.trim()) return setError('Enter the exam attempt, for example May 2027.');
    if (!questionPaper || !evaluationReference) return setError('Upload the original Question Paper PDF and the AI Evaluation Reference TXT.');
    setSavingTest(true);
    try {
      const result = await apiRequest<{ test: MockTest }>('/api/admin/faculty-mocks/tests', {
        method: 'POST',
        body: JSON.stringify({
          facultyId, courseLevel, attempt: attempt.trim(), modelGroup: selectedSubject?.group || '',
          subjectKey, subjectName: selectedSubject?.name || '', paper, mockNumber, title,
          maximumMarks: Number(maximumMarks), syllabusVersion: 'New Scheme 2024',
          questionPaperFile: questionPaper,
          evaluationReferenceFile: evaluationReference,
        }),
      });
      onNotify?.(`${result.test.faculty_name}: Mock ${String(result.test.mock_number).padStart(2, '0')} published for ${attempt}.`, 'success');
      setMockNumber('');
      setTitle('');
      setQuestionPaper(null);
      setEvaluationReference(null);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not publish mock test.';
      setError(message);
      onNotify?.(message, 'error');
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
    } catch (err) { onNotify?.(err instanceof Error ? err.message : 'Failed to update faculty.', 'error'); }
  };

  const toggleTest = async (test: MockTest) => {
    try {
      await apiRequest(`/api/admin/faculty-mocks/tests/${test.id}/status`, {
        method: 'PUT', body: JSON.stringify({ status: test.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED' }),
      });
      await loadData();
    } catch (err) { onNotify?.(err instanceof Error ? err.message : 'Failed to update mock test.', 'error'); }
  };

  const renderPdfInput = (label: string, value: StoredPdf | null) => (
    <label className="block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><UploadCloud className="h-4 w-4 text-blue-600" />{label} *</span>
      <span className="mt-1 block text-[11px] text-slate-500">{value ? value.name : 'Choose original PDF (max 20 MB). It will be stored without conversion.'}</span>
      {value && <span className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Stored unchanged for student download only · not sent for AI extraction</span>}
      <input className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => { void choosePdf(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
  );

  const renderReferenceInput = () => (
    <label className="block rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-3 cursor-pointer hover:border-violet-500 hover:bg-violet-50 transition">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><UploadCloud className="h-4 w-4 text-violet-600" />Evaluation Reference TXT (QP + Answers + Marking Scheme) *</span>
      <span className="mt-1 block text-[11px] text-slate-500">{evaluationReference ? evaluationReference.name : 'Choose one .txt file (max 10 MB) containing all 3 sections.'}</span>
      {evaluationReference && <span className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{evaluationReference.text.length.toLocaleString()} characters · QP ✓ · Answers ✓ · Marking Scheme ✓ · private</span>}
      <input className="hidden" type="file" accept=".txt,text/plain" onChange={(event) => { void chooseEvaluationReference(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
  );

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Faculty Mock Evaluation</h2>
          <p className="text-xs text-slate-500">Upload one original Question Paper PDF for student download and one private TXT containing all evaluation references.</p>
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
            </div>
          ))}
          {!loading && !faculties.length && <p className="text-xs text-slate-400">No faculties added yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-bold">2. Add Faculty Mock</h3></div>
        <form onSubmit={publishMock} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[11px] font-semibold text-slate-600">Faculty
              <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" required>
                <option value="">Select faculty</option>{faculties.filter((f) => f.status === 'ACTIVE').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">CA Course
              <select value={courseLevel} onChange={(e) => setCourseLevel(e.target.value as CALevel)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <option value="FOUNDATION">CA Foundation</option><option value="INTERMEDIATE">CA Intermediate</option><option value="FINAL">CA Final</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Exam Attempt
              <input value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="e.g. May 2027" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" required />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Subject
              <select value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                {subjects.map((subject) => <option key={subject.key} value={subject.key}>{subject.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Paper
              <input value={paper} onChange={(e) => setPaper(e.target.value)} maxLength={40} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" required />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Mock Number
              <input type="number" min="1" max="99" value={mockNumber} onChange={(e) => setMockNumber(e.target.value)} placeholder="Auto next number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Maximum Marks
              <input type="number" min="1" max="500" value={maximumMarks} onChange={(e) => setMaximumMarks(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" required />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">Test Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated if blank" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {renderPdfInput('Downloadable Question Paper PDF', questionPaper)}
            {renderReferenceInput()}
          </div>
          <p className="text-[10px] leading-5 text-slate-500">The original Question Paper PDF is stored byte-for-byte for student download only. It is never extracted or sent to AI. All evaluation text comes from the private TXT. Use exactly these headings, each on its own line: [QUESTION PAPER], [SUGGESTED ANSWERS], and [MARKING SCHEME]. Put the complete question paper, model solutions and step-wise mark allocation under their respective headings.</p>
          <button disabled={savingTest || !!readingFile || !facultyId || !attempt.trim() || !questionPaper || !evaluationReference} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {savingTest ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {savingTest ? 'Publishing mock…' : readingFile ? `Reading ${readingFile.replace('_', ' ').toLowerCase()}…` : 'Publish Faculty Mock'}
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
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Faculty</th><th>Course / Attempt</th><th>Subject</th><th>Mock No.</th><th>Marks</th><th>Status</th><th className="text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTests.map((test) => (
                <tr key={test.id}>
                  <td className="py-3 font-semibold">{test.faculty_name}</td>
                  <td>{test.course_level} · {test.attempt}</td>
                  <td>{test.subject_name} · {test.paper}</td>
                  <td><span className="rounded-md bg-indigo-50 px-2 py-1 font-mono font-bold text-indigo-700">Mock {String(test.mock_number).padStart(2, '0')}</span></td>
                  <td>{test.maximum_marks}</td>
                  <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${test.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{test.status}</span></td>
                  <td className="py-2 text-right"><button type="button" onClick={() => void toggleTest(test)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">{test.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}</button></td>
                </tr>
              ))}
              {!loading && !filteredTests.length && <tr><td colSpan={7} className="py-8 text-center text-slate-400">No faculty mocks match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminFacultyMockSection;
