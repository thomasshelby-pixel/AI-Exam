import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Download,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  BookOpen,
  X,
  FileCheck,
  Check,
  ChevronRight,
  Info,
  Archive,
  ArrowRight,
} from 'lucide-react';
import {
  mcqApi,
  McqMaterial,
  McqMaterialStatus,
  McqMaterialPreviewResponse,
} from '../../api/mcqClient.js';
import { McqCourse } from '../../types/index.js';

const COURSE_OPTIONS: { label: string; value: McqCourse }[] = [
  { label: 'CA Foundation', value: 'CA_FOUNDATION' },
  { label: 'CA Intermediate', value: 'CA_INTERMEDIATE' },
  { label: 'CA Final', value: 'CA_FINAL' },
];

const MATERIAL_TYPES = [
  'ICAI Module',
  'PYQ',
  'RTP',
  'MTP',
  'Conceptual',
  'Practical',
  'Other',
];

const STATUS_OPTIONS: McqMaterialStatus[] = [
  'Draft',
  'Review',
  'Approved',
  'Published',
  'Archived',
];

const CA_SUBJECTS: Record<McqCourse, string[]> = {
  CA_FOUNDATION: [
    'Accounting',
    'Business Laws',
    'Quantitative Aptitude',
    'Business Economics',
  ],
  CA_INTERMEDIATE: [
    'Advanced Accounting',
    'Corporate and Other Laws',
    'Taxation (Income Tax & GST)',
    'Cost and Management Accounting',
    'Auditing and Ethics',
    'Financial Management and Strategic Management',
  ],
  CA_FINAL: [
    'Financial Reporting (Ind AS)',
    'Advanced Financial Management',
    'Advanced Auditing and Professional Ethics',
    'Direct Tax Laws and International Taxation',
    'Indirect Tax Laws (GST & Customs)',
    'Integrated Business Solutions',
  ],
};

interface McqMaterialLibraryProps {
  onSelectForBulkImport?: (material: McqMaterial) => void;
}

export const McqMaterialLibrary: React.FC<McqMaterialLibraryProps> = ({ onSelectForBulkImport }) => {
  const [materials, setMaterials] = useState<McqMaterial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [filterCourse, setFilterCourse] = useState<string>('ALL');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [viewingMaterial, setViewingMaterial] = useState<McqMaterial | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<McqMaterial | null>(null);

  // Upload Form State
  const [uploadStep, setUploadStep] = useState<'form' | 'preview'>('form');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [validatingDoc, setValidatingDoc] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<McqMaterialPreviewResponse | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>('Different mock question paper / revised ICAI edition');

  const [formData, setFormData] = useState<{
    materialName: string;
    course: McqCourse;
    subject: string;
    chapter: string;
    topic: string;
    materialType: string;
    source: string;
    attempt: string;
    applicableFrom: string;
    applicableTill: string;
    amendmentVersion: string;
    description: string;
    status: McqMaterialStatus;
  }>({
    materialName: '',
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: '',
    topic: '',
    materialType: 'MTP',
    source: 'ICAI',
    attempt: 'May 2026',
    applicableFrom: '2024-05-01',
    applicableTill: '2026-11-30',
    amendmentVersion: 'New Scheme 2024',
    description: '',
    status: 'Draft',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [submittingMaterial, setSubmittingMaterial] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadMaterials();
  }, [filterCourse, filterSubject, filterType, filterStatus, page]);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const data = await mcqApi.getMaterials({
        course: filterCourse,
        subject: filterSubject,
        materialType: filterType,
        status: filterStatus,
        search: searchQuery,
        page,
        limit: 15,
      });
      setMaterials(data.materials || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load materials:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadMaterials();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.txt')) {
      setFormError('Unsupported file type. Material Upload strictly accepts PDF (.pdf) or TXT (.txt) source documents.');
      setSelectedFile(null);
      setFileBase64('');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setFormError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum limit of 50MB.`);
      setSelectedFile(null);
      setFileBase64('');
      return;
    }

    setSelectedFile(file);

    // Auto-populate material name if blank
    if (!formData.materialName) {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      setFormData((prev) => ({
        ...prev,
        materialName: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
      }));
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setFileBase64(uploadEvent.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleValidateAndPreview = async () => {
    if (!selectedFile || !fileBase64) {
      setFormError('Please select a PDF or TXT source file.');
      return;
    }
    if (!formData.materialName.trim()) {
      setFormError('Please specify a Material Name.');
      return;
    }

    setFormError(null);
    setValidatingDoc(true);

    try {
      const preview = await mcqApi.validateMaterialPreview({
        fileBase64,
        filename: selectedFile.name,
        mimeType: selectedFile.type,
        course: formData.course,
        subject: formData.subject,
        materialType: formData.materialType,
        attempt: formData.attempt,
      });

      setPreviewResult(preview);
      setUploadStep('preview');
    } catch (err: any) {
      console.error('Validation error:', err);
      setFormError(err.message || 'Failed to validate document.');
    } finally {
      setValidatingDoc(false);
    }
  };

  const handleSaveMaterial = async (targetStatus?: McqMaterialStatus, override?: boolean) => {
    if (!selectedFile || !fileBase64) return;

    setSubmittingMaterial(true);
    setFormError(null);

    try {
      await mcqApi.createMaterial({
        materialName: formData.materialName,
        course: formData.course,
        subject: formData.subject,
        chapter: formData.chapter || undefined,
        topic: formData.topic || undefined,
        materialType: formData.materialType,
        source: formData.source,
        attempt: formData.attempt || undefined,
        applicableFrom: formData.applicableFrom || undefined,
        applicableTill: formData.applicableTill || undefined,
        amendmentVersion: formData.amendmentVersion || undefined,
        description: formData.description || undefined,
        status: targetStatus || formData.status,
        fileBase64,
        originalFilename: selectedFile.name,
        mimeType: selectedFile.type,
        overrideDuplicate: override || false,
        overrideReason: override ? overrideReason : undefined,
      });

      setActionSuccess(`Material "${formData.materialName}" successfully saved!`);
      setTimeout(() => setActionSuccess(null), 4000);

      // Reset modal
      setShowUploadModal(false);
      setUploadStep('form');
      setSelectedFile(null);
      setFileBase64('');
      setPreviewResult(null);
      loadMaterials();
    } catch (err: any) {
      console.error('Failed to save material:', err);
      setFormError(err.message || 'Failed to save material record.');
    } finally {
      setSubmittingMaterial(false);
    }
  };

  const handleDownload = (id: string, fileName: string) => {
    const token = localStorage.getItem('token');
    const url = `/api/mcq/admin/materials/${id}/download?token=${encodeURIComponent(token || '')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleUpdateStatus = async (id: string, newStatus: McqMaterialStatus) => {
    try {
      await mcqApi.updateMaterial(id, { status: newStatus });
      setActionSuccess(`Material status updated to ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 3000);
      loadMaterials();
      if (editingMaterial && editingMaterial.id === id) {
        setEditingMaterial({ ...editingMaterial, status: newStatus });
      }
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleDeleteMaterial = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${name}"? Attached disk files will be erased.`)) {
      return;
    }
    try {
      await mcqApi.deleteMaterial(id);
      setActionSuccess(`Material "${name}" deleted.`);
      setTimeout(() => setActionSuccess(null), 3000);
      loadMaterials();
      if (viewingMaterial?.id === id) setViewingMaterial(null);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const getStatusBadge = (status: McqMaterialStatus) => {
    switch (status) {
      case 'Published':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Published</span>;
      case 'Approved':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">Approved</span>;
      case 'Review':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Under Review</span>;
      case 'Archived':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">Archived</span>;
      case 'Draft':
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Draft</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-white">Material Library</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Source Documents (PDF & TXT)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Repository for official ICAI reference papers, RTPs, MTPs, and Study Modules.
            Uploaded source files are parsed with cryptographic duplicate detection and stored securely.
          </p>
        </div>

        <button
          onClick={() => {
            setFormData({
              materialName: '',
              course: 'CA_INTERMEDIATE',
              subject: 'Corporate and Other Laws',
              chapter: '',
              topic: '',
              materialType: 'MTP',
              source: 'ICAI',
              attempt: 'May 2026',
              applicableFrom: '2024-05-01',
              applicableTill: '2026-11-30',
              amendmentVersion: 'New Scheme 2024',
              description: '',
              status: 'Draft',
            });
            setSelectedFile(null);
            setFileBase64('');
            setPreviewResult(null);
            setUploadStep('form');
            setFormError(null);
            setShowUploadModal(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Material (PDF / TXT)</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by material title, description, or attempt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          <button
            onClick={() => { setPage(1); loadMaterials(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-700/60 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Course Level</label>
            <select
              value={filterCourse}
              onChange={(e) => {
                setFilterCourse(e.target.value);
                setFilterSubject('ALL');
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Courses</option>
              {COURSE_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Subject</label>
            <select
              value={filterSubject}
              onChange={(e) => { setFilterSubject(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Subjects</option>
              {filterCourse !== 'ALL' &&
                CA_SUBJECTS[filterCourse as McqCourse]?.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Material Type</label>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Material Types</option>
              {MATERIAL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="px-5 py-3.5">Material Name</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Course & Subject</th>
                <th className="px-3 py-3.5">Attempt / Source</th>
                <th className="px-3 py-3.5">Format</th>
                <th className="px-3 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                    Loading Material Library...
                  </td>
                </tr>
              ) : materials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="font-semibold text-slate-300 text-sm">No source materials found.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Upload your first official ICAI source paper in PDF or TXT to build the question pool.
                    </p>
                  </td>
                </tr>
              ) : (
                materials.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-white max-w-xs truncate" title={item.material_name}>
                        {item.material_name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs font-mono">
                        {item.file_name} • {(item.file_size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900 text-slate-300 border border-slate-700">
                        {item.material_type}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-200">
                        {item.course.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-slate-400">{item.subject}</div>
                    </td>

                    <td className="px-3 py-3.5">
                      <div className="font-semibold text-slate-300">{item.attempt || 'General'}</div>
                      <div className="text-[11px] text-slate-500">{item.source || 'ICAI'}</div>
                    </td>

                    <td className="px-3 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          item.file_type === 'PDF'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {item.file_type} {item.file_type === 'PDF' && `(${item.page_count}p)`}
                      </span>
                    </td>

                    <td className="px-3 py-3.5">
                      {getStatusBadge(item.status)}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingMaterial(item)}
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition"
                          title="Preview Extracted Content"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(item.id, item.file_name)}
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-blue-300 rounded-lg transition"
                          title="Download Source Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingMaterial(item)}
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-lg transition"
                          title="Edit Metadata & Status"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(item.id, item.material_name)}
                          className="p-1.5 bg-slate-700 hover:bg-red-900/60 text-red-300 rounded-lg transition"
                          title="Delete Material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-700/80 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
            <div>Showing {materials.length} of {total} source materials</div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 text-white font-bold">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* UPLOAD MATERIAL MODAL (PDF / TXT ONLY) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {uploadStep === 'form' ? 'Upload Source Document' : 'Material Content Preview & Duplicate Verification'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {uploadStep === 'form' ? 'Supported formats: PDF, TXT (Maximum: 50MB)' : 'Review extracted ground truth before saving'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-xl flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {uploadStep === 'form' ? (
                <>
                  {/* Format Notice */}
                  <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5 text-blue-200">
                    <Info className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                    <div>
                      <span className="font-bold">Source Material Document:</span> Accepts authentic <strong>PDF (.pdf)</strong> and <strong>TXT (.txt)</strong> source papers.
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        For structured question spreadsheets with answer keys, switch to the <em>"Bulk Import MCQs (CSV / XLSX)"</em> tab.
                      </p>
                    </div>
                  </div>

                  {/* File Upload Zone */}
                  <div>
                    <label className="block font-bold text-slate-300 mb-1.5">
                      Select Source Document (PDF or TXT) *
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".pdf,.txt,application/pdf,text/plain"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${
                        selectedFile
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-slate-700 hover:border-blue-500/50 bg-slate-950/40'
                      }`}
                    >
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                            <FileCheck className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <div className="font-bold text-white text-sm">{selectedFile.name}</div>
                            <div className="text-[11px] text-emerald-400">
                              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.name.endsWith('.pdf') ? 'PDF Document' : 'Plain Text Document'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                          <div className="font-semibold text-slate-200 text-xs">
                            Click to browse or drag & drop PDF or TXT
                          </div>
                          <div className="text-[11px] text-slate-500">
                            PDF (up to 50MB) or TXT (up to 15MB)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-300 mb-1">Material Name *</label>
                      <input
                        type="text"
                        value={formData.materialName}
                        onChange={(e) => setFormData({ ...formData, materialName: e.target.value })}
                        placeholder="e.g. CA Inter Corporate Laws MTP Series 1 — May 2026"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Course Level *</label>
                      <select
                        value={formData.course}
                        onChange={(e) => {
                          const lvl = e.target.value as McqCourse;
                          setFormData({
                            ...formData,
                            course: lvl,
                            subject: CA_SUBJECTS[lvl][0],
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {COURSE_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Subject *</label>
                      <select
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {CA_SUBJECTS[formData.course]?.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Material Type *</label>
                      <select
                        value={formData.materialType}
                        onChange={(e) => setFormData({ ...formData, materialType: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {MATERIAL_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Source *</label>
                      <input
                        type="text"
                        value={formData.source}
                        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                        placeholder="ICAI / Board of Studies / Faculty"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Attempt / Year</label>
                      <input
                        type="text"
                        value={formData.attempt}
                        onChange={(e) => setFormData({ ...formData, attempt: e.target.value })}
                        placeholder="May 2026 / Sept 2026"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Amendment Version</label>
                      <input
                        type="text"
                        value={formData.amendmentVersion}
                        onChange={(e) => setFormData({ ...formData, amendmentVersion: e.target.value })}
                        placeholder="New Scheme 2024 / Finance Act 2024"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-300 mb-1">Description / Notes</label>
                      <textarea
                        rows={2}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Optional details, paper code, chapters covered..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* PREVIEW SCREEN */
                previewResult && (
                  <div className="space-y-4">
                    {/* Duplicate Status Banner */}
                    {previewResult.duplicateCheck.status === 'EXACT_DUPLICATE' && (
                      <div className="p-4 bg-red-500/20 border-2 border-red-500/60 rounded-xl text-red-200">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <ShieldAlert className="w-5 h-5 text-red-400" />
                          <span>Exact Duplicate Detected</span>
                        </div>
                        <p className="mt-1 text-xs">{previewResult.duplicateCheck.message}</p>
                        <p className="mt-2 text-[11px] text-red-300 bg-red-950/60 p-2 rounded">
                          Exact file checksum or content already exists in the database. Exact duplicate uploads are blocked to preserve database integrity.
                        </p>
                      </div>
                    )}

                    {previewResult.duplicateCheck.status === 'POSSIBLE_DUPLICATE' && (
                      <div className="p-4 bg-amber-500/20 border-2 border-amber-500/60 rounded-xl text-amber-200">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <AlertTriangle className="w-5 h-5 text-amber-400" />
                          <span>Possible Duplicate ({previewResult.duplicateCheck.similarity}% Similarity)</span>
                        </div>
                        <p className="mt-1 text-xs">{previewResult.duplicateCheck.message}</p>
                        <div className="mt-3 bg-amber-950/60 p-3 rounded-lg border border-amber-500/30">
                          <label className="block font-bold text-amber-300 mb-1 text-[11px]">
                            Admin Override Justification (Audited) *
                          </label>
                          <input
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="e.g. Distinct mock questions / revised answers for this attempt"
                            className="w-full bg-slate-900 border border-amber-500/50 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {previewResult.duplicateCheck.status === 'NEW' && (
                      <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-200 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Document verified unique! No collisions found.</span>
                      </div>
                    )}

                    {previewResult.duplicateCheck.status === 'SIMILAR' && (
                      <div className="p-3 bg-blue-500/20 border border-blue-500/40 rounded-xl text-blue-200 flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-400 shrink-0" />
                        <span>Syllabus overlap detected for this subject, but questions are distinct. Ready to save.</span>
                      </div>
                    )}

                    {/* Metadata Summary Card */}
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div><span className="text-slate-500 font-bold">File:</span> <span className="text-white">{previewResult.fileName}</span></div>
                      <div><span className="text-slate-500 font-bold">Type:</span> <span className="text-white">{previewResult.fileType} {previewResult.fileType === 'PDF' && `(${previewResult.pageCount}p)`}</span></div>
                      <div><span className="text-slate-500 font-bold">Size:</span> <span className="text-white">{(previewResult.fileSize / (1024 * 1024)).toFixed(2)} MB</span></div>
                      <div><span className="text-slate-500 font-bold">Course:</span> <span className="text-white">{formData.course.replace(/_/g, ' ')}</span></div>
                      <div><span className="text-slate-500 font-bold">Subject:</span> <span className="text-white">{formData.subject}</span></div>
                      <div><span className="text-slate-500 font-bold">Type:</span> <span className="text-white">{formData.materialType}</span></div>
                      <div><span className="text-slate-500 font-bold">Attempt:</span> <span className="text-white">{formData.attempt}</span></div>
                      <div><span className="text-slate-500 font-bold">Status:</span> <span className="text-white">{formData.status}</span></div>
                    </div>

                    {/* Extracted Text Preview */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                        <span>Extracted Content Preview (Ground Truth)</span>
                        <span>{previewResult.fullExtractedText.length} characters</span>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {previewResult.extractedTextSnippet}
                        {previewResult.fullExtractedText.length > 1500 && (
                          <div className="text-slate-500 italic mt-2">
                            ... [full document text ({previewResult.fullExtractedText.length} chars) will be saved and indexed for question extraction]
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              {uploadStep === 'form' ? (
                <>
                  <button
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedFile || !formData.materialName.trim() || validatingDoc}
                    onClick={handleValidateAndPreview}
                    className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50 transition cursor-pointer"
                  >
                    {validatingDoc ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    <span>Validate & Preview Material</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setUploadStep('form')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                  >
                    ← Back to Details
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={submittingMaterial || previewResult?.duplicateCheck.status === 'EXACT_DUPLICATE'}
                      onClick={() => handleSaveMaterial('Draft', previewResult?.duplicateCheck.status === 'POSSIBLE_DUPLICATE')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold rounded-xl disabled:opacity-50 transition cursor-pointer"
                    >
                      Save as Draft
                    </button>
                    <button
                      disabled={submittingMaterial || previewResult?.duplicateCheck.status === 'EXACT_DUPLICATE'}
                      onClick={() => handleSaveMaterial('Published', previewResult?.duplicateCheck.status === 'POSSIBLE_DUPLICATE')}
                      className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 transition cursor-pointer"
                    >
                      {submittingMaterial ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Save & Publish</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW EXTRACTED CONTENT MODAL */}
      {viewingMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div>
                <h3 className="font-bold text-white text-sm">{viewingMaterial.material_name}</h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {viewingMaterial.file_name} • {viewingMaterial.file_type} • Status: {viewingMaterial.status}
                </p>
              </div>
              <button
                onClick={() => setViewingMaterial(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px]">
                <div><span className="text-slate-500 font-bold">Course:</span> <span className="text-white">{viewingMaterial.course}</span></div>
                <div><span className="text-slate-500 font-bold">Subject:</span> <span className="text-white">{viewingMaterial.subject}</span></div>
                <div><span className="text-slate-500 font-bold">Type:</span> <span className="text-white">{viewingMaterial.material_type}</span></div>
                <div><span className="text-slate-500 font-bold">Attempt:</span> <span className="text-white">{viewingMaterial.attempt || 'General'}</span></div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Indexed Ground Truth Text
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                  {viewingMaterial.extracted_text || 'No extracted text available.'}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={() => handleDownload(viewingMaterial.id, viewingMaterial.file_name)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold rounded-lg transition"
              >
                <Download className="w-3.5 h-3.5" /> Download File
              </button>
              <button
                onClick={() => setViewingMaterial(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT METADATA & STATUS MODAL */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Edit Material Metadata & Status</h3>
              <button onClick={() => setEditingMaterial(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Material Title</label>
              <input
                type="text"
                value={editingMaterial.material_name}
                onChange={(e) => setEditingMaterial({ ...editingMaterial, material_name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Status</label>
                <select
                  value={editingMaterial.status}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, status: e.target.value as McqMaterialStatus })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Attempt</label>
                <input
                  type="text"
                  value={editingMaterial.attempt || ''}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, attempt: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Description</label>
              <textarea
                rows={2}
                value={editingMaterial.description || ''}
                onChange={(e) => setEditingMaterial({ ...editingMaterial, description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingMaterial(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await mcqApi.updateMaterial(editingMaterial.id, {
                      material_name: editingMaterial.material_name,
                      status: editingMaterial.status,
                      attempt: editingMaterial.attempt,
                      description: editingMaterial.description,
                    });
                    setActionSuccess('Material metadata updated successfully!');
                    setTimeout(() => setActionSuccess(null), 3000);
                    setEditingMaterial(null);
                    loadMaterials();
                  } catch (err: any) {
                    alert(`Update failed: ${err.message}`);
                  }
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
