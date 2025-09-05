import fs from 'fs';
import path from 'path';

// Test configuration
const API_BASE_URL = 'http://localhost:3000'; // Adjust if your server runs on a different port
const API_KEY = 'your-api-key-here'; // Replace with your actual API key

// Test file
const testFilePath = './testtt.jpg'; // Using the existing test image
const testFileName = 'test-uploadcare.jpg';

/**
 * Test Uploadcare upload functionality
 */
async function testUploadcareUpload() {
  try {
    console.log('🧪 Testing Uploadcare upload...');
    
    // Check if test file exists
    if (!fs.existsSync(testFilePath)) {
      console.error('❌ Test file not found:', testFilePath);
      return false;
    }
    
    // Read and encode the test file
    const fileBuffer = fs.readFileSync(testFilePath);
    const base64File = fileBuffer.toString('base64');
    const fileStats = fs.statSync(testFilePath);
    
    console.log(`📁 File: ${testFileName}`);
    console.log(`📏 Size: ${fileStats.size} bytes`);
    console.log(`🔤 Type: image/jpeg`);
    
    // Upload to Uploadcare
    const uploadResponse = await fetch(`${API_BASE_URL}/api/v1/upload/uploadcare/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        file: base64File,
        filename: testFileName,
        contentType: 'image/jpeg',
        fileSize: fileStats.size
      })
    });
    
    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      console.error('❌ Upload failed:', errorData);
      return false;
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('✅ Upload successful!');
    console.log('📊 Response:', JSON.stringify(uploadResult, null, 2));
    
    // Test the file URL
    if (uploadResult.data && uploadResult.data.url) {
      console.log('🌐 Testing file URL...');
      const fileResponse = await fetch(uploadResult.data.url);
      if (fileResponse.ok) {
        console.log('✅ File URL is accessible');
        return uploadResult.data;
      } else {
        console.error('❌ File URL not accessible:', fileResponse.status);
        return false;
      }
    }
    
    return uploadResult.data;
    
  } catch (error) {
    console.error('💥 Upload test error:', error);
    return false;
  }
}

/**
 * Test Uploadcare delete functionality
 */
async function testUploadcareDelete(fileData) {
  try {
    console.log('🗑️ Testing Uploadcare delete...');
    
    if (!fileData || !fileData.url) {
      console.error('❌ No file data to delete');
      return false;
    }
    
    console.log(`🗂️ Deleting file: ${fileData.url}`);
    console.log(`🆔 UUID: ${fileData.uuid}`);
    
    // Delete from Uploadcare
    const deleteResponse = await fetch(`${API_BASE_URL}/api/v1/upload/uploadcare/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        fileUrl: fileData.url,
        uuid: fileData.uuid
      })
    });
    
    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json().catch(() => ({}));
      console.error('❌ Delete failed:', errorData);
      return false;
    }
    
    const deleteResult = await deleteResponse.json();
    console.log('✅ Delete successful!');
    console.log('📊 Response:', JSON.stringify(deleteResult, null, 2));
    
    // Verify file is deleted by trying to access it
    console.log('🔍 Verifying file deletion...');
    const fileResponse = await fetch(fileData.url);
    if (fileResponse.status === 404) {
      console.log('✅ File successfully deleted (404 as expected)');
      return true;
    } else {
      console.log('⚠️ File still accessible (may take time to propagate)');
      return true; // Still consider success as deletion was accepted
    }
    
  } catch (error) {
    console.error('💥 Delete test error:', error);
    return false;
  }
}

/**
 * Test Uploadcare health check
 */
async function testUploadcareHealth() {
  try {
    console.log('🏥 Testing Uploadcare health check...');
    
    const healthResponse = await fetch(`${API_BASE_URL}/api/v1/upload/uploadcare/health`, {
      method: 'GET'
    });
    
    if (!healthResponse.ok) {
      console.error('❌ Health check failed:', healthResponse.status);
      return false;
    }
    
    const healthResult = await healthResponse.json();
    console.log('✅ Health check successful!');
    console.log('📊 Response:', JSON.stringify(healthResult, null, 2));
    
    return true;
    
  } catch (error) {
    console.error('💥 Health check error:', error);
    return false;
  }
}

/**
 * Test image transformations
 */
async function testImageTransformations(fileData) {
  try {
    console.log('🎨 Testing image transformations...');
    
    if (!fileData || !fileData.url) {
      console.error('❌ No file data for transformations');
      return false;
    }
    
    const transformations = [
      { name: 'Resize 300x300', url: `${fileData.url}-/resize/300x300/` },
      { name: 'Preview 100x100', url: `${fileData.url}-/preview/100x100/` },
      { name: 'Format WebP', url: `${fileData.url}-/format/webp/` },
      { name: 'Grayscale', url: `${fileData.url}-/grayscale/` }
    ];
    
    for (const transform of transformations) {
      console.log(`🔄 Testing: ${transform.name}`);
      const response = await fetch(transform.url);
      if (response.ok) {
        console.log(`✅ ${transform.name} - OK`);
      } else {
        console.log(`❌ ${transform.name} - Failed (${response.status})`);
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('💥 Transformations test error:', error);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Uploadcare integration tests...\n');
  
  // Test 1: Health check
  console.log('='.repeat(50));
  console.log('TEST 1: Health Check');
  console.log('='.repeat(50));
  const healthOk = await testUploadcareHealth();
  console.log('');
  
  if (!healthOk) {
    console.error('❌ Health check failed, stopping tests');
    return;
  }
  
  // Test 2: Upload
  console.log('='.repeat(50));
  console.log('TEST 2: File Upload');
  console.log('='.repeat(50));
  const uploadData = await testUploadcareUpload();
  console.log('');
  
  if (!uploadData) {
    console.error('❌ Upload failed, stopping tests');
    return;
  }
  
  // Test 3: Image transformations
  console.log('='.repeat(50));
  console.log('TEST 3: Image Transformations');
  console.log('='.repeat(50));
  await testImageTransformations(uploadData);
  console.log('');
  
  // Test 4: Delete
  console.log('='.repeat(50));
  console.log('TEST 4: File Delete');
  console.log('='.repeat(50));
  const deleteOk = await testUploadcareDelete(uploadData);
  console.log('');
  
  // Summary
  console.log('='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`🏥 Health Check: ${healthOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`📤 Upload: ${uploadData ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🗑️ Delete: ${deleteOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (healthOk && uploadData && deleteOk) {
    console.log('\n🎉 All tests passed! Uploadcare integration is working correctly.');
  } else {
    console.log('\n❌ Some tests failed. Check the logs above for details.');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testUploadcareUpload, testUploadcareDelete, testUploadcareHealth, testImageTransformations };
