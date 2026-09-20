import React, { useState, useEffect } from 'react';
import {
  Star,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Edit3,
  ThumbsUp,
  ThumbsDown,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { StudentReview, ReviewEligibilityResponse } from '../../types/index.js';
import { VerifiedStudentBadge, OfficialAdminBadge } from '../common/VerifiedBadges.js';

interface StudentReviewCardProps {
  onSuccess?: () => void;
  onNavigateUpload?: () => void;
}

const AVAILABLE_TAGS = [
  'Evaluation Accuracy',
  'Report Quality',
  'Checked Copy',
  'Upload Experience',
  'Ease of Use',
  'Overall Experience',
];

export const StudentReviewCard: React.FC<StudentReviewCardProps> = ({
  onSuccess,
  onNavigateUpload,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [eligibility, setEligibility] = useState<ReviewEligibilityResponse>({
    eligible: false,
    completedEvaluationsCount: 0,
  });
  const [existingReview, setExistingReview] = useState<StudentReview | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Form states
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Evaluation Accuracy', 'Report Quality']);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');

      // Check eligibility and existing review in parallel
      const [eligRes, reviewRes] = await Promise.all([
        apiRequest<ReviewEligibilityResponse>('/api/student/review/eligibility'),
        apiRequest<{ review: StudentReview | null }>('/api/student/review'),
      ]);

      setEligibility(eligRes);

      if (reviewRes.review) {
        setExistingReview(reviewRes.review);
        setRating(reviewRes.review.rating);
        setReviewText(reviewRes.review.reviewText);
        if (reviewRes.review.experienceTags && Array.isArray(reviewRes.review.experienceTags)) {
          setSelectedTags(reviewRes.review.experienceTags);
        }
        setIsEditing(false);
      } else {
        setExistingReview(null);
        setIsEditing(true);
      }
    } catch (err: unknown) {
      console.warn('Failed to load review details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (selectedTags.length >= 4) return; // Limit to 4 tags
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (rating < 1 || rating > 5) {
      setErrorMsg('Please select a rating between 1 and 5 stars.');
      return;
    }

    const trimmed = reviewText.trim();
    if (trimmed.length < 20) {
      setErrorMsg(`Review text is too short (${trimmed.length}/20 min characters).`);
      return;
    }

    if (trimmed.length > 500) {
      setErrorMsg(`Review text exceeds 500 characters (${trimmed.length}/500).`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiRequest<{ success: boolean; message: string; review: StudentReview }>(
        '/api/student/review',
        {
          method: 'POST',
          body: JSON.stringify({
            rating,
            reviewText: trimmed,
            experienceTags: selectedTags,
          }),
        }
      );

      setSuccessMsg(res.message);
      setExistingReview(res.review);
      setIsEditing(false);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post review';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center animate-pulse">
        <p className="text-xs text-slate-400">Loading student review eligibility...</p>
      </div>
    );
  }

  // If student has NOT completed at least 1 evaluation
  if (!eligibility.eligible && !existingReview) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 shrink-0">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Student Review & Community Feedback
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Complete an evaluation to share your experience.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Reviews are exclusively reserved for students with at least 1 evaluated answer sheet.
            </span>
          </div>

          {onNavigateUpload && (
            <button
              onClick={onNavigateUpload}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Answer Sheet</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-4 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-amber-400 shrink-0">
            <Star className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Share Your CA Evaluation Experience</span>
              <VerifiedStudentBadge showText={false} />
            </h3>
            <p className="text-xs text-blue-200/80">
              Your feedback is published publicly immediately to help fellow CA aspirants.
            </p>
          </div>
        </div>

        {existingReview && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Review</span>
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Messages */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Existing Review Display (Non-Editing View) */}
        {existingReview && !isEditing ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-750/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= existingReview.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-slate-100 text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {existingReview.rating}.0 / 5
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Published as <strong>{existingReview.displayName}</strong>
                  </span>
                  <VerifiedStudentBadge showText={false} />
                </div>

                {/* Status Badge */}
                <div>
                  {existingReview.status === 'PUBLISHED' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Live on Platform
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      Under Moderation
                    </span>
                  )}
                </div>
              </div>

              {/* Experience Tags */}
              {existingReview.experienceTags && existingReview.experienceTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {existingReview.experienceTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 italic leading-relaxed">
                "{existingReview.reviewText}"
              </p>

              {/* Likes & Dislikes received */}
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                  <ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                  <span>{existingReview.likesCount || 0} Helpful upvotes</span>
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>{existingReview.dislikesCount || 0} downvotes</span>
                </span>
              </div>

              {/* Official Team Reply */}
              {existingReview.adminReply && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <OfficialAdminBadge />
                    <span>{existingReview.adminReplyName || 'CA Exam Checker AI'}</span>
                  </div>
                  <p className="leading-relaxed">{existingReview.adminReply}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Privacy Protected: Your email and mobile number are never displayed publicly.
              </span>
            </div>
          </div>
        ) : (
          /* Review Form (Editing or First Time) */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Star Rating Picker */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Overall Rating <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex text-slate-200" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      aria-label={`${star} Star${star > 1 ? 's' : ''}`}
                      className="p-1 hover:scale-110 transition cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          star <= (hoverRating || rating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1">
                  {hoverRating || rating} / 5
                </span>
              </div>
            </div>

            {/* Experience Tags Multi-Select */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                What Stood Out? (Select up to 4 tags)
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Written Review */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Your Detailed Feedback <span className="text-rose-500">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    reviewText.length > 500
                      ? 'text-rose-600 font-bold'
                      : reviewText.length < 20
                      ? 'text-amber-600'
                      : 'text-slate-400'
                  }`}
                >
                  {reviewText.length} / 500 chars (min 20)
                </span>
              </div>

              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share how accurately the evaluation matched ICAI step marking, deduction remarks, working notes feedback, or speed..."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Privacy & Instant Publication Notice */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Immediate Public Publication</span>
                <span className="text-[11px] text-blue-800 dark:text-blue-300">
                  Your review will be posted publicly immediately. It will be displayed under your privacy-safe name (First Name + Last Initial) with a Blue Verified Student badge.
                </span>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              {existingReview && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {submitting ? (
                  <span>Posting...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Post Review</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
