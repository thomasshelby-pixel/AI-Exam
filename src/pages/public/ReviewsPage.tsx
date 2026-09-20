import React, { useState, useEffect } from 'react';
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Filter,
  ShieldCheck,
  AlertCircle,
  LogIn,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { formatDateIST } from '../../utils/timezone.js';
import { PublicReview, PublicReviewsResponse, User } from '../../types/index.js';
import { VerifiedStudentBadge, OfficialAdminBadge } from '../../components/common/VerifiedBadges.js';

interface ReviewsPageProps {
  user: User | null;
  onNavigateLogin: () => void;
  onNavigateRegister: () => void;
  onNavigateStudentPortal?: () => void;
}

export const ReviewsPage: React.FC<ReviewsPageProps> = ({
  user,
  onNavigateLogin,
  onNavigateRegister,
  onNavigateStudentPortal,
}) => {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [stats, setStats] = useState({
    totalReviews: 0,
    averageRating: 0,
    ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<number, number>,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'most_liked'>('newest');
  const [votingId, setVotingId] = useState<string | null>(null);
  const [loginPromptOpen, setLoginPromptOpen] = useState<boolean>(false);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const params = new URLSearchParams();
      if (selectedLevel !== 'ALL') params.set('caLevel', selectedLevel);
      if (sortBy !== 'newest') params.set('sortBy', sortBy);

      const res = await apiRequest<PublicReviewsResponse>(`/api/reviews?${params.toString()}`);
      setReviews(res.reviews || []);
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load student reviews';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [selectedLevel, sortBy]);

  const handleVote = async (reviewId: string, voteType: 'LIKE' | 'DISLIKE') => {
    if (!user) {
      setLoginPromptOpen(true);
      return;
    }

    try {
      setVotingId(reviewId);
      const res = await apiRequest<{
        success: boolean;
        userVote: 'LIKE' | 'DISLIKE' | null;
        likesCount: number;
        dislikesCount: number;
      }>(`/api/reviews/${reviewId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ voteType }),
      });

      // Optimistically update the vote counts & state in local list
      setReviews((prev) =>
        prev.map((r) => {
          if (r.id === reviewId) {
            return {
              ...r,
              userVote: res.userVote,
              likesCount: res.likesCount,
              dislikesCount: res.dislikesCount,
            };
          }
          return r;
        })
      );
    } catch (err: unknown) {
      console.warn('Voting error:', err);
    } finally {
      setVotingId(null);
    }
  };

  const handleShareExperience = () => {
    if (!user) {
      onNavigateLogin();
    } else if (onNavigateStudentPortal) {
      onNavigateStudentPortal();
    }
  };

  const calculateBarPercent = (count: number) => {
    if (!stats.totalReviews || stats.totalReviews === 0) return 0;
    return Math.round((count / stats.totalReviews) * 100);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-800 dark:text-slate-100">
      {/* Header Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold shadow-2xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Transparent Student Reviews & Verified Feedback</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
          What CA Aspirants Say
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Unfiltered, transparent feedback from students who evaluate their mock exam answer sheets with CA Exam Checker AI.
        </p>
      </div>

      {/* Aggregate Score & Distribution Card */}
      <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Main Average Rating */}
          <div className="md:col-span-4 text-center md:text-left space-y-3 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 pb-6 md:pb-0 md:pr-8">
            {stats.totalReviews === 0 ? (
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  No reviews yet
                </div>
                <div className="flex items-center justify-center md:justify-start gap-1 text-slate-300 dark:text-slate-600">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="w-5 h-5 fill-transparent text-slate-300 dark:text-slate-600"
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Be the first student to share your experience.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline justify-center md:justify-start gap-2">
                  <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tight">
                    {stats.averageRating.toFixed(1)}
                  </span>
                  <span className="text-slate-400 text-lg font-bold">/ 5.0</span>
                </div>

                <div className="flex items-center justify-center md:justify-start gap-1 text-amber-400">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= Math.round(stats.averageRating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-slate-100 text-slate-300 dark:fill-slate-700 dark:text-slate-600'
                      }`}
                    />
                  ))}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Based on {stats.totalReviews} verified student evaluation{stats.totalReviews === 1 ? '' : 's'}.
                </p>
              </div>
            )}

            <button
              onClick={handleShareExperience}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2"
            >
              <span>Share Your Experience</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Rating Distribution Bars */}
          <div className="md:col-span-8 space-y-2.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = stats.ratingBreakdown[stars] || 0;
              const percent = calculateBarPercent(count);
              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <span className="w-12 font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    {stars} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    {count} ({percent}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter and Sort Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        {/* Level Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
          {[
            { id: 'ALL', label: 'All Levels' },
            { id: 'FOUNDATION', label: 'CA Foundation' },
            { id: 'INTERMEDIATE', label: 'CA Intermediate' },
            { id: 'FINAL', label: 'CA Final' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedLevel(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedLevel === tab.id
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Sort by:</span>
          <button
            onClick={() => setSortBy('newest')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
              sortBy === 'newest'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Newest First
          </button>
          <button
            onClick={() => setSortBy('most_liked')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
              sortBy === 'most_liked'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Most Helpful (Likes)
          </button>
        </div>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading student reviews...</p>
        </div>
      ) : errorMsg ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      ) : reviews.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 p-8">
          <MessageSquare className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Reviews Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {selectedLevel === 'ALL'
              ? 'Be the first to share your evaluation experience after checking your mock answers.'
              : `No reviews published yet for ${selectedLevel.replace('FOUNDATION', 'CA Foundation').replace('INTERMEDIATE', 'CA Intermediate').replace('FINAL', 'CA Final')}.`}
          </p>
          <button
            onClick={handleShareExperience}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer"
          >
            Leave a Review
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-2xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Reviewer Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {r.displayName}
                      </span>
                      <VerifiedStudentBadge showText={false} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold text-[11px] border border-blue-200 dark:border-blue-900">
                        {r.caLevel}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {formatDateIST(r.date)}
                      </span>
                    </div>
                  </div>

                  {/* Stars */}
                  <div className="flex text-amber-400 shrink-0">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= r.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-slate-100 text-slate-200 dark:fill-slate-700 dark:text-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Experience Tags */}
                {r.experienceTags && r.experienceTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {r.experienceTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Review Body */}
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed italic">
                  "{r.reviewText}"
                </p>

                {/* Official Response Block */}
                {r.adminReply && (
                  <div className="mt-3 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                        <span>{r.adminReplyName || 'CA Exam Checker AI'}</span>
                        <OfficialAdminBadge showText={false} />
                      </div>
                      {r.adminReplyAt && (
                        <span className="text-[10px] text-amber-700/80 dark:text-amber-400">
                          {formatDateIST(r.adminReplyAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                      {r.adminReply}
                    </p>
                  </div>
                )}
              </div>

              {/* Card Footer / Voting Controls */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500">
                <span className="text-[11px] text-slate-400 font-medium">Was this helpful?</span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVote(r.id, 'LIKE')}
                    disabled={votingId === r.id || (r as any).isOwnReview}
                    title={(r as any).isOwnReview ? 'You cannot vote on your own review' : 'Helpful'}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      r.userVote === 'LIKE'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                    } ${(r as any).isOwnReview ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${r.userVote === 'LIKE' ? 'fill-current' : ''}`} />
                    <span>{r.likesCount || 0}</span>
                  </button>

                  <button
                    onClick={() => handleVote(r.id, 'DISLIKE')}
                    disabled={votingId === r.id || (r as any).isOwnReview}
                    title={(r as any).isOwnReview ? 'You cannot vote on your own review' : 'Not helpful'}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      r.userVote === 'DISLIKE'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                    } ${(r as any).isOwnReview ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ThumbsDown className={`w-3.5 h-3.5 ${r.userVote === 'DISLIKE' ? 'fill-current' : ''}`} />
                    <span>{r.dislikesCount || 0}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Login Prompt Modal for non-logged-in voters */}
      {loginPromptOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-sm w-full p-6 space-y-4 shadow-xl text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <LogIn className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Sign In to Vote on Reviews
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Log in with your CA student account to upvote helpful feedback from fellow aspirants.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setLoginPromptOpen(false);
                  onNavigateLogin();
                }}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={() => setLoginPromptOpen(false)}
                className="w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
