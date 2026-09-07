import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import { FileCheck2, Search, Filter, ArrowRight, RefreshCw, Layers } from 'lucide-react';

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

  useEffect(() => {
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
    fetchEvaluations();
  }, []);

  const filtered = evaluations.filter((ev) => {
    if (levelFilter !== 'ALL' && ev.level !== levelFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return ev.subject_name.toLowerCase().includes(q) || ev.material_type.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-blue-600" />
            <span>My Evaluated Answer Sheets</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Access past ICAI step marking evaluations, deduction remarks, and performance certificates.
          </p>
        </div>

        <button
          onClick={onNavigateUpload}
          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-2 w-fit"
        >
          <span>Evaluate New Sheet</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by subject name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          >
            <option value="ALL">All Levels</option>
            <option value="FOUNDATION">Foundation</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="FINAL">Final</option>
          </select>
        </div>
      </div>

      {/* Evaluations Table / Cards */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-xs">Loading evaluation archives...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Subject & Paper</th>
                  <th className="py-3 px-4">Paper Type</th>
                  <th className="py-3 px-4">Attempt</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Percentage</th>
                  <th className="py-3 px-4">Grade</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-800 block">{ev.subject_name}</span>
                      <span className="text-[10px] text-slate-400">CA {ev.level}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                        {ev.material_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{ev.attempt || 'May 2026'}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(ev.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {ev.total_marks} / {ev.maximum_marks}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700">{ev.percentage}%</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ev.percentage >= 60
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : ev.percentage >= 40
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {ev.grade || 'Evaluated'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onViewReport(ev.id)}
                        className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs transition"
                      >
                        Detailed Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3 shadow-sm">
          <Layers className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No evaluation records found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
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
    </div>
  );
};
