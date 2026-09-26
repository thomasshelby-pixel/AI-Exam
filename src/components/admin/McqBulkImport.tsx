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
} from 'lucide-react';
import { mcqApi, McqMaterial, BulkImportPreviewResult } from '../../api/mcqClient.js';
import { McqCourse } from '../../types/index.js';
import {
  CANONICAL_COURSE_OPTIONS,
  getCourseSubjects,
  getSubjectChapters,
  getChapterTopics,
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
Q-C-001,CASE-001,ABC Ltd Compliance Case,"ABC Ltd is an unlisted public company having a paid-up share capital of Rs. 10 Crores and turnover of Rs. 120 Crores during the preceding financial year. The Board consists of 6 directors. The company proposes to hold an Extraordinary General Meeting (EGM) upon requisition received from members holding 12% of the paid-up capital on 10th January.",1,"Based on the facts above, which statutory provision governs the calling of an EGM on requisition?","Section 96 of Companies Act 2013","Section 100 of Companies Act 2013","Section 108 of Companies Act 2013","Section 111 of Companies Act 2013",B,"Section 100 provides that the Board shall call an EGM on the requisition of members holding not less than one-tenth of paid-up share capital.","Companies Act 2013 Sec 100",CA Intermediate,Corporate and Other Laws,Management and Administration - Sec 88 to 122,Annual General Meeting (AGM) & EGM,Moderate,CASE_BASED,ICAI Module,May 2026,2024-05-01,2028-12-31,New Scheme 2024
Q-C-002,CASE-001,ABC Ltd Compliance Case,"ABC Ltd is an unlisted public company having a paid-up share capital of Rs. 10 Crores and turnover of Rs. 120 Crores during the preceding financial year. The Board consists of 6 directors. The company proposes to hold an Extraordinary General Meeting (EGM) upon requisition received from members holding 12% of the paid-up capital on 10th January.",2,"Within what time period from the date of receipt of a valid requisition must the Board proceed to call the meeting?","Within 21 days","Within 30 days","Within 45 days","Within 60 days",A,"Under Section 100(2), the Board must within 21 days from the date of receipt of a valid requisition proceed to call a meeting on a day not later than 45 days.","Companies Act 2013 Sec 100(2)",CA Intermediate,Corporate and Other Laws,Management and Administration - Sec 88 to 122,Annual General Meeting (AGM) & EGM,Moderate,CASE_BASED,ICAI Module,May 2026,2024-05-01,2028-12-31,New Scheme 2024`;

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const McqBulkImport: React.FC<McqBulkImportProps> = ({
  onImportComplete,
  onGoToMaterialLibrary,
}) => {
  // Step State
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // STEP 1: Cascading Defaults
  const [selectedCourse, setSelectedCourse] = useState<string>('CA_INTERMEDIATE');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('Not Applicable');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [materials, setMaterials] = useState<McqMaterial[]>([]);

  // STEP 2: Input Mode & Content
  const [uploadMode, setUploadMode] = useState<'upload' | 'paste'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileFormat, setFileFormat] = useState<'CSV' | 'XLSX'>('CSV');
  const [csvContent, setCsvContent] = useState<string>('');

  // STEP 3 & 4: Validation & Preview
  const [validating, setValidating] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkImportPreviewResult | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors' | 'cases'>('all');
  const [selectedCaseModal, setSelectedCaseModal] = useState<{
    caseId: string;
    title: string;
    scenario: string;
  } | null>(null);

  // STEP 5, 6, 7: Import, Review, Publish
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

  // Update cascading dropdowns when Course changes
  const courseSubjects = getCourseSubjects(selectedCourse);
  useEffect(() => {
    if (courseSubjects.length > 0 && (!selectedSubject || !courseSubjects.includes(selectedSubject))) {
      setSelectedSubject(courseSubjects[0]);
    }
  }, [selectedCourse, courseSubjects, selectedSubject]);

  // Update cascading dropdowns when Subject changes
  const subjectChapters = getSubjectChapters(selectedCourse, selectedSubject);
  useEffect(() => {
    if (subjectChapters.length > 0 && (!selectedChapter || !subjectChapters.includes(selectedChapter))) {
      setSelectedChapter(subjectChapters[0]);
    }
  }, [selectedCourse, selectedSubject, subjectChapters, selectedChapter]);

  // Update cascading dropdowns when Chapter changes
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

  // Download Sample CSV
  const handleDownloadCsvSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mcq_case_architecture_template.csv');
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
    XLSX.writeFile(wb, 'mcq_case_architecture_template.xlsx');
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
        'Invalid format. The Structured MCQ Import workflow strictly accepts CSV (.csv) or Excel (.xlsx) files. For PDF reference study materials, switch to the Material Library workflow.'
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

  // Step 5: Import as Draft
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
      setCurrentStep(6); // Advance to Admin Review Step
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMsg(err.message || 'Failed to save question records as draft.');
    } finally {
      setImporting(false);
    }
  };

  // Step 7: Approve & Publish
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
      setCurrentStep(7);
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
              Imports canonical Normal and Case-Based MCQs directly into the Question Bank via CSV or XLSX.
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

      {/* 7-Step Stepper Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {[
            { num: 1, title: 'Defaults', desc: 'Course & Subject' },
            { num: 2, title: 'Upload', desc: 'CSV / XLSX' },
            { num: 3, title: 'Validate', desc: 'Case Structure' },
            { num: 4, title: 'Preview', desc: 'Verify Rows' },
            { num: 5, title: 'Draft', desc: 'Import Records' },
            { num: 6, title: 'Review', desc: 'Admin Inspect' },
            { num: 7, title: 'Publish', desc: 'Make Live' },
          ].map((st) => {
            const isCompleted = currentStep > st.num;
            const isCurrent = currentStep === st.num;
            return (
              <button
                key={st.num}
                type="button"
                onClick={() => {
                  if (st.num <= currentStep || (st.num === 4 && previewResult)) {
                    setCurrentStep(st.num as WizardStep);
                  }
                }}
                disabled={st.num > currentStep && !(st.num === 4 && previewResult)}
                className={`p-2.5 rounded-xl text-left transition-all border cursor-pointer disabled:cursor-not-allowed ${
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
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3 h-3" /> : st.num}
                    </span>
                    <span className={isCurrent ? 'text-blue-700 dark:text-blue-300' : ''}>
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
      {/* STEP 1: IMPORT DEFAULTS (Cascading Dropdowns) */}
      {/* ======================================================== */}
      {currentStep === 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Step 1 — Set Import Defaults</span>
              <span className="text-xs font-normal text-slate-500">(Convenience values for blank row fields)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <strong>Priority Rule:</strong> Explicit metadata inside any CSV/XLSX row always takes priority over these defaults. Defaults are used only when a row does not specify a course, subject, or chapter.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Course Dropdown */}
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

            {/* Subject Dropdown (Cascades from Course) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Subject (Cascading from Course) <span className="text-rose-500">*</span>
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

            {/* Chapter Dropdown (Cascades from Course + Subject) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Chapter (Cascading from Subject) <span className="text-rose-500">*</span>
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

            {/* Topic Dropdown (Cascades from Chapter) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Topic (Cascading from Chapter)
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

          {/* Optional Source Material Link */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>Link to Source Document in Material Library (Optional)</span>
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Stores stable <code>sourceMaterialId</code>
              </span>
            </label>
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None — Independent Question Import (No source material linked)</option>
              {materials.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.material_name} ({mat.course} • {mat.material_type} • ID: {mat.id.slice(0, 14)}...)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Linking allows students and administrators to trace question references and suggested rubrics directly to authentic study materials.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span>Continue to Step 2 (Upload Questions)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 2: UPLOAD STRUCTURED MCQS (CSV / XLSX / Paste) */}
      {/* ======================================================== */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Step 2 — Upload Structured MCQs</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload a structured <code>.csv</code> or <code>.xlsx</code> file containing Normal or Case-Based questions.
              </p>
            </div>

            {/* Template Downloads */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadCsvSample}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV Template</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadXlsxSample}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>XLSX Template</span>
              </button>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setUploadMode('upload')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                uploadMode === 'upload'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Upload CSV or XLSX File
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                uploadMode === 'paste'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Paste CSV Content Directly
            </button>
          </div>

          {uploadMode === 'upload' ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-8 text-center bg-slate-50/50 dark:bg-slate-800/30 transition-colors cursor-pointer group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                />
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {uploadedFile ? uploadedFile.name : 'Click to select CSV or XLSX file'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supported formats: <strong>.csv</strong> or <strong>.xlsx</strong> (Strictly Structured MCQs)
                </p>
                {uploadedFile && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {(uploadedFile.size / 1024).toFixed(1)} KB • Format: {fileFormat}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Paste Structured CSV Rows
              </label>
              <textarea
                value={csvContent}
                onChange={(e) => {
                  setCsvContent(e.target.value);
                  setFileFormat('CSV');
                  setFileBase64('');
                  setUploadedFile(null);
                }}
                rows={10}
                placeholder="Question ID,Case ID,Case Title,Case Scenario,Case Sequence,Question Text,Option A,Option B,Option C,Option D,Correct Answer..."
                className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleRunValidation}
              disabled={validating || (!uploadedFile && !csvContent.trim())}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {validating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Validating Rules...</span>
                </>
              ) : (
                <>
                  <span>Validate & Preview Records</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 3 & 4: VALIDATION & PREVIEW (Visual Scorecard + Table) */}
      {/* ======================================================== */}
      {currentStep === 4 && previewResult && (
        <div className="space-y-6">
          {/* Summary Scorecard */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-slate-500">Total Rows Detected</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {previewResult.totalRows}
              </div>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Valid Questions</div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                {previewResult.validCount}
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">Validation Errors</div>
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">
                {previewResult.invalidCount}
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-purple-700 dark:text-purple-400 font-medium">Case Studies Detected</div>
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">
                {previewResult.caseCount}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-blue-700 dark:text-blue-400 font-medium">Normal MCQs</div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                {previewResult.normalCount}
              </div>
            </div>
          </div>

          {/* Cases Detected Banner */}
          {previewResult.casesSummary && previewResult.casesSummary.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                <span>Parent Case Bundles Found ({previewResult.casesSummary.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {previewResult.casesSummary.map((cs) => (
                  <div
                    key={cs.caseId}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 text-[10px] font-mono">
                          {cs.caseId}
                        </span>
                        <span>{cs.caseTitle}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {cs.subject} • {cs.chapter}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-semibold text-purple-700 dark:text-purple-300">
                        {cs.questionCount} Questions
                      </span>
                      <div className="text-[10px] text-slate-400">
                        Seq: {cs.sequences.join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Table Controls */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Filter View:</span>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('all')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      previewFilter === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    All ({previewResult.totalRows})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('valid')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      previewFilter === 'valid' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Valid Only ({previewResult.validCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('errors')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      previewFilter === 'errors' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Errors ({previewResult.invalidCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('cases')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      previewFilter === 'cases' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Case Studies
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Edit / Re-upload File
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 w-16">Row #</th>
                    <th className="py-2.5 px-3 w-28">Type</th>
                    <th className="py-2.5 px-3 w-32">Case ID / Seq</th>
                    <th className="py-2.5 px-4 min-w-[280px]">Question Preview</th>
                    <th className="py-2.5 px-3 w-20 text-center">Answer</th>
                    <th className="py-2.5 px-3 w-36">Course & Subject</th>
                    <th className="py-2.5 px-3 w-28 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedRows.map((r) => {
                    const isCase = r.data.questionType === 'case_based';
                    return (
                      <tr
                        key={r.rowNumber}
                        className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                          !r.isValid ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-400 font-semibold">
                          #{r.rowNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block ${
                              isCase
                                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                                : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                            }`}
                          >
                            {isCase ? 'CASE_BASED' : 'NORMAL'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {isCase ? (
                            <div>
                              <span className="font-mono font-bold text-purple-700 dark:text-purple-300 text-[11px]">
                                {r.data.caseId}
                              </span>
                              <div className="text-[10px] text-slate-500">
                                Seq #{r.data.caseSequence}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Single MCQ</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-white line-clamp-2">
                            {r.data.questionText || <span className="text-rose-500 italic">Missing question text</span>}
                          </div>
                          {isCase && r.data.caseStudyScenario && (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCaseModal({
                                  caseId: r.data.caseId || '',
                                  title: r.data.caseTitle || '',
                                  scenario: r.data.caseStudyScenario || '',
                                })
                              }
                              className="mt-1 text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Parent Case Scenario</span>
                            </button>
                          )}
                          {!r.isValid && (
                            <div className="mt-1.5 space-y-0.5">
                              {r.errors.map((err, idx) => (
                                <div key={idx} className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  <span>{err}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold inline-flex items-center justify-center text-xs">
                            {r.data.correctAnswer || '-'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 dark:text-white truncate max-w-[130px]">
                            {r.data.course?.replace('CA_', 'CA ')}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                            {r.data.subject}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                              <XCircle className="w-3 h-3" />
                              Invalid
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Stepper Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                Ready to import <strong>{previewResult.validCount}</strong> valid questions into canonical Question Bank.
                {previewResult.invalidCount > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 ml-1">
                    ({previewResult.invalidCount} invalid rows will be skipped)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleImportAsDraft}
                  disabled={importing || previewResult.validCount === 0}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Importing as Draft...</span>
                    </>
                  ) : (
                    <>
                      <span>Import {previewResult.validCount} Valid Records as Draft</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 5 & 6: ADMIN REVIEW (Inspect Draft Batch) */}
      {/* ======================================================== */}
      {currentStep === 6 && importBatchResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Step 5 & 6 — Imported as Draft (Ready for Review)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Successfully saved <strong>{importBatchResult.importedCount} questions</strong> across{' '}
                <strong>{importBatchResult.casesCount} case bundles</strong> with status <code>DRAFT</code>.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Admin Review Quality Checklist:
            </div>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Parent Case Bundles linked via stable <code>caseId</code></span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Cascading metadata (Course, Subject, Chapter) validated</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Zero negative marking policy enforced for Intermediate and Final</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Explanation & statutory reference attached to each option</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setCurrentStep(1);
                setPreviewResult(null);
                setUploadedFile(null);
                setCsvContent('');
              }}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              Start New Import Batch
            </button>

            <button
              type="button"
              onClick={handleApproveAndPublish}
              disabled={publishing}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Publishing Batch...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Step 7 — Approve & Publish to Active Bank</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 7: APPROVE / PUBLISH COMPLETED */}
      {/* ======================================================== */}
      {currentStep === 7 && publishSuccess && (
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
