import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import { FileCheck2, Search, Filter, ArrowRight, RefreshCw, Layers, Globe, Building2, RotateCcw } from 'lucide-react';
import { RecheckRequestModal } from '../../components/student/RecheckRequestModal.js';
import { EvaluationResult } from '../../types/index.js';

interface EvaluationItem {
  id: string;
  level: string;
  material_type: string;
  subject_key: string;
  subject_name: string;
  attempt: string;
  total_marks: number;
  maximum_marks: number;
  percentage: number;
  grade: string;
  confidence_score: number;
  status: string;
  rejection_reason?: string;
  created_at: string;
  evaluation_source?: 'PUBLIC' | 'INSTITUTE';
  institute_id?: string;
  institute_name?: string;
  batch_name?: string;
}

interface MyEvaluationsProps {
  onViewReport: (id: string) => void;
  onNavigateUpload: () => void;
}

export const MyEvaluations: React.FC<MyEvaluationsProps> = ({ onViewReport, onNavigateUpload }) => {
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'PUBLIC' | 'INSTITUTE'>('ALL');
  const [recheckEvaluation, setRecheckEvaluation] = useState<EvaluationResult | null>(null);
  const [isRecheckModalOpen, setIsRecheckModalOpen] = useState<boolean>(false);
  const [loadingRecheckId, setLoadingRecheckId] = useState<string | null>(null);

  const fetchEvaluations = async () => {
    try {
      const res = await apiRequest<{ evaluations: EvaluationItem[] }>('/api/student/evaluations');
      setEvaluations(res.evaluations || []);
    } catch (err) {
      console.error('Failed to load evaluations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluations();
  }, []);

  const handleOpenRecheck = async (id: string) => {
    try {
      setLoadingRecheckId(id);
      const data = await apiRequest<{ evaluation?: { resultJson?: any; raw_result_json?: string } }>(
        `/api/student/evaluations/${id}`
      );
      const evalResult =
        data.evaluation?.resultJson ||
        (data.evaluation?.raw_result_json ? JSON.parse(data.evaluation.raw_result_json) : null);

      if (evalResult) {
        setRecheckEvaluation(evalResult);
        setIsRecheckModalOpen(true);
      } else {
        alert('Evaluation details could not be loaded for rechecking.');
      }
    } catch (err) {
      console.error('Failed to open recheck modal:', err);
      alert('Failed to load evaluation details for recheck request.');
    } finally {
      setLoadingRecheckId(null);
    }
  };

  const filtered = evaluations.filter((ev) => {
    if (levelFilter !== 'ALL' && ev.level !== levelFilter) return false;
    if (sourceFilter !== 'ALL') {
      const src = ev.evaluation_source || 'PUBLIC';
      if (src !== sourceFilter) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        ev.subject_name.toLowerCase().includes(q) ||
        ev.material_type.toLowerCase().includes(q) ||
        (ev.institute_name && ev.institute_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800 dark:text-slate-100 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>My Evaluated Answer Sheets</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Access past ICAI step marking evaluations, academy mock checks, deduction remarks, and verified certified copies.
          </p>
        </div>

        <button
          onClick={onNavigateUpload}
          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-2 w-fit cursor-pointer"
        >
          <span>Evaluate New Sheet</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by subject or institute..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Source Tabs */}
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSourceFilter('ALL')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                sourceFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              All Sources
            </button>
            <button
              onClick={() => setSourceFilter('PUBLIC')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition flex items-center gap-1 ${
                sourceFilter === 'PUBLIC'
                  ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Globe className="w-3 h-3" />
              Public AI
            </button>
            <button
              onClick={() => setSourceFilter('INSTITUTE')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition flex items-center gap-1 ${
                sourceFilter === 'INSTITUTE'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              Institute
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900"
            >
              <option value="ALL">All Levels</option>
              <option value="FOUNDATION">Foundation</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="FINAL">Final</option>
            </select>
          </div>
        </div>
      </div>

      {/* Evaluations Table / Cards */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-2" />
          <p className="text-xs">Loading evaluation archives...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Subject & Paper</th>
                  <th className="py-3 px-4">Evaluation Source</th>
                  <th className="py-3 px-4">Paper Type</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Percentage</th>
                  <th className="py-3 px-4">Grade</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((ev) => {
                  const isInstitute = ev.evaluation_source === 'INSTITUTE';
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{ev.subject_name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">CA {ev.level}</span>
                      </td>
                      <td className="py-3 px-4">
                        {isInstitute ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded w-fit">
                              <Building2 className="w-3 h-3" />
                              Institute
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5 truncate max-w-[150px]" title={ev.institute_name}>
                              {ev.institute_name || 'Academy'}
                            </span>
                            {ev.batch_name && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[150px]">
                                {ev.batch_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded w-fit">
                              <Globe className="w-3 h-3" />
                              Public AI
                            </span>
                            {ev.institute_name && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate max-w-[150px]" title={`Sponsored by ${ev.institute_name}`}>
                                Via {ev.institute_name}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          {ev.material_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                        {new Date(ev.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {ev.total_marks} / {ev.maximum_marks}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">{ev.percentage}%</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ev.percentage >= 60
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : ev.percentage >= 40
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {ev.grade || 'Evaluated'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {ev.status === 'COMPLETED' && (
                            <button
                              id={`recheck-btn-${ev.id}`}
                              onClick={() => handleOpenRecheck(ev.id)}
                              disabled={loadingRecheckId === ev.id}
                              className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold text-xs transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                              title="Submit Recheck Request to Senior Academic Faculty"
                            >
                              <RotateCcw className={`w-3 h-3 ${loadingRecheckId === ev.id ? 'animate-spin' : ''}`} />
                              <span>Recheck</span>
                            </button>
                          )}
                          <button
                            onClick={() => onViewReport(ev.id)}
                            className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold text-xs transition cursor-pointer"
                          >
                            Detailed Report
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-3 shadow-sm">
          <Layers className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No evaluation records found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {search ? 'No evaluations matched your search criteria.' : 'Upload your first answer sheet to get started.'}
          </p>
          <button
            onClick={onNavigateUpload}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition inline-block mt-2 shadow-sm"
          >
            Start First Check
          </button>
        </div>
      )}

      {/* Student Recheck Request Modal */}
      {recheckEvaluation && (
        <RecheckRequestModal
          isOpen={isRecheckModalOpen}
          onClose={() => {
            setIsRecheckModalOpen(false);
            setRecheckEvaluation(null);
          }}
          evaluationResult={recheckEvaluation}
          onRecheckSubmitted={() => {
            setIsRecheckModalOpen(false);
            setRecheckEvaluation(null);
            fetchEvaluations();
          }}
        />
      )}
    </div>
  );
};
