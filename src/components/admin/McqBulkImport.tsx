import React, { useState, useEffect, useRef } from 'react';
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
  Info,
  Check,
  Link as LinkIcon,
} from 'lucide-react';
import { mcqApi, McqMaterial, BulkImportPreviewResult } from '../../api/mcqClient.js';
import { McqCourse } from '../../types/index.js';

interface McqBulkImportProps {
  onImportComplete?: () => void;
  onGoToMaterialLibrary?: () => void;
}

const SAMPLE_CSV = `Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Reference,Course,Subject,Chapter,Topic,Difficulty,Question Type,Source,Attempt
"Under Section 2(46) of the Companies Act 2013, a holding company in relation to one or more other companies means:","A company of which such companies are subsidiary companies","A company holding more than 20% shares","A company whose directors control another board","Any listed entity",A,"As per Section 2(46), holding company means a company of which such companies are subsidiary companies.","Companies Act 2013 Sec 2(46)",CA_INTERMEDIATE,"Corporate and Other Laws","Chapter 1 - Preliminary","Holding Company",easy,normal,"ICAI Module","May 2026"
"Which of the following is considered an extraordinary general meeting requisitioned under Section 100?","Annual General Meeting","Extraordinary General Meeting called by Board or Requisitionists","Statutory Meeting","Board Meeting",B,"Section 100 provides for calling of EGM by Board on requisition of members holding specified paid-up capital.","Companies Act 2013 Sec 100",CA_INTERMEDIATE,"Corporate and Other Laws","Chapter 7 - Management and Administration","EGM Requisition",moderate,normal,"MTP May 2026","May 2026"`;

export const McqBulkImport: React.FC<McqBulkImportProps> = ({
  onImportComplete,
  onGoToMaterialLibrary,
}) => {
  const [csvContent, setCsvContent] = useState<string>('');
  const [validating, setValidating] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkImportPreviewResult | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Source Material Linking
  const [materials, setMaterials] = useState<McqMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');

  // Default values
  const [defaultCourse, setDefaultCourse] = useState<McqCourse>('CA_INTERMEDIATE');
  const [defaultSubject, setDefaultSubject] = useState<string>('Corporate and Other Laws');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      const data = await mcqApi.getMaterials({ limit: 50 });
      setMaterials(data.materials || []);
    } catch (err) {
      console.warn('Could not fetch materials for linking:', err);
    }
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mcq_structured_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.txt')) {
      setErrorMsg('For structured question imports, please provide a CSV file (.csv). For source PDF documents, switch to Material Library.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      setPreviewResult(null);
    };
    reader.readAsText(file);
  };

  const handleValidatePreview = async () => {
    if (!csvContent.trim()) {
      setErrorMsg('Please upload a CSV file or paste question records below.');
      return;
    }

    setErrorMsg(null);
    setValidating(true);

    try {
      const preview = await mcqApi.validateBulkImport(csvContent, {
        course: defaultCourse,
        subject: defaultSubject,
        sourceMaterialId: selectedMaterialId || undefined,
      });

      setPreviewResult(preview);
    } catch (err: any) {
      console.error('Validation error:', err);
      setErrorMsg(err.message || 'Failed to parse and validate CSV records.');
    } finally {
      setValidating(false);
    }
  };

  const handleCommitImport = async () => {
    if (!previewResult || previewResult.validCount === 0) {
      setErrorMsg('No valid question rows to import.');
      return;
    }

    setImporting(true);
    setErrorMsg(null);

    try {
      const validRows = previewResult.rows.filter((r) => r.isValid);
      const res = await mcqApi.commitBulkImport(validRows);

      setImportSuccess(`Successfully imported ${res.importedCount} questions into the active Question Bank!`);
      setPreviewResult(null);
      setCsvContent('');
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      console.error('Commit error:', err);
      setErrorMsg(err.message || 'Failed to commit imported questions.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Workflow Separation Notice */}
      <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-white">Structured MCQ Bulk Import</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              CSV / XLSX
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Import pre-structured multiple-choice questions with 4 options and answer keys directly into the question bank.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownloadSample}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV Template</span>
          </button>
          {onGoToMaterialLibrary && (
            <button
              onClick={onGoToMaterialLibrary}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-bold rounded-xl border border-blue-500/30 transition cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Go to Material Library (PDF/TXT)</span>
            </button>
          )}
        </div>
      </div>

      {/* Distinction Banner */}
      <div className="p-4 bg-slate-900/90 border border-slate-700 rounded-xl flex items-start gap-3 text-xs">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-white">Two Distinct Content Management Workflows:</div>
          <p className="text-slate-400">
            <strong>1. Material Library:</strong> For official ICAI reference papers in <em>PDF and TXT</em> format (MTPs, RTPs, Study Modules).
          </p>
          <p className="text-slate-400">
            <strong>2. Structured MCQ Bulk Import:</strong> For spreadsheet rows in <em>CSV and XLSX</em> containing questions with Options A, B, C, D and Answer Keys.
          </p>
        </div>
      </div>

      {importSuccess && (
        <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold rounded-xl flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{importSuccess}</span>
          </div>
          <button
            onClick={() => setImportSuccess(null)}
            className="text-emerald-300 hover:text-white text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-semibold rounded-xl flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Import Configuration Card */}
      <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 space-y-4 text-xs">
        <h3 className="font-bold text-white text-sm">1. Optional Linking & Defaults</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-bold text-slate-300 mb-1">
              Link to Source Document in Material Library (Optional)
            </label>
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None (Independent Question Import)</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.material_name} ({m.file_type} • {m.attempt || 'General'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">Default Course</label>
            <select
              value={defaultCourse}
              onChange={(e) => setDefaultCourse(e.target.value as McqCourse)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="CA_FOUNDATION">CA Foundation</option>
              <option value="CA_INTERMEDIATE">CA Intermediate</option>
              <option value="CA_FINAL">CA Final</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">Default Subject</label>
            <input
              type="text"
              value={defaultSubject}
              onChange={(e) => setDefaultSubject(e.target.value)}
              placeholder="e.g. Corporate and Other Laws"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* File or Text Area */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <label className="block font-bold text-slate-300">
              2. Upload CSV File or Paste Question Records
            </label>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-700 text-blue-400 font-bold rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Browse CSV File</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <textarea
            rows={8}
            value={csvContent}
            onChange={(e) => {
              setCsvContent(e.target.value);
              setPreviewResult(null);
            }}
            placeholder={`Paste CSV content here...\n\nExample Header:\nQuestion Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Reference,Course,Subject,Chapter,Topic,Difficulty,Question Type,Source,Attempt`}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          />
        </div>

        {/* Validation CTA */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
          <button
            onClick={() => {
              setCsvContent(SAMPLE_CSV);
              setPreviewResult(null);
            }}
            className="text-xs text-slate-400 hover:text-blue-400 underline cursor-pointer"
          >
            Load Sample CSV Data
          </button>

          <button
            disabled={!csvContent.trim() || validating}
            onClick={handleValidatePreview}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50 transition cursor-pointer"
          >
            {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Validate & Preview Questions</span>
          </button>
        </div>
      </div>

      {/* PREVIEW RESULTS */}
      {previewResult && (
        <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 space-y-4 text-xs animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-700">
            <div>
              <h3 className="text-base font-bold text-white">Import Preview & Validation Report</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Total Rows: <strong>{previewResult.totalRows}</strong> • Valid Questions:{' '}
                <strong className="text-emerald-400">{previewResult.validCount}</strong> • Invalid:{' '}
                <strong className="text-red-400">{previewResult.invalidCount}</strong>
              </p>
            </div>

            <button
              disabled={importing || previewResult.validCount === 0}
              onClick={handleCommitImport}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition cursor-pointer"
            >
              {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>Import {previewResult.validCount} Valid Questions</span>
            </button>
          </div>

          {/* Table of Parsed Questions */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-700/80 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-700">
                <tr>
                  <th className="px-3 py-2.5">Row</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Question Text</th>
                  <th className="px-3 py-2.5">Ans</th>
                  <th className="px-3 py-2.5">Course / Subject</th>
                  <th className="px-3 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-300">
                {previewResult.rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`hover:bg-slate-700/30 transition ${
                      !row.isValid ? 'bg-red-500/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                      #{row.rowNumber}
                    </td>

                    <td className="px-3 py-2">
                      {row.isValid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
                          <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2 max-w-sm">
                      <div className="font-semibold text-white truncate" title={row.data.questionText}>
                        {row.data.questionText || '<Missing Question Text>'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        A: {row.data.optionA} | B: {row.data.optionB}
                      </div>
                    </td>

                    <td className="px-3 py-2 font-bold text-blue-400 font-mono">
                      {row.data.correctAnswer}
                    </td>

                    <td className="px-3 py-2 text-[11px]">
                      <div className="text-slate-300">{row.data.course}</div>
                      <div className="text-slate-500 truncate max-w-[120px]">{row.data.subject}</div>
                    </td>

                    <td className="px-3 py-2 text-[11px]">
                      {row.isValid ? (
                        <span className="text-slate-400 font-mono text-[10px]">
                          {row.data.difficulty} • {row.data.questionType}
                        </span>
                      ) : (
                        <div className="text-red-400 font-semibold space-y-0.5">
                          {row.errors.map((e, idx) => (
                            <div key={idx}>• {e}</div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
