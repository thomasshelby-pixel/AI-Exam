import React, { useEffect } from 'react';
import { LegalDocumentView } from './LegalDocumentView.js';

export const PrivacyPolicyPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.title = 'Privacy Policy | CA Exam Checker AI';
  }, []);

  return <LegalDocumentView activeDocType="PRIVACY" />;
};
