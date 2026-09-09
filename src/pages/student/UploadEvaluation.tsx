import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { CA_SUBJECTS, CASubject } from '../../data/caCurriculum.js';
import { CALevel, MaterialType, CheckingMode, EvaluationResult } from '../../types/index.js';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Zap,
  Info,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Scale,
  Building2,
  Globe,
  BookOpen,
} from 'lucide-react';

interface UploadEvaluationProps {
  onEvaluationComplete: (evaluationId: string, result: EvaluationResult) => void;
  onOpenCreditsModal: () => void;
}

type EvaluationStep =
  | 'IDLE'
  | 'UPLOADING'
  | 'VALIDATING_DOCUMENT'
  | 'READING_SOLUTIONS'
  | 'IDENTIFYING_QUESTIONS'
  | 'EVALUATING_STEPS'
  | 'CALCULATING_MARKS'
  | 'FINALIZING_REPORT';

export const UploadEvaluation: React.FC<UploadEvaluationProps> = ({
  onEvaluationComplete,
  onOpenCreditsModal,
}) => {
  const { user, profile, refreshUser } = useAuth();
  const location = useLocation();
  const navState = (location.state || {}) as {
    initialEvaluationType?: 'PUBLIC' | 'INSTITUTE';
    instituteId?: string;
    materialId?: string;
    subjectKey?: string;
    level?: CALevel;
  };

  // Dual Evaluation state
  const [evaluationSource, setEvaluationSource] = useState<'PUBLIC' | 'INSTITUTE'>(
    navState.initialEvaluationType || 'PUBLIC'
  );
  const [enrolledInstitutes, setEnrolledInstitutes] = useState<any[]>([]);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>(navState.instituteId || '');
  const [instituteMaterials, setInstituteMaterials] = useState<any[]>([]);
  const [selectedInstituteMaterialId, setSelectedInstituteMaterialId] = useState<string>(navState.materialId || '');
  const [loadingEnrollments, setLoadingEnrollments] = useState<boolean>(true);

  // Form states
  const [level, setLevel] = useState<CALevel>(navState.level || 'INTERMEDIATE');
  const [selectedGroup, setSelectedGroup] = useState<'GROUP_1' | 'GROUP_2' | 'ALL'>('GROUP_1');
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>(
    navState.subjectKey || 'inter_advanced_accounting'
  );
  const [materialType, setMaterialType] = useState<MaterialType>('MTP');
  const [attempt, setAttempt] = useState<string>('May 2026');
  const [checkingMode, setCheckingMode] = useState<CheckingMode>('standard');

  // File upload states
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Material check status
  const [materialAvailable, setMaterialAvailable] = useState<boolean>(true);
  const [materialTitle, setMaterialTitle] = useState<string>('');
  const [checkingMaterial, setCheckingMaterial] = useState<boolean>(false);

  // Progress states
  const [evalStep, setEvalStep] = useState<EvaluationStep>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [rejectionDetails, setRejectionDetails] = useState<string>('');

  const studentProfile = profile as {
    free_evaluations_used?: number;
    purchased_credits?: number;
    icai_registration_number?: string;
    institute_name?: string;
  } | null;

  const freeRemaining = Math.max(0, 2 - (studentProfile?.free_evaluations_used || 0));
  const purchasedCredits = studentProfile?.purchased_credits || 0;

  // Active membership check
  const activeInstitute = enrolledInstitutes.find((inst) => inst.institute_id === selectedInstituteId);
  const isInstituteEnrolled = enrolledInstitutes.length > 0;
  const hasAccess =
    evaluationSource === 'INSTITUTE'
      ? !!activeInstitute
      : user?.hasPermanentFreeAccess || freeRemaining > 0 || purchasedCredits > 0;

  // Fetch student enrollments
  useEffect(() => {
    const fetchEnrollments = async () => {
      try {
        setLoadingEnrollments(true);
        const res = await apiRequest<{ enrollments: any[] }>('/api/student/enrollments');
        const active = (res.enrollments || []).filter((e: any) => e.status === 'ACTIVE');
        setEnrolledInstitutes(active);
        if (active.length > 0 && !selectedInstituteId) {
          setSelectedInstituteId(navState.instituteId || active[0].institute_id);
        }
        if (navState.initialEvaluationType === 'INSTITUTE' && active.length > 0) {
          setEvaluationSource('INSTITUTE');
        }
      } catch (err) {
        console.warn('Could not load student enrollments:', err);
      } finally {
        setLoadingEnrollments(false);
      }
    };
    fetchEnrollments();
  }, []);

  // Fetch materials for selected institute
  useEffect(() => {
    if (evaluationSource !== 'INSTITUTE' || !selectedInstituteId) {
      setInstituteMaterials([]);
      return;
    }
    const fetchInstMaterials = async () => {
      try {
        const res = await apiRequest<{ materials: any[] }>(
          `/api/student/institute-materials?instituteId=${selectedInstituteId}`
        );
        const mats = res.materials || [];
        setInstituteMaterials(mats);
        if (mats.length > 0) {
          const match = navState.materialId ? mats.find((m: any) => m.id === navState.materialId) : null;
          const chosen = match || mats[0];
          setSelectedInstituteMaterialId(chosen.id);
          if (chosen.level) setLevel(chosen.level as CALevel);
          if (chosen.subject_key) setSelectedSubjectKey(chosen.subject_key);
        }
      } catch (err) {
        console.warn('Could not load institute materials:', err);
      }
    };
    fetchInstMaterials();
  }, [evaluationSource, selectedInstituteId]);

  // Filter subjects based on level and group
  const filteredSubjects = CA_SUBJECTS.filter((s) => {
    if (s.level !== level) return false;
    if (level === 'FOUNDATION') return true;
    if (selectedGroup === 'ALL') return true;
    return s.group === selectedGroup;
  });

  // Selected subject object
  const currentSubject = CA_SUBJECTS.find((s) => s.id === selectedSubjectKey) || filteredSubjects[0];

  // Auto update selected subject when level/group changes
  useEffect(() => {
    if (evaluationSource === 'PUBLIC' && filteredSubjects.length > 0 && !filteredSubjects.some((s) => s.id === selectedSubjectKey)) {
      setSelectedSubjectKey(filteredSubjects[0].id);
    }
  }, [level, selectedGroup, filteredSubjects, selectedSubjectKey, evaluationSource]);

  // Check material availability from server
  useEffect(() => {
    if (evaluationSource === 'INSTITUTE') {
      if (selectedInstituteMaterialId) {
        const sel = instituteMaterials.find((m: any) => m.id === selectedInstituteMaterialId);
        if (sel) {
          setMaterialAvailable(true);
          setMaterialTitle(sel.title || sel.subject_name);
          return;
        }
      }
      if (instituteMaterials.length > 0) {
        setMaterialAvailable(true);
        setMaterialTitle(instituteMaterials[0].title || 'Institute Test Series Paper');
      } else {
        setMaterialAvailable(false);
        setMaterialTitle('');
      }
      return;
    }

    const checkMaterial = async () => {
      if (!selectedSubjectKey) return;
      setCheckingMaterial(true);
      try {
        const res = await apiRequest<{
          available: boolean;
          material?: { question_paper_title: string; attempt: string };
        }>(
          `/api/public/materials-check?level=${level}&subjectKey=${selectedSubjectKey}&attempt=${encodeURIComponent(
            attempt
          )}&materialType=${materialType}`
        );

        setMaterialAvailable(res.available);
        setMaterialTitle(res.material?.question_paper_title || '');
      } catch {
        setMaterialAvailable(false);
      } finally {
        setCheckingMaterial(false);
      }
    };

    checkMaterial();
  }, [
    evaluationSource,
    selectedInstituteMaterialId,
    instituteMaterials,
    level,
    selectedSubjectKey,
    attempt,
    materialType,
  ]);

  // Handle file drop & selection
  const processFile = (selectedFile: File) => {
    setErrorMessage('');
    setRejectionDetails('');

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds 50MB limit. Please upload a compressed PDF or images.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1] || '';
      setFileBase64(base64Data);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Submit evaluation
  const handleStartEvaluation = async () => {
    if (!file || !fileBase64) {
      setErrorMessage('Please upload your handwritten CA answer sheet file (PDF or image).');
      return;
    }

    if (!materialAvailable) {
      setErrorMessage(
        evaluationSource === 'INSTITUTE'
          ? 'No test materials are available for this coaching institute. Please contact your faculty to upload test questions.'
          : 'Evaluation material is not available for the selected paper and attempt yet. Please try again once the required material has been uploaded.'
      );
      return;
    }

    if (!hasAccess) {
      if (evaluationSource === 'INSTITUTE') {
        setErrorMessage('You are not actively enrolled in this coaching institute.');
      } else {
        onOpenCreditsModal();
      }
      return;
    }

    try {
      setErrorMessage('');
      setRejectionDetails('');
      setEvalStep('UPLOADING');

      // Step state transitions
      setTimeout(() => setEvalStep('VALIDATING_DOCUMENT'), 1000);
      setTimeout(() => setEvalStep('READING_SOLUTIONS'), 2500);
      setTimeout(() => setEvalStep('IDENTIFYING_QUESTIONS'), 4000);
      setTimeout(() => setEvalStep('EVALUATING_STEPS'), 6500);
      setTimeout(() => setEvalStep('CALCULATING_MARKS'), 9500);
      setTimeout(() => setEvalStep('FINALIZING_REPORT'), 12000);

      const response = await apiRequest<{
        success: boolean;
        evaluationId: string;
        result: EvaluationResult;
      }>('/api/student/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          studentName: user?.fullName,
          icaiRegistrationNumber: studentProfile?.icai_registration_number || 'N/A',
          level,
          materialType: evaluationSource === 'INSTITUTE' ? 'MOCK_EXAM' : materialType,
          modelGroup: selectedGroup !== 'ALL' ? selectedGroup : undefined,
          subjectKey: selectedSubjectKey,
          subjectName: currentSubject?.name || 'CA Subject',
          attempt: evaluationSource === 'INSTITUTE' ? 'Institute Series' : attempt,
          checkingMode,
          fileBase64,
          mimeType: file.type || 'application/pdf',
          filename: file.name,
          evaluationSource,
          instituteId: evaluationSource === 'INSTITUTE' ? selectedInstituteId : undefined,
          instituteMaterialId: evaluationSource === 'INSTITUTE' ? selectedInstituteMaterialId : undefined,
        }),
      });

      await refreshUser();
      onEvaluationComplete(response.evaluationId, response.result);
    } catch (err: unknown) {
      setEvalStep('IDLE');
      const msg = err instanceof Error ? err.message : 'Evaluation could not be completed.';
      setErrorMessage(msg);
      if (msg.toLowerCase().includes('not appear to be a valid ca answer sheet') || msg.toLowerCase().includes('reject')) {
        setRejectionDetails(
          'Document validation safeguard triggered: Admit cards, certificates, hall tickets, and blank documents are strictly rejected. No evaluation credits have been deducted.'
        );
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 text-slate-800 space-y-6">
      {/* Title & ICAI Disclaimer Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Evaluate Handwritten Answer Sheet</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold uppercase tracking-wider">
              ICAI Pattern
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Upload your mock test, model test, or test series solutions for line-by-line step marking.
          </p>
        </div>

        {/* Entitlement Counter Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/50">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Available Balance</p>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              {user?.hasPermanentFreeAccess ? (
                <span className="text-blue-600">Active</span>
              ) : studentProfile?.institute_name ? (
                <span className="text-blue-600">Institute Sponsored</span>
              ) : freeRemaining > 0 ? (
                <span className="text-emerald-600">{freeRemaining} Free Left</span>
              ) : (
                <span className="text-slate-900">{purchasedCredits} Credits</span>
              )}
            </p>
          </div>
          {!user?.hasPermanentFreeAccess && !studentProfile?.institute_name && freeRemaining === 0 && purchasedCredits === 0 && (
            <button
              onClick={onOpenCreditsModal}
              className="ml-1 px-2.5 py-1 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
            >
              Buy (₹10)
            </button>
          )}
        </div>
      </div>

      {/* Evaluation Progress State Overlay */}
      {evalStep !== 'IDLE' && (
        <div className="p-5 rounded-xl bg-white border border-blue-200 shadow-lg space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
              <h3 className="text-base font-bold text-slate-900">ICAI Examiner Evaluation in Progress</h3>
            </div>
            <span className="text-xs font-mono font-bold text-blue-700 px-2.5 py-1 rounded bg-blue-50 border border-blue-200">
              Avg. 45 - 60s
            </span>
          </div>

          <div className="space-y-2">
            {[
              { key: 'UPLOADING', label: '1. Encrypted Document Ingestion' },
              { key: 'VALIDATING_DOCUMENT', label: '2. Answer Sheet Vision Safeguard (Checking Authenticity)' },
              { key: 'READING_SOLUTIONS', label: '3. Reading Handwritten Solutions & OCR Extraction' },
              { key: 'IDENTIFYING_QUESTIONS', label: '4. Indexing Questions, Sub-questions & Ledger Workings' },
              { key: 'EVALUATING_STEPS', label: '5. ICAI Step Marking, AS/Ind AS & Legal Provisions Check' },
              { key: 'CALCULATING_MARKS', label: '6. Sum Verification (Strictly No Negative Marking on Inter/Final MCQs)' },
              { key: 'FINALIZING_REPORT', label: '7. Generating Detailed Examiner Feedback & Strengths Report' },
            ].map((st) => {
              const stepsList: EvaluationStep[] = [
                'UPLOADING',
                'VALIDATING_DOCUMENT',
                'READING_SOLUTIONS',
                'IDENTIFYING_QUESTIONS',
                'EVALUATING_STEPS',
                'CALCULATING_MARKS',
                'FINALIZING_REPORT',
              ];
              const currentIndex = stepsList.indexOf(evalStep);
              const thisIndex = stepsList.indexOf(st.key as EvaluationStep);
              const isDone = currentIndex > thisIndex;
              const isCurrent = currentIndex === thisIndex;

              return (
                <div key={st.key} className="flex items-center gap-3 text-xs">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : isCurrent ? (
                    <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                  )}
                  <span className={isDone ? 'text-slate-400 line-through' : isCurrent ? 'text-blue-700 font-bold' : 'text-slate-500'}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Errors & Validation Rejection Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          {rejectionDetails && <p className="text-xs text-rose-600 pl-6">{rejectionDetails}</p>}
        </div>
      )}

      {/* Dual Evaluation Mode Selector Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Scale className="w-4 h-4 text-indigo-600" />
            Evaluation Benchmark Mode
          </h3>
          <span className="text-[11px] font-semibold text-slate-500">
            {evaluationSource === 'INSTITUTE' ? 'Sponsored by Coaching Academy' : 'Standard ICAI Public Model'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Public AI Evaluation Option */}
          <button
            type="button"
            onClick={() => setEvaluationSource('PUBLIC')}
            className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
              evaluationSource === 'PUBLIC'
                ? 'bg-blue-50/70 border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                Public AI Evaluation
              </span>
              {evaluationSource === 'PUBLIC' && (
                <span className="w-2 h-2 rounded-full bg-blue-600" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Checked against official ICAI MTP, RTP & Suggested Answers. Uses personal evaluation credits.
            </p>
            <div className="mt-2 text-[10px] font-bold text-blue-700 bg-blue-100/60 rounded px-2 py-0.5 inline-block">
              {user?.hasPermanentFreeAccess
                ? 'Unlimited Access'
                : freeRemaining > 0
                ? `${freeRemaining} Free Left`
                : `${purchasedCredits} Credits Available`}
            </div>
          </button>

          {/* Institute Sponsored Evaluation Option */}
          <button
            type="button"
            onClick={() => {
              if (enrolledInstitutes.length > 0) {
                setEvaluationSource('INSTITUTE');
                if (!selectedInstituteId && enrolledInstitutes[0]) {
                  setSelectedInstituteId(enrolledInstitutes[0].institute_id);
                }
              }
            }}
            disabled={enrolledInstitutes.length === 0}
            className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
              evaluationSource === 'INSTITUTE'
                ? 'bg-indigo-50/70 border-indigo-500 shadow-xs ring-1 ring-indigo-500/20'
                : enrolledInstitutes.length === 0
                ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                Institute Evaluation
              </span>
              {evaluationSource === 'INSTITUTE' && (
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Checked against your enrolled coaching academy's custom test papers & approved marking schemes.
            </p>
            <div className="mt-2 text-[10px] font-bold text-indigo-700 bg-indigo-100/60 rounded px-2 py-0.5 inline-block">
              {enrolledInstitutes.length > 0
                ? `100% Institute Sponsored (${enrolledInstitutes.length} ${
                    enrolledInstitutes.length === 1 ? 'Academy' : 'Academies'
                  })`
                : 'Not Enrolled in any Academy'}
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Paper & Subject Configuration */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              {evaluationSource === 'INSTITUTE' ? '1. Institute Paper Selection' : '1. Paper Specification'}
            </h3>

            {evaluationSource === 'INSTITUTE' ? (
              <div className="space-y-3.5">
                {/* Institute Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    Enrolled Coaching Academy
                  </label>
                  {enrolledInstitutes.length > 0 ? (
                    <select
                      value={selectedInstituteId}
                      onChange={(e) => setSelectedInstituteId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white font-medium"
                    >
                      {enrolledInstitutes.map((inst) => (
                        <option key={inst.institute_id} value={inst.institute_id}>
                          {inst.institute_name} {inst.batch_name ? `(${inst.batch_name})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      You are not currently enrolled in any coaching academy. Please join an institute using an invite code.
                    </div>
                  )}
                </div>

                {/* Test Paper / Material Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                    Institute Test Paper / Mock Series
                  </label>
                  {instituteMaterials.length > 0 ? (
                    <select
                      value={selectedInstituteMaterialId}
                      onChange={(e) => {
                        setSelectedInstituteMaterialId(e.target.value);
                        const sel = instituteMaterials.find((m) => m.id === e.target.value);
                        if (sel) {
                          if (sel.level) setLevel(sel.level as CALevel);
                          if (sel.subject_key) setSelectedSubjectKey(sel.subject_key);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white font-medium"
                    >
                      {instituteMaterials.map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.title} ({mat.level} • {mat.subject_name})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                      No test papers uploaded by this institute yet. Please contact your coordinator.
                    </div>
                  )}
                </div>

                {/* Selected Paper Details Preview */}
                {selectedInstituteMaterialId && (
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-[11px] space-y-1 text-slate-600">
                    <div className="font-bold text-indigo-900 flex items-center justify-between">
                      <span>Curriculum: CA {level}</span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded font-bold">
                        Sponsored
                      </span>
                    </div>
                    <p className="text-slate-500 font-medium">Subject: {currentSubject?.name || 'Selected Paper'}</p>
                    <p className="text-[10px] text-indigo-700">Evaluated using verified faculty marking scheme</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Level selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">CA Examination Level</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['FOUNDATION', 'INTERMEDIATE', 'FINAL'] as CALevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLevel(lvl)}
                        className={`py-1.5 px-1 text-xs font-bold rounded-lg border transition text-center ${
                          level === lvl
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {lvl === 'FOUNDATION' ? 'Foundation' : lvl === 'INTERMEDIATE' ? 'Inter' : 'Final'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Group selection (if Inter or Final) */}
                {level !== 'FOUNDATION' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Group</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'GROUP_1', label: 'Group 1' },
                        { id: 'GROUP_2', label: 'Group 2' },
                        { id: 'ALL', label: 'All Papers' },
                      ].map((grp) => (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => setSelectedGroup(grp.id as 'GROUP_1' | 'GROUP_2' | 'ALL')}
                          className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                            selectedGroup === grp.id
                              ? 'bg-blue-50 border-blue-600 text-blue-700'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {grp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subject Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Subject & Paper</label>
                  <select
                    value={selectedSubjectKey}
                    onChange={(e) => setSelectedSubjectKey(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  >
                    {filteredSubjects.map((subj) => (
                      <option key={subj.id} value={subj.id}>
                        Paper {subj.paperNumber}: {subj.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Paper Type & Attempt */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Paper Type</label>
                    <select
                      value={materialType}
                      onChange={(e) => setMaterialType(e.target.value as MaterialType)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                    >
                      <option value="MTP">ICAI MTP Series</option>
                      <option value="RTP">ICAI RTP Series</option>
                      <option value="PAST_EXAM">Past Exam Paper</option>
                      <option value="MODEL">Model Test Paper</option>
                      <option value="CUSTOM">Test Series Answer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Attempt</label>
                    <select
                      value={attempt}
                      onChange={(e) => setAttempt(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                    >
                      <option value="May 2026">May 2026</option>
                      <option value="Nov 2026">Nov 2026</option>
                      <option value="Jan 2027">Jan 2027</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Checking Mode */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Evaluator Strictness</span>
                <span className="text-[10px] text-blue-600 font-bold">ICAI Standard</span>
              </label>
              <select
                value={checkingMode}
                onChange={(e) => setCheckingMode(e.target.value as CheckingMode)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                <option value="standard">Standard ICAI Marking (Balanced & Realistic)</option>
                <option value="strict">Strict Head Examiner (Conservative on Working Notes)</option>
                <option value="lenient">Moderate Guidance (Emphasizes Partial Step Marks)</option>
              </select>
            </div>

            {/* Reference Material Status Badge */}
            <div className="pt-2 border-t border-slate-100">
              {checkingMaterial ? (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Verifying Reference Material...
                </p>
              ) : materialAvailable ? (
                <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="truncate">
                    {evaluationSource === 'INSTITUTE'
                      ? 'Institute Question Paper & Model Answers Loaded'
                      : 'ICAI Suggested Answers & Marking Scheme Loaded'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                  <Info className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    {evaluationSource === 'INSTITUTE'
                      ? 'Test material pending upload by academy.'
                      : 'Evaluation material is pending upload for this paper.'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ICAI Exam Rules Highlights */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs space-y-2 text-slate-600 shadow-sm">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-blue-600" />
              ICAI Rule Adherence
            </h4>
            <ul className="space-y-1.5 list-disc list-inside text-slate-500 text-[11px]">
              <li>Step-by-step marking awarded for correct intermediate calculations.</li>
              <li>
                <strong className="text-slate-800 font-bold">Zero Negative Marking</strong> for Intermediate & Final MCQs.
              </li>
              <li>Working Notes evaluated alongside Main Financial Statements.</li>
              <li>Alternative correct methods and interpretations accepted.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: File Upload Area & Submit */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                2. Upload Handwritten Answer Sheet
              </h3>
              <span className="text-xs text-slate-400 font-medium">PDF, JPG, PNG (Max 50MB)</span>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition flex flex-col items-center justify-center min-h-[260px] cursor-pointer ${
                dragOver
                  ? 'border-blue-500 bg-blue-50/50'
                  : file
                  ? 'border-emerald-500 bg-emerald-50/40'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/20'
              }`}
              onClick={() => document.getElementById('answer-sheet-file-input')?.click()}
            >
              <input
                id="answer-sheet-file-input"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processFile(e.target.files[0]);
                  }
                }}
              />

              {file ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 max-w-sm truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for ICAI step-evaluation
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setFileBase64('');
                    }}
                    className="text-xs text-rose-600 hover:underline inline-block mt-2 font-semibold"
                  >
                    Remove & choose another file
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Drag & drop your handwritten CA answer sheet here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">or click to browse from your computer or phone</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 text-[11px] text-slate-600 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Admit cards, certificates & blank documents are rejected automatically</span>
                  </div>
                </div>
              )}
            </div>

            {/* Material Unavailable Alert */}
            {!materialAvailable && !checkingMaterial && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-900">Evaluation Material Not Uploaded Yet</p>
                  <p className="mt-0.5 leading-relaxed">
                    Evaluation material is not available for the selected paper and attempt yet. Please try again once the required material has been uploaded.
                  </p>
                </div>
              </div>
            )}

            {/* Action CTA Button */}
            <div className="pt-2">
              <button
                id="start-evaluation-btn"
                onClick={handleStartEvaluation}
                disabled={evalStep !== 'IDLE' || !file || !materialAvailable || checkingMaterial}
                className={`w-full py-3.5 px-6 rounded-lg text-white font-bold text-sm sm:text-base transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                  evaluationSource === 'INSTITUTE'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {evalStep !== 'IDLE' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Evaluating Answer Sheet...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {evaluationSource === 'INSTITUTE'
                        ? 'Start Institute Evaluation (0 Credits)'
                        : 'Start ICAI Step Evaluation'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
