import fs from 'node:fs';
import path from 'node:path';

function parseSimpleYaml(content: string) {
  const lines = content.split('\n');
  const result: Record<string, any> = {};
  let currentTopKey = '';
  let currentList: any[] | null = null;
  let currentObj: Record<string, any> | null = null;
  let inAvailabilityList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const indent = rawLine.search(/\S/);

    if (indent === 0 && line.endsWith(':')) {
      currentTopKey = line.replace(':', '').trim();
      currentList = null;
      currentObj = null;
      inAvailabilityList = false;
      if (currentTopKey === 'env') {
        result[currentTopKey] = [];
        currentList = result[currentTopKey];
      } else {
        result[currentTopKey] = {};
        currentObj = result[currentTopKey];
      }
      continue;
    }

    if (currentTopKey === 'runConfig' && currentObj) {
      const [k, ...v] = line.split(':');
      if (k && v.length > 0) {
        currentObj[k.trim()] = v.join(':').trim();
      }
    } else if (currentTopKey === 'env' && currentList) {
      if (line.startsWith('- variable:')) {
        inAvailabilityList = false;
        const varName = line.replace('- variable:', '').trim();
        const newEntry: Record<string, any> = { variable: varName };
        currentList.push(newEntry);
      } else if (line.startsWith('value:')) {
        inAvailabilityList = false;
        const lastEntry = currentList[currentList.length - 1];
        if (lastEntry) lastEntry.value = line.replace('value:', '').trim().replace(/^['"]|['"]$/g, '');
      } else if (line.startsWith('secret:')) {
        inAvailabilityList = false;
        const lastEntry = currentList[currentList.length - 1];
        if (lastEntry) lastEntry.secret = line.replace('secret:', '').trim();
      } else if (line.startsWith('availability:')) {
        inAvailabilityList = true;
        const lastEntry = currentList[currentList.length - 1];
        if (lastEntry) lastEntry.availability = [];
      } else if (line.startsWith('- ') && inAvailabilityList) {
        const lastEntry = currentList[currentList.length - 1];
        if (lastEntry && Array.isArray(lastEntry.availability)) {
          lastEntry.availability.push(line.replace('- ', '').trim());
        }
      }
    }
  }

  return result;
}

export function validateAppHostingConfig(filePath: string) {
  console.log(`[Validator] Validating: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseSimpleYaml(rawContent);
  console.log('[Validator] Parsed Structure:', JSON.stringify(parsed, null, 2));

  // 1. Check supported top-level keys only
  const SUPPORTED_TOP_LEVEL = new Set(['runConfig', 'env']);
  for (const key of Object.keys(parsed)) {
    if (!SUPPORTED_TOP_LEVEL.has(key)) {
      throw new Error(`Invalid top-level property '${key}' in apphosting.yaml. Supported properties are: ${Array.from(SUPPORTED_TOP_LEVEL).join(', ')}`);
    }
  }

  // 2. Validate runConfig
  if (parsed.runConfig) {
    const SUPPORTED_RUN_CONFIG = new Set(['cpu', 'memoryMiB', 'maxInstances', 'minInstances', 'concurrency', 'vpcAccess']);
    for (const key of Object.keys(parsed.runConfig)) {
      if (!SUPPORTED_RUN_CONFIG.has(key)) {
        throw new Error(`Invalid runConfig property '${key}'. Supported: ${Array.from(SUPPORTED_RUN_CONFIG).join(', ')}`);
      }
    }
  }

  // 3. Validate env
  if (parsed.env) {
    if (!Array.isArray(parsed.env)) {
      throw new Error(`'env' must be a list of environment variable objects.`);
    }

    const RESERVED_NAMES = new Set(['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']);
    const seenNames = new Set<string>();

    for (const entry of parsed.env) {
      if (!entry.variable || typeof entry.variable !== 'string') {
        throw new Error(`Environment variable missing or empty 'variable' name.`);
      }
      if (entry.variable.includes('=')) {
        throw new Error(`Environment variable name '${entry.variable}' contains '=' which is invalid.`);
      }
      if (RESERVED_NAMES.has(entry.variable)) {
        throw new Error(`Reserved environment variable '${entry.variable}' cannot be configured in apphosting.yaml.`);
      }
      if (seenNames.has(entry.variable)) {
        throw new Error(`Duplicate environment variable '${entry.variable}'.`);
      }
      seenNames.add(entry.variable);

      if (entry.availability) {
        if (!Array.isArray(entry.availability)) {
          throw new Error(`'availability' for '${entry.variable}' must be a list.`);
        }
        const VALID_AVAILABILITY = new Set(['BUILD', 'RUNTIME']);
        for (const avail of entry.availability) {
          if (!VALID_AVAILABILITY.has(avail)) {
            throw new Error(`Invalid availability value '${avail}' for '${entry.variable}'. Allowed values are 'BUILD' or 'RUNTIME'.`);
          }
        }
      }
    }
  }

  console.log('[Validator] apphosting.yaml validation PASSED with 0 errors.');
  return true;
}

try {
  const filePath = path.resolve(process.cwd(), 'apphosting.yaml');
  validateAppHostingConfig(filePath);
} catch (e: any) {
  console.error('[Validator Error]', e.message);
  process.exit(1);
}
