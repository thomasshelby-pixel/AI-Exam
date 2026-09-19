import React, { useState, useEffect } from 'react';
import { VALID_ICAI_REGIONS, IcaiRegion, validateSrn, parseSrn, normalizeSrn } from '../../utils/srnValidator';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';

interface SrnInputFieldProps {
  id?: string;
  value: string;
  onChange: (fullSrn: string) => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  showHelperText?: boolean;
  error?: string;
}

export const SrnInputField: React.FC<SrnInputFieldProps> = ({
  id = 'icai-srn-input',
  value,
  onChange,
  required = true,
  disabled = false,
  label = 'ICAI Student Registration Number (SRN)',
  showHelperText = true,
  error: externalError,
}) => {
  const [selectedRegion, setSelectedRegion] = useState<IcaiRegion | ''>('CRO');
  const [digits, setDigits] = useState<string>('');
  const [isTouched, setIsTouched] = useState(false);

  // Sync internal split state from incoming value
  useEffect(() => {
    if (!value) {
      setDigits('');
      return;
    }
    const parsed = parseSrn(value);
    if (parsed.region) {
      setSelectedRegion(parsed.region);
    }
    setDigits(parsed.digits);
  }, [value]);

  const validation = validateSrn(value);

  const handleRegionChange = (newRegion: IcaiRegion) => {
    setSelectedRegion(newRegion);
    const combined = newRegion + digits;
    onChange(combined);
  };

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // Check if user pasted a full 10-character SRN into the digits field
    const normalizedRaw = normalizeSrn(rawVal);
    const candidatePrefix = normalizedRaw.substring(0, 3) as IcaiRegion;
    if (VALID_ICAI_REGIONS.includes(candidatePrefix)) {
      setSelectedRegion(candidatePrefix);
      const parsedDigits = normalizedRaw.substring(3).replace(/[^0-9]/g, '').slice(0, 7);
      setDigits(parsedDigits);
      onChange(candidatePrefix + parsedDigits);
      return;
    }

    // Otherwise treat as numeric portion (max 7 digits)
    const cleanedDigits = rawVal.replace(/[^0-9]/g, '').slice(0, 7);
    setDigits(cleanedDigits);
    const region = selectedRegion || 'CRO';
    onChange(region + cleanedDigits);
  };

  const displayError = externalError || (isTouched && value && !validation.isValid ? validation.error : '');

  return (
    <div className="space-y-1.5 text-left">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <span className="text-[10px] text-slate-400 font-mono">10 Characters</span>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Regional Office Dropdown */}
        <div className="w-28 shrink-0">
          <select
            id={`${id}-region`}
            aria-label="Regional Office Prefix"
            disabled={disabled}
            value={selectedRegion}
            onChange={(e) => handleRegionChange(e.target.value as IcaiRegion)}
            className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold font-mono text-blue-700 dark:text-blue-300 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            {VALID_ICAI_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r} (Regional)
              </option>
            ))}
          </select>
        </div>

        {/* 7-digit Number Field starting with 0 */}
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            required={required}
            placeholder="0XXXXXX (7 digits)"
            value={digits}
            onChange={handleDigitsChange}
            onBlur={() => setIsTouched(true)}
            maxLength={7}
            className={`w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border font-mono tracking-wider text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-800 ${
              displayError
                ? 'border-rose-400 focus:border-rose-600'
                : validation.isValid
                ? 'border-emerald-400 focus:border-emerald-600'
                : 'border-slate-200 dark:border-slate-700 focus:border-blue-600'
            } disabled:opacity-60`}
          />
          {validation.isValid && (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute right-3 top-2.5" />
          )}
        </div>
      </div>

      {/* Helper text & validation notice */}
      {showHelperText && (
        <div className="space-y-1 pt-0.5">
          {displayError ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{displayError}</span>
            </p>
          ) : validation.isValid ? (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Format valid as per ICAI 10-character standard ({validation.normalized})</span>
            </p>
          ) : (
            <div className="flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Enter your Student Registration Number exactly as recorded in your ICAI SSP records (e.g. NRO0XXXXXX / WRO0XXXXXX).
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
