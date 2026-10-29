import React from 'react';
import { Check, LockKeyhole } from 'lucide-react';

export type OtpVaultAnimationStatus = 'ready' | 'verifying' | 'success';

interface OtpVaultAnimationProps {
  status: OtpVaultAnimationStatus;
  compact?: boolean;
}

const vaultStyles = `
@keyframes otpVaultSpin { to { transform: rotate(360deg); } }
@keyframes otpVaultDial {
  0% { transform: rotate(0deg); }
  70% { transform: rotate(255deg); }
  100% { transform: rotate(360deg); }
}
@keyframes otpVaultScan {
  0%, 100% { transform: translateY(0); opacity: .15; }
  45% { opacity: 1; }
  55% { transform: translateY(78px); opacity: .9; }
}
@keyframes otpVaultPulse {
  0%, 100% { opacity: .45; transform: scale(.96); }
  50% { opacity: 1; transform: scale(1.04); }
}
@keyframes otpVaultCheckIn {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.45); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes otpVaultProgress {
  0% { transform: translateX(-110%); }
  65% { transform: translateX(135%); }
  100% { transform: translateX(135%); }
}
.otp-vault-animation {
  position: relative; isolation: isolate; overflow: hidden;
  padding: 16px 12px 13px;
  border: 1px solid rgba(103, 232, 249, .22); border-radius: 18px;
  color: #e7f5fb;
  background: radial-gradient(ellipse at 50% 8%, rgba(21, 94, 117, .32), transparent 56%), linear-gradient(145deg, #0b1724 0%, #101d2a 58%, #07111c 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 12px 32px rgba(2, 12, 22, .18);
  text-align: center;
}
.otp-vault-animation.is-compact { padding-top: 12px; padding-bottom: 11px; }
.otp-vault-backdrop {
  position: absolute; z-index: -1; inset: 0; pointer-events: none; opacity: .75;
  background-image: radial-gradient(rgba(148, 203, 220, .22) .65px, transparent .65px);
  background-size: 14px 14px; mask-image: linear-gradient(to bottom, black, transparent 78%);
}
.otp-vault-scene { position: relative; width: 132px; height: 132px; margin: 0 auto 7px; perspective: 700px; }
.otp-vault-animation.is-compact .otp-vault-scene { transform: scale(.91); margin-top: -5px; margin-bottom: -1px; }
.otp-vault-halo {
  position: absolute; inset: 0; border: 1px solid rgba(103, 232, 249, .18); border-radius: 50%;
  box-shadow: 0 0 32px rgba(34, 211, 238, .1), inset 0 0 20px rgba(34, 211, 238, .06);
  animation: otpVaultPulse 2.6s ease-in-out infinite;
}
.otp-vault-shell {
  position: absolute; inset: 8px; border: 2px solid #355969; border-radius: 50%;
  background: linear-gradient(145deg, #1c3544, #0a1722 72%);
  box-shadow: 0 8px 25px rgba(0,0,0,.28), inset 0 0 0 4px rgba(3,12,20,.82), inset 0 0 0 6px rgba(113, 190, 210, .08);
}
.otp-vault-shell::before { content: ""; position: absolute; inset: 7px; border: 1px dashed rgba(143, 207, 223, .42); border-radius: 50%; }
.otp-vault-door {
  position: absolute; z-index: 2; inset: 17px; display: grid; place-items: center;
  border: 2px solid #527788; border-radius: 50%;
  background: linear-gradient(145deg, #24485b 0%, #132b3c 54%, #0d1d2a 100%);
  box-shadow: inset 0 0 0 4px rgba(2,12,20,.78), inset 0 0 0 6px rgba(116, 204, 224, .12), 0 3px 8px rgba(0,0,0,.3);
  transform-origin: 28% 50%;
  transition: transform .78s cubic-bezier(.2,.75,.2,1), opacity .6s ease, border-color .4s ease;
}
.otp-vault-door::before { content: ""; position: absolute; inset: 8px; border: 1px solid rgba(171, 228, 240, .24); border-radius: 50%; }
.otp-vault-door-track { position: absolute; inset: 5px; border: 1px dashed rgba(141, 222, 236, .42); border-radius: 50%; animation: otpVaultSpin 11s linear infinite; }
.otp-vault-dial {
  position: relative; z-index: 1; display: grid; width: 43px; height: 43px; place-items: center;
  border: 2px solid #7da6b6; border-radius: 50%;
  background: radial-gradient(circle at 32% 26%, #2e5c70, #0b1a27 72%);
  box-shadow: 0 0 0 3px rgba(3,12,20,.55), inset 0 0 0 1px rgba(195, 238, 247, .15);
  animation: otpVaultDial 2.4s cubic-bezier(.45,.05,.55,.95) infinite;
}
.otp-vault-dial::before, .otp-vault-dial::after {
  content: ""; position: absolute; border-radius: 3px; background: #91ddeb; box-shadow: 0 0 8px rgba(103,232,249,.45);
}
.otp-vault-dial::before { width: 2px; height: 31px; }
.otp-vault-dial::after { width: 31px; height: 2px; }
.otp-vault-lockmark {
  position: absolute; z-index: 3; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%;
  color: #b8f3fb; background: #102637; box-shadow: 0 0 12px rgba(103,232,249,.2);
}
.otp-vault-bolt {
  position: absolute; z-index: 4; width: 19px; height: 5px;
  border: 1px solid #79a2b2; border-radius: 999px;
  background: linear-gradient(180deg, #d4edf2, #7199aa 58%, #3b6172);
  box-shadow: 0 1px 4px rgba(0,0,0,.4);
  transition: transform .55s cubic-bezier(.18,.72,.25,1), opacity .45s ease;
}
.otp-vault-bolt--top { top: 10px; left: calc(50% - 9.5px); }
.otp-vault-bolt--right { right: 10px; top: calc(50% - 2.5px); transform: rotate(90deg); }
.otp-vault-bolt--bottom { bottom: 10px; left: calc(50% - 9.5px); }
.otp-vault-bolt--left { left: 10px; top: calc(50% - 2.5px); transform: rotate(90deg); }
.otp-vault-scan-line {
  position: absolute; z-index: 5; top: 18px; left: 18px; right: 18px; height: 1px; pointer-events: none;
  background: #72f0fc; box-shadow: 0 0 8px 2px rgba(34,211,238,.48);
  animation: otpVaultScan 1.75s ease-in-out infinite;
}
.otp-vault-success-mark {
  position: absolute; z-index: 6; top: 50%; left: 50%; display: grid; width: 43px; height: 43px; place-items: center;
  color: #07241d; border: 1px solid rgba(187,247,208,.8); border-radius: 50%;
  background: linear-gradient(145deg, #a7f3d0, #34d399);
  box-shadow: 0 0 0 5px rgba(52,211,153,.12), 0 0 28px rgba(52,211,153,.42);
  opacity: 0; transform: translate(-50%, -50%) scale(.45); transition: opacity .25s ease;
}
.otp-vault-animation.is-success .otp-vault-door { transform: perspective(560px) rotateY(-62deg) translateX(7px); border-color: #7093a2; opacity: .72; }
.otp-vault-animation.is-success .otp-vault-door-track,
.otp-vault-animation.is-success .otp-vault-dial,
.otp-vault-animation.is-success .otp-vault-scan-line { animation: none; opacity: 0; }
.otp-vault-animation.is-success .otp-vault-bolt--top { transform: translateY(-13px); opacity: .4; }
.otp-vault-animation.is-success .otp-vault-bolt--right { transform: rotate(90deg) translateY(-13px); opacity: .4; }
.otp-vault-animation.is-success .otp-vault-bolt--bottom { transform: translateY(13px); opacity: .4; }
.otp-vault-animation.is-success .otp-vault-bolt--left { transform: rotate(90deg) translateY(13px); opacity: .4; }
.otp-vault-animation.is-success .otp-vault-success-mark { opacity: 1; animation: otpVaultCheckIn .46s cubic-bezier(.2,.8,.2,1) both; }
.otp-vault-animation.is-success .otp-vault-halo {
  border-color: rgba(52,211,153,.42); box-shadow: 0 0 34px rgba(52,211,153,.2), inset 0 0 18px rgba(52,211,153,.1); animation: none;
}
.otp-vault-copy { position: relative; }
.otp-vault-kicker { display: flex; align-items: center; justify-content: center; gap: 7px; color: #8ce5f0; font-size: 10px; font-weight: 800; letter-spacing: .17em; }
.otp-vault-animation.is-success .otp-vault-kicker { color: #86efac; }
.otp-vault-live-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 9px currentColor; animation: otpVaultPulse 1.2s ease-in-out infinite; }
.otp-vault-animation.is-success .otp-vault-live-dot { animation: none; }
.otp-vault-title { margin-top: 6px; color: #f2fbff; font-size: 14px; font-weight: 750; letter-spacing: -.015em; }
.otp-vault-description { margin-top: 3px; color: #a9bdc9; font-size: 11px; line-height: 1.5; }
.otp-vault-progress { height: 3px; max-width: 220px; margin: 12px auto 0; overflow: hidden; border-radius: 999px; background: rgba(148, 188, 203, .16); }
.otp-vault-progress-fill { display: block; width: 32%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #22d3ee, #a5f3fc); box-shadow: 0 0 10px rgba(34,211,238,.35); animation: otpVaultProgress 1.45s ease-in-out infinite; }
.otp-vault-animation.is-success .otp-vault-progress-fill { width: 100%; background: linear-gradient(90deg, #34d399, #bbf7d0); animation: none; }
@media (prefers-reduced-motion: reduce) {
  .otp-vault-animation *, .otp-vault-animation *::before, .otp-vault-animation *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important;
  }
}
`;

export const OtpVaultAnimation: React.FC<OtpVaultAnimationProps> = ({ status, compact = false }) => {
  const isSuccess = status === 'success';
  const isReady = status === 'ready';

  return (
    <section
      className={
        'otp-vault-animation' +
        (isSuccess ? ' is-success' : '') +
        (compact ? ' is-compact' : '')
      }
      role="status"
      aria-live="polite"
      aria-label={isSuccess ? 'OTP verified successfully' : 'Verifying OTP'}
    >
      <style>{vaultStyles}</style>
      <div className="otp-vault-backdrop" aria-hidden="true" />
      <div className="otp-vault-scene" aria-hidden="true">
        <div className="otp-vault-halo" />
        <div className="otp-vault-shell">
          <span className="otp-vault-bolt otp-vault-bolt--top" />
          <span className="otp-vault-bolt otp-vault-bolt--right" />
          <span className="otp-vault-bolt otp-vault-bolt--bottom" />
          <span className="otp-vault-bolt otp-vault-bolt--left" />
          <div className="otp-vault-door">
            <div className="otp-vault-door-track" />
            <div className="otp-vault-dial" />
            {!isSuccess && (
              <div className="otp-vault-lockmark">
                <LockKeyhole size={15} strokeWidth={2.4} />
              </div>
            )}
          </div>
          <div className="otp-vault-scan-line" />
          <div className="otp-vault-success-mark">
            <Check size={25} strokeWidth={3.2} />
          </div>
        </div>
      </div>
      <div className="otp-vault-copy">
        <div className="otp-vault-kicker">
          <span className="otp-vault-live-dot" />
          {isSuccess ? 'VERIFIED & UNLOCKED' : isReady ? 'VAULT ARMED' : 'AUTHENTICATING'}
        </div>
        <p className="otp-vault-title">
          {isSuccess ? 'Identity confirmed' : isReady ? 'Ready for secure verification' : 'Securing your connection'}
        </p>
        <p className="otp-vault-description">
          {isSuccess
            ? 'The vault is open. You are cleared to continue.'
            : isReady
            ? 'Enter your 6-digit code and verify to unlock secure access.'
            : 'Checking your code and releasing the security lock…'}
        </p>
      </div>
      <div className="otp-vault-progress" aria-hidden="true">
        <span className="otp-vault-progress-fill" />
      </div>
    </section>
  );
};
