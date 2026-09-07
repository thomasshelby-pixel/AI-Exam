import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  ShieldCheck,
  Users,
  Building2,
  FileCheck2,
  DollarSign,
  Search,
  Plus,
  Trash2,
  Lock,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  BookOpen,
  Activity,
} from 'lucide-react';

interface AdminMetrics {
  totalUsers: number;
  totalStudents: number;
  totalInstitutes: number;
  totalEvaluations: number;
  totalTransactions: number;
  totalRevenuePaise: number;
  averageScore: number;
  passRate: number;
  activeMaterialsCount: number;
}

interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  has_permanent_free_access: number;
  created_at: string;
  last_login_at?: string;
  icai_registration_number?: string;
  ca_level?: string;
  institute_name?: string;
  purchased_credits?: number;
}

interface MaterialItem {
  id: string;
  level: string;
  material_type: string;
  subject_key: string;
  subject_name: string;
  attempt: string;
  question_paper_title: string;
  created_at: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  user_id?: string;
  ip_address?: string;
  created_at: string;
  details?: string;
}

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'materials' | 'institutes' | 'audit'>('overview');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filter
  const [userSearch, setUserSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Modals & form state
  const [showAddMaterialModal, setShowAddMaterialModal] = useState<boolean>(false);
  const [newMatLevel, setNewMatLevel] = useState<string>('INTERMEDIATE');
  const [newMatType, setNewMatType] = useState<string>('MTP');
  const [newMatSubKey, setNewMatSubKey] = useState<string>('inter_advanced_accounting');
  const [newMatSubName, setNewMatSubName] = useState<string>('Advanced Accounting');
  const [newMatAttempt, setNewMatAttempt] = useState<string>('May 2026');
  const [newMatTitle, setNewMatTitle] = useState<string>('');
  const [newMatPaper, setNewMatPaper] = useState<string>('');
  const [newMatSuggested, setNewMatSuggested] = useState<string>('');
  const [newMatScheme, setNewMatScheme] = useState<string>('');

  const [feedbackSuccess, setFeedbackSuccess] = useState<string>('');
  const [feedbackError, setFeedbackError] = useState<string>('');

  const loadData = async () => {
    try {
      setIsLoading(true);
      const mRes = await apiRequest<{ metrics: AdminMetrics }>('/api/admin/metrics');
      setMetrics(mRes.metrics);

      const uRes = await apiRequest<{ users: UserItem[] }>('/api/admin/users');
      setUsers(uRes.users || []);

      const matRes = await apiRequest<{ materials: MaterialItem[] }>('/api/admin/materials');
      setMaterials(matRes.materials || []);

      const logRes = await apiRequest<{ logs: AuditLogItem[] }>('/api/admin/audit-logs');
      setAuditLogs(logRes.logs || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleFreeAccess = async (userId: string, currentStatus: number) => {
    try {
      setFeedbackSuccess('');
      setFeedbackError('');
      await apiRequest(`/api/admin/users/${userId}/permanent-access`, {
        method: 'POST',
        body: JSON.stringify({ enable: currentStatus === 0 }),
      });
      setFeedbackSuccess('User permanent access entitlement updated.');
      await loadData();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSuccess('');
    setFeedbackError('');

    try {
      await apiRequest('/api/admin/materials', {
        method: 'POST',
        body: JSON.stringify({
          level: newMatLevel,
          materialType: newMatType,
          subjectKey: newMatSubKey,
          subjectName: newMatSubName,
          attempt: newMatAttempt,
          questionPaperTitle: newMatTitle,
          questionPaperContent: newMatPaper,
          suggestedAnswersContent: newMatSuggested,
          stepMarkingScheme: newMatScheme,
        }),
      });
      setShowAddMaterialModal(false);
      setNewMatTitle('');
      setNewMatPaper('');
      setNewMatSuggested('');
      setFeedbackSuccess('New ICAI Question Paper & Marking Scheme successfully ingested.');
      await loadData();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to add material');
    }
  };

  const handleDeleteMaterial = async (id: string, title: string) => {
    if (!confirm(`Delete material "${title}"?`)) return;
    try {
      await apiRequest(`/api/admin/materials/${id}`, { method: 'DELETE' });
      setFeedbackSuccess('Material deleted.');
      await loadData();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to delete material');
    }
  };

  if (isLoading && !metrics) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800 space-y-6">
      {/* Admin Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-mono px-2 py-0.2 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  ROOT ADMIN ACCESS
                </span>
                <span className="text-xs text-slate-500">Multi-tenant ICAI Platform</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">System Administration & Audit Console</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Metrics</span>
            </button>
          </div>
        </div>

        {/* Feedback banners */}
        {feedbackSuccess && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{feedbackSuccess}</span>
          </div>
        )}
        {feedbackError && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{feedbackError}</span>
          </div>
        )}
      </div>

      {/* Admin Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs sm:text-sm font-semibold">
        {[
          { id: 'overview', label: 'Platform Metrics' },
          { id: 'users', label: `Users & Roles (${users.length})` },
          { id: 'materials', label: `ICAI Question Materials (${materials.length})` },
          { id: 'audit', label: `Security Audit Logs (${auditLogs.length})` },
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

      {/* Tab 1: Platform Metrics */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Total Registered Users</span>
              <p className="text-2xl font-black text-slate-900">{metrics?.totalUsers || 0}</p>
              <p className="text-[11px] text-slate-500">
                {metrics?.totalStudents} students • {metrics?.totalInstitutes} institutes
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Answer Sheets Evaluated</span>
              <p className="text-2xl font-black text-slate-900">{metrics?.totalEvaluations || 0}</p>
              <p className="text-[11px] text-emerald-600 font-semibold">Pass rate: {metrics?.passRate || 0}%</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Gross Razorpay Volume</span>
              <p className="text-2xl font-black text-blue-600 font-mono">
                ₹{((metrics?.totalRevenuePaise || 0) / 100).toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-slate-500">{metrics?.totalTransactions || 0} successful orders</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Curriculum Materials Loaded</span>
              <p className="text-2xl font-black text-slate-900">{metrics?.activeMaterialsCount || 0}</p>
              <p className="text-[11px] text-slate-500">Suggested answers & marking keys</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Users Management */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search user name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              >
                <option value="ALL">All Roles</option>
                <option value="STUDENT">Students</option>
                <option value="INSTITUTE">Institutes</option>
                <option value="ADMIN">Admins</option>
                <option value="SUPER_ADMIN">Super Admins</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Credits</th>
                  <th className="py-2.5 px-3">Permanent Free</th>
                  <th className="py-2.5 px-3">Registered</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-900">{u.full_name}</p>
                      <p className="text-[10px] text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-700 font-bold border border-slate-200">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                        {u.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{u.purchased_credits || 0}</td>
                    <td className="py-2.5 px-3">
                      {u.has_permanent_free_access ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                          ENABLED
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Standard</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleToggleFreeAccess(u.id, u.has_permanent_free_access)}
                        className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer"
                      >
                        {u.has_permanent_free_access ? 'Revoke Free' : 'Grant Permanent Free'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: ICAI Materials Management */}
      {activeTab === 'materials' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Official ICAI Evaluation Reference Material</h3>
              <p className="text-xs text-slate-500">
                Model answer keys, suggested answers, and marking rubrics used by the AI evaluator
              </p>
            </div>
            <button
              onClick={() => setShowAddMaterialModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ingest New Material</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {materials.map((mat) => (
              <div key={mat.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      CA {mat.level}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                      {mat.material_type}
                    </span>
                    <span className="text-xs text-slate-500">{mat.attempt}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">{mat.question_paper_title}</h4>
                  <p className="text-xs text-slate-500">{mat.subject_name}</p>
                </div>
                <button
                  onClick={() => handleDeleteMaterial(mat.id, mat.question_paper_title)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Security Audit Logs */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span>Platform Security & Audit Trail</span>
          </h3>

          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-blue-700 mr-3">{log.action}</span>
                  <span className="text-slate-700">{log.details || 'System event'}</span>
                </div>
                <div className="text-right text-slate-500 font-mono text-[10px]">
                  {new Date(log.created_at).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add Material */}
      {showAddMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 space-y-4 text-slate-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Ingest ICAI Material & Marking Scheme</h3>

            <form onSubmit={handleAddMaterial} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Level</label>
                  <select
                    value={newMatLevel}
                    onChange={(e) => setNewMatLevel(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  >
                    <option value="FOUNDATION">CA Foundation</option>
                    <option value="INTERMEDIATE">CA Intermediate</option>
                    <option value="FINAL">CA Final</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Material Type</label>
                  <select
                    value={newMatType}
                    onChange={(e) => setNewMatType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  >
                    <option value="MTP">MTP</option>
                    <option value="RTP">RTP</option>
                    <option value="PAST_EXAM">Past Exam</option>
                    <option value="MODEL">Model Paper</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  value={newMatSubName}
                  onChange={(e) => setNewMatSubName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Paper Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ICAI Intermediate May 2026 MTP Series 1 - Advanced Accounting"
                  value={newMatTitle}
                  onChange={(e) => setNewMatTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Suggested Answers Content</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Paste official suggested answers or guidelines..."
                  value={newMatSuggested}
                  onChange={(e) => setNewMatSuggested(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMaterialModal(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Ingest Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
