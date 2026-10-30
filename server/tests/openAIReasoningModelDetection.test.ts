import { isOpenAIReasoningModel } from '../models/modelRegistry.js';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}

assert(isOpenAIReasoningModel('gpt-6-astra'), 'Astra is classified as a reasoning model');
assert(isOpenAIReasoningModel('gpt-5.6-sol'), 'Sol is classified as a reasoning model');
assert(isOpenAIReasoningModel('gpt-5.6-terra'), 'Terra retains its configured reasoning compatibility');
assert(isOpenAIReasoningModel('o3-mini'), 'OpenAI o-series reasoning models are classified');
assert(!isOpenAIReasoningModel('gpt-4.1'), 'Standard chat model is not classified as reasoning');
console.log('OpenAI reasoning model detection tests passed.');
