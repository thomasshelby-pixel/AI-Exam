import React, { useState, useEffect } from 'react';
import {
  Star,
  CheckCircle2,
  XCircle,
  EyeOff,
  Eye,
  Trash2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  MessageSquare,
  Reply,
  Calendar,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { StudentReview } from '../../types/index.js';
import { VerifiedStudentBadge, OfficialAdminBadge } from '../common/VerifiedBadges.js';

interface AdminReviewsSectionProps {
  onNotify?: (msg: string, type: 'success' | 'error') => void;
  onRefreshPendingCount?: () => void;
}

const MODERATION_REASONS = [
  'Spam or Advertisement',
  'Profanity, Hate Speech or Abuse',
  'Private Contact Info / PII Leak',
  'Malicious Link or Scam',
  'Irrelevant or Off-Topic',
  'Other Policy Violation',
];

export const AdminReviewsSection: React.FC<AdminReviewsSectionProps> = ({
  onNotify,
  onRefreshPendingCount,
}) => {
  const [reviews, setReviews] = useState<StudentReview[]>([]);
  const [counts, setCounts] = useState({ total: 0, published: 0, hidden: 0, removed: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Moderation Modal state (for Hiding or Removing with reason)
  const [moderationModal, setModerationModal] = useState<{
    review: StudentReview;
    targetStatus: 'HIDDEN' | 'REMOVED' | 'PUBLISHED';
    selectedReason: string;
    customNote: string;
  } | null>(null);

  // Official Reply Modal state
  const [replyModal, setReplyModal] = useState<{
    review: StudentReview;
    replyText: string;
  } | null>(null);

  // Permanent Delete Modal state
  const [deleteModal, setDeleteModal] = useState<StudentReview | null>(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
      if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());

      const res = await apiRequest<{
        reviews: StudentReview[];
        counts: { total: number; published: number; hidden: number; removed: number };
      }>(`/api/admin/reviews?${queryParams.toString()}`);

      setReviews(res.reviews || []);
      setCounts(
        res.counts || {
          total: 0,
          published: 0,
          hidden: 0,
          removed: 0,
        }
      );
      if (onRefreshPendingCount) {
        onRefreshPendingCount();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load reviews';
      if (onNotify) onNotify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReviews();
  };

  const handleUpdateStatus = async (
    reviewId: string,
    targetStatus: 'PUBLISHED' | 'HIDDEN' | 'REMOVED',
    reason?: string
  ) => {
    try {
      setActionInProgress(reviewId);
      await apiRequest(`/api/admin/reviews/${reviewId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus, reason }),
      });

      if (onNotify) {
        onNotify(`Review status updated to ${targetStatus}`, 'success');
      }
      setModerationModal(null);
      await fetchReviews();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update review status';
      if (onNotify) onNotify(msg, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSaveReply = async (reviewId: string, replyText: string) => {
    try {
      setActionInProgress(reviewId);
      await apiRequest(`/api/admin/reviews/${reviewId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ replyText }),
      });

      if (onNotify) {
        onNotify('Official response published successfully', 'success');
      }
      setReplyModal(null);
      await fetchReviews();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post official reply';
      if (onNotify) onNotify(msg, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteReply = async (reviewId: string) => {
    try {
      setActionInProgress(reviewId);
      await apiRequest(`/api/admin/reviews/${reviewId}/reply`, {
        method: 'DELETE',
      });

      if (onNotify) {
        onNotify('Official response removed', 'success');
      }
      setReplyModal(null);
      await fetchReviews();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete official reply';
      if (onNotify) onNotify(msg, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      setActionInProgress(reviewId);
      await apiRequest(`/api/admin/reviews/${reviewId}`, {
        method: 'DELETE',
      });

      if (onNotify) {
        onNotify('Review permanently deleted', 'success');
      }
      setDeleteModal(null);
      await fetchReviews();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete review';
      if (onNotify) onNotify(msg, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Community Feedback & Reviews Moderation
                </h2>
                <p className="text-xs text-slate-500">
                  Transparent student reviews are published immediately. Moderate spam, handle abuse, or post official team responses.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchReviews()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Reviews</span>
            </button>
          </div>
        </div>

        {/* Status Count Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-lg border text-left transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-slate-500">All Reviews</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{counts.total}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('PUBLISHED')}
            className={`p-3 rounded-lg border text-left transition cursor-pointer ${
              statusFilter === 'PUBLISHED'
                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-emerald-700">Live & Published</p>
            <p className="text-lg font-bold text-emerald-900 mt-0.5">{counts.published}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('HIDDEN')}
            className={`p-3 rounded-lg border text-left transition cursor-pointer ${
              statusFilter === 'HIDDEN'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-amber-700">Hidden by Moderation</p>
            <p className="text-lg font-bold text-amber-900 mt-0.5">{counts.hidden}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('REMOVED')}
            className={`p-3 rounded-lg border text-left transition cursor-pointer ${
              statusFilter === 'REMOVED'
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-rose-700">Removed</p>
            <p className="text-lg font-bold text-rose-900 mt-0.5">{counts.removed}</p>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name, registered email, or review text..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Search
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading reviews...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-2">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Reviews Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no reviews matching your current filter criteria.
            </p>
          </div>
        ) : (
          reviews.map((rev) => {
            const isPublished = rev.status === 'PUBLISHED';
            const isHidden = rev.status === 'HIDDEN';
            const isRemoved = rev.status === 'REMOVED';
            const isProcessing = actionInProgress === rev.id;

            return (
              <div
                key={rev.id}
                className={`bg-white rounded-xl border p-4 sm:p-5 shadow-xs transition ${
                  isPublished
                    ? 'border-slate-200'
                    : isHidden
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-rose-200 bg-rose-50/20 opacity-80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left Column: Author Info, Rating, Content */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {rev.studentName || rev.displayName}
                      </span>
                      {rev.studentEmail && (
                        <span className="text-xs text-slate-400">({rev.studentEmail})</span>
                      )}
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded text-[10px] font-semibold uppercase tracking-wider">
                        CA {rev.caLevel}
                      </span>
                      <span className="text-xs text-slate-400">
                        Public Display: <strong className="text-slate-700">{rev.displayName}</strong>
                      </span>
                      <VerifiedStudentBadge showText={true} />
                    </div>

                    {/* Star Rating & Date */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <div className="flex items-center text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-800">{rev.rating}.0 / 5</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(rev.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>

                      {/* Likes / Dislikes badges */}
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{rev.likesCount || 0}</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400 font-semibold">
                        <ThumbsDown className="w-3 h-3" />
                        <span>{rev.dislikesCount || 0}</span>
                      </span>
                    </div>

                    {/* Experience Tags */}
                    {rev.experienceTags && rev.experienceTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {rev.experienceTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Review Body */}
                    <div className="pt-1">
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50/70 p-3 rounded-lg border border-slate-100 italic">
                        "{rev.reviewText}"
                      </p>
                    </div>

                    {/* Official Response Preview */}
                    {rev.adminReply && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 font-bold text-amber-900">
                            <OfficialAdminBadge />
                            <span>{rev.adminReplyName || 'CA Exam Checker AI'}</span>
                          </div>
                          {rev.adminReplyAt && (
                            <span className="text-[10px] text-amber-700">
                              {new Date(rev.adminReplyAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                        <p className="leading-relaxed">{rev.adminReply}</p>
                      </div>
                    )}

                    {/* Moderation Reason / Audit (if hidden/removed) */}
                    {rev.moderationReason && (
                      <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Moderation Reason: </strong>
                          <span>{rev.moderationReason}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Status Badge & Actions */}
                  <div className="flex flex-col sm:items-end gap-2.5 shrink-0 pt-1 sm:pt-0">
                    <div>
                      {isPublished && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Live & Published
                        </span>
                      )}
                      {isHidden && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <EyeOff className="w-3 h-3 text-amber-600" />
                          Hidden
                        </span>
                      )}
                      {isRemoved && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Removed
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {/* Official Reply Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setReplyModal({
                            review: rev,
                            replyText: rev.adminReply || '',
                          })
                        }
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Post or edit official team response"
                      >
                        <Reply className="w-3.5 h-3.5" />
                        <span>{rev.adminReply ? 'Edit Reply' : 'Official Reply'}</span>
                      </button>

                      {/* Restore to Published */}
                      {!isPublished && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(rev.id, 'PUBLISHED', 'Restored to published')}
                          disabled={isProcessing}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Restore review to public showcase"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Publish</span>
                        </button>
                      )}

                      {/* Hide Review */}
                      {isPublished && (
                        <button
                          type="button"
                          onClick={() =>
                            setModerationModal({
                              review: rev,
                              targetStatus: 'HIDDEN',
                              selectedReason: MODERATION_REASONS[0],
                              customNote: '',
                            })
                          }
                          disabled={isProcessing}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Hide from public listing (Spam/Abuse)"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </button>
                      )}

                      {/* Delete permanently */}
                      <button
                        type="button"
                        onClick={() => setDeleteModal(rev)}
                        disabled={isProcessing}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Official Reply Modal */}
      {replyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <OfficialAdminBadge />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Official Response from CA Exam Checker AI
                </h3>
                <p className="text-xs text-slate-500">
                  Responding to student {replyModal.review.displayName} ({replyModal.review.caLevel})
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-800">Student Review:</p>
              <p className="italic">"{replyModal.review.reviewText}"</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Official Platform Response:
                </label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {replyModal.replyText.length} / 1000 chars
                </span>
              </div>
              <textarea
                value={replyModal.replyText}
                onChange={(e) =>
                  setReplyModal({ ...replyModal, replyText: e.target.value })
                }
                placeholder="Write a helpful, professional response to acknowledge the student's experience or address their feedback..."
                rows={4}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {replyModal.review.adminReply ? (
                <button
                  type="button"
                  onClick={() => handleDeleteReply(replyModal.review.id)}
                  className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Remove Reply
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReplyModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveReply(replyModal.review.id, replyModal.replyText)}
                  disabled={!replyModal.replyText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  Publish Response
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Moderation (Hide/Remove) Modal */}
      {moderationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <EyeOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Hide Review from Public Showcase
                </h3>
                <p className="text-xs text-slate-500">
                  Student: {moderationModal.review.displayName}
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Review Text:</p>
              <p className="italic">"{moderationModal.review.reviewText}"</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Reason for Moderation Action:
              </label>
              <select
                value={moderationModal.selectedReason}
                onChange={(e) =>
                  setModerationModal({ ...moderationModal, selectedReason: e.target.value })
                }
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
              >
                {MODERATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <textarea
                value={moderationModal.customNote}
                onChange={(e) =>
                  setModerationModal({ ...moderationModal, customNote: e.target.value })
                }
                placeholder="Additional audit notes (optional)..."
                rows={2}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModerationModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const combined = moderationModal.customNote
                    ? `${moderationModal.selectedReason}: ${moderationModal.customNote}`
                    : moderationModal.selectedReason;
                  handleUpdateStatus(
                    moderationModal.review.id,
                    moderationModal.targetStatus,
                    combined
                  );
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Confirm Hide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Permanently Delete Review?</h3>
              <p className="text-xs text-slate-500 mt-1">
                This action is irreversible and removes the testimonial permanently from the database.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                {deleteModal.studentName || deleteModal.displayName}
              </p>
              <p className="text-slate-500 text-[11px] truncate">{deleteModal.reviewText}</p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteReview(deleteModal.id)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
