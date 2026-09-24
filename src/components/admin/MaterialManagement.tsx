import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest, ApiError } from '../../api/client';
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
  FileDown,
  ShieldAlert,
  AlertTriangle,
  X,
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
  const [selectedSeries, setSelectedSeries] = useState<string>('ALL');
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
    mtpSeries: 1 as 1 | 2,
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
    combinedText: '',
    markingSchemeText: '',
    referenceGuidanceText: '',
    amendmentsProvisionsText: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    sourceFormat: 'SEPARATE' as 'SEPARATE' | 'COMBINED',
    version: '1.0',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [availableAttempts, setAvailableAttempts] = useState<ExamAttempt[]>(() =>
    getAttemptsForLevel(initialFormState.level)
  );

  // Duplicate upload protection state (staged tiers: NEW, EXACT_DUPLICATE, POSSIBLE_DUPLICATE, SIMILAR, REPLACEMENT_VERSION)
  interface DuplicateInfoState {
    status: 'NEW' | 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'SIMILAR' | 'REPLACEMENT_VERSION';
    isDuplicate: boolean;
    canOverride: boolean;
    similarity?: number;
    message: string;
    reason?: string;
    details?: {
      level: string;
      subject: string;
      attempt: string;
      materialType: string;
      series?: string;
      paper?: string;
      version?: string;
      title?: string;
      year?: string;
    };
    existingMaterial?: any;
    fileHash?: string | null;
  }

  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfoState | null>(null);
  const [showDuplicateBlockedModal, setShowDuplicateBlockedModal] = useState<boolean>(false);
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [overrideReasonInput, setOverrideReasonInput] = useState<string>('Contains different mock questions / revised answers.');

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

  // Staged Duplicate-Upload Real-Time Pre-Check
  useEffect(() => {
    if (!showFormModal || editingMaterial) {
      setDuplicateInfo(null);
      return;
    }

    let isMounted = true;
    const runCheck = async () => {
      try {
        const fullContent = `${formData.questionPaperText || ''}\n\n${formData.suggestedAnswersText || ''}`.trim();
        const res = await apiRequest<{
          status: 'NEW' | 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'SIMILAR' | 'REPLACEMENT_VERSION';
          isDuplicate: boolean;
          canOverride: boolean;
          similarity?: number;
          duplicateKey?: string;
          message?: string;
          reason?: string;
          fileHash?: string | null;
          details?: {
            level: string;
            subject: string;
            attempt: string;
            materialType: string;
            series?: string;
            paper?: string;
            version?: string;
            title?: string;
            year?: string;
          };
          existingMaterial?: any;
        }>('/api/admin/materials/check-duplicate', {
          method: 'POST',
          body: JSON.stringify({
            level: formData.level,
            subjectKey: formData.subjectKey,
            subjectName: formData.subjectName,
            attempt: formData.attempt,
            materialType: formData.materialType,
            mtpSeries: formData.mtpSeries,
            paper: formData.paper,
            version: formData.version,
            title: formData.questionPaperTitle,
            fileName: formData.attachedFile?.name,
            rawText: fullContent.length >= 30 ? fullContent : undefined,
          }),
        });

        if (!isMounted) return;

        if (res) {
          if (res.status === 'EXACT_DUPLICATE') {
            setDuplicateInfo({
              status: 'EXACT_DUPLICATE',
              isDuplicate: true,
              canOverride: false,
              similarity: 100,
              message: res.message || 'An identical material already exists in the database.',
              reason: res.reason,
              details: res.details,
              existingMaterial: res.existingMaterial,
              fileHash: res.fileHash,
            });
          } else if (res.status === 'POSSIBLE_DUPLICATE') {
            setDuplicateInfo({
              status: 'POSSIBLE_DUPLICATE',
              isDuplicate: true,
              canOverride: true,
              similarity: res.similarity || 85,
              message: res.message || 'This material appears very similar to an existing material. Please review.',
              reason: res.reason,
              details: res.details,
              existingMaterial: res.existingMaterial,
              fileHash: res.fileHash,
            });
          } else if (res.status === 'SIMILAR') {
            setDuplicateInfo({
              status: 'SIMILAR',
              isDuplicate: false,
              canOverride: false,
              similarity: res.similarity,
              message: res.message || 'Similar material exists for this attempt; new distinct material is allowed.',
              reason: res.reason,
              details: res.details,
              existingMaterial: res.existingMaterial,
              fileHash: res.fileHash,
            });
          } else if (res.status === 'REPLACEMENT_VERSION') {
            setDuplicateInfo({
              status: 'REPLACEMENT_VERSION',
              isDuplicate: false,
              canOverride: false,
              similarity: res.similarity,
              message: res.message || `New version ${formData.version} detected.`,
              reason: res.reason,
              details: res.details,
              existingMaterial: res.existingMaterial,
              fileHash: res.fileHash,
            });
          } else {
            // NEW material
            setDuplicateInfo(null);
          }
        }
      } catch {
        // Silent error during pre-check typing
      }
    };

    const timer = setTimeout(runCheck, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    showFormModal,
    editingMaterial,
    formData.level,
    formData.subjectKey,
    formData.subjectName,
    formData.attempt,
    formData.materialType,
    formData.mtpSeries,
    formData.paper,
    formData.version,
    formData.questionPaperTitle,
    formData.attachedFile?.name,
  ]);

  // Handle PDF / Text File Upload and AI Extraction
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetField: 'questionPaperText' | 'suggestedAnswersText' | 'markingSchemeText' | 'combinedText' | 'ALL'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
      const text = await file.text();
      if (targetField === 'ALL') {
        setFormData((prev) => ({ ...prev, questionPaperText: text }));
      } else if (targetField === 'combinedText') {
        setFormData((prev) => ({ ...prev, combinedText: text, questionPaperText: text, suggestedAnswersText: text }));
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
            targetField === 'combinedText'
              ? 'COMBINED_PYQ'
              : targetField === 'questionPaperText'
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
            const next = {
              ...prev,
              attachedFile: {
                name: file.name,
                size: file.size,
                type: file.type || 'application/pdf',
                base64,
              },
            };
            if (targetField === 'combinedText') {
              const combinedJoined = `${ext.questionPaperText || ''}\n\n${ext.suggestedAnswersText || ''}`.trim();
              next.combinedText = combinedJoined;
              if (ext.questionPaperText) next.questionPaperText = ext.questionPaperText;
              if (ext.suggestedAnswersText) next.suggestedAnswersText = ext.suggestedAnswersText;
            }
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
      if (selectedSeries !== 'ALL') params.append('mtpSeries', selectedSeries);
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
  }, [selectedLevel, selectedType, selectedSeries, selectedStatus]);

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
        mtpSeries: (m.mtp_series || m.mtpSeries || 1) as 1 | 2,
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
        combinedText: ((m.source_format || m.sourceFormat || '').toUpperCase() === 'COMBINED')
          ? (m.question_paper_text === m.suggested_answers_text ? m.question_paper_text : `${m.question_paper_text || ''}\n\n${m.suggested_answers_text || ''}`.trim())
          : '',
        markingSchemeText: m.marking_scheme_text || '',
        referenceGuidanceText: m.reference_guidance_text || '',
        amendmentsProvisionsText: m.amendments_provisions_text || '',
        effectiveDate: m.effective_date || new Date().toISOString().split('T')[0],
        sourceFormat: ((m.source_format || m.sourceFormat || 'SEPARATE') as string).toUpperCase() === 'COMBINED' ? 'COMBINED' : 'SEPARATE',
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
    const title = mat.question_paper_title || mat.questionPaperTitle || 'this material';
    if (!window.confirm(`Are you sure you want to permanently delete "${title}" and all associated cloud files? This cannot be undone.`)) {
      return;
    }
    try {
      await apiRequest(`/api/admin/materials/${mat.id}`, { method: 'DELETE' });
      onNotify?.('Material and cloud files permanently deleted', 'success');
      await fetchMaterials();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete material';
      onNotify?.(msg, 'error');
    }
  };

  // Handle Form Submit (Create or Update) with staged duplicate review
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    // STRICT DUPLICATE-UPLOAD PROTECTION: Block immediate submission for exact duplicates
    if (duplicateInfo?.status === 'EXACT_DUPLICATE' && !editingMaterial) {
      setShowDuplicateBlockedModal(true);
      return;
    }

    // High-similarity possible duplicate: Prompt admin for review & confirmation
    if (duplicateInfo?.status === 'POSSIBLE_DUPLICATE' && !editingMaterial) {
      setShowOverrideModal(true);
      return;
    }

    await executeSaveMaterial(false);
  };

  const executeSaveMaterial = async (overrideDuplicate: boolean = false, overrideReason: string = '') => {
    if (!formData.questionPaperTitle.trim()) {
      alert('Please provide a title for the material.');
      return;
    }

    const isPyqCombined = formData.materialType === 'PYQ' && formData.sourceFormat === 'COMBINED';
    const payload: any = { ...formData };
    if (isPyqCombined) {
      const combinedVal = (payload.combinedText || payload.questionPaperText || payload.suggestedAnswersText || '').trim();
      if (!combinedVal) {
        alert('Please provide the Combined Question Paper + Suggested Answers text or upload the file.');
        return;
      }
      if (!payload.questionPaperText.trim()) payload.questionPaperText = combinedVal;
      if (!payload.suggestedAnswersText.trim()) payload.suggestedAnswersText = combinedVal;
      payload.combinedText = combinedVal;
    } else {
      if (!payload.questionPaperText.trim() || !payload.suggestedAnswersText.trim()) {
        alert('Question Paper Text and Suggested Answers Text are required.');
        return;
      }
    }

    if (overrideDuplicate) {
      payload.overrideDuplicate = true;
      payload.overrideReason = overrideReason || overrideReasonInput || 'Admin confirmed distinct material content.';
    }

    try {
      setIsSubmitting(true);
      if (editingMaterial) {
        await apiRequest(`/api/admin/materials/${editingMaterial.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify?.('Material updated successfully', 'success');
      } else {
        await apiRequest('/api/admin/materials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify?.(
          overrideDuplicate
            ? 'New material added successfully (Duplicate override logged)'
            : 'New material added successfully',
          'success'
        );
      }
      setShowFormModal(false);
      setShowOverrideModal(false);
      fetchMaterials();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const status = err.data?.status || 'EXACT_DUPLICATE';
        const canOverride = Boolean(err.data?.canOverride);
        const details = err.data?.duplicateDetails || duplicateInfo?.details;
        const msg = err.data?.message || duplicateInfo?.message || 'This material is already uploaded.';
        const sim = err.data?.similarity || duplicateInfo?.similarity;

        setDuplicateInfo({
          status: status as any,
          isDuplicate: true,
          canOverride,
          similarity: sim,
          message: msg,
          reason: err.data?.reason,
          details: details || {
            level: formData.level === 'INTERMEDIATE' ? 'CA Intermediate' : formData.level === 'FINAL' ? 'CA Final' : 'CA Foundation',
            subject: formData.subjectName,
            attempt: formData.attempt,
            materialType: formData.materialType === 'MTP' ? 'MTP' : (formData.materialType === 'QUESTION_PAPER' ? 'Question Paper' : formData.materialType),
            series: formData.materialType === 'MTP' ? `Series ${formData.mtpSeries}` : undefined,
            paper: formData.paper || 'Paper 1',
          },
          existingMaterial: err.data?.existingMaterial,
          fileHash: err.data?.fileHash,
        });

        if (canOverride) {
          setShowOverrideModal(true);
        } else {
          setShowDuplicateBlockedModal(true);
        }
        return;
      }
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
              {ALLOWED_MATERIAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value === 'MODEL_TEST_PAPER' ? 'Model Test Paper' : t.value}
                </option>
              ))}
            </select>

            {/* MTP Series Filter */}
            <select
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Series</option>
              <option value="1">Series 1</option>
              <option value="2">Series 2</option>
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
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 inline-flex items-center gap-1 flex-wrap">
                        <span>{m.material_type}</span>
                        {m.material_type === 'MTP' && (
                          <span className="px-1.5 py-0.2 text-[9px] font-extrabold rounded bg-blue-100 text-blue-700">
                            S{m.mtp_series || m.mtpSeries || 1}
                          </span>
                        )}
                        {m.material_type === 'PYQ' && (
                          <span className="px-1.5 py-0.2 text-[9px] font-extrabold rounded bg-purple-100 text-purple-700">
                            {(m.source_format || m.sourceFormat) === 'COMBINED' ? 'Combined' : 'Separate'}
                          </span>
                        )}
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
                        {(m.file_id || m.file_name || m.download_url) && (
                          <a
                            href={m.download_url || `/api/admin/materials/${m.id}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition cursor-pointer"
                            title={`View PDF: ${m.file_name || 'Attached PDF'}`}
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </a>
                        )}
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
                  <div className={`grid grid-cols-2 ${inspectFullText.material_type === 'PYQ' ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200`}>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">TYPE</span>
                      <span className="font-semibold text-slate-800">{inspectFullText.material_type}</span>
                    </div>
                    {inspectFullText.material_type === 'PYQ' && (
                      <div>
                        <span className="text-[10px] text-purple-600 font-bold block">SOURCE FORMAT</span>
                        <span className="font-semibold text-purple-800">
                          {(inspectFullText.source_format || inspectFullText.sourceFormat) === 'COMBINED' ? 'Combined QP+Answers' : 'Separate QP & Answers'}
                        </span>
                      </div>
                    )}
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
              {/* TIERED DUPLICATE-UPLOAD PROTECTION BANNER */}
              {duplicateInfo && !editingMaterial && (
                <>
                  {duplicateInfo.status === 'EXACT_DUPLICATE' && (
                    <div
                      id="admin-material-exact-duplicate-banner"
                      className="p-4 bg-red-50 border-2 border-red-500 rounded-xl flex items-start justify-between gap-3 text-red-950 shadow-xs animate-in fade-in duration-200"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-base flex-shrink-0 mt-0.5">
                          🛑
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-red-900">
                              Exact Duplicate Detected
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-200 text-red-800 border border-red-300">
                              100% Identical
                            </span>
                          </div>
                          <p className="text-xs text-red-800 mt-1 font-medium">
                            {duplicateInfo.message || 'An identical material or file checksum already exists in the database. Exact duplicate uploads are rejected.'}
                          </p>
                          <div className="mt-2 text-[11px] text-red-700 bg-red-100/70 p-2 rounded border border-red-200">
                            <strong>Existing:</strong> {duplicateInfo.existingMaterial?.question_paper_title || duplicateInfo.existingMaterial?.title || 'Existing Material'} ({duplicateInfo.details?.subject} • {duplicateInfo.details?.attempt})
                            {duplicateInfo.fileHash && <span className="block font-mono text-[10px] mt-0.5">Checksum: {duplicateInfo.fileHash.slice(0, 16)}...</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {duplicateInfo.status === 'POSSIBLE_DUPLICATE' && (
                    <div
                      id="admin-material-possible-duplicate-banner"
                      className="p-4 bg-amber-50 border-2 border-amber-400 rounded-xl flex items-start justify-between gap-3 text-amber-950 shadow-xs animate-in fade-in duration-200"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-base flex-shrink-0 mt-0.5">
                          ⚠️
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-amber-900">
                              Possible Duplicate ({duplicateInfo.similarity || 85}% Similarity)
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Admin Review Required
                            </span>
                          </div>
                          <p className="text-xs text-amber-800 mt-1 font-medium">
                            {duplicateInfo.message || 'This material shares high text overlap with an existing entry. CA materials may repeat concepts or questions; you can review and override if this is a distinct material.'}
                          </p>
                          <div className="mt-2 text-[11px] text-amber-900 bg-amber-100/70 p-2 rounded border border-amber-200 flex items-center justify-between gap-2">
                            <span><strong>Matches:</strong> {duplicateInfo.existingMaterial?.question_paper_title || duplicateInfo.existingMaterial?.title || 'Existing Material'}</span>
                            <button
                              type="button"
                              onClick={() => setShowOverrideModal(true)}
                              className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded text-[11px] transition shrink-0 cursor-pointer"
                            >
                              Review & Override →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {duplicateInfo.status === 'SIMILAR' && (
                    <div
                      id="admin-material-similar-banner"
                      className="p-3 bg-blue-50 border border-blue-300 rounded-xl flex items-center gap-3 text-blue-950 shadow-xs animate-in fade-in duration-200"
                    >
                      <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        ℹ️
                      </div>
                      <p className="text-xs text-blue-800 font-medium">
                        Existing material found for <strong>{duplicateInfo.details?.subject} ({duplicateInfo.details?.attempt})</strong>. Distinct questions/content can be uploaded freely.
                      </p>
                    </div>
                  )}

                  {duplicateInfo.status === 'REPLACEMENT_VERSION' && (
                    <div
                      id="admin-material-version-banner"
                      className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-emerald-950 shadow-xs animate-in fade-in duration-200"
                    >
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        ✨
                      </div>
                      <p className="text-xs text-emerald-800 font-medium">
                        Uploading new version <strong>{duplicateInfo.details?.version || '2.0'}</strong> for this material.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Row 1: Level, Material Type, MTP Series / PYQ Format, Subject */}
              <div className={`grid grid-cols-1 ${formData.materialType === 'MTP' || formData.materialType === 'PYQ' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
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
                    {ALLOWED_MATERIAL_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                    {formData.materialType && !ALLOWED_MATERIAL_TYPES.some((t) => t.value === formData.materialType) && (
                      <option value={formData.materialType}>
                        {formData.materialType === 'QUESTION_PAPER'
                          ? 'Question Paper (Legacy)'
                          : formData.materialType === 'SUGGESTED_ANSWER'
                          ? 'Suggested Answer (Legacy)'
                          : formData.materialType}
                      </option>
                    )}
                  </select>
                </div>

                {formData.materialType === 'MTP' && (
                  <div>
                    <label className="block font-bold text-blue-700 mb-1 flex items-center justify-between">
                      <span>MTP Series *</span>
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded">Required</span>
                    </label>
                    <select
                      id="admin-form-mtp-series-select"
                      value={formData.mtpSeries}
                      onChange={(e) => setFormData({ ...formData, mtpSeries: Number(e.target.value) as any })}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50/50 text-blue-800 font-semibold focus:outline-none focus:border-blue-600"
                    >
                      <option value={1}>Series 1 (Model Test 1)</option>
                      <option value={2}>Series 2 (Model Test 2)</option>
                      <option value={3}>Series 3 (Model Test 3)</option>
                      <option value={4}>Series 4 (Model Test 4)</option>
                    </select>
                  </div>
                )}

                {formData.materialType === 'PYQ' && (
                  <div>
                    <label className="block font-bold text-purple-700 mb-1 flex items-center justify-between">
                      <span>Source Format *</span>
                      <span className="text-[10px] text-purple-600 bg-purple-50 px-1 rounded">PYQ</span>
                    </label>
                    <select
                      id="admin-form-pyq-source-format-select"
                      value={formData.sourceFormat}
                      onChange={(e) => setFormData({ ...formData, sourceFormat: e.target.value as 'SEPARATE' | 'COMBINED' })}
                      className="w-full px-3 py-2 border border-purple-300 rounded-lg bg-purple-50/50 text-purple-800 font-semibold focus:outline-none focus:border-purple-600"
                    >
                      <option value="SEPARATE">A. Separate Question &amp; Suggested Answers</option>
                      <option value="COMBINED">B. Combined Question Paper + Suggested Answers</option>
                    </select>
                  </div>
                )}

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

              {/* COMBINED vs SEPARATE INPUTS */}
              {formData.materialType === 'PYQ' && formData.sourceFormat === 'COMBINED' ? (
                <div className="space-y-4">
                  <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <span className="font-bold">Combined Format Mode:</span> Upload or paste a single document containing both Question Paper questions and Suggested Answers. The backend normalizer will partition this into separate reference packages. Marking Scheme remains a separate upload.
                  </div>

                  {/* Combined Question Paper + Suggested Answers */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">
                        1. Combined Question Paper + Suggested Answers * (Questions & Model Solutions)
                      </label>
                      <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer">
                        {isExtractingDoc === 'combinedText' ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <FileUp className="w-3 h-3" />
                        )}
                        <span>{isExtractingDoc === 'combinedText' ? 'Extracting...' : 'Upload Combined PYQ PDF / TXT'}</span>
                        <input
                          type="file"
                          accept=".pdf,.txt,.md"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'combinedText')}
                          disabled={Boolean(isExtractingDoc)}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={7}
                      value={formData.combinedText || formData.questionPaperText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({
                          ...formData,
                          combinedText: val,
                          questionPaperText: val,
                          suggestedAnswersText: val,
                        });
                      }}
                      placeholder="Paste complete Combined Question Paper + Suggested Answers text here (or upload single combined PYQ PDF)..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                      required
                    />
                  </div>

                  {/* Marking Scheme Text - ALWAYS SEPARATE */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <label className="font-bold text-slate-700">
                          2. Marking Scheme Text (Step-by-Step Mark Breakdown)
                        </label>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          Separate Input
                        </span>
                      </div>
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
                </div>
              ) : (
                <div className="space-y-4">
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
                </div>
              )}

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
                  id="admin-material-save-btn"
                  disabled={isSubmitting || (duplicateInfo?.status === 'EXACT_DUPLICATE' && !editingMaterial)}
                  className={`px-5 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                    duplicateInfo?.status === 'EXACT_DUPLICATE' && !editingMaterial
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                      : duplicateInfo?.status === 'POSSIBLE_DUPLICATE' && !editingMaterial
                      ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-sm'
                      : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50'
                  }`}
                  title={
                    duplicateInfo?.status === 'EXACT_DUPLICATE' && !editingMaterial
                      ? 'Upload blocked: Material is an exact duplicate.'
                      : duplicateInfo?.status === 'POSSIBLE_DUPLICATE' && !editingMaterial
                      ? 'High similarity detected. Click to review and override.'
                      : 'Save Material'
                  }
                >
                  {duplicateInfo?.status === 'EXACT_DUPLICATE' && !editingMaterial ? (
                    <>
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                      <span>Upload Blocked (Exact Duplicate)</span>
                    </>
                  ) : duplicateInfo?.status === 'POSSIBLE_DUPLICATE' && !editingMaterial ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-100" />
                      <span>Review & Confirm Upload ({duplicateInfo.similarity || 85}% Match)...</span>
                    </>
                  ) : (
                    <>
                      {isSubmitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      <span>{editingMaterial ? 'Update Material' : 'Save Material'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STRICT EXACT DUPLICATE BLOCKED MODAL */}
      {showDuplicateBlockedModal && duplicateInfo && (
        <div
          id="duplicate-material-blocked-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-red-400 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 text-center mb-1">
              Exact Duplicate Detected
            </h3>
            <p className="text-xs text-slate-600 text-center mb-4 font-medium">
              An identical file checksum or content matching this material already exists in the database.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-2 text-xs">
              <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Level:</span>
                <span className="font-bold text-slate-900">{duplicateInfo.details?.level || formData.level}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Subject:</span>
                <span className="font-bold text-slate-900">{duplicateInfo.details?.subject || formData.subjectName}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Attempt:</span>
                <span className="font-bold text-slate-900">{duplicateInfo.details?.attempt || formData.attempt}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Material Type:</span>
                <span className="font-bold text-slate-900">{duplicateInfo.details?.materialType || formData.materialType}</span>
              </div>
              {duplicateInfo.existingMaterial && (
                <div className="py-1 bg-red-50 px-2 rounded text-red-900 font-medium text-[11px]">
                  <strong>Existing Title:</strong> {duplicateInfo.existingMaterial.question_paper_title || duplicateInfo.existingMaterial.title}
                </div>
              )}
              {duplicateInfo.fileHash && (
                <div className="text-[10px] font-mono text-slate-500 break-all pt-1 border-t border-slate-200">
                  SHA-256: {duplicateInfo.fileHash}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 text-center mb-5 leading-relaxed bg-red-50/70 p-2.5 rounded-lg border border-red-200 text-red-900 font-medium">
              Strict duplicate protection blocks exact re-uploads to preserve system accuracy. If you wish to update this material, use the Edit action instead.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                id="btn-close-duplicate-blocked-dialog"
                onClick={() => setShowDuplicateBlockedModal(false)}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition shadow-sm cursor-pointer"
              >
                Close & Review Form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POSSIBLE DUPLICATE OVERRIDE MODAL */}
      {showOverrideModal && duplicateInfo && (
        <div
          id="duplicate-material-override-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-amber-400 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center mb-4">
              <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-bold mb-2">
                {duplicateInfo.similarity || 85}% Content Similarity
              </span>
              <h3 className="text-lg font-black text-slate-900">
                Possible Duplicate Detected
              </h3>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                The content you are uploading shares substantial overlap with an existing material.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-xs space-y-3">
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Existing Material</div>
                <div className="font-bold text-slate-900 bg-white p-2.5 rounded-lg border border-slate-200">
                  {duplicateInfo.existingMaterial?.question_paper_title || duplicateInfo.existingMaterial?.title || 'Existing Material'}
                  <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                    {duplicateInfo.details?.subject} • {duplicateInfo.details?.attempt} • {duplicateInfo.details?.materialType}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">New Upload</div>
                <div className="font-bold text-blue-900 bg-blue-50/60 p-2.5 rounded-lg border border-blue-200">
                  {formData.questionPaperTitle}
                  <div className="text-[11px] text-blue-700 font-normal mt-0.5">
                    {formData.subjectName} • {formData.attempt} • {formData.materialType} (v{formData.version || '1.0'})
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Override Justification (Logged to Security Audit Trail) *
              </label>
              <input
                type="text"
                value={overrideReasonInput}
                onChange={(e) => setOverrideReasonInput(e.target.value)}
                placeholder="e.g., Distinct mock questions / revised answers for this attempt"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                CA exams frequently revisit syllabus concepts. Overriding will approve this upload and create an audit log.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-semibold text-xs cursor-pointer"
              >
                Cancel / Review
              </button>
              <button
                type="button"
                disabled={isSubmitting || !overrideReasonInput.trim()}
                onClick={() => executeSaveMaterial(true, overrideReasonInput)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Confirm & Upload Material
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
