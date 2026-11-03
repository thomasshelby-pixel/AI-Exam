import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../api/client';
import { CALevel } from '../../types';
import { AlertCircle, CheckCircle2, FileText, Files, Loader2, Upload, X } from 'lucide-react';

interface SubjectOption {
  key: string;
  name: string;
  paper: string;
}

interface ModelTestBulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  subjectsByLevel: Record<CALevel, SubjectOption[]>;
}

interface PreviewMaterial {
  id?: string;
  modelTestNumber: number;
  title: string;
  questionPaperCharacters: number;
  suggestedAnswerCharacters: number;
  markingSchemeCharacters: number;
}

interface BulkResponse {
  success: boolean;
  uploaded?: number;
  validated?: number;
  materials?: PreviewMaterial[];
  errors?: string[];
  blocked?: Array<{ modelTestNumber: number; status?: string; message?: string; reason?: string; existingTitle?: string; existingId?: string }>;
  error?: string;
  message?: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_BYTES = 16 * 1024 * 1024;

export const ModelTestBulkUploadModal: React.FC<ModelTestBulkUploadModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  subjectsByLevel,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [level, setLevel] = useState<CALevel>('INTERMEDIATE');
  const [subjectKey, setSubjectKey] = useState<string>(subjectsByLevel.INTERMEDIATE[0]?.key || '');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewMaterial[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const subjects = useMemo(() => subjectsByLevel[level] || [], [level, subjectsByLevel]);
  const selectedSubject = subjects.find((subject) => subject.key === subjectKey) || subjects[0];

  useEffect(() => {
    if (!subjects.some((subject) => subject.key === subjectKey)) {
      setSubjectKey(subjects[0]?.key || '');
    }
  }, [level, subjectKey, subjects]);

  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setPreview(null);
      setErrors([]);
      setBusy(false);
      setSuccessMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const readFiles = async () => {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length === 0) throw new Error('Select one or more TXT files first.');
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) throw new Error(`${oversized.name} exceeds the 2 MB per-file limit.`);
    if (totalBytes > MAX_BATCH_BYTES) throw new Error('The complete TXT batch exceeds the 16 MB limit.');

    return Promise.all(files.map(async (file) => ({
      fileName: file.name,
      content: await file.text(),
    })));
  };

  const submitBatch = async (dryRun: boolean) => {
    if (!selectedSubject) {
      setErrors(['Select a subject before continuing.']);
      return;
    }

    setBusy(true);
    setErrors([]);
    setSuccessMessage('');
    try {
      const textFiles = await readFiles();
      const result = await apiRequest<BulkResponse>('/api/admin/materials/bulk-model-tests', {
        method: 'POST',
        body: JSON.stringify({
          level,
          subjectKey: selectedSubject.key,
          subjectName: selectedSubject.name,
          paper: selectedSubject.paper,
          files: textFiles,
          dryRun,
        }),
      });

      if (!result.success) {
        setPreview(null);
        setErrors(result.errors?.length
          ? result.errors
          : result.blocked?.map((item) => `Model ${item.modelTestNumber}: ${item.message || item.reason || item.status || (item.existingTitle ? `already exists — ${item.existingTitle}` : 'this model slot is already occupied')}`) || [result.error || 'Batch validation failed.']);
        return;
      }

      if (dryRun) {
        setPreview(result.materials || []);
        setSuccessMessage(result.message || 'All eight model files passed validation.');
      } else {
        setSuccessMessage(result.message || `Uploaded ${result.uploaded || 8} Model Test Papers.`);
        setPreview(result.materials || []);
        onComplete();
      }
    } catch (error: any) {
      const apiErrors = error?.data?.errors;
      const blocked = error?.data?.blocked;
      setPreview(null);
      setErrors(Array.isArray(apiErrors) && apiErrors.length
        ? apiErrors
        : Array.isArray(blocked) && blocked.length
          ? blocked.map((item: any) => `Model ${item.modelTestNumber}: ${item.message || item.reason || item.status || (item.existingTitle ? `already exists — ${item.existingTitle}` : 'this model slot is already occupied')}`)
          : [error instanceof Error ? error.message : 'Unable to process this TXT batch.']);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleFilesChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setFiles(selected);
    setPreview(null);
    setErrors([]);
    setSuccessMessage('');
    event.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl border border-slate-200">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Files className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Bulk Model Test Paper Upload</h2>
                <p className="text-xs text-slate-500 mt-0.5">Upload Model 1–8 together using TXT files. No PDF extraction or Gemini call.</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={handleClose} disabled={busy} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">CA Course *</label>
              <select
                value={level}
                onChange={(event) => { setLevel(event.target.value as CALevel); setPreview(null); }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm"
                disabled={busy}
              >
                <option value="FOUNDATION">CA Foundation</option>
                <option value="INTERMEDIATE">CA Intermediate</option>
                <option value="FINAL">CA Final</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Subject *</label>
              <select
                value={selectedSubject?.key || ''}
                onChange={(event) => { setSubjectKey(event.target.value); setPreview(null); }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm"
                disabled={busy}
              >
                {subjects.map((subject) => (
                  <option key={subject.key} value={subject.key}>{subject.name} ({subject.paper})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="text-xs font-bold text-indigo-950 mb-1">TXT format required</p>
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-indigo-900">{'MODEL TEST PAPER 1\n[QUESTION PAPER]\n...full question paper...\n[SUGGESTED ANSWERS]\n...full model answers...\n[MARKING SCHEME]\n...step-wise marks...'}</pre>
            <p className="text-[11px] text-indigo-800 mt-2">Upload 8 combined TXT files, one master TXT with Model 1–8 blocks, or 24 separate files named like Model 1 Question Paper.txt, Model 1 Suggested Answers.txt and Model 1 Marking Scheme.txt (repeat for Models 2–8).</p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-7 text-center cursor-pointer transition bg-slate-50/60"
          >
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm mx-auto flex items-center justify-center text-indigo-600 mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">Choose all Model Test TXT files</p>
            <p className="text-xs text-slate-500 mt-1">Multiple files supported · 2 MB each · 16 MB total</p>
            <input ref={fileInputRef} type="file" accept=".txt,text/plain" multiple className="hidden" onChange={handleFilesChanged} />
          </div>

          {files.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800">{files.length} file(s) selected</p>
                <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => { setFiles([]); setPreview(null); setErrors([]); }}>Clear</button>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {files.map((file) => (
                  <div key={file.name} className="flex items-center gap-2 text-xs text-slate-600">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-rose-800 text-xs font-bold"><AlertCircle className="w-4 h-4" /> Validation / upload issues</div>
              {errors.map((error, index) => <p key={index} className="text-[11px] text-rose-700">• {error}</p>)}
              <p className="text-[11px] text-rose-700 font-semibold mt-2">Nothing from this batch was saved when validation failed.</p>
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5" />
              <p className="text-xs text-emerald-800 font-semibold">{successMessage}</p>
            </div>
          )}

          {preview && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800">Validated Model Sequence</p>
                <span className="text-[10px] font-bold text-emerald-700">{preview.length}/8 ready</span>
              </div>
              <div className="divide-y divide-slate-100">
                {[...preview].sort((a, b) => a.modelTestNumber - b.modelTestNumber).map((item) => (
                  <div key={item.modelTestNumber} className="px-3 py-2 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-extrabold">{item.modelTestNumber}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-500">QP {item.questionPaperCharacters} chars · Answers {item.suggestedAnswerCharacters} chars · Marking Scheme {item.markingSchemeCharacters} chars</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={handleClose} disabled={busy} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-40">Cancel</button>
            {!preview ? (
              <button type="button" onClick={() => submitBatch(true)} disabled={busy || files.length === 0 || !selectedSubject} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Validate 8 Models
              </button>
            ) : (
              <button type="button" onClick={() => submitBatch(false)} disabled={busy || preview.length !== 8} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload All 8 Models
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
