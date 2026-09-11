import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

EventEmitter.defaultMaxListeners = 100;
import {
  downloadFileFromCloudStorage,
  deleteFileFromCloudStorage,
  inspectCloudStorageStatus,
  getStorageBucket,
} from '../services/firebaseCloudStorageService.js';
import {
  savePersistentFile,
  getPersistentFile,
  deleteEvaluationCloudFiles,
} from '../services/persistentStorageService.js';
import { getFirestoreDoc } from '../services/firestoreDbService.js';

export async function runEndToEndPersistenceTest() {
  console.log('===============================================================');
  console.log('=== STARTING ENTERPRISE CLOUD STORAGE PERSISTENCE TEST ===');
  console.log('===============================================================\n');

  // Step 0: Probe privileged Cloud Storage access
  console.log('[Step 0] Probing privileged Cloud Storage status...');
  const probe = await inspectCloudStorageStatus();
  console.log('Probe Result:', JSON.stringify(probe, null, 2));

  if (!probe.enabled) {
    console.error('\n[HALT] Privileged Cloud Storage is not yet accessible:');
    console.error('Status:', probe.status);
    console.error('Details:', probe.details);
    console.error('Service Account:', probe.serviceAccountEmail);
    return {
      success: false,
      reason: probe.details,
      status: probe.status,
      serviceAccountEmail: probe.serviceAccountEmail,
    };
  }

  // Step 1: Generate an authentic test evaluation PDF using pdf-lib
  console.log('\n[Step 1] Creating a real test evaluation PDF with pdf-lib...');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const textFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('ICAI CA EXAM EVALUATION - PERSISTENCE TEST', {
    x: 50,
    y: 740,
    size: 16,
    font,
    color: rgb(0.1, 0.2, 0.6),
  });

  page.drawText(`Test Run Timestamp: ${new Date().toISOString()}`, {
    x: 50,
    y: 700,
    size: 11,
    font: textFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawText('This document validates:', {
    x: 50,
    y: 660,
    size: 11,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('1. Pure Firebase Cloud Storage binary persistence (no Firestore chunking)', {
    x: 70,
    y: 635,
    size: 10,
    font: textFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('2. Firestore metadata synchronization (/file_storage_metadata)', {
    x: 70,
    y: 615,
    size: 10,
    font: textFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('3. Bit-for-bit SHA-256 integrity verification across cold restarts', {
    x: 70,
    y: 595,
    size: 10,
    font: textFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('4. Zero public exposure (storage.rules default-deny, server-side RBAC only)', {
    x: 70,
    y: 575,
    size: 10,
    font: textFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const originalChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  console.log(`Generated PDF size: ${pdfBuffer.length} bytes`);
  console.log(`Original SHA-256 Checksum: ${originalChecksum}`);

  const testEvaluationId = `eval_test_${Date.now()}`;
  const testStudentId = 'usr_student_test_001';
  const testFilename = `${testEvaluationId}_checked_copy.pdf`;

  // Step 2: Upload to Cloud Storage via persistentStorageService
  console.log('\n[Step 2] Uploading PDF to Firebase Cloud Storage via server-side service...');
  const uploadResult = await savePersistentFile(
    `${testEvaluationId}_checked_copy`,
    testFilename,
    'application/pdf',
    pdfBuffer,
    'EVALUATION_CHECKED_COPY',
    {
      ownerUserId: testStudentId,
      evaluationId: testEvaluationId,
      instituteId: null,
    }
  );

  console.log('Upload Result:', JSON.stringify(uploadResult, null, 2));

  if (uploadResult.status !== 'ACTIVE') {
    throw new Error(`Cloud Storage upload failed: status is ${uploadResult.status}, error: ${uploadResult.errorMessage}`);
  }

  // Step 3: Verify existence directly in Google Cloud Storage
  console.log('\n[Step 3] Verifying object exists directly in Cloud Storage bucket...');
  const bucket = getStorageBucket();
  const fileRef = bucket.file(uploadResult.storagePath);
  const [exists] = await fileRef.exists();
  if (!exists) {
    throw new Error(`Object not found in Cloud Storage bucket at path: ${uploadResult.storagePath}`);
  }
  console.log('✅ Verified: Object confirmed physically present in Cloud Storage bucket at path:', uploadResult.storagePath);

  // Step 4: Verify Firestore Metadata Record
  console.log('\n[Step 4] Verifying Firestore metadata record (/file_storage_metadata)...');
  const metadata = await getFirestoreDoc('file_storage_metadata', `${testEvaluationId}_checked_copy`);
  console.log('Retrieved Metadata from Firestore:', JSON.stringify(metadata, null, 2));

  if (!metadata) {
    throw new Error('Firestore metadata document was not created!');
  }
  console.log('✅ Verified: Lightweight structured metadata successfully synchronized in Cloud Firestore.');

  // Step 5: Verify immediate retrieval through the application
  console.log('\n[Step 5] Retrieving file through the application service layer...');
  const retrievedImmediate = await getPersistentFile(`${testEvaluationId}_checked_copy`);
  if (!retrievedImmediate || !retrievedImmediate.buffer) {
    throw new Error('Failed to retrieve file through getPersistentFile');
  }
  console.log('✅ Verified: File successfully retrieved through application service.');

  // Step 6: Simulate cold restart / laptop restart by wiping all local cache copies
  console.log('\n[Step 6] Simulating cold restart / local wipe to test Cloud Storage persistence...');
  const localCachePaths = [
    path.join(process.cwd(), 'uploads', testFilename),
    path.join(process.cwd(), 'data', 'uploads', testFilename),
    path.join(process.cwd(), 'uploads', `${testEvaluationId}_checked_copy.pdf`),
    path.join(process.cwd(), 'data', 'uploads', `${testEvaluationId}_checked_copy.pdf`),
  ];
  for (const p of localCachePaths) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        console.log(`Purged local cache file: ${p}`);
      } catch (err) {
        console.warn(`Warning clearing local cache ${p}:`, err);
      }
    }
  }

  // Step 7: Retrieve again after local wipe (proves cold restore from Cloud Storage)
  console.log('\n[Step 7] Retrieving file after local wipe (cold restoration from Cloud Storage)...');
  const retrievedCold = await getPersistentFile(`${testEvaluationId}_checked_copy`);
  if (!retrievedCold || !retrievedCold.buffer) {
    throw new Error('Cold retrieval from Cloud Storage failed! File was not restored.');
  }
  console.log(`✅ Successfully restored from Cloud Storage! Restored size: ${retrievedCold.buffer.length} bytes`);

  // Step 8: Verify bit-for-bit SHA-256 integrity
  console.log('\n[Step 8] Verifying bit-for-bit SHA-256 cryptographic checksum...');
  const restoredChecksum = crypto.createHash('sha256').update(retrievedCold.buffer).digest('hex');
  console.log(`Original SHA-256: ${originalChecksum}`);
  console.log(`Restored SHA-256: ${restoredChecksum}`);

  if (originalChecksum !== restoredChecksum) {
    throw new Error(`SHA-256 Checksum mismatch! Original: ${originalChecksum}, Restored: ${restoredChecksum}`);
  }
  console.log('✅ SHA-256 Checksum MATCHES 100% BIT-FOR-BIT!');

  // Step 9: Delete file through authorized application flow
  console.log('\n[Step 9] Deleting evaluation through authorized application flow...');
  const deleteCount = await deleteEvaluationCloudFiles(testEvaluationId);
  console.log(`Purged evaluation files count: ${deleteCount}`);

  // Step 10: Verify object is permanently deleted from Cloud Storage
  console.log('\n[Step 10] Verifying object is permanently deleted from Cloud Storage...');
  const [postDeleteExists] = await fileRef.exists();
  if (postDeleteExists) {
    throw new Error(`Object still exists in Cloud Storage after deletion! Path: ${uploadResult.storagePath}`);
  }
  console.log('✅ Verified: Object is confirmed permanently DELETED from Cloud Storage bucket.');

  // Step 11: Wipe local cache again and verify deleted file does NOT reappear after restart
  console.log('\n[Step 11] Verifying deleted file does NOT reappear after restart/cold retrieval...');
  for (const p of localCachePaths) {
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }

  const postDeleteRetrieval = await getPersistentFile(`${testEvaluationId}_checked_copy`);
  if (postDeleteRetrieval !== null) {
    throw new Error('Deleted file reappeared or was unexpectedly restored after deletion!');
  }
  console.log('✅ Verified: Deleted file correctly returns null and does not reappear.');

  console.log('\n===============================================================');
  console.log('=== ALL ENTERPRISE CLOUD STORAGE PERSISTENCE TESTS PASSED! ===');
  console.log('===============================================================\n');

  return {
    success: true,
    fileSize: pdfBuffer.length,
    checksum: originalChecksum,
    storagePath: uploadResult.storagePath,
    bucket: uploadResult.storageBucket,
    verifiedColdRestoration: true,
    verifiedBitForBitIntegrity: true,
    verifiedCleanDeletion: true,
  };
}

if (process.argv[1]?.endsWith('testE2ECloudStorage.ts')) {
  runEndToEndPersistenceTest()
    .then((res) => {
      console.log('Test completed with result:', res);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Test failed with exception:', err);
      process.exit(1);
    });
}
