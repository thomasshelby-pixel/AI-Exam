import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Calendar,
} from 'lucide-react';
import {
  mcqApi,
  McqMaterial,
  McqMaterialStatus,
  McqMaterialPreviewResponse,
} from '../../api/mcqClient.js';
import { McqCourse } from '../../types/index.js';
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
import { AdminMaterialUploadWizard } from './AdminMaterialUploadWizard.js';

const STATUS_OPTIONS: McqMaterialStatus[] = [
  'Draft',
  'Review',
  'Approved',
  'Published',
  'Archived',
];

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

  // Selection & Bulk Deletion State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    targetMaterial?: McqMaterial;
    targetIds: string[];
    totalMaterials: number;
    linkedQuestionsCount: number;
    linkedCasesCount: number;
    loadingSummary: boolean;
    deleting: boolean;
  }>({
    isOpen: false,
    type: 'single',
    targetIds: [],
    totalMaterials: 0,
    linkedQuestionsCount: 0,
    linkedCasesCount: 0,
    loadingSummary: false,
    deleting: false,
  });

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
    materialType: CanonicalSourceCategory;
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
    attempt: 'May 2026 - Series 1',
    applicableFrom: '2024-05-01',
    applicableTill: '2026-11-30',
    amendmentVersion: 'New Scheme 2024',
    description: '',
    status: 'Draft',
  });

  const isAttemptRequiredForUpload = isAttemptRequiredSource(formData.materialType);

  const [formError, setFormError] = useState<string | null>(null);
  const [submittingMaterial, setSubmittingMaterial] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cascading helpers for Upload Form
  const courseSubjects = useMemo(() => {
    return getCourseSubjects(formData.course);
  }, [formData.course]);

  const subjectChapters = useMemo(() => {
    if (!formData.subject) return [];
    return getSubjectChapters(formData.course, formData.subject);
  }, [formData.course, formData.subject]);

  const chapterTopics = useMemo(() => {
    if (!formData.subject || !formData.chapter) return ['Not Applicable'];
    return getChapterTopics(formData.course, formData.subject, formData.chapter);
  }, [formData.course, formData.subject, formData.chapter]);

  // Cascading helpers for filter bar
  const filterCourseSubjects = useMemo(() => {
    if (filterCourse === 'ALL') return [];
    return getCourseSubjects(filterCourse);
  }, [filterCourse]);

  const handleCourseChange = (newCourse: McqCourse) => {
    const subs = getCourseSubjects(newCourse);
    const firstSub = subs[0] || '';
    setFormData((prev) => ({
      ...prev,
      course: newCourse,
      subject: firstSub,
      chapter: '',
      topic: '',
    }));
  };

  const handleSourceCategoryChange = (newCat: CanonicalSourceCategory) => {
    setFormData((prev) => {
      const isReq = isAttemptRequiredSource(newCat);
      return {
        ...prev,
        materialType: newCat,
        source: newCat === 'Self-Created' ? 'Self-Created' : 'ICAI',
        attempt: isReq ? (prev.attempt || getAttemptSuggestions(newCat)[0] || '') : '',
      };
    });
  };

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

  // File input handler for PDF/TXT source documents (accept=".pdf,.txt,application/pdf,text/plain")
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.length === materials.length && materials.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(materials.map((m) => m.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const triggerSingleDelete = async (material: McqMaterial) => {
    setDeleteConfirmModal({
      isOpen: true,
      type: 'single',
      targetMaterial: material,
      targetIds: [material.id],
      totalMaterials: 1,
      linkedQuestionsCount: material.linked_mcq_count ?? material.linkedMcqCount ?? 0,
      linkedCasesCount: material.linked_case_count ?? material.linkedCaseCount ?? 0,
      loadingSummary: true,
      deleting: false,
    });

    try {
      const summary = await mcqApi.getMaterialLinkedSummary(material.id);
      setDeleteConfirmModal((prev) => ({
        ...prev,
        linkedQuestionsCount: summary.linkedQuestionsCount,
        linkedCasesCount: summary.linkedCasesCount,
        loadingSummary: false,
      }));
    } catch {
      setDeleteConfirmModal((prev) => ({ ...prev, loadingSummary: false }));
    }
  };

  const triggerBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleteConfirmModal({
      isOpen: true,
      type: 'bulk',
      targetIds: selectedIds,
      totalMaterials: selectedIds.length,
      linkedQuestionsCount: 0,
      linkedCasesCount: 0,
      loadingSummary: true,
      deleting: false,
    });

    try {
      const summary = await mcqApi.getBulkMaterialsLinkedSummary(selectedIds);
      setDeleteConfirmModal((prev) => ({
        ...prev,
        linkedQuestionsCount: summary.linkedQuestionsCount,
        linkedCasesCount: summary.linkedCasesCount,
        loadingSummary: false,
      }));
    } catch {
      setDeleteConfirmModal((prev) => ({ ...prev, loadingSummary: false }));
    }
  };

  const executeDelete = async (linkedAction: 'unlink' | 'archive') => {
    setDeleteConfirmModal((prev) => ({ ...prev, deleting: true }));
    try {
      if (deleteConfirmModal.type === 'single') {
        const id = deleteConfirmModal.targetIds[0];
        await mcqApi.deleteMaterial(id, linkedAction);
        setActionSuccess(`Material deleted successfully (${linkedAction === 'archive' ? 'Linked MCQs archived' : 'Linked MCQs kept intact'}).`);
      } else {
        const res = await mcqApi.bulkDeleteMaterials(deleteConfirmModal.targetIds, linkedAction);
        setActionSuccess(`${res.deletedCount} materials deleted successfully (${linkedAction === 'archive' ? 'Linked MCQs archived' : 'Linked MCQs kept intact'}).`);
      }
      setSelectedIds([]);
      setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false, deleting: false }));
      setTimeout(() => setActionSuccess(null), 4000);
      loadMaterials();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      setDeleteConfirmModal((prev) => ({ ...prev, deleting: false }));
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
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Course</label>
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
              {CANONICAL_COURSE_OPTIONS.map((c) => (
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
              {filterCourseSubjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Source Category</label>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Source Categories</option>
              {CANONICAL_SOURCE_CATEGORIES.map((t) => (
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

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-blue-950/70 border border-blue-700/80 rounded-2xl flex items-center justify-between text-xs text-blue-200 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            <span>
              <strong>Selected: {selectedIds.length}</strong> material{selectedIds.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearSelection}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              onClick={triggerBulkDelete}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Materials Table */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="px-4 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={materials.length > 0 && selectedIds.length === materials.length}
                    onChange={handleSelectAllVisible}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Select All Visible"
                  />
                </th>
                <th className="px-4 py-3.5">Material Name</th>
                <th className="px-4 py-3.5">Course & Subject</th>
                <th className="px-3 py-3.5">Chapter / Topic</th>
                <th className="px-3 py-3.5">Source Category</th>
                <th className="px-3 py-3.5">Attempt / Year</th>
                <th className="px-3 py-3.5">Format</th>
                <th className="px-3 py-3.5">Linked MCQs</th>
                <th className="px-3 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                    Loading Material Library...
                  </td>
                </tr>
              ) : materials.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="font-semibold text-slate-300 text-sm">No source materials found.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Upload your first official ICAI source paper in PDF or TXT to build the question pool.
                    </p>
                  </td>
                </tr>
              ) : (
                materials.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-700/30 transition-colors ${
                      selectedIds.includes(item.id) ? 'bg-blue-950/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleToggleSelect(item.id)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-bold text-white max-w-xs truncate" title={item.material_name}>
                        {item.material_name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs font-mono">
                        {item.file_name} • {(item.file_size / (1024 * 1024)).toFixed(2)} MB • {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-200">
                        {item.course.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-slate-400">{item.subject}</div>
                    </td>

                    <td className="px-3 py-3.5">
                      <div className="text-slate-300 font-medium">{item.chapter || 'All Chapters'}</div>
                      {item.topic && item.topic !== 'Not Applicable' && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{item.topic}</div>
                      )}
                    </td>

                    <td className="px-3 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900 text-slate-300 border border-slate-700">
                        {item.material_type}
                      </span>
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
                      <div className="font-bold text-blue-300">
                        {(item.linked_mcq_count ?? item.linkedMcqCount ?? 0)} MCQs
                      </div>
                      {(item.linked_case_count ?? item.linkedCaseCount ?? 0) > 0 && (
                        <div className="text-[10px] text-purple-300 font-semibold">
                          {(item.linked_case_count ?? item.linkedCaseCount)} Cases
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3.5">
                      {getStatusBadge(item.status)}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingMaterial(item)}
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition cursor-pointer"
                          title="Preview Extracted Content"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(item.id, item.file_name)}
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-blue-300 rounded-lg transition cursor-pointer"
                          title="Download Source Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingMaterial(item)}
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-lg transition cursor-pointer"
                          title="Edit Metadata & Status"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => triggerSingleDelete(item)}
                          className="p-1.5 bg-slate-700 hover:bg-red-900/60 text-red-300 rounded-lg transition cursor-pointer"
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

      {/* 8-STEP ADMIN CONTENT FLOW WIZARD (Upload -> Process -> Review -> Publish) */}
      <AdminMaterialUploadWizard
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onComplete={() => {
          setShowUploadModal(false);
          loadMaterials();
          setActionSuccess("Material and questions successfully processed, approved, and published to Question Bank.");
        }}
      />

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
                <div><span className="text-slate-500 font-bold">Course:</span> <span className="text-white">{viewingMaterial.course.replace(/_/g, ' ')}</span></div>
                <div><span className="text-slate-500 font-bold">Subject:</span> <span className="text-white">{viewingMaterial.subject}</span></div>
                <div><span className="text-slate-500 font-bold">Source Category:</span> <span className="text-white">{viewingMaterial.material_type}</span></div>
                <div><span className="text-slate-500 font-bold">Attempt / Year:</span> <span className="text-white">{viewingMaterial.attempt || 'General / Non-Attempt'}</span></div>
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

            <div className={`grid ${isAttemptRequiredSource(editingMaterial.material_type) ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
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

              {isAttemptRequiredSource(editingMaterial.material_type) && (
                <div>
                  <label className="block font-bold text-amber-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Attempt / Year (for {editingMaterial.material_type})</span>
                  </label>
                  <input
                    type="text"
                    value={editingMaterial.attempt || ''}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, attempt: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              )}
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

      {/* DELETE CONFIRMATION DIALOG (SINGLE & BULK WITH CONFIGURED LINKED MCQ POLICY) */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {deleteConfirmModal.type === 'single' ? 'Delete Material?' : 'Delete Selected Materials?'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {deleteConfirmModal.type === 'single'
                      ? 'This action will remove the material from the active Material Library.'
                      : `You selected ${deleteConfirmModal.totalMaterials} materials to remove from the active Material Library.`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeleteConfirmModal((p) => ({ ...p, isOpen: false }))}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteConfirmModal.type === 'single' && deleteConfirmModal.targetMaterial && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-400">You are about to delete:</div>
                <div className="font-bold text-white text-xs mt-0.5 truncate">
                  "{deleteConfirmModal.targetMaterial.material_name}"
                </div>
              </div>
            )}

            {/* Impact Box */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <div className="text-xs font-bold text-slate-300">Impact on Linked Content:</div>
              {deleteConfirmModal.loadingSummary ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span>Calculating linked questions and cases...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                    <div className="text-2xl font-black text-blue-400">
                      {deleteConfirmModal.linkedQuestionsCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Linked MCQs</div>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                    <div className="text-2xl font-black text-purple-400">
                      {deleteConfirmModal.linkedCasesCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Linked Cases</div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                <strong>Configured Safety Policy:</strong> Deleting a material does NOT automatically delete linked questions.
                Linked questions can remain intact in the Question Bank (unlinked from this material) or be archived.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-bold text-slate-300 mb-2">What should happen to linked MCQs?</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => executeDelete('unlink')}
                  disabled={deleteConfirmModal.deleting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 text-left flex items-center justify-between"
                >
                  <span>Keep Linked MCQs but Unlink Material</span>
                  <span className="text-[10px] text-blue-200 uppercase font-semibold">Recommended</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeDelete('archive')}
                  disabled={deleteConfirmModal.deleting}
                  className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 text-left flex items-center justify-between"
                >
                  <span>Archive Linked MCQs</span>
                  <span className="text-[10px] text-amber-200 uppercase font-semibold">Hide from active practice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal((p) => ({ ...p, isOpen: false }))}
                  disabled={deleteConfirmModal.deleting}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
