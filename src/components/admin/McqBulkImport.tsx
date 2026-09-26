import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Info,
  Check,
  Link as LinkIcon,
  Layers,
  FileText,
  Eye,
  HelpCircle,
  FolderOpen,
  Send,
  ShieldCheck,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { mcqApi, McqMaterial, BulkImportPreviewResult } from '../../api/mcqClient.js';
import { McqCourse, McqQuestionType, McqDifficulty, McqSource } from '../../types/index.js';
import {
  CANONICAL_COURSE_OPTIONS,
  getCourseSubjects,
  getSubjectChapters,
  getChapterTopics,
  CANONICAL_SOURCE_CATEGORIES,
  CanonicalSourceCategory,
  isAttemptRequiredSource,
  getAttemptSuggestions,
} from '../../data/caCurriculum.js';

interface McqBulkImportProps {
  onImportComplete?: () => void;
  onGoToMaterialLibrary?: () => void;
}

const TEMPLATE_HEADERS = [
  'Question ID',
  'Case ID',
  'Case Title',
  'Case Scenario',
  'Case Sequence',
  'Question Text',
  'Option A',
  'Option B',
  'Option C',
  'Option D',
  'Correct Answer',
  'Explanation',
  'Reference',
  'Course',
  'Subject',
  'Chapter',
  'Topic',
  'Difficulty',
  'Question Type',
  'Source',
  'Attempt',
  'Applicable From',
  'Applicable Till',
  'Amendment Version',
];

const SAMPLE_CSV = `Question ID,Case ID,Case Title,Case Scenario,Case Sequence,Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Reference,Course,Subject,Chapter,Topic,Difficulty,Question Type,Source,Attempt,Applicable From,Applicable Till,Amendment Version
Q-N-001,,,,,"Under Section 2(46) of the Companies Act 2013, a holding company in relation to one or more other companies means:","A company of which such companies are subsidiary companies","A company holding more than 20% shares","A company whose directors control another board","Any listed entity",A,"As per Section 2(46), holding company means a company of which such companies are subsidiary companies.","Companies Act 2013 Sec 2(46)",CA Intermediate,Corporate and Other Laws,Preliminary - Sec 1 to 2,Company Classification,Moderate,NORMAL,ICAI Module,May 2026,2024-05-01,2028-12-31,New Scheme 2024
Q-N-002,,,,,"Which of the following is NOT an essential characteristic of a company under Companies Act 2013?","Separate Legal Entity","Perpetual Succession","Unlimited Personal Liability of Members","Common Seal (Optional)",C,"A company provides limited liability to its members up to unpaid share capital. Unlimited personal liability is not a standard characteristic.","Companies Act 2013 Sec 9",CA Intermediate,Corporate and Other Laws,Preliminary - Sec 1 to 2,Definitions of Key Terms,Easy,NORMAL,Self-Created,,,New Scheme 2024
Q-C-001,CASE-001,ABC Ltd Compliance Case,"ABC Ltd is an unlisted public company having a paid-up share capital of Rs. 10 Crores and turnover of Rs. 120 Crores during the preceding financial year. The Board consists of 6 directors. The company proposes to hold an Extraordinary General Meeting (EGM) upon requisition received from members holding 12% of the paid-up capital on 10th January.",1,"Based on the facts above, which statutory provision governs the calling of an EGM on requisition?","Section 96 of Companies Act 2013","Section 100 of Companies Act 2013","Section 108 of Companies Act 2013","Section 111 of Companies Act 2013",B,"Section 100 provides that the Board shall call an EGM on the requisition of members holding not less than one-tenth of paid-up share capital.","Companies Act 2013 Sec 100",CA Intermediate,Corporate and Other Laws,Management and Administration - Sec 88 to 122,Annual General Meeting (AGM) & EGM,Moderate,CASE_BASED,RTP,September 2026,2024-05-01,2028-12-31,New Scheme 2024
Q-C-002,CASE-001,ABC Ltd Compliance Case,"ABC Ltd is an unlisted public company having a paid-up share capital of Rs. 10 Crores and turnover of Rs. 120 Crores during the preceding financial year. The Board consists of 6 directors. The company proposes to hold an Extraordinary General Meeting (EGM) upon requisition received from members holding 12% of the paid-up capital on 10th January.",2,"Within what time period from the date of receipt of a valid requisition must the Board proceed to call the meeting?","Within 21 days","Within 30 days","Within 45 days","Within 60 days",A,"Under Section 100(2), the Board must within 21 days from the date of receipt of a valid requisition proceed to call a meeting on a day not later than 45 days.","Companies Act 2013 Sec 100(2)",CA Intermediate,Corporate and Other Laws,Management and Administration - Sec 88 to 122,Annual General Meeting (AGM) & EGM,Moderate,CASE_BASED,RTP,September 2026,2024-05-01,2028-12-31,New Scheme 2024`;

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const McqBulkImport: React.FC<McqBulkImportProps> = ({
  onImportComplete,
  onGoToMaterialLibrary,
}) => {
  // Step State (1 to 8)
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // STEP 1: Select Course & Content Details
  const [selectedCourse, setSelectedCourse] = useState<string>('CA_INTERMEDIATE');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('Not Applicable');
  const [questionType, setQuestionType] = useState<'Single MCQ' | 'Case-Based MCQ' | 'Mixed'>('Mixed');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Moderate' | 'Hard' | 'Mixed'>('Mixed');
  const [sourceCategory, setSourceCategory] = useState<CanonicalSourceCategory>('ICAI Module');
  const [attemptYear, setAttemptYear] = useState<string>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [materials, setMaterials] = useState<McqMaterial[]>([]);

  // STEP 2: Upload
  const [uploadMode, setUploadMode] = useState<'upload' | 'paste'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileFormat, setFileFormat] = useState<'CSV' | 'XLSX'>('CSV');
  const [csvContent, setCsvContent] = useState<string>('');

  // STEP 3 & 4: Validate & Preview
  const [validating, setValidating] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkImportPreviewResult | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors' | 'cases'>('all');
  const [selectedCaseModal, setSelectedCaseModal] = useState<{
    caseId: string;
    title: string;
    scenario: string;
  } | null>(null);

  // STEP 5, 6, 7, 8: Save Draft, Review, Approve, Publish
  const [importing, setImporting] = useState<boolean>(false);
  const [importBatchResult, setImportBatchResult] = useState<{
    importedCount: number;
    casesCount: number;
    importedIds: string[];
    status: 'draft' | 'published';
  } | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load materials from Material Library
  useEffect(() => {
    loadMaterials();
  }, []);

  // Update cascading subjects when Course changes
  const courseSubjects = getCourseSubjects(selectedCourse);
  useEffect(() => {
    if (courseSubjects.length > 0 && (!selectedSubject || !courseSubjects.includes(selectedSubject))) {
      setSelectedSubject(courseSubjects[0]);
    }
  }, [selectedCourse, courseSubjects, selectedSubject]);

  // Update cascading chapters when Subject changes
  const subjectChapters = getSubjectChapters(selectedCourse, selectedSubject);
  useEffect(() => {
    if (subjectChapters.length > 0 && (!selectedChapter || !subjectChapters.includes(selectedChapter))) {
      setSelectedChapter(subjectChapters[0]);
    }
  }, [selectedCourse, selectedSubject, subjectChapters, selectedChapter]);

  // Update cascading topics when Chapter changes
  const chapterTopics = getChapterTopics(selectedCourse, selectedSubject, selectedChapter);
  useEffect(() => {
    if (chapterTopics.length > 0 && (!selectedTopic || !chapterTopics.includes(selectedTopic))) {
      setSelectedTopic(chapterTopics[0]);
    }
  }, [selectedCourse, selectedSubject, selectedChapter, chapterTopics, selectedTopic]);

  const loadMaterials = async () => {
    try {
      const data = await mcqApi.getMaterials({ limit: 100 });
      setMaterials(data.materials || []);
    } catch (err) {
      console.warn('Could not fetch materials for linking:', err);
    }
  };

  // Dynamic conditional attempt handling on Source Category change
  const handleSourceCategoryChange = (newSource: CanonicalSourceCategory) => {
    setSourceCategory(newSource);
    if (!isAttemptRequiredSource(newSource)) {
      setAttemptYear(''); // Immediately clear attempt
    } else {
      const suggestions = getAttemptSuggestions(newSource);
      if (!attemptYear && suggestions.length > 0) {
        setAttemptYear(suggestions[0]);
      }
    }
  };

  // Download Sample CSV
  const handleDownloadCsvSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mcq_arena_bulk_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Sample XLSX
  const handleDownloadXlsxSample = () => {
    const wb = XLSX.utils.book_new();
    const parsedCsv = XLSX.utils.aoa_to_sheet(
      SAMPLE_CSV.split('\n').map((row) =>
        row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((val) => val.replace(/^"|"$/g, '').trim())
      )
    );
    XLSX.utils.book_append_sheet(wb, parsedCsv, 'MCQ Import Template');
    XLSX.writeFile(wb, 'mcq_arena_bulk_template.xlsx');
  };

  // File Upload Handler (CSV or XLSX only)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv');
    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

    if (!isCsv && !isXlsx) {
      setErrorMsg(
        'Invalid format. Bulk Import strictly accepts CSV (.csv) or Excel (.xlsx) files. For PDF reference study materials, switch to the Material Library workflow.'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadedFile(file);
    setFileFormat(isXlsx ? 'XLSX' : 'CSV');

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvContent(text);
        setFileBase64('');
        setPreviewResult(null);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        setFileBase64(base64);
        setCsvContent('');
        setPreviewResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 3: Run Validation
  const handleRunValidation = async () => {
    setErrorMsg(null);
    if (uploadMode === 'paste' && !csvContent.trim()) {
      setErrorMsg('Please paste CSV content before validating.');
      return;
    }
    if (uploadMode === 'upload' && !uploadedFile && !csvContent && !fileBase64) {
      setErrorMsg('Please select a CSV or XLSX file to validate.');
      return;
    }

    setValidating(true);
    try {
      const defaultValues = {
        course: selectedCourse,
        subject: selectedSubject,
        chapter: selectedChapter,
        topic: selectedTopic === 'Not Applicable' ? undefined : selectedTopic,
        questionType: questionType === 'Single MCQ' ? 'SINGLE' : questionType === 'Case-Based MCQ' ? 'CASE_BASED' : 'MIXED',
        difficulty: difficulty === 'Easy' ? 'easy' : difficulty === 'Moderate' ? 'moderate' : difficulty === 'Hard' ? 'hard' : 'mixed',
        source: sourceCategory,
        attempt: isAttemptRequiredSource(sourceCategory) ? attemptYear : undefined,
        sourceMaterialId: selectedMaterialId || undefined,
      };

      let preview: BulkImportPreviewResult;
      if (fileFormat === 'XLSX' && fileBase64) {
        preview = await mcqApi.validateBulkImport({
          base64File: fileBase64,
          fileFormat: 'XLSX',
          defaultValues,
        });
      } else {
        preview = await mcqApi.validateBulkImport({
          csvText: csvContent,
          fileFormat: 'CSV',
          defaultValues,
        });
      }

      setPreviewResult(preview);
      setCurrentStep(4); // Advance to Preview Step
    } catch (err: any) {
      console.error('Validation error:', err);
      setErrorMsg(err.message || 'Validation failed. Please verify column headers and row values.');
    } finally {
      setValidating(false);
    }
  };

  // Step 5: Save as Draft
  const handleImportAsDraft = async () => {
    if (!previewResult || previewResult.validCount === 0) {
      setErrorMsg('No valid question rows available to import.');
      return;
    }

    setImporting(true);
    setErrorMsg(null);
    try {
      const validRows = previewResult.rows.filter((r) => r.isValid);
      const res = await mcqApi.commitBulkImport(validRows, 'draft');

      setImportBatchResult({
        importedCount: res.importedCount,
        casesCount: res.casesCount || 0,
        importedIds: res.importedIds || [],
        status: 'draft',
      });
      setCurrentStep(5); // Show Saved Draft step confirmation
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMsg(err.message || 'Failed to save question records as draft.');
    } finally {
      setImporting(false);
    }
  };

  // Step 8: Approve & Publish
  const handleApproveAndPublish = async () => {
    if (!importBatchResult || importBatchResult.importedIds.length === 0) {
      setErrorMsg('No imported batch records found for publication.');
      return;
    }

    setPublishing(true);
    setErrorMsg(null);
    try {
      await mcqApi.bulkUpdateStatus(importBatchResult.importedIds, 'published');
      setPublishSuccess(
        `Approved & Published! ${importBatchResult.importedCount} questions (${importBatchResult.casesCount} case studies) are now live in the active Question Bank and Student Arena.`
      );
      setCurrentStep(8); // Final Published step
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      console.error('Publish error:', err);
      setErrorMsg(err.message || 'Failed to publish questions.');
    } finally {
      setPublishing(false);
    }
  };

  // Filter preview rows
  const displayedRows = (previewResult?.rows || []).filter((r) => {
    if (previewFilter === 'valid') return r.isValid;
    if (previewFilter === 'errors') return !r.isValid;
    if (previewFilter === 'cases') return r.data.questionType === 'case_based';
    return true;
  });

  const STEPS: { num: WizardStep; title: string; desc: string }[] = [
    { num: 1, title: 'Details', desc: 'Course & Config' },
    { num: 2, title: 'Upload', desc: 'CSV / XLSX' },
    { num: 3, title: 'Validate', desc: 'Syntax & Integrity' },
    { num: 4, title: 'Preview', desc: 'Inspect Rows' },
    { num: 5, title: 'Save Draft', desc: 'Saved in DB' },
    { num: 6, title: 'Review', desc: 'Admin Quality Audit' },
    { num: 7, title: 'Approve', desc: 'Confirm Compliance' },
    { num: 8, title: 'Publish', desc: 'Live in Arena' },
  ];

  return (
    <div className="space-y-6">
      {/* Workflow Navigation Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center border border-amber-500/30">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                WORKFLOW B
              </span>
              <h2 className="text-lg font-bold">Structured MCQ Bulk Import</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Production-grade 8-step import workflow for single and case-based MCQs via CSV or XLSX.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onGoToMaterialLibrary}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>Switch to Workflow A (Material Library)</span>
          </button>
        </div>
      </div>

      {/* 8-Step Stepper Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {STEPS.map((st) => {
            const isCompleted = currentStep > st.num;
            const isCurrent = currentStep === st.num;
            return (
              <button
                key={st.num}
                type="button"
                onClick={() => {
                  if (st.num <= currentStep || (st.num === 4 && previewResult)) {
                    setCurrentStep(st.num);
                  }
                }}
                disabled={st.num > currentStep && !(st.num === 4 && previewResult)}
                className={`p-2 rounded-xl text-left transition-all border cursor-pointer disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 ring-2 ring-blue-500/20'
                    : isCompleted
                    ? 'bg-slate-50 dark:bg-slate-800/60 border-emerald-300 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400'
                    : 'bg-transparent border-slate-200 dark:border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3 h-3" /> : st.num}
                    </span>
                    <span className={`truncate ${isCurrent ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                      {st.title}
                    </span>
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {st.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start gap-3 text-sm text-rose-700 dark:text-rose-300 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 1: SELECT COURSE & CONTENT DETAILS */}
      {/* ======================================================== */}
      {currentStep === 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Step 1 — Select Course & Content Details</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Configure curriculum mapping, question format, difficulty rule, and source category. Explicit row metadata in CSV/XLSX takes precedence over these defaults.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Course */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Course <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CANONICAL_COURSE_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Subject <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {courseSubjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            {/* Chapter */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Chapter <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {subjectChapters.map((chap) => (
                  <option key={chap} value={chap}>
                    {chap}
                  </option>
                ))}
              </select>
            </div>

            {/* Topic */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Topic
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {chapterTopics.map((top) => (
                  <option key={top} value={top}>
                    {top}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Question Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Question Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Single MCQ">Single MCQ (All rows must be NORMAL)</option>
                <option value="Case-Based MCQ">Case-Based MCQ (All rows must be CASE_BASED)</option>
                <option value="Mixed">Mixed (File may contain both; rows must state questionType)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {questionType === 'Single MCQ' && 'Enforces NORMAL structure for all questions.'}
                {questionType === 'Case-Based MCQ' && 'Enforces Case ID, Title, Scenario, and Sequence for all rows.'}
                {questionType === 'Mixed' && 'Each row must explicitly provide questionType (NORMAL or CASE_BASED).'}
              </p>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Difficulty <span className="text-rose-500">*</span>
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Easy">Easy (Every row forced/validated as Easy)</option>
                <option value="Moderate">Moderate (Every row forced/validated as Moderate)</option>
                <option value="Hard">Hard (Every row forced/validated as Hard)</option>
                <option value="Mixed">Mixed (Each row provides its own explicit difficulty)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Strict difficulty rule without silent overrides.
              </p>
            </div>

            {/* Source Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Source Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={sourceCategory}
                onChange={(e) => handleSourceCategoryChange(e.target.value as CanonicalSourceCategory)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CANONICAL_SOURCE_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Where the content originated. Note: AI generation is tracked separately under Generation Method.
              </p>
            </div>
          </div>

          {/* CONDITIONAL ATTEMPT / YEAR FIELD */}
          {/* Exact rule: MUST appear ONLY when Source Category is RTP, MTP, or PYQ */}
          {isAttemptRequiredSource(sourceCategory) && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl animate-in fade-in space-y-2">
              <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Attempt / Year (Applicable for {sourceCategory})</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={attemptYear}
                  onChange={(e) => setAttemptYear(e.target.value)}
                  placeholder={
                    sourceCategory === 'MTP'
                      ? 'e.g. May 2026 - Series 1'
                      : sourceCategory === 'RTP'
                      ? 'e.g. September 2026'
                      : 'e.g. May 2025'
                  }
                  className="flex-1 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />

                {/* Suggestions pill shortcuts */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {getAttemptSuggestions(sourceCategory).map((sugg) => (
                    <button
                      key={sugg}
                      type="button"
                      onClick={() => setAttemptYear(sugg)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                        attemptYear === sugg
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-amber-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {sugg}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/80">
                Structured examination metadata stored directly with each imported question.
              </p>
            </div>
          )}

          {/* Optional Source Material Link */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>Optional Source Material Link (Material Library)</span>
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Optional for traceability
              </span>
            </label>
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Independent MCQ Import (No linked source material)</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.material_name} ({m.course} • {m.subject} {m.attempt ? `• ${m.attempt}` : ''})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span>Next: Upload File (Step 2)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 2: UPLOAD (CSV / XLSX) */}
      {/* ======================================================== */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Step 2 — Upload Structured File (CSV or XLSX)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload your questions table. Supports both single MCQs and Case Studies.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCsvSample}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                <span>CSV Template</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadXlsxSample}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Excel Template</span>
              </button>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setUploadMode('upload')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                uploadMode === 'upload'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Upload File (CSV / XLSX)
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                uploadMode === 'paste'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Paste Raw CSV Text
            </button>
          </div>

          {uploadMode === 'upload' ? (
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                  uploadedFile
                    ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/40'
                }`}
              >
                {uploadedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {uploadedFile.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {(uploadedFile.size / 1024).toFixed(1)} KB • Format: {fileFormat}
                    </div>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1">
                      Click to choose a different file
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                      Click to browse or drag and drop your file
                    </div>
                    <div className="text-xs text-slate-500">
                      Supports CSV (.csv) or Excel (.xlsx / .xls)
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Paste CSV Lines (Header row required)
              </label>
              <textarea
                rows={8}
                value={csvContent}
                onChange={(e) => {
                  setCsvContent(e.target.value);
                  setUploadedFile(null);
                  setFileBase64('');
                  setFileFormat('CSV');
                }}
                placeholder="Question ID,Case ID,Case Title,Case Scenario,Case Sequence,Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation..."
                className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Back: Details (Step 1)
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              disabled={uploadMode === 'upload' ? !uploadedFile && !csvContent && !fileBase64 : !csvContent.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <span>Next: Validate (Step 3)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 3: VALIDATE */}
      {/* ======================================================== */}
      {currentStep === 3 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Step 3 — Run Validation Engine
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verify question structure, options completeness, case scenario consistency, and difficulty constraints before saving.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Course:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {CANONICAL_COURSE_OPTIONS.find((c) => c.value === selectedCourse)?.label || selectedCourse}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Subject:</span>
              <span className="font-bold text-slate-900 dark:text-white">{selectedSubject}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Question Type:</span>
              <span className="font-bold text-slate-900 dark:text-white">{questionType}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Difficulty:</span>
              <span className="font-bold text-slate-900 dark:text-white">{difficulty}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Source Category:</span>
              <span className="font-bold text-slate-900 dark:text-white">{sourceCategory}</span>
            </div>
            {isAttemptRequiredSource(sourceCategory) && (
              <div>
                <span className="text-slate-500 block">Attempt / Year:</span>
                <span className="font-bold text-slate-900 dark:text-white">{attemptYear || 'Not set'}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500 block">File:</span>
              <span className="font-bold text-slate-900 dark:text-white truncate block">
                {uploadedFile?.name || (uploadMode === 'paste' ? 'Pasted CSV' : 'Loaded file')}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Format:</span>
              <span className="font-bold text-slate-900 dark:text-white">{fileFormat}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Back: Upload (Step 2)
            </button>

            <button
              type="button"
              onClick={handleRunValidation}
              disabled={validating}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {validating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating Rows...</span>
                </>
              ) : (
                <>
                  <span>Run Validation Engine</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 4: PREVIEW */}
      {/* ======================================================== */}
      {currentStep === 4 && previewResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Step 4 — Validation Preview & Verification</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Inspect parsed questions, error details, and case study groupings before saving to database.
            </p>
          </div>

          {/* Metrics summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-500">Total Rows</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                {previewResult.totalRows}
              </div>
            </div>
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Valid Rows</div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                {previewResult.validCount}
              </div>
            </div>
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900">
              <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold">Error Rows</div>
              <div className="text-xl font-bold text-rose-700 dark:text-rose-300 mt-0.5">
                {previewResult.invalidCount}
              </div>
            </div>
            <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">Case Studies</div>
              <div className="text-xl font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                {previewResult.caseCount}
              </div>
            </div>
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Single MCQs</div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                {previewResult.normalCount}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            {[
              { id: 'all', label: `All Rows (${previewResult.rows.length})` },
              { id: 'valid', label: `Valid Only (${previewResult.validCount})` },
              { id: 'errors', label: `Errors Only (${previewResult.invalidCount})` },
              { id: 'cases', label: `Case Studies (${previewResult.caseCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreviewFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  previewFilter === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Rows Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Question Text</th>
                  <th className="p-3">Correct</th>
                  <th className="p-3">Subject / Chapter</th>
                  <th className="p-3">Difficulty</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Status / Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedRows.map((r) => (
                  <tr
                    key={r.rowNumber}
                    className={
                      r.isValid
                        ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        : 'bg-rose-50/50 dark:bg-rose-950/20'
                    }
                  >
                    <td className="p-3 font-mono text-slate-500">{r.rowNumber}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.data.questionType === 'case_based'
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {r.data.questionType === 'case_based' ? 'Case' : 'Single'}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs truncate" title={r.data.questionText}>
                      {r.data.questionText || <span className="text-slate-400 italic">Empty</span>}
                    </td>
                    <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                      {r.data.correctAnswer}
                    </td>
                    <td className="p-3 max-w-[140px] truncate text-slate-600 dark:text-slate-300">
                      {r.data.subject} • {r.data.chapter}
                    </td>
                    <td className="p-3 capitalize">{r.data.difficulty}</td>
                    <td className="p-3">
                      {r.data.source}
                      {r.data.attempt && <span className="text-slate-400 block text-[10px]">{r.data.attempt}</span>}
                    </td>
                    <td className="p-3">
                      {r.isValid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {r.errors.map((err, i) => (
                            <span
                              key={i}
                              className="text-[10px] text-rose-600 dark:text-rose-400 block bg-rose-100/60 dark:bg-rose-950/50 p-1 rounded"
                            >
                              {err}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Back: Upload
            </button>

            <button
              type="button"
              onClick={handleImportAsDraft}
              disabled={importing || previewResult.validCount === 0}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Records as Draft...</span>
                </>
              ) : (
                <>
                  <span>Save {previewResult.validCount} Records as Draft (Step 5)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 5: SAVE AS DRAFT CONFIRMATION */}
      {/* ======================================================== */}
      {currentStep === 5 && importBatchResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Step 5 — Saved as Draft in Database
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Successfully saved <strong>{importBatchResult.importedCount} questions</strong> across{' '}
                <strong>{importBatchResult.casesCount} case bundles</strong> with generation method{' '}
                <code className="text-blue-500 font-mono">IMPORTED</code>.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
            <div className="font-bold text-slate-800 dark:text-slate-200">Draft Ingestion Details:</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-600 dark:text-slate-300">
              <div>Total Records: <strong className="text-slate-900 dark:text-white">{importBatchResult.importedCount}</strong></div>
              <div>Case Studies: <strong className="text-slate-900 dark:text-white">{importBatchResult.casesCount}</strong></div>
              <div>Database Status: <strong className="text-amber-500 uppercase">DRAFT</strong></div>
              <div>Arena Visibility: <strong className="text-slate-400">Hidden from students</strong></div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Back: Preview (Step 4)
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(6)}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span>Proceed to Admin Review (Step 6)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 6: REVIEW (Admin Quality Checklist) */}
      {/* ======================================================== */}
      {currentStep === 6 && importBatchResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Step 6 — Admin Review & Quality Audit
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Verify content compliance and accuracy against ICAI syllabus guidelines before final approval.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Admin Quality Certification Checklist:
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Question prompts and option choices are verified for clean syntax and ICAI terminology.</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Statutory sections, accounting standards, and explanatory workings are attached.</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Case study scenarios are factual, complete, and properly ordered by sequential numbering.</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Course and syllabus scheme: {selectedCourse} • {selectedSubject}.</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Back: Draft (Step 5)
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(7)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span>Confirm & Approve Batch (Step 7)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 7: APPROVE */}
      {/* ======================================================== */}
      {currentStep === 7 && importBatchResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Step 7 — Admin Approval Confirmed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Batch certified ready for publication. Clicking Publish will make all {importBatchResult.importedCount} questions immediately available to students in the Practice Arena.
              </p>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-2 text-emerald-800 dark:text-emerald-300">
            <div className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Ready for Live Deployment</span>
            </div>
            <p>
              Publication updates the canonical status of all {importBatchResult.importedCount} questions from <code>DRAFT</code> to <code>PUBLISHED</code>, indexing them for randomized practice sessions, quick tests, and mock examinations.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(6)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Back: Review (Step 6)
            </button>

            <button
              type="button"
              onClick={handleApproveAndPublish}
              disabled={publishing}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing Live...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Step 8 — Publish to Question Bank & Arena</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 8: PUBLISH (Celebration & Success) */}
      {/* ======================================================== */}
      {currentStep === 8 && publishSuccess && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-8 text-center space-y-5 shadow-lg animate-in fade-in">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-300 dark:border-emerald-800 shadow-sm">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Questions Successfully Published!
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 max-w-lg mx-auto leading-relaxed">
              {publishSuccess}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setCurrentStep(1);
                setPreviewResult(null);
                setUploadedFile(null);
                setCsvContent('');
                setImportBatchResult(null);
                setPublishSuccess(null);
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              Import Another Question Batch
            </button>

            {onImportComplete && (
              <button
                type="button"
                onClick={onImportComplete}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Go to Active Question Bank
              </button>
            )}
          </div>
        </div>
      )}

      {/* Case Scenario Detail Modal */}
      {selectedCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-purple-200 dark:border-purple-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 text-xs font-mono font-bold">
                  {selectedCaseModal.caseId}
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedCaseModal.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCaseModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase">
                Parent Case Study Scenario:
              </div>
              <div className="p-4 bg-purple-50/50 dark:bg-slate-800/60 rounded-xl border border-purple-100 dark:border-purple-900 text-xs text-slate-800 dark:text-slate-200 leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">
                {selectedCaseModal.scenario}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedCaseModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
