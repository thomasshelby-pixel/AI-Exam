import { apiRequest } from './client.js';

export type FeatureStatus = 'ENABLED' | 'TESTING' | 'DISABLED' | 'COMING_SOON';
export type FeatureApplication = 'CHECKER' | 'MCQ_ARENA';

export interface FeatureTesterRecord {
  id: string;
  feature_id?: string;
  application?: FeatureApplication;
  feature_key: string;
  email: string;
  created_at: string;
  created_by: string;
}

export interface FeatureWithTesters {
  id: string;
  application: FeatureApplication;
  feature_key: string;
  feature_name: string;
  description: string;
  status: FeatureStatus;
  student_message: string;
  display_in_student_dashboard: number;
  display_order: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  testers: FeatureTesterRecord[];
}

export interface FeatureAccessResult {
  application: FeatureApplication;
  featureKey: string;
  featureName: string;
  allowed: boolean;
  status: FeatureStatus;
  studentMessage: string;
  reason:
    | 'admin_override'
    | 'enabled'
    | 'tester_allowed'
    | 'limited_testing'
    | 'disabled'
    | 'coming_soon'
    | 'unauthenticated';
}

export const featureApi = {
  // Check student access to a feature (with optional application scope)
  checkAccess: async (featureKey: string, application?: FeatureApplication): Promise<FeatureAccessResult> => {
    if (application) {
      return apiRequest<FeatureAccessResult>(`/api/features/${application}/${featureKey}/access`);
    }
    return apiRequest<FeatureAccessResult>(`/api/features/${featureKey}/access`);
  },

  // Public: Get student-visible features list
  getPublicFeatures: async (application?: FeatureApplication): Promise<FeatureWithTesters[]> => {
    const url = application ? `/api/features?application=${application}` : '/api/features';
    const res = await apiRequest<{ success: boolean; features: FeatureWithTesters[] }>(url);
    return res.features || [];
  },

  // Admin: Get all features with testers
  getAllFeatures: async (application?: FeatureApplication): Promise<FeatureWithTesters[]> => {
    const url = application ? `/api/admin/features?application=${application}` : '/api/admin/features';
    const res = await apiRequest<{ success: boolean; features: FeatureWithTesters[] }>(url);
    return res.features || [];
  },

  // Admin: Create a brand new feature
  createFeature: async (params: {
    application: FeatureApplication;
    featureKey: string;
    featureName: string;
    description?: string;
    status?: FeatureStatus;
    studentMessage?: string;
    displayInStudentDashboard?: boolean;
    displayOrder?: number;
  }): Promise<FeatureWithTesters> => {
    const res = await apiRequest<{ success: boolean; feature: FeatureWithTesters; message: string }>(
      '/api/admin/features',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return res.feature;
  },

  // Admin: Update status / student message / metadata
  updateFeature: async (
    featureKey: string,
    params: {
      status?: FeatureStatus;
      studentMessage?: string;
      featureName?: string;
      description?: string;
      displayInStudentDashboard?: boolean;
      displayOrder?: number;
      application?: FeatureApplication;
    }
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
  addTester: async (
    featureKey: string,
    email: string,
    application?: FeatureApplication
  ): Promise<FeatureTesterRecord> => {
    const res = await apiRequest<{ success: boolean; tester: FeatureTesterRecord; message: string }>(
      `/api/admin/features/${featureKey}/testers`,
      {
        method: 'POST',
        body: JSON.stringify({ email, application }),
      }
    );
    return res.tester;
  },

  // Admin: Remove tester from feature
  removeTester: async (
    featureKey: string,
    testerId: string,
    application?: FeatureApplication
  ): Promise<{ success: boolean; removedEmail: string }> => {
    const url = application
      ? `/api/admin/features/${featureKey}/testers/${testerId}?application=${application}`
      : `/api/admin/features/${featureKey}/testers/${testerId}`;
    return apiRequest<{ success: boolean; removedEmail: string }>(url, {
      method: 'DELETE',
    });
  },
};
