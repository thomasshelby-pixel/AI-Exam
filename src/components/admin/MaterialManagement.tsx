import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest } from '../../api/client';
import { EvaluationMaterial, CALevel, MaterialType } from '../../types';
import { fetchExamAttempts, getAttemptsForLevel, ExamAttempt, ALLOWED_MATERIAL_TYPES } from '../../lib/attempts';
import {
  FileText,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Layers,
  BookOpen,
  Calendar,
  Tag,
  Clock,
  ChevronRight,
  Sparkles,
  Upload,
  FileUp,
  FileCheck,
} from 'lucide-react';

interface MaterialManagementProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const MaterialManagement: React.FC<MaterialManagementProps> = ({ onNotify }) => {
  const [materials, setMaterials] = useState<EvaluationMaterial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Filters
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal states
  const [inspectMaterial, setInspectMaterial] = useState<EvaluationMaterial | null>(null);
  const [inspectFullText, setInspectFullText] = useState<any | null>(null);
  const [loadingInspect, setLoadingInspect] = useState<boolean>(false);

  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [editingMaterial, setEditingMaterial] = useState<EvaluationMaterial | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isExtractingDoc, setIsExtractingDoc] = useState<string | null>(null);

  // Form State
  const initialFormState = {
    level: 'INTERMEDIATE' as CALevel,
    materialType: 'MTP' as MaterialType,
    modelGroup: 'GROUP_1',
    subjectKey: 'inter_advanced_accounting',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    attempt: 'May 2026',
    syllabusVersion: 'New Scheme 2024',
    chapterTopic: '',
    questionPaperTitle: '',
    questionPaperText: '',
    suggestedAnswersText: '',
    markingSchemeText: '',
    referenceGuidanceText: '',
    amendmentsProvisionsText: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    version: '1.0',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [availableAttempts, setAvailableAttempts] = useState<ExamAttempt[]>(() =>
    getAttemptsForLevel(initialFormState.level)
  );

  // Sync available exam attempts dynamically when CA level changes in form
  useEffect(() => {
    let isMounted = true;
    fetchExamAttempts(formData.level).then((attempts) => {
      if (isMounted && attempts.length > 0) {
        setAvailableAttempts(attempts);
        if (!attempts.some((a) => a.attemptLabel === formData.attempt)) {
          const defaultMay26 = attempts.find((a) => a.attemptLabel === 'May 2026');
          setFormData((prev) => ({
            ...prev,
            attempt: defaultMay26 ? defaultMay26.attemptLabel : attempts[0].attemptLabel,
          }));
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [formData.level]);

  // Handle PDF / Text File Upload and AI Extraction
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetField: 'questionPaperText' | 'suggestedAnswersText' | 'markingSchemeText' | 'ALL'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
      const text = await file.text();
      if (targetField === 'ALL') {
        setFormData((prev) => ({ ...prev, questionPaperText: text }));
      } else {
        setFormData((prev) => ({ ...prev, [targetField]: text }));
      }
      onNotify?.(`Loaded text from ${file.name}`, 'success');
      return;
    }

    try {
      setIsExtractingDoc(targetField);
      onNotify?.(`Extracting content from ${file.name} using Gemini AI...`, 'success');

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const role =
            targetField === 'questionPaperText'
              ? 'QUESTION_PAPER'
              : targetField === 'suggestedAnswersText'
              ? 'SUGGESTED_ANSWERS'
              : targetField === 'markingSchemeText'
              ? 'MARKING_SCHEME'
              : 'COMPLETE_SUITE';

          const res = await apiRequest<{ success: boolean; extracted: any }>('/api/admin/materials/extract-pdf', {
            method: 'POST',
            body: JSON.stringify({
              fileBase64: base64,
              mimeType: file.type || 'application/pdf',
              documentRole: role,
            }),
          });

          const ext = res.extracted || {};
          setFormData((prev) => {
            const next = { ...prev };
            if (targetField === 'ALL' || targetField === 'questionPaperText') {
              if (ext.questionPaperText) next.questionPaperText = ext.questionPaperText;
            }
            if (targetField === 'ALL' || targetField === 'suggestedAnswersText') {
              if (ext.suggestedAnswersText) next.suggestedAnswersText = ext.suggestedAnswersText;
            }
            if (targetField === 'ALL' || targetField === 'markingSchemeText') {
              if (ext.markingSchemeText) next.markingSchemeText = ext.markingSchemeText;
            }
            if (ext.extractedTitle && !next.questionPaperTitle) {
              next.questionPaperTitle = ext.extractedTitle;
            }
            if (ext.detectedAttempt) {
              next.attempt = ext.detectedAttempt;
            }
            return next;
          });

          onNotify?.(`Successfully digitized ${file.name}! Fields populated.`, 'success');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to extract text from document';
          onNotify?.(msg, 'error');
        } finally {
          setIsExtractingDoc(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      setIsExtractingDoc(null);
      onNotify?.('Error reading file', 'error');
    }
  };

  // Fetch materials
  const fetchMaterials = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (selectedLevel !== 'ALL') params.append('level', selectedLevel);
      if (selectedType !== 'ALL') params.append('materialType', selectedType);
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await apiRequest<{ materials: EvaluationMaterial[] }>(
        `/api/admin/materials?${params.toString()}`
      );
      setMaterials(res.materials || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load materials';
      setError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [selectedLevel, selectedType, selectedStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMaterials();
  };

  // Inspect material
  const handleInspect = async (mat: EvaluationMaterial) => {
    setInspectMaterial(mat);
    setLoadingInspect(true);
    try {
      const res = await apiRequest<{ material: any }>(`/api/admin/materials/${mat.id}`);
      setInspectFullText(res.material);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load details';
      onNotify?.(msg, 'error');
    } finally {
      setLoadingInspect(false);
    }
  };

  // Open Edit Form
  const handleOpenEdit = async (mat: EvaluationMaterial) => {
    setEditingMaterial(mat);
    setIsSubmitting(true);
    try {
      const res = await apiRequest<{ material: any }>(`/api/admin/materials/${mat.id}`);
      const m = res.material;
      setFormData({
        level: m.level || 'INTERMEDIATE',
        materialType: (m.material_type || 'MTP') as MaterialType,
        modelGroup: m.model_group || 'GROUP_1',
        subjectKey: m.subject_key || 'inter_advanced_accounting',
        subjectName: m.subject_name || 'Advanced Accounting',
        paper: m.paper || 'Paper 1',
        attempt: m.attempt || 'May 2026',
        syllabusVersion: m.syllabus_version || 'New Scheme 2024',
        chapterTopic: m.chapter_topic || '',
        questionPaperTitle: m.question_paper_title || '',
        questionPaperText: m.question_paper_text || '',
        suggestedAnswersText: m.suggested_answers_text || '',
        markingSchemeText: m.marking_scheme_text || '',
        referenceGuidanceText: m.reference_guidance_text || '',
        amendmentsProvisionsText: m.amendments_provisions_text || '',
        effectiveDate: m.effective_date || new Date().toISOString().split('T')[0],
        version: m.version || '1.0',
        status: m.status || 'ACTIVE',
      });
      setShowFormModal(true);
    } catch (err: unknown) {
      onNotify?.('Failed to load material for editing', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Add Form
  const handleOpenAdd = () => {
    setEditingMaterial(null);
    setFormData(initialFormState);
    setShowFormModal(true);
  };

  // Toggle Status (ACTIVE / INACTIVE)
  const handleToggleStatus = async (mat: EvaluationMaterial) => {
    const nextStatus = mat.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiRequest(`/api/admin/materials/${mat.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      onNotify?.(`Material set to ${nextStatus}`, 'success');
      fetchMaterials();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status update failed';
      onNotify?.(msg, 'error');
    }
  };

  // Delete Material
  const handleDelete = async (mat: EvaluationMaterial) => {
    if (!window.confirm(`Are you sure you want to delete "${mat.questionPaperTitle}"? This cannot be undone.`)) {
      return;
    }
    try {
      await apiRequest(`/api/admin/materials/${mat.id}`, { method: 'DELETE' });
      onNotify?.('Material deleted successfully', 'success');
      fetchMaterials();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete material';
      onNotify?.(msg, 'error');
    }
  };

  // Handle Form Submit (Create or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.questionPaperTitle.trim()) {
      alert('Please provide a title for the material.');
      return;
    }
    if (!formData.questionPaperText.trim() || !formData.suggestedAnswersText.trim()) {
      alert('Question Paper Text and Suggested Answers Text are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingMaterial) {
        await apiRequest(`/api/admin/materials/${editingMaterial.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        onNotify?.('Material updated successfully', 'success');
      } else {
        await apiRequest('/api/admin/materials', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        onNotify?.('New material added successfully', 'success');
      }
      setShowFormModal(false);
      fetchMaterials();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save material';
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Standard CA Subjects by Level
  const subjectsMap: Record<CALevel, Array<{ key: string; name: string; paper: string }>> = {
    FOUNDATION: [
      { key: 'foundation_accounting', name: 'Accounting', paper: 'Paper 1' },
      { key: 'foundation_business_laws', name: 'Business Laws', paper: 'Paper 2' },
      { key: 'foundation_quantitative_aptitude', name: 'Quantitative Aptitude', paper: 'Paper 3' },
      { key: 'foundation_business_economics', name: 'Business Economics', paper: 'Paper 4' },
    ],
    INTERMEDIATE: [
      { key: 'inter_advanced_accounting', name: 'Advanced Accounting', paper: 'Paper 1' },
      { key: 'inter_corporate_laws', name: 'Corporate and Other Laws', paper: 'Paper 2' },
      { key: 'inter_taxation', name: 'Taxation (Income Tax & GST)', paper: 'Paper 3' },
      { key: 'inter_cost_accounting', name: 'Cost and Management Accounting', paper: 'Paper 4' },
      { key: 'inter_auditing_ethics', name: 'Auditing and Ethics', paper: 'Paper 5' },
      { key: 'inter_fm_sm', name: 'Financial Management and Strategic Management', paper: 'Paper 6' },
    ],
    FINAL: [
      { key: 'final_financial_reporting', name: 'Financial Reporting (Ind AS)', paper: 'Paper 1' },
      { key: 'final_afm', name: 'Advanced Financial Management', paper: 'Paper 2' },
      { key: 'final_advanced_auditing', name: 'Advanced Auditing and Professional Ethics', paper: 'Paper 3' },
      { key: 'final_direct_tax', name: 'Direct Tax Laws and International Taxation', paper: 'Paper 4' },
      { key: 'final_indirect_tax', name: 'Indirect Tax Laws (GST & Customs)', paper: 'Paper 5' },
      { key: 'final_integrated_business_solutions', name: 'Integrated Business Solutions', paper: 'Paper 6' },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Official Evaluation Material Management</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Audit-Protected
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ground-truth question papers, suggested answers, marking rubrics, and statutory provisions used by the AI engine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMaterials}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Material</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, subject, attempt or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Level Filter */}
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All CA Levels</option>
              <option value="FOUNDATION">Foundation</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="FINAL">Final</option>
            </select>

            {/* Material Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Material Types</option>
              <option value="MTP">MTP</option>
              <option value="PYQ">PYQ</option>
              <option value="MODEL_TEST_PAPER">Model Test Paper</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              type="submit"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        </form>
      </div>

      {/* Materials Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-3 px-4 font-bold">Paper Title & Attempt</th>
                <th className="py-3 px-3 font-bold">Subject & Paper</th>
                <th className="py-3 px-3 font-bold">Type</th>
                <th className="py-3 px-3 font-bold">Syllabus</th>
                <th className="py-3 px-3 font-bold">Version</th>
                <th className="py-3 px-3 font-bold">Content Size</th>
                <th className="py-3 px-3 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading materials database...
                  </td>
                </tr>
              )}

              {!loading && materials.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No evaluation materials found matching criteria. Click &quot;Upload Material&quot; to add reference papers.
                  </td>
                </tr>
              )}

              {!loading &&
                materials.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{m.question_paper_title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="font-medium text-blue-600">{m.level}</span>
                        <span>•</span>
                        <span>{m.attempt || 'Current'}</span>
                        {m.chapter_topic && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[120px]">{m.chapter_topic}</span>
                          </>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800">{m.subject_name}</div>
                      <div className="text-[10px] text-slate-400">{m.paper || 'Paper 1'}</div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {m.material_type}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      {m.syllabus_version || 'New Scheme 2024'}
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-slate-700">
                      v{m.version || '1.0'}
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                      <div>QP: {m.qp_chars || 0} chars</div>
                      <div className="text-emerald-700">SA: {m.sa_chars || 0} chars</div>
                    </td>

                    <td className="py-3 px-3">
                      <button
                        onClick={() => handleToggleStatus(m)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition ${
                          m.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Click to toggle status"
                      >
                        {m.status === 'ACTIVE' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{m.status || 'ACTIVE'}</span>
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleInspect(m)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                          title="Inspect Material"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                          title="Edit / Replace Material"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(m)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          title="Delete Material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Modal Drawer */}
      {inspectMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{inspectMaterial.question_paper_title}</h4>
                <p className="text-xs text-slate-500">
                  CA {inspectMaterial.level} • {inspectMaterial.subject_name} ({inspectMaterial.paper || 'Paper 1'}) • {inspectMaterial.attempt}
                </p>
              </div>
              <button
                onClick={() => {
                  setInspectMaterial(null);
                  setInspectFullText(null);
                }}
                className="text-slate-400 hover:text-slate-700 font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {loadingInspect && (
                <div className="py-8 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                  Loading full material texts...
                </div>
              )}

              {!loadingInspect && inspectFullText && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">TYPE</span>
                      <span className="font-semibold text-slate-800">{inspectFullText.material_type}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">SYLLABUS</span>
                      <span className="font-semibold text-slate-800">{inspectFullText.syllabus_version || 'New Scheme 2024'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">VERSION</span>
                      <span className="font-semibold text-slate-800">v{inspectFullText.version || '1.0'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">STATUS</span>
                      <span className={`font-semibold ${inspectFullText.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {inspectFullText.status}
                      </span>
                    </div>
                  </div>

                  {/* Question Paper Text */}
                  <div className="space-y-1">
                    <h5 className="font-bold text-slate-800 flex items-center justify-between">
                      <span>1. Official Question Paper Text</span>
                      <span className="text-[10px] font-mono text-slate-400">{inspectFullText.question_paper_text?.length || 0} characters</span>
                    </h5>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 max-h-48 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                      {inspectFullText.question_paper_text || 'No question paper text provided.'}
                    </div>
                  </div>

                  {/* Suggested Answers Text */}
                  <div className="space-y-1">
                    <h5 className="font-bold text-slate-800 flex items-center justify-between">
                      <span>2. Suggested Guideline Answers Text</span>
                      <span className="text-[10px] font-mono text-slate-400">{inspectFullText.suggested_answers_text?.length || 0} characters</span>
                    </h5>
                    <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 max-h-48 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                      {inspectFullText.suggested_answers_text || 'No suggested answers text provided.'}
                    </div>
                  </div>

                  {/* Marking Scheme / Guidelines */}
                  {inspectFullText.marking_scheme_text && (
                    <div className="space-y-1">
                      <h5 className="font-bold text-slate-800">3. Marking Scheme & Step Allocation</h5>
                      <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200 max-h-36 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                        {inspectFullText.marking_scheme_text}
                      </div>
                    </div>
                  )}

                  {/* Reference Guidance / Examiner Comments */}
                  {inspectFullText.reference_guidance_text && (
                    <div className="space-y-1">
                      <h5 className="font-bold text-slate-800">4. Examiner Comments & Reference Guidance</h5>
                      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 max-h-36 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                        {inspectFullText.reference_guidance_text}
                      </div>
                    </div>
                  )}

                  {/* Amendments / Provisions */}
                  {inspectFullText.amendments_provisions_text && (
                    <div className="space-y-1">
                      <h5 className="font-bold text-slate-800">5. Relevant Statutory Amendments & Provisions</h5>
                      <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200 max-h-36 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                        {inspectFullText.amendments_provisions_text}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 flex justify-end bg-slate-50">
              <button
                onClick={() => {
                  setInspectMaterial(null);
                  setInspectFullText(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload / Edit Material Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h4 className="text-sm font-bold text-slate-900">
                {editingMaterial ? 'Edit / Replace Evaluation Material' : 'Upload New Evaluation Material'}
              </h4>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Row 1: Level, Material Type, Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CA Level *</label>
                  <select
                    value={formData.level}
                    onChange={(e) => {
                      const lvl = e.target.value as CALevel;
                      const subs = subjectsMap[lvl] || [];
                      setFormData({
                        ...formData,
                        level: lvl,
                        subjectKey: subs[0]?.key || '',
                        subjectName: subs[0]?.name || '',
                        paper: subs[0]?.paper || 'Paper 1',
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none"
                  >
                    <option value="FOUNDATION">CA Foundation</option>
                    <option value="INTERMEDIATE">CA Intermediate</option>
                    <option value="FINAL">CA Final</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Material Type *</label>
                  <select
                    value={formData.materialType}
                    onChange={(e) => setFormData({ ...formData, materialType: e.target.value as MaterialType })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none"
                  >
                    <option value="MTP">MTP (Mock Test Paper)</option>
                    <option value="PYQ">PYQ (Past Year Question Paper)</option>
                    <option value="MODEL_TEST_PAPER">Model Test Paper</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Subject *</label>
                  <select
                    value={formData.subjectKey}
                    onChange={(e) => {
                      const selected = subjectsMap[formData.level]?.find((s) => s.key === e.target.value);
                      if (selected) {
                        setFormData({
                          ...formData,
                          subjectKey: selected.key,
                          subjectName: selected.name,
                          paper: selected.paper,
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none"
                  >
                    {subjectsMap[formData.level]?.map((sub) => (
                      <option key={sub.key} value={sub.key}>
                        {sub.name} ({sub.paper})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Paper, Attempt, Syllabus, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Paper Designation</label>
                  <input
                    type="text"
                    value={formData.paper}
                    onChange={(e) => setFormData({ ...formData, paper: e.target.value })}
                    placeholder="e.g. Paper 1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Exam Attempt</label>
                  <select
                    value={formData.attempt}
                    onChange={(e) => setFormData({ ...formData, attempt: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none text-slate-800"
                  >
                    {availableAttempts.map((att) => (
                      <option key={att.id} value={att.attemptLabel}>
                        {att.attemptLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Syllabus Version</label>
                  <input
                    type="text"
                    value={formData.syllabusVersion}
                    onChange={(e) => setFormData({ ...formData, syllabusVersion: e.target.value })}
                    placeholder="e.g. New Scheme 2024"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              {/* AI PDF Extraction Banner */}
              <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-blue-900 text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>Smart PDF Upload & Digitization</span>
                    </div>
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      Upload an official Question Paper, Suggested Answers, or Marking Scheme PDF. Gemini will extract and structure the text automatically.
                    </p>
                  </div>
                  <label className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs cursor-pointer shadow-sm transition shrink-0">
                    {isExtractingDoc === 'ALL' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>{isExtractingDoc === 'ALL' ? 'Digitizing PDF...' : 'Upload Complete PDF Suite'}</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'ALL')}
                      disabled={Boolean(isExtractingDoc)}
                    />
                  </label>
                </div>
              </div>

              {/* Title & Chapter/Topic */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Material Title *</label>
                  <input
                    type="text"
                    value={formData.questionPaperTitle}
                    onChange={(e) => setFormData({ ...formData, questionPaperTitle: e.target.value })}
                    placeholder="e.g. CA Inter Advanced Accounting MTP Series 1 May 2026"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chapter / Topic (Optional)</label>
                  <input
                    type="text"
                    value={formData.chapterTopic}
                    onChange={(e) => setFormData({ ...formData, chapterTopic: e.target.value })}
                    placeholder="e.g. AS 14 Amalgamation"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              {/* Question Paper Text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    1. Question Paper Text * (Ground Truth Questions)
                  </label>
                  <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer">
                    {isExtractingDoc === 'questionPaperText' ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileUp className="w-3 h-3" />
                    )}
                    <span>{isExtractingDoc === 'questionPaperText' ? 'Extracting...' : 'Upload Question Paper PDF / TXT'}</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'questionPaperText')}
                      disabled={Boolean(isExtractingDoc)}
                    />
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={formData.questionPaperText}
                  onChange={(e) => setFormData({ ...formData, questionPaperText: e.target.value })}
                  placeholder="Paste complete Question Paper text here, including question numbers and marks..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                  required
                />
              </div>

              {/* Suggested Answers Text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    2. Suggested Guideline Answers Text * (Ground Truth Answers)
                  </label>
                  <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 cursor-pointer">
                    {isExtractingDoc === 'suggestedAnswersText' ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileUp className="w-3 h-3" />
                    )}
                    <span>{isExtractingDoc === 'suggestedAnswersText' ? 'Extracting...' : 'Upload Suggested Answers PDF / TXT'}</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'suggestedAnswersText')}
                      disabled={Boolean(isExtractingDoc)}
                    />
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={formData.suggestedAnswersText}
                  onChange={(e) => setFormData({ ...formData, suggestedAnswersText: e.target.value })}
                  placeholder="Paste official suggested answers, journal entries, working notes, balance sheets, and conclusions..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                  required
                />
              </div>

              {/* Marking Scheme Text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    3. Marking Scheme Text (Step-by-Step Mark Breakdown)
                  </label>
                  <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 cursor-pointer">
                    {isExtractingDoc === 'markingSchemeText' ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileUp className="w-3 h-3" />
                    )}
                    <span>{isExtractingDoc === 'markingSchemeText' ? 'Extracting...' : 'Upload Marking Scheme PDF / TXT'}</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'markingSchemeText')}
                      disabled={Boolean(isExtractingDoc)}
                    />
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={formData.markingSchemeText}
                  onChange={(e) => setFormData({ ...formData, markingSchemeText: e.target.value })}
                  placeholder="e.g. Step 1: 1 Mark for Calculation of Purchase Consideration; Step 2: 2 Marks for Journal Entries..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                />
              </div>

              {/* Examiner Comments / Guidance */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  4. Reference Guidance & Examiner Comments (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.referenceGuidanceText}
                  onChange={(e) => setFormData({ ...formData, referenceGuidanceText: e.target.value })}
                  placeholder="Specific common student errors noted by examiners, alternate acceptable treatments..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                />
              </div>

              {/* Statutory Amendments */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  5. Relevant Amendments / Provisions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.amendmentsProvisionsText}
                  onChange={(e) => setFormData({ ...formData, amendmentsProvisionsText: e.target.value })}
                  placeholder="Effective circulars, Finance Act amendments, judicial rulings applicable for this attempt..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  <span>{editingMaterial ? 'Update Material' : 'Save Material'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
