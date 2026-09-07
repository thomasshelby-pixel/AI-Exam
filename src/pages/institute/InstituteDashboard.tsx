import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Building2,
  Users,
  Layers,
  FileText,
  Award,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  RefreshCw,
  Edit3,
} from 'lucide-react';

interface InstituteData {
  institute: {
    id: string;
    name: string;
    code: string;
    email: string;
    phone: string;
    address?: string;
    website?: string;
    contact_person: string;
    status: string;
    subscription_plan: string;
    subscription_expires_at?: string;
    max_students: number;
  };
  metrics: {
    totalStudents: number;
    activeStudents: number;
    totalEvaluations: number;
    averageScore: number;
    maxStudentsAllowed: number;
    subscriptionStatus: string;
  };
  batches: Array<{
    id: string;
    name: string;
    course_level: string;
    description?: string;
    student_count: number;
  }>;
  topPerformers: Array<{
    id: string;
    full_name: string;
    email: string;
    avg_score: number;
    evals_count: number;
  }>;
  subjectStats: Array<{
    subject_name: string;
    avg_score: number;
    count: number;
  }>;
}

interface StudentItem {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  icai_registration_number: string;
  ca_level: string;
  membership_status: string;
  joined_at: string;
  batch_name?: string;
  evaluations_count: number;
  average_score?: number;
}

interface AssignmentItem {
  id: string;
  title: string;
  subject_name: string;
  maximum_marks: number;
  deadline: string;
  batch_name?: string;
  submissions_count: number;
}

export const InstituteDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'batches' | 'assignments' | 'profile'>('overview');
  const [data, setData] = useState<InstituteData | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Student search & filter
  const [studentSearch, setStudentSearch] = useState<string>('');

  // Modals
  const [showAddStudentModal, setShowAddStudentModal] = useState<boolean>(false);
  const [newStudentEmail, setNewStudentEmail] = useState<string>('');
  const [newStudentBatchId, setNewStudentBatchId] = useState<string>('');

  const [showCreateBatchModal, setShowCreateBatchModal] = useState<boolean>(false);
  const [newBatchName, setNewBatchName] = useState<string>('');
  const [newBatchLevel, setNewBatchLevel] = useState<string>('INTERMEDIATE');
  const [newBatchDesc, setNewBatchDesc] = useState<string>('');

  const [showCreateAssignmentModal, setShowCreateAssignmentModal] = useState<boolean>(false);
  const [assignTitle, setAssignTitle] = useState<string>('');
  const [assignSubjectKey, setAssignSubjectKey] = useState<string>('inter_advanced_accounting');
  const [assignSubjectName, setAssignSubjectName] = useState<string>('Advanced Accounting');
  const [assignMaxMarks, setAssignMaxMarks] = useState<number>(100);
  const [assignDeadline, setAssignDeadline] = useState<string>('');
  const [assignBatchId, setAssignBatchId] = useState<string>('');

  const [actionError, setActionError] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string>('');

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest<InstituteData>('/api/institute/dashboard');
      setData(res);

      const stuRes = await apiRequest<{ students: StudentItem[] }>('/api/institute/students');
      setStudents(stuRes.students || []);

      const assignRes = await apiRequest<{ assignments: AssignmentItem[] }>('/api/institute/assignments');
      setAssignments(assignRes.assignments || []);
    } catch (err) {
      console.error('Failed to load institute data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    try {
      await apiRequest('/api/institute/students', {
        method: 'POST',
        body: JSON.stringify({
          email: newStudentEmail,
          batchId: newStudentBatchId || undefined,
        }),
      });

      setActionSuccess(`Student ${newStudentEmail} enrolled under institute sponsorship.`);
      setNewStudentEmail('');
      setShowAddStudentModal(false);
      await loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to enroll student';
      setActionError(msg);
    }
  };

  const handleRemoveStudent = async (studentId: string, name: string) => {
    if (!confirm(`Are you sure you want to end sponsorship for ${name}? Their past evaluations will be safely preserved.`)) {
      return;
    }

    try {
      await apiRequest(`/api/institute/students/${studentId}`, {
        method: 'DELETE',
      });
      setActionSuccess(`Student sponsorship removed. Historical evaluations intact.`);
      await loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove student';
      setActionError(msg);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    try {
      await apiRequest('/api/institute/batches', {
        method: 'POST',
        body: JSON.stringify({
          name: newBatchName,
          courseLevel: newBatchLevel,
          description: newBatchDesc,
        }),
      });
      setShowCreateBatchModal(false);
      setNewBatchName('');
      setNewBatchDesc('');
      setActionSuccess('Batch created successfully.');
      await loadDashboard();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create batch');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    try {
      await apiRequest('/api/institute/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: assignTitle,
          subjectKey: assignSubjectKey,
          subjectName: assignSubjectName,
          maximumMarks: assignMaxMarks,
          deadline: assignDeadline,
          batchId: assignBatchId || undefined,
        }),
      });
      setShowCreateAssignmentModal(false);
      setAssignTitle('');
      setActionSuccess('Assignment created successfully.');
      await loadDashboard();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create assignment');
    }
  };

  if (isLoading && !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const inst = data?.institute;
  const metrics = data?.metrics || {
    totalStudents: 0,
    activeStudents: 0,
    totalEvaluations: 0,
    averageScore: 0,
    maxStudentsAllowed: 500,
    subscriptionStatus: 'ACTIVE',
  };

  const filteredStudents = students.filter((s) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.icai_registration_number.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800 space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-mono px-2 py-0.2 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  {inst?.code || 'INSTITUTE'}
                </span>
                <span className="text-[11px] px-2 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  {inst?.status || 'ACTIVE'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">{inst?.name || 'Coaching Institute'}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Head Coordinator: {inst?.contact_person} • {inst?.email}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs text-slate-500">Institutional Quota</p>
            <p className="text-lg font-bold font-mono text-slate-900">
              {metrics.activeStudents} / {metrics.maxStudentsAllowed} Students
            </p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Sponsorship Active</p>
          </div>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Institute Portal Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs sm:text-sm font-semibold">
        {[
          { id: 'overview', label: 'Dashboard & Analytics' },
          { id: 'students', label: `Enrolled Students (${students.length})` },
          { id: 'batches', label: `Batches (${data?.batches.length || 0})` },
          { id: 'assignments', label: `Mock Test Series (${assignments.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-2.5 transition relative cursor-pointer ${
              activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview & Analytics */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Total Enrolled Students</span>
              <p className="text-2xl font-black text-slate-900">{metrics.totalStudents}</p>
              <p className="text-[11px] text-slate-500">{metrics.activeStudents} active this session</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Total Answer Sheets Checked</span>
              <p className="text-2xl font-black text-slate-900">{metrics.totalEvaluations}</p>
              <p className="text-[11px] text-slate-500">Full paper ICAI step marking</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Academy Average Score</span>
              <p className="text-2xl font-black text-blue-600 font-mono">{metrics.averageScore}%</p>
              <p className="text-[11px] text-slate-500">Across all mock submissions</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Active Batches</span>
              <p className="text-2xl font-black text-slate-900">{data?.batches.length || 0}</p>
              <p className="text-[11px] text-slate-500">Foundation, Inter & Final</p>
            </div>
          </div>

          {/* Top Performers and Subject Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-blue-600" />
                Top Performing Students
              </h3>
              {data?.topPerformers && data.topPerformers.length > 0 ? (
                <div className="space-y-2">
                  {data.topPerformers.map((st) => (
                    <div key={st.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">{st.full_name}</p>
                        <p className="text-[10px] text-slate-500">{st.email}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-blue-600">{Math.round(st.avg_score * 10) / 10}%</span>
                        <p className="text-[10px] text-slate-500">{st.evals_count} papers</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No evaluated student papers yet.</p>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Subject-Wise Academy Performance
              </h3>
              {data?.subjectStats && data.subjectStats.length > 0 ? (
                <div className="space-y-2">
                  {data.subjectStats.map((sub, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <span className="font-semibold text-slate-900 truncate max-w-xs">{sub.subject_name}</span>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-blue-600">{Math.round(sub.avg_score * 10) / 10}%</span>
                        <span className="text-[10px] text-slate-500 ml-2">({sub.count} tests)</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Subject performance will appear once students complete papers.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Enrolled Students */}
      {activeTab === 'students' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search students by name, email, reg no..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <button
              onClick={() => setShowAddStudentModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Enroll Student</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">ICAI Reg. No</th>
                  <th className="py-2.5 px-3">Level</th>
                  <th className="py-2.5 px-3">Batch</th>
                  <th className="py-2.5 px-3">Evaluations</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{st.full_name}</td>
                    <td className="py-2.5 px-3 text-slate-500">{st.email}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{st.icai_registration_number}</td>
                    <td className="py-2.5 px-3">CA {st.ca_level}</td>
                    <td className="py-2.5 px-3 text-slate-600">{st.batch_name || 'Unassigned'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{st.evaluations_count} completed</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleRemoveStudent(st.id, st.full_name)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition cursor-pointer"
                        title="End sponsorship"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Batches */}
      {activeTab === 'batches' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Institute Batches</h3>
              <p className="text-xs text-slate-500">Organize students into classroom groups and target examination sessions</p>
            </div>
            <button
              onClick={() => setShowCreateBatchModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Batch</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data?.batches.map((batch) => (
              <div key={batch.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    CA {batch.course_level}
                  </span>
                  <span className="text-xs font-mono text-slate-500">{batch.student_count} Students</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900">{batch.name}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{batch.description || 'No batch description provided.'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Assignments / Mock Tests */}
      {activeTab === 'assignments' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Mock Test Series & Assignments</h3>
              <p className="text-xs text-slate-500">Post test deadlines for your students and evaluate submissions</p>
            </div>
            <button
              onClick={() => setShowCreateAssignmentModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Mock Test</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {assignments.map((asgn) => (
              <div key={asgn.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{asgn.title}</h4>
                  <p className="text-xs text-slate-500">
                    {asgn.subject_name} • Max Marks: {asgn.maximum_marks} • Batch: {asgn.batch_name || 'All Batches'}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <span className="font-mono text-blue-600 font-semibold">{asgn.submissions_count} Submissions</span>
                  <p className="text-[11px] text-slate-500">
                    Deadline: {new Date(asgn.deadline).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Enroll Student */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3.5 text-slate-800 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Enroll Student Under Sponsorship</h3>
            <p className="text-xs text-slate-500">
              Enter the student&apos;s registered email address to grant institutional sponsorship.
            </p>

            <form onSubmit={handleEnrollStudent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Student Email</label>
                <input
                  type="email"
                  required
                  placeholder="student@example.com"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to Batch (Optional)</label>
                <select
                  value={newStudentBatchId}
                  onChange={(e) => setNewStudentBatchId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                >
                  <option value="">No Batch Assigned</option>
                  {data?.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (CA {b.course_level})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Enroll Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Batch */}
      {showCreateBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3.5 text-slate-800 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Create New Batch</h3>

            <form onSubmit={handleCreateBatch} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CA Inter Nov 2026 Regular"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Level</label>
                <select
                  value={newBatchLevel}
                  onChange={(e) => setNewBatchLevel(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                >
                  <option value="FOUNDATION">CA Foundation</option>
                  <option value="INTERMEDIATE">CA Intermediate</option>
                  <option value="FINAL">CA Final</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={newBatchDesc}
                  onChange={(e) => setNewBatchDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateBatchModal(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Create Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Assignment */}
      {showCreateAssignmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3.5 text-slate-800 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Create New Mock Test Assignment</h3>

            <form onSubmit={handleCreateAssignment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Advanced Accounting MTP Mock Test 1"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    required
                    value={assignSubjectName}
                    onChange={(e) => setAssignSubjectName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Marks</label>
                  <input
                    type="number"
                    required
                    value={assignMaxMarks}
                    onChange={(e) => setAssignMaxMarks(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Submission Deadline</label>
                <input
                  type="date"
                  required
                  value={assignDeadline}
                  onChange={(e) => setAssignDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateAssignmentModal(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Publish Test
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
