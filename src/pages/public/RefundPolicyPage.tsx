import React, { useEffect } from 'react';
import { LegalDocumentView } from './LegalDocumentView.js';

export const RefundPolicyPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.title = 'Refund & Cancellation Policy | CA Exam Checker AI';
  }, []);

  return <LegalDocumentView activeDocType="REFUND" />;
};
