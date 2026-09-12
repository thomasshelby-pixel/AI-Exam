import React, { useEffect } from 'react';
import { LegalDocumentView } from './LegalDocumentView.js';

export const TermsPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.title = 'Terms of Service | CA Exam Checker AI';
  }, []);

  return <LegalDocumentView activeDocType="TERMS" />;
};
