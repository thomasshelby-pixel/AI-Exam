import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import { formatDateTimeIST } from '../../utils/timezone.js';
import {
  Bell,
  CheckCircle2,
  X,
  ExternalLink,
  Flame,
  Check,
  Settings,
  Mail,
  Smartphone,
  RefreshCw,
  AlertCircle,
  Inbox,
  ArrowRight,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  category?: string;
  priority?: string;
  action_url?: string;
  action_label?: string;
  read: number;
  is_read: number;
  created_at: string;
}

interface NotificationPreferences {
  emailNotificationsEnabled: boolean;
  marketingEmailsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
}

interface StudentNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationsUpdated?: () => void;
}

export const StudentNotificationModal: React.FC<StudentNotificationModalProps> = ({
  isOpen,
  onClose,
  onNotificationsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'notifications' | 'preferences'>('notifications');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Preferences state
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    emailNotificationsEnabled: true,
    marketingEmailsEnabled: true,
    inAppNotificationsEnabled: true,
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState<boolean>(false);
  const [prefsSuccess, setPrefsSuccess] = useState<string>('');

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest<{ notifications: NotificationItem[]; unreadCount?: number }>(
        '/api/student/notifications'
      );
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load student notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const res = await apiRequest<{ preferences: NotificationPreferences }>(
        '/api/student/notification-preferences'
      );
      if (res.preferences) {
        setPreferences(res.preferences);
      }
    } catch (err) {
      console.warn('Failed to load preferences:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
      loadPreferences();
    }
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiRequest(`/api/student/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: 1, is_read: 1 } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      onNotificationsUpdated?.();
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiRequest('/api/student/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1, is_read: 1 })));
      setUnreadCount(0);
      onNotificationsUpdated?.();
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setIsSavingPrefs(true);
      setPrefsSuccess('');
      await apiRequest('/api/student/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      setPrefsSuccess('Notification preferences saved successfully.');
      setTimeout(() => setPrefsSuccess(''), 4000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') {
      return !n.read && !n.is_read;
    }
    return true;
  });

  const getCategoryBadgeClass = (category?: string) => {
    const c = (category || 'SYSTEM').toUpperCase();
    switch (c) {
      case 'EXAM_ALERT':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'FEATURE_UPDATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'MAINTENANCE':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'PROMOTIONAL':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'URGENT_ALERT':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'ANNOUNCEMENT':
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                    {unreadCount} new
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">Platform updates, exam notices & alerts</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab(activeTab === 'notifications' ? 'preferences' : 'notifications')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'preferences'
                  ? 'bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Notification Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab / Filter Bar */}
        {activeTab === 'notifications' && (
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filter === 'unread'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Mark all as read</span>
              </button>
            )}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'notifications' ? (
            isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading notifications...</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs">
                <Inbox className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  You're all caught up on platform exam updates and alerts.
                </p>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const isUnread = !n.read && !n.is_read;
                const isUrgent = n.priority === 'URGENT';
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border transition relative ${
                      isUnread
                        ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800'
                    } ${isUrgent ? 'ring-1 ring-rose-400/30' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {n.category && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${getCategoryBadgeClass(
                              n.category
                            )}`}
                          >
                            {n.category}
                          </span>
                        )}
                        {isUrgent && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            URGENT
                          </span>
                        )}
                        {isUnread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                        )}
                      </div>

                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {formatDateTimeIST(n.created_at)}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {n.title}
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">
                      {n.message}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      {n.action_url ? (
                        <a
                          href={n.action_url}
                          onClick={() => {
                            if (isUnread) handleMarkAsRead(n.id);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>{n.action_label || 'View Details'}</span>
                          <ArrowRight className="w-3 h-3" />
                        </a>
                      ) : (
                        <span />
                      )}

                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(n.id)}
                          className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* PREFERENCES TAB */
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">Notification Preferences</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Customize the channels and messages you receive from CA Exam Checker AI.
                </p>
              </div>

              {prefsSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{prefsSuccess}</span>
                </div>
              )}

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.emailNotificationsEnabled}
                    onChange={(e) =>
                      setPreferences({ ...preferences, emailNotificationsEnabled: e.target.checked })
                    }
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Email Notifications</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Receive major platform updates, exam schedule changes, and evaluation confirmations in your inbox.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.marketingEmailsEnabled}
                    onChange={(e) =>
                      setPreferences({ ...preferences, marketingEmailsEnabled: e.target.checked })
                    }
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      Promotional & Special Offers
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Hear about bonus credit promotions, referral discounts, and seasonal student incentives.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.inAppNotificationsEnabled}
                    onChange={(e) =>
                      setPreferences({ ...preferences, inAppNotificationsEnabled: e.target.checked })
                    }
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">In-App Notification Feed</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Display announcements and alert badges inside your student dashboard notification feed.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  disabled={isSavingPrefs}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingPrefs ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Preferences</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>CA Exam Checker AI Operations</span>
          <button
            onClick={onClose}
            className="font-bold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
