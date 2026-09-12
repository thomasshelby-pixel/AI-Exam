import React, { useState, useEffect } from 'react';
import {
  Scale,
  FileText,
  ShieldCheck,
  Plus,
  Edit3,
  CheckCircle2,
  Archive,
  Eye,
  RefreshCw,
  AlertCircle,
  Building,
  Save,
  Clock,
  History,
  Info,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { LegalDocument, LegalSettings, LegalDocType } from '../../types/index.js';

export const AdminLegalSection: React.FC = () => {
  const [versions, setVersions] = useState<LegalDocument[]>([]);
  const [settings, setSettings] = useState<LegalSettings>({
    legal_entity_name: '[LEGAL_ENTITY_NAME]',
    business_address: '[VERIFIED_BUSINESS_ADDRESS]',
    privacy_email: '[PRIVACY_OR_GRIEVANCE_EMAIL]',
    support_email: 'caexamchecker.support@gmail.com',
    instagram_url: 'https://insta.openinapp.co/utw2r',
    governing_law: 'Laws of India',
    dispute_jurisdiction: '[CONFIGURABLE_JURISDICTION]',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Draft / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    doc_type: 'TERMS' as LegalDocType,
    title: '',
    version: '',
    effective_date: '',
    last_updated_date: '',
    content: '',
    changelog: '',
  });

  // Load versions and settings
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await apiRequest<{
        success: boolean;
        versions: LegalDocument[];
        settings: LegalSettings;
      }>('/api/legal/admin/versions');

      if (res.success) {
        setVersions(res.versions || []);
        if (res.settings) {
          setSettings(res.settings);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load legal document versions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreateDraft = (defaultType: LegalDocType = 'TERMS') => {
    const defaultTitle =
      defaultType === 'TERMS'
        ? 'CA EXAM CHECKER AI — TERMS OF SERVICE'
        : defaultType === 'PRIVACY'
        ? 'CA EXAM CHECKER AI — PRIVACY POLICY'
        : 'CA EXAM CHECKER AI — REFUND & CANCELLATION POLICY';

    // Find current published version to prefill content
    const currentPublished = versions.find((v) => v.doc_type === defaultType && v.status === 'PUBLISHED');

    setFormData({
      doc_type: defaultType,
      title: defaultTitle,
      version: currentPublished ? `${parseFloat(currentPublished.version || '1.0') + 0.1}` : '1.1',
      effective_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      last_updated_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      content: currentPublished ? currentPublished.content : '',
      changelog: '',
    });
    setEditingId(null);
    setModalMode('CREATE');
    setPreviewMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEditDraft = (doc: LegalDocument) => {
    setFormData({
      doc_type: doc.doc_type,
      title: doc.title,
      version: doc.version,
      effective_date: doc.effective_date,
      last_updated_date: doc.last_updated_date,
      content: doc.content,
      changelog: doc.changelog || '',
    });
    setEditingId(doc.id);
    setModalMode('EDIT');
    setPreviewMode(false);
    setIsModalOpen(true);
  };

  const handleSaveDraft = async () => {
    try {
      if (!formData.title.trim() || !formData.version.trim() || !formData.content.trim()) {
        setErrorMsg('Title, version, and content are required.');
        return;
      }

      setErrorMsg('');
      if (modalMode === 'CREATE') {
        await apiRequest('/api/legal/admin/draft', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        setSuccessMsg(`Draft for ${formData.doc_type} (v${formData.version}) created successfully.`);
      } else if (editingId) {
        await apiRequest(`/api/legal/admin/draft/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        setSuccessMsg(`Draft for ${formData.doc_type} updated successfully.`);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save draft');
    }
  };

  const handlePublish = async (id: string, docType: string, version: string) => {
    const confirmPublish = window.confirm(
      `Are you sure you want to PUBLISH version ${version} of ${docType}?\n\nThis will automatically archive the currently published version and take immediate legal effect across the platform.`
    );
    if (!confirmPublish) return;

    try {
      setErrorMsg('');
      await apiRequest(`/api/legal/admin/publish/${id}`, { method: 'POST' });
      setSuccessMsg(`Successfully published ${docType} v${version}. Previous version archived.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to publish document');
    }
  };

  const handleArchive = async (id: string) => {
    const confirmArchive = window.confirm('Are you sure you want to archive this version?');
    if (!confirmArchive) return;

    try {
      setErrorMsg('');
      await apiRequest(`/api/legal/admin/archive/${id}`, { method: 'POST' });
      setSuccessMsg('Version archived successfully.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to archive document');
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      setErrorMsg('');
      await apiRequest('/api/legal/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSuccessMsg('Legal entity & business contact settings updated and synced.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const publishedTerms = versions.find((v) => v.doc_type === 'TERMS' && v.status === 'PUBLISHED');
  const publishedPrivacy = versions.find((v) => v.doc_type === 'PRIVACY' && v.status === 'PUBLISHED');
  const publishedRefund = versions.find((v) => v.doc_type === 'REFUND' && v.status === 'PUBLISHED');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <span>Legal Documents & Regulatory Compliance</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Terms of Service, Privacy Policy, and Refund & Cancellation Policy versions with zero code redeploys.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => handleOpenCreateDraft('TERMS')}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Draft</span>
          </button>
        </div>
      </div>

      {/* Internal Legal Review Warning Note */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5 text-xs">
        <div className="flex items-center gap-2 font-bold text-amber-800">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Internal Legal Counsel Verification Notice</span>
        </div>
        <p className="leading-relaxed">
          <strong>Internal Note:</strong> The published legal documents must be reviewed and verified by qualified legal counsel before official launch to ensure alignment with your operating entity, applicable Indian laws, and payment gateway mandates.
        </p>
        <p className="text-[11px] text-amber-700 italic">
          Constraint: Do NOT invent legal entity details, registered address, GSTIN, company registration details, lawyer details, or government registration numbers. Where a legally required business detail is not currently configured, use a clearly marked admin-configurable placeholder and do not fabricate it.
        </p>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="font-bold text-rose-900 hover:underline">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="font-bold text-emerald-900 hover:underline">Dismiss</button>
        </div>
      )}

      {/* 1. Current Active Published Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            type: 'TERMS' as LegalDocType,
            title: 'Terms of Service',
            path: '/terms',
            icon: FileText,
            doc: publishedTerms,
          },
          {
            type: 'PRIVACY' as LegalDocType,
            title: 'Privacy Policy',
            path: '/privacy-policy',
            icon: ShieldCheck,
            doc: publishedPrivacy,
          },
          {
            type: 'REFUND' as LegalDocType,
            title: 'Refund & Cancellation',
            path: '/refund-policy',
            icon: Scale,
            doc: publishedRefund,
          },
        ].map((item) => {
          const Icon = item.icon;
          const d = item.doc;
          return (
            <div key={item.type} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Live Active
                  </span>
                </div>

                {d ? (
                  <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                    <p>
                      Version: <strong className="text-slate-900 font-mono">v{d.version}</strong>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Effective: {d.effective_date}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Published: {d.published_at ? new Date(d.published_at).toLocaleDateString() : 'Baseline'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 italic mb-4">No published version found. Baseline default active.</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <a
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Public View</span>
                </a>
                <button
                  onClick={() => handleOpenCreateDraft(item.type)}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Version Draft</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Configurable Legal Entity & Business Placeholders */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <span>Legal Entity & Regulatory Business Settings</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              These details populate the public legal contact cards. Placeholders remain active until verified details are entered.
            </p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Legal Entity Name</label>
            <input
              type="text"
              value={settings.legal_entity_name}
              onChange={(e) => setSettings({ ...settings, legal_entity_name: e.target.value })}
              placeholder="[LEGAL_ENTITY_NAME]"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            />
            <span className="text-[10px] text-slate-400">Leave as placeholder if awaiting registration.</span>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Business / Registered Address</label>
            <input
              type="text"
              value={settings.business_address}
              onChange={(e) => setSettings({ ...settings, business_address: e.target.value })}
              placeholder="[VERIFIED_BUSINESS_ADDRESS]"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            />
            <span className="text-[10px] text-slate-400">Official registered or operating address.</span>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Privacy / Grievance Officer Email</label>
            <input
              type="text"
              value={settings.privacy_email}
              onChange={(e) => setSettings({ ...settings, privacy_email: e.target.value })}
              placeholder="[PRIVACY_OR_GRIEVANCE_EMAIL]"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            />
            <span className="text-[10px] text-slate-400">Grievance contact under Indian IT Act / DPDP.</span>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Student Support Email</label>
            <input
              type="text"
              value={settings.support_email}
              onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Official Instagram Link</label>
            <input
              type="text"
              value={settings.instagram_url}
              onChange={(e) => setSettings({ ...settings, instagram_url: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Dispute Jurisdiction</label>
            <input
              type="text"
              value={settings.dispute_jurisdiction}
              onChange={(e) => setSettings({ ...settings, dispute_jurisdiction: e.target.value })}
              placeholder="[CONFIGURABLE_JURISDICTION]"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
            />
          </div>
        </div>
      </div>

      {/* 3. Document Version History & Audit Trail */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Document Version History & Drafts ({versions.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">Immutable audit log maintained for every publication</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
              <tr>
                <th className="px-4 py-3">Document Type</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Effective Date</th>
                <th className="px-4 py-3">Published By / Timestamp</th>
                <th className="px-4 py-3">Changelog</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {versions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    No legal document versions found.
                  </td>
                </tr>
              ) : (
                versions.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {v.doc_type === 'TERMS' ? 'Terms of Service' : v.doc_type === 'PRIVACY' ? 'Privacy Policy' : 'Refund & Cancellation'}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">v{v.version}</td>
                    <td className="px-4 py-3">
                      {v.status === 'PUBLISHED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Live Active
                        </span>
                      ) : v.status === 'DRAFT' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" /> Draft
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          <Archive className="w-3 h-3" /> Archived
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{v.effective_date}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {v.published_at ? (
                        <div>
                          <p className="font-medium text-slate-700">{new Date(v.published_at).toLocaleDateString()}</p>
                          <p className="text-[10px] text-slate-400">{v.published_by || 'system'}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not published</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={v.changelog || 'Baseline'}>
                      {v.changelog || 'Baseline version'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {v.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => handleOpenEditDraft(v)}
                            className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handlePublish(v.id, v.doc_type, v.version)}
                            className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-semibold transition cursor-pointer"
                          >
                            Publish
                          </button>
                        </>
                      )}

                      {v.status === 'PUBLISHED' && (
                        <button
                          onClick={() => handleOpenCreateDraft(v.doc_type)}
                          className="px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px] font-semibold transition cursor-pointer"
                        >
                          Clone to Draft
                        </button>
                      )}

                      {v.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => handleArchive(v.id)}
                          className="px-2 py-1 rounded bg-slate-50 text-slate-500 hover:bg-slate-100 text-[11px] transition cursor-pointer"
                        >
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Create / Edit Draft Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {modalMode === 'CREATE' ? 'Create New Legal Document Draft' : `Edit Draft: ${formData.title}`}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode(!previewMode)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    previewMode ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {previewMode ? 'Edit Mode' : 'Preview Rendered'}
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {previewMode ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 whitespace-pre-wrap font-sans leading-relaxed text-slate-800">
                  <h2 className="text-base font-bold text-slate-900 mb-2">{formData.title}</h2>
                  <p className="text-[11px] text-slate-500 mb-4">
                    Effective Date: {formData.effective_date} | Version: {formData.version}
                  </p>
                  <div>{formData.content}</div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Document Type</label>
                      <select
                        value={formData.doc_type}
                        disabled={modalMode === 'EDIT'}
                        onChange={(e) => setFormData({ ...formData, doc_type: e.target.value as LegalDocType })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-medium text-xs focus:outline-none focus:border-blue-600"
                      >
                        <option value="TERMS">Terms of Service</option>
                        <option value="PRIVACY">Privacy Policy</option>
                        <option value="REFUND">Refund & Cancellation Policy</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Version Identifier</label>
                      <input
                        type="text"
                        value={formData.version}
                        onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                        placeholder="e.g. 1.1"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Effective Date</label>
                      <input
                        type="text"
                        value={formData.effective_date}
                        onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Document Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Document Content (Plain text / Structured sections)
                    </label>
                    <textarea
                      rows={14}
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      className="w-full p-3 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs text-slate-800 leading-relaxed focus:outline-none focus:border-blue-600 focus:bg-white"
                      placeholder="Paste legal document text..."
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Changelog Summary (Optional)</label>
                    <input
                      type="text"
                      value={formData.changelog}
                      onChange={(e) => setFormData({ ...formData, changelog: e.target.value })}
                      placeholder="e.g., Clarified 3-month credit validity clause as per policy"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Save Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
