import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Building2,
  BookOpen,
  FileCheck2,
  Calendar,
  Layers,
  ArrowRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  X,
  FileText
} from 'lucide-react';

interface EnrolledInstitute {
  membership_id: string;
  institute_id: string;
  institute_name: string;
  institute_code: string;
  institute_logo?: string | null;
  institute_email?: string | null;
  institute_status: string;
  batch_id: string | null;
  batch_name: string | null;
  batch_level: string | null;
  batch_target_attempt: string | null;
  membership_status: string;
  sponsored_access: number | boolean;
  joined_at: string;
  materials_count: number;
  tests_count: number;
  recentMaterials?: Array<{
    id: string;
    title: string;
    level: string;
    subject_name: string;
    paper?: string;
    material_type: string;
    created_at: string;
  }>;
  recentTests?: Array<{
    id: string;
    title: string;
    subject_name: string;
    maximum_marks: number;
    deadline?: string;
  }>;
}

interface StudentEnrollmentsPageProps {
  onNavigateUpload: (instituteId?: string, materialId?: string) => void;
  onNavigateDashboard: () => void;
}

export const StudentEnrollmentsPage: React.FC<StudentEnrollmentsPageProps> = ({
  onNavigateUpload,
  onNavigateDashboard,
}) => {
  const [enrollments, setEnrollments] = useState<EnrolledInstitute[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Join Institute Modal
  const [isJoinModalOpen, setIsJoinModalOpen] = useState<boolean>(false);
  const [instituteCodeInput, setInstituteCodeInput] = useState<string>('');
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [joinModalError, setJoinModalError] = useState<string>('');
  const [joinModalSuccess, setJoinModalSuccess] = useState<string>('');

  // Material inspection drawer/modal
  const [selectedInstituteForMaterials, setSelectedInstituteForMaterials] = useState<EnrolledInstitute | null>(null);

  const fetchEnrollments = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const res = await apiRequest<{
        success: boolean;
        enrollments: EnrolledInstitute[];
      }>('/api/student/enrollments');

      setEnrollments(res.enrollments || []);
    } catch (err: any) {
      console.error('Failed to load student enrollments:', err);
      setErrorMessage(err?.message || 'Failed to load institute enrollments. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, []);

  const handleJoinInstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instituteCodeInput.trim()) {
      setJoinModalError('Please enter an institute code.');
      return;
    }

    try {
      setIsJoining(true);
      setJoinModalError('');
      setJoinModalSuccess('');

      const res = await apiRequest<{
        success: boolean;
        message: string;
        institute: { id: string; name: string; code: string };
      }>('/api/student/join-institute', {
        method: 'POST',
        body: JSON.stringify({ instituteCode: instituteCodeInput.trim() }),
      });

      setJoinModalSuccess(res.message || 'Successfully enrolled in institute!');
      setInstituteCodeInput('');
      await fetchEnrollments();
      setTimeout(() => {
        setIsJoinModalOpen(false);
        setJoinModalSuccess('');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to join institute:', err);
      setJoinModalError(err?.message || 'Failed to join institute. Please check code and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <button
              onClick={onNavigateDashboard}
              className="hover:text-indigo-600 transition-colors"
            >
              Dashboard
            </button>
            <span>/</span>
            <span className="font-semibold text-slate-700">Institute Enrollments</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-600" />
            My Coaching Institute Enrollments
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage your affiliated coaching academies, assigned batches, institute test papers, and sponsored evaluations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setJoinModalError('');
              setJoinModalSuccess('');
              setInstituteCodeInput('');
              setIsJoinModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            Join with Institute Code
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={fetchEnrollments}
            className="text-xs font-bold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-3"></div>
          <p className="text-sm font-medium text-slate-500">Loading your enrolled institutes & batches...</p>
        </div>
      ) : enrollments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No Coaching Institutes Linked Yet</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Are you studying at a CA Coaching Institute, Academy, or Faculty Test Series?
            Link your institute enrollment using their unique code to unlock 100% sponsored AI evaluations,
            batch-specific test papers, and faculty model answers.
          </p>
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
          >
            <Plus className="w-4 h-4" />
            Enter Institute Enrollment Code
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {enrollments.map((enr) => (
              <div
                key={enr.membership_id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-indigo-200 transition-all"
              >
                {/* Institute Card Header */}
                <div className="p-6 sm:p-7 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 font-black text-lg">
                        {enr.institute_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-slate-900">{enr.institute_name}</h2>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-mono font-bold border border-slate-200">
                            {enr.institute_code}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Active Enrollment
                          </span>
                          {enr.sponsored_access && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200">
                              <Sparkles className="w-3 h-3 text-indigo-500" />
                              Sponsored Evaluations Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Enrolled on {formatDate(enr.joined_at)} • Official Institute Partner
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigateUpload(enr.institute_id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        Evaluate with Institute Materials
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card Body - Cohort & Batch Details */}
                <div className="p-6 sm:p-7 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Assigned Batch / Cohort
                      </span>
                      <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="truncate">{enr.batch_name || 'Unassigned Cohort'}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Curriculum Level & Target
                      </span>
                      <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span>
                          {enr.batch_level ? `CA ${enr.batch_level}` : 'General Level'}
                          {enr.batch_target_attempt ? ` • ${enr.batch_target_attempt}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Evaluation Privilege
                      </span>
                      <div className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>100% Institute Sponsored</span>
                      </div>
                    </div>
                  </div>

                  {/* Materials & Tests Accordion / Previews */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Institute Question Papers & Materials */}
                    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-indigo-600" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Published Question Papers ({enr.materials_count})
                          </h3>
                        </div>
                        {enr.materials_count > 0 && (
                          <button
                            onClick={() => setSelectedInstituteForMaterials(enr)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            View All <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {enr.recentMaterials && enr.recentMaterials.length > 0 ? (
                        <div className="space-y-2">
                          {enr.recentMaterials.slice(0, 3).map((mat) => (
                            <div
                              key={mat.id}
                              className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-indigo-300 transition-colors"
                            >
                              <div className="truncate pr-2">
                                <p className="font-semibold text-slate-800 truncate">{mat.title}</p>
                                <p className="text-[11px] text-slate-500">{mat.subject_name}</p>
                              </div>
                              <button
                                onClick={() => onNavigateUpload(enr.institute_id, mat.id)}
                                className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 text-[11px] flex-shrink-0"
                              >
                                Evaluate
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 py-3 text-center">
                          No question papers published yet for this institute.
                        </p>
                      )}
                    </div>

                    {/* Assigned Tests & Mock Series */}
                    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Assignments & Tests ({enr.tests_count})
                          </h3>
                        </div>
                      </div>

                      {enr.recentTests && enr.recentTests.length > 0 ? (
                        <div className="space-y-2">
                          {enr.recentTests.slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                            >
                              <div className="truncate pr-2">
                                <p className="font-semibold text-slate-800 truncate">{t.title}</p>
                                <p className="text-[11px] text-slate-500">
                                  {t.subject_name} • Max Marks: {t.maximum_marks}
                                </p>
                              </div>
                              <button
                                onClick={() => onNavigateUpload(enr.institute_id)}
                                className="px-2.5 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 text-[11px] flex-shrink-0"
                              >
                                Start
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 py-3 text-center">
                          No active mock tests or assignments scheduled.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Join Institute with Code */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                Join Coaching Institute
              </h3>
              <button
                onClick={() => setIsJoinModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJoinInstitute} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter the unique enrollment code issued by your coaching institute or instructor.
                This instantly links your account and activates institute-sponsored AI evaluations.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Institute Enrollment Code
                </label>
                <input
                  type="text"
                  value={instituteCodeInput}
                  onChange={(e) => setInstituteCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. APEX-CA-2026"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {joinModalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{joinModalError}</span>
                </div>
              )}

              {joinModalSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{joinModalSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoining || !instituteCodeInput.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isJoining ? 'Verifying...' : 'Link Institute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View All Materials for Institute */}
      {selectedInstituteForMaterials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedInstituteForMaterials.institute_name} Question Papers
                </h3>
                <p className="text-xs text-slate-500">Official model answers and verified ICAI marking schemes</p>
              </div>
              <button
                onClick={() => setSelectedInstituteForMaterials(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 space-y-3 flex-1">
              {selectedInstituteForMaterials.recentMaterials && selectedInstituteForMaterials.recentMaterials.length > 0 ? (
                selectedInstituteForMaterials.recentMaterials.map((mat) => (
                  <div
                    key={mat.id}
                    className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4 hover:border-indigo-300 transition-colors bg-white"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{mat.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {mat.subject_name} • {mat.level} {mat.paper ? `• Paper ${mat.paper}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const instId = selectedInstituteForMaterials.institute_id;
                        setSelectedInstituteForMaterials(null);
                        onNavigateUpload(instId, mat.id);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 flex-shrink-0"
                    >
                      Start Evaluation
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-8">
                  No materials published currently.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedInstituteForMaterials(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
