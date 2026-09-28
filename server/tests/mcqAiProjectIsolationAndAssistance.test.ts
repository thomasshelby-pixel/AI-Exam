import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getMcqAiModel,
  isMcqAiConfigured,
  getMcqAiStatus,
  getMcqAiAuditMetrics,
  applyOptionalAiAssistance,
} from '../services/mcqAiService.js';
import {
  parseMaterialTextDeterministic,
  ExtractedQuestionDraft,
} from '../services/mcqDeterministicParser.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ ARENA SEPARATE AI PROJECT & ISOLATION AUDIT ---');
console.log('========================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passedTests++;
          console.log(`[PASS] Test ${totalTests}: ${name}`);
        })
        .catch((err) => {
          console.error(`[FAIL] Test ${totalTests}: ${name}`, err);
          throw err;
        });
    }
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`, err);
    throw err;
  }
}

async function runAllTests() {
  console.log('>>> SECTION 1: ARCHITECTURAL & PROJECT ISOLATION');

  // Test 1: Checker AI Configuration Untouched & Preserved
  runTest('Test 1: CA Exam Checker uses its own independent GEMINI_API_KEY and gemini.ts', () => {
    const checkerCode = fs.readFileSync(path.resolve(process.cwd(), 'server', 'gemini.ts'), 'utf-8');
    assert.ok(
      checkerCode.includes("process.env.GEMINI_API_KEY"),
      'Checker must continue reading GEMINI_API_KEY'
    );
    assert.ok(
      !checkerCode.includes("MCQ_GEMINI_API_KEY"),
      'Checker must NEVER read or know about MCQ_GEMINI_API_KEY'
    );
    assert.ok(
      !checkerCode.includes("mcqAiService"),
      'Checker must NEVER import mcqAiService'
    );
  });

  // Test 2: MCQ Arena uses dedicated MCQ_GEMINI_API_KEY and mcqAiService
  runTest('Test 2: MCQ Arena uses separate MCQ_GEMINI_API_KEY and mcqAiService', () => {
    const mcqAiCode = fs.readFileSync(path.resolve(process.cwd(), 'server', 'services', 'mcqAiService.ts'), 'utf-8');
    assert.ok(
      mcqAiCode.includes("process.env.MCQ_GEMINI_API_KEY"),
      'MCQ AI service must read process.env.MCQ_GEMINI_API_KEY'
    );
    assert.ok(
      !mcqAiCode.includes("process.env.GEMINI_API_KEY"),
      'MCQ AI service must NEVER read or fall back to Checker GEMINI_API_KEY'
    );
    assert.ok(
      !mcqAiCode.includes("from '../gemini.js'") && !mcqAiCode.includes("from './gemini.js'"),
      'MCQ AI service must NOT import Checker gemini.ts'
    );
  });

  // Test 3: API Key is strictly Server-Side Only
  runTest('Test 3: MCQ_GEMINI_API_KEY is strictly server-side (never in frontend code)', () => {
    const srcFiles = fs.readdirSync(path.resolve(process.cwd(), 'src'), { recursive: true }) as string[];
    for (const relPath of srcFiles) {
      if (typeof relPath === 'string' && (relPath.endsWith('.ts') || relPath.endsWith('.tsx'))) {
        const content = fs.readFileSync(path.resolve(process.cwd(), 'src', relPath), 'utf-8');
        assert.ok(
          !content.includes('MCQ_GEMINI_API_KEY'),
          `Client file src/${relPath} must not contain MCQ_GEMINI_API_KEY`
        );
        assert.ok(
          !content.includes('mcqAiService'),
          `Client file src/${relPath} must not import server-side mcqAiService`
        );
      }
    }
  });

  // Test 4: Model Configuration is dynamic and defaults to low-cost Flash-Lite
  runTest('Test 4: MCQ AI Model defaults to gemini-3.1-flash-lite and is configurable via env', () => {
    const originalModel = process.env.MCQ_AI_MODEL;
    delete process.env.MCQ_AI_MODEL;
    assert.strictEqual(getMcqAiModel(), 'gemini-3.1-flash-lite', 'Default model must be low-cost gemini-3.1-flash-lite');

    process.env.MCQ_AI_MODEL = 'gemini-flash-latest';
    assert.strictEqual(getMcqAiModel(), 'gemini-flash-latest', 'Model must be configurable via MCQ_AI_MODEL');

    if (originalModel) {
      process.env.MCQ_AI_MODEL = originalModel;
    } else {
      delete process.env.MCQ_AI_MODEL;
    }
  });

  // Test 5: Status report confirms project isolation
  runTest('Test 5: getMcqAiStatus confirms Checker is untouched and server-side safety', () => {
    const status = getMcqAiStatus();
    assert.strictEqual(status.checkerAiUntouched, true, 'Checker AI must be confirmed untouched');
    assert.strictEqual(status.isServerSideOnly, true, 'Must be server-side only');
    assert.strictEqual(typeof status.configured, 'boolean');
    assert.strictEqual(status.model, 'gemini-3.1-flash-lite');
  });

  console.log('>>> SECTION 2: DETERMINISTIC FIRST & ZERO AI FOR COMPLETE QUESTIONS');

  // Test 6: Complete questions require ZERO AI calls
  await runTest('Test 6: Questions with complete answers and explanations trigger ZERO AI calls', async () => {
    const rawSample = `
1. What is the fundamental accounting equation?
(A) Assets = Liabilities + Capital
(B) Assets = Liabilities - Capital
(C) Assets + Liabilities = Capital
(D) Capital = Assets + Liabilities
Answer: (A)
Explanation: The fundamental accounting equation is Assets = Liabilities + Capital as per accounting principles.
Ref: Chapter 1
`;
    const parsed = parseMaterialTextDeterministic({
      rawText: rawSample,
      course: 'CA_FOUNDATION',
      subject: 'Accounting',
      sourceCategory: 'ICAI Module',
      materialName: 'Test Complete Accounting',
    });

    assert.strictEqual(parsed.totalDetected, 1);
    assert.strictEqual(parsed.questions[0].correctAnswer, 'A');
    assert.strictEqual(parsed.questions[0].explanationSource, 'SOURCE');

    // Apply optional AI assistance
    const result = await applyOptionalAiAssistance({
      questions: parsed.questions,
      rawText: rawSample,
      course: 'CA_FOUNDATION',
      subject: 'Accounting',
      enableAi: true,
    });

    assert.strictEqual(result.aiAssistedCount, 0, 'No AI calls should be made when source explanation is present');
    assert.strictEqual(result.sourceExtractedCount, 1, 'Source explanation must be preserved');
    assert.strictEqual(result.questions[0].explanationSource, 'SOURCE');
  });

  // Test 7: AI Assistance OFF produces 100% Rule-Based output
  await runTest('Test 7: enableAi: false produces 100% Rule-Based output without any AI calls', async () => {
    const rawMissingExp = `
1. Consideration under Section 2(d) of Indian Contract Act may move from:
(A) Promisee only
(B) Any third party
(C) Either the promisee or any other person
(D) Stranger to the contract only
Answer: C
`;
    const parsed = parseMaterialTextDeterministic({
      rawText: rawMissingExp,
      course: 'CA_FOUNDATION',
      subject: 'Business Laws',
      sourceCategory: 'RTP',
      materialName: 'Test Laws RTP',
    });

    assert.strictEqual(parsed.totalDetected, 1);
    assert.strictEqual(parsed.questions[0].correctAnswer, 'C');

    const result = await applyOptionalAiAssistance({
      questions: parsed.questions,
      rawText: rawMissingExp,
      course: 'CA_FOUNDATION',
      subject: 'Business Laws',
      enableAi: false, // OFF
    });

    assert.strictEqual(result.aiAssistedCount, 0);
    assert.strictEqual(result.aiExplanationDraftCount, 0);
    assert.ok(result.aiAuditNotes[0].includes('100% Rule-Based Processing'));
  });

  // Test 8: Unconfigured AI key gracefully falls back without failing the upload
  await runTest('Test 8: Unconfigured MCQ Gemini API key falls back gracefully with zero crashes', async () => {
    const originalKey = process.env.MCQ_GEMINI_API_KEY;
    delete process.env.MCQ_GEMINI_API_KEY;

    assert.strictEqual(isMcqAiConfigured(), false);

    const questions: ExtractedQuestionDraft[] = [
      {
        id: 'test_q_1',
        tempId: 'temp_1',
        course: 'CA_FOUNDATION',
        subject: 'Accounting',
        chapter: 'Inventories',
        topic: 'Valuation',
        questionType: 'normal',
        difficulty: 'moderate',
        source: 'MTP',
        questionText: 'Inventories are valued at cost or NRV whichever is lower as per:',
        optionA: 'AS 1',
        optionB: 'AS 2',
        optionC: 'AS 9',
        optionD: 'AS 10',
        correctAnswer: 'B',
        explanation: '',
        reference: '',
        sourceMaterialName: 'Test Mat',
        isDuplicate: false,
        needsReview: false,
        validationErrors: [],
      },
    ];

    const result = await applyOptionalAiAssistance({
      questions,
      rawText: '',
      course: 'CA_FOUNDATION',
      subject: 'Accounting',
      enableAi: true,
    });

    assert.strictEqual(result.aiAssistedCount, 0);
    assert.ok(result.aiAuditNotes[0].includes('MCQ AI is not configured'));
    assert.strictEqual(result.questions[0].correctAnswer, 'B', 'Original answer must remain intact');

    if (originalKey) {
      process.env.MCQ_GEMINI_API_KEY = originalKey;
    }
  });

  console.log('>>> SECTION 3: COST CONTROLS, SAFETY LIMITS & TELEMETRY');

  // Test 9: Safety limits are configured properly
  runTest('Test 9: Configurable safety limits (job budget, batch size, retries, timeout)', () => {
    const status = getMcqAiStatus();
    assert.ok(status.maxQuestionsPerJob >= 10 && status.maxQuestionsPerJob <= 500);
    assert.ok(status.maxBatchSize >= 5 && status.maxBatchSize <= 50);
    assert.ok(status.maxRetries >= 1 && status.maxRetries <= 5);
    assert.ok(status.timeoutMs >= 5000);
  });

  // Test 10: Audit metrics are tracked in memory without secret exposure
  runTest('Test 10: Audit metrics track task counts and cache hits without secrets', () => {
    const metrics = getMcqAiAuditMetrics();
    assert.ok('totalRequests' in metrics);
    assert.ok('successfulRequests' in metrics);
    assert.ok('failedRequests' in metrics);
    assert.ok('taskCounts' in metrics);
    assert.ok('cacheHits' in metrics);
    const jsonStr = JSON.stringify(metrics);
    assert.ok(!jsonStr.includes('AIza'), 'Metrics must not expose credentials');
  });

  console.log('========================================================================');
  console.log(`MCQ ARENA AI ISOLATION TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log('========================================================================');
}

runAllTests().catch((err) => {
  console.error('Fatal error during MCQ AI test suite:', err);
  process.exit(1);
});
