import { apiRequest } from './client.js';

export type FeatureStatus = 'ENABLED' | 'TESTING' | 'DISABLED';

export interface FeatureTesterRecord {
  id: string;
  feature_key: string;
  email: string;
  created_at: string;
  created_by: string;
}

export interface FeatureWithTesters {
  id: string;
  feature_key: string;
  feature_name: string;
  status: FeatureStatus;
  student_message: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  testers: FeatureTesterRecord[];
}

export interface FeatureAccessResult {
  featureKey: string;
  featureName: string;
  allowed: boolean;
  status: FeatureStatus;
  studentMessage: string;
  reason: 'admin_override' | 'enabled' | 'tester_allowed' | 'limited_testing' | 'disabled' | 'unauthenticated';
}

export const featureApi = {
  // Check student access to a feature
  checkAccess: async (featureKey: string): Promise<FeatureAccessResult> => {
    return apiRequest<FeatureAccessResult>(`/api/features/${featureKey}/access`);
  },

  // Admin: Get all features with testers
  getAllFeatures: async (): Promise<FeatureWithTesters[]> => {
    const res = await apiRequest<{ success: boolean; features: FeatureWithTesters[] }>('/api/admin/features');
    return res.features || [];
  },

  // Admin: Update status / student message
  updateFeature: async (
    featureKey: string,
    params: { status?: FeatureStatus; studentMessage?: string }
  ): Promise<FeatureWithTesters> => {
    const res = await apiRequest<{ success: boolean; feature: FeatureWithTesters; message: string }>(
      `/api/admin/features/${featureKey}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
    return res.feature;
  },

  // Admin: Add tester to feature
  addTester: async (featureKey: string, email: string): Promise<FeatureTesterRecord> => {
    const res = await apiRequest<{ success: boolean; tester: FeatureTesterRecord; message: string }>(
      `/api/admin/features/${featureKey}/testers`,
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
    return res.tester;
  },

  // Admin: Remove tester from feature
  removeTester: async (featureKey: string, testerId: string): Promise<{ success: boolean; removedEmail: string }> => {
    return apiRequest<{ success: boolean; removedEmail: string }>(
      `/api/admin/features/${featureKey}/testers/${testerId}`,
      {
        method: 'DELETE',
      }
    );
  },
};
