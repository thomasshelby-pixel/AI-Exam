export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(false);
    }
    if ((window as any).Razorpay) {
      return resolve(true);
    }

    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    if (!document.body) {
      if (document.readyState === 'loading') {
        window.addEventListener(
          'DOMContentLoaded',
          () => {
            loadRazorpayScript().then(resolve);
          },
          { once: true }
        );
        return;
      }
    }

    try {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      (document.body || document.documentElement).appendChild(script);
    } catch {
      resolve(false);
    }
  });
}
