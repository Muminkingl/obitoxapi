# 🚀 Uploadcare Provider - Complete Usage Guide

## Overview

The ObitoX SDK now supports **Uploadcare** as a storage provider with enterprise-grade features including:
- ✅ **Zero bandwidth cost** uploads
- ✅ **Malware scanning** with ClamAV
- ✅ **File validation** and moderation
- ✅ **SVG security** validation
- ✅ **Real-time progress** tracking
- ✅ **Developer token** architecture

## 🔑 Setup

### 1. Install the SDK
```bash
npm install @obitox/upload
```

### 2. Get Your Credentials
- **ObitoX API Key**: Get from your ObitoX dashboard
- **Uploadcare Public Key**: From your Uploadcare project settings
- **Uploadcare Secret Key**: From your Uploadcare project settings

### 3. Initialize the SDK
```javascript
import ObitoX from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'your_obitox_api_key',
  baseUrl: 'https://api.obitox.com' // or your custom endpoint
});

// Your Uploadcare credentials
const UPLOADCARE_PUBLIC_KEY = 'your_uploadcare_public_key';
const UPLOADCARE_SECRET_KEY = 'your_uploadcare_secret_key';
```

## 📤 File Upload

### Basic Upload
```javascript
const file = document.getElementById('fileInput').files[0];

try {
  const result = await obitox.uploadFile({
    file: file,
    filename: file.name,
    contentType: file.type,
    provider: 'UPLOADCARE',
    uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
    uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
    onProgress: (progress, bytesUploaded, totalBytes) => {
      console.log(`Upload progress: ${progress}%`);
      console.log(`Uploaded: ${bytesUploaded}/${totalBytes} bytes`);
    }
  });
  
  console.log('Upload successful!');
  console.log('File URL:', result.fileUrl);
  console.log('File ID:', result.fileId);
} catch (error) {
  console.error('Upload failed:', error.message);
}
```

### Upload with Validation
```javascript
// First validate the file
const validation = await obitox.validateFile({
  filename: file.name,
  contentType: file.type,
  fileSize: file.size,
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
  maxFileSize: 10 * 1024 * 1024, // 10MB limit
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
  blockMimeTypes: ['application/exe', 'application/x-executable'],
  enableSvgValidation: true
});

if (!validation.data.isValid) {
  console.error('File validation failed:', validation.data.errors);
  return;
}

if (validation.data.warnings.length > 0) {
  console.warn('File validation warnings:', validation.data.warnings);
}

// Proceed with upload if validation passes
const result = await obitox.uploadFile({
  file: file,
  filename: file.name,
  contentType: file.type,
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});
```

## 🛡️ Malware Scanning

### Scan File for Malware
```javascript
// Scan a file for malware
const scanResult = await obitox.scanFileForMalware({
  fileUrl: 'https://ucarecdn.com/your-file-uuid/',
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

console.log('Scan initiated:', scanResult.data.requestId);
```

### Check Scan Status
```javascript
// Check if scan is complete
const statusResult = await obitox.checkMalwareScanStatus({
  requestId: scanResult.data.requestId,
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

if (statusResult.data.isComplete) {
  console.log('Scan completed!');
} else {
  console.log('Scan still in progress...');
}
```

### Get Scan Results
```javascript
// Get detailed scan results
const results = await obitox.getMalwareScanResults({
  fileUrl: 'https://ucarecdn.com/your-file-uuid/',
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

if (results.data.isInfected) {
  console.error('File is infected!');
  console.error('Infected with:', results.data.infectedWith);
  
  // Remove infected file
  await obitox.removeInfectedFile({
    fileUrl: 'https://ucarecdn.com/your-file-uuid/',
    provider: 'UPLOADCARE',
    uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
    uploadcareSecretKey: UPLOADCARE_SECRET_KEY
  });
} else {
  console.log('File is clean!');
}
```

## 🔍 File Validation

### Pre-Upload Validation
```javascript
const validation = await obitox.validateFile({
  filename: 'document.pdf',
  contentType: 'application/pdf',
  fileSize: 2048000, // 2MB
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
  maxFileSize: 5 * 1024 * 1024, // 5MB limit
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'text/plain'
  ],
  blockMimeTypes: [
    'application/exe',
    'application/x-executable',
    'application/x-msdownload'
  ],
  enableSvgValidation: true
});

console.log('Validation result:', validation.data.isValid);
console.log('Errors:', validation.data.errors);
console.log('Warnings:', validation.data.warnings);
```

### SVG Security Validation
```javascript
// Validate SVG file for JavaScript content
const svgValidation = await obitox.validateSvg({
  fileUrl: 'https://ucarecdn.com/your-svg-file-uuid/',
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

if (svgValidation.data.hasJavaScript) {
  console.error('SVG contains JavaScript!');
  console.error('Detected patterns:', svgValidation.data.detectedPatterns);
} else {
  console.log('SVG is safe!');
}
```

## 📥 File Download

### Download File
```javascript
const downloadResult = await obitox.downloadFile({
  fileUrl: 'https://ucarecdn.com/your-file-uuid/',
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

console.log('Download URL:', downloadResult.downloadUrl);
// The downloadUrl will be the correct CDN URL (including custom domains)
```

## 🗑️ File Management

### Delete File
```javascript
const deleted = await obitox.deleteFile({
  fileUrl: 'https://ucarecdn.com/your-file-uuid/',
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

if (deleted) {
  console.log('File deleted successfully!');
} else {
  console.log('File deletion failed!');
}
```

### List Files
```javascript
const files = await obitox.listFiles({
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
  limit: 20,
  offset: 0
});

console.log('Total files:', files.data.total);
console.log('Files:', files.data.files);
```

## ⚙️ Project Settings

### Get Project Configuration
```javascript
const settings = await obitox.getProjectSettings({
  provider: 'UPLOADCARE',
  uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: UPLOADCARE_SECRET_KEY
});

console.log('Project settings:', settings.data.projectSettings);
```

## 🎯 Complete Example

Here's a complete example showing all features:

```javascript
import ObitoX from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'your_obitox_api_key',
  baseUrl: 'https://api.obitox.com'
});

const UPLOADCARE_PUBLIC_KEY = 'your_uploadcare_public_key';
const UPLOADCARE_SECRET_KEY = 'your_uploadcare_secret_key';

async function handleFileUpload(file) {
  try {
    // 1. Validate file before upload
    console.log('🔍 Validating file...');
    const validation = await obitox.validateFile({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
      provider: 'UPLOADCARE',
      uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
      uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      enableSvgValidation: true
    });

    if (!validation.data.isValid) {
      throw new Error(`Validation failed: ${validation.data.errors.join(', ')}`);
    }

    // 2. Upload file with progress tracking
    console.log('📤 Uploading file...');
    const uploadResult = await obitox.uploadFile({
      file: file,
      filename: file.name,
      contentType: file.type,
      provider: 'UPLOADCARE',
      uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
      uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
      onProgress: (progress) => {
        console.log(`Upload progress: ${progress}%`);
      }
    });

    console.log('✅ Upload successful!');
    console.log('File URL:', uploadResult.fileUrl);

    // 3. Scan for malware
    console.log('🛡️ Scanning for malware...');
    const scanResult = await obitox.scanFileForMalware({
      fileUrl: uploadResult.fileUrl,
      provider: 'UPLOADCARE',
      uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
      uploadcareSecretKey: UPLOADCARE_SECRET_KEY
    });

    // 4. Wait for scan to complete
    let scanComplete = false;
    while (!scanComplete) {
      const status = await obitox.checkMalwareScanStatus({
        requestId: scanResult.data.requestId,
        provider: 'UPLOADCARE',
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY
      });
      
      scanComplete = status.data.isComplete;
      if (!scanComplete) {
        console.log('⏳ Scan in progress...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 5. Get scan results
    const results = await obitox.getMalwareScanResults({
      fileUrl: uploadResult.fileUrl,
      provider: 'UPLOADCARE',
      uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
      uploadcareSecretKey: UPLOADCARE_SECRET_KEY
    });

    if (results.data.isInfected) {
      console.error('🚨 File is infected!');
      await obitox.removeInfectedFile({
        fileUrl: uploadResult.fileUrl,
        provider: 'UPLOADCARE',
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY
      });
      throw new Error('File was infected and has been removed');
    }

    console.log('✅ File is clean!');
    return uploadResult.fileUrl;

  } catch (error) {
    console.error('❌ Upload process failed:', error.message);
    throw error;
  }
}

// Usage
document.getElementById('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    try {
      const fileUrl = await handleFileUpload(file);
      console.log('🎉 File processed successfully:', fileUrl);
    } catch (error) {
      console.error('💥 File processing failed:', error.message);
    }
  }
});
```

## 🔧 Configuration Options

### File Validation Options
```javascript
const validationOptions = {
  maxFileSize: 5 * 1024 * 1024, // 5MB (default: 5TB)
  allowedMimeTypes: [
    'image/jpeg',
    'image/png', 
    'image/gif',
    'application/pdf',
    'text/plain'
  ],
  blockMimeTypes: [
    'application/exe',
    'application/x-executable',
    'application/x-msdownload'
  ],
  enableSvgValidation: true // Check SVG files for JavaScript
};
```

### Upload Options
```javascript
const uploadOptions = {
  onProgress: (progress, bytesUploaded, totalBytes) => {
    // Handle upload progress
  },
  onCancel: () => {
    // Handle upload cancellation
  }
};
```

## 🚨 Error Handling

```javascript
try {
  const result = await obitox.uploadFile({
    file: file,
    filename: file.name,
    contentType: file.type,
    provider: 'UPLOADCARE',
    uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
    uploadcareSecretKey: UPLOADCARE_SECRET_KEY
  });
} catch (error) {
  if (error.message.includes('VALIDATION_ERROR')) {
    console.error('File validation failed');
  } else if (error.message.includes('MISSING_UPLOADCARE_CREDENTIALS')) {
    console.error('Uploadcare credentials missing');
  } else if (error.message.includes('SCAN_INITIATION_FAILED')) {
    console.error('Malware scan failed to start');
  } else {
    console.error('Upload failed:', error.message);
  }
}
```

## 🎯 Key Benefits

1. **Zero Bandwidth Cost**: Files upload directly to Uploadcare, not through your server
2. **Enterprise Security**: Built-in malware scanning with ClamAV
3. **Comprehensive Validation**: File size, MIME type, and security validation
4. **Real-time Progress**: Track upload progress in real-time
5. **Developer Token Architecture**: Use your own Uploadcare credentials
6. **Custom CDN Support**: Automatic handling of custom CDN domains
7. **SVG Security**: JavaScript content detection in SVG files
8. **Comprehensive Error Handling**: Detailed error messages and validation results

## 📚 API Reference

### Methods Available
- `uploadFile()` - Upload files with progress tracking
- `downloadFile()` - Get download URLs (including custom CDN domains)
- `deleteFile()` - Remove files from storage
- `listFiles()` - List files with metadata
- `scanFileForMalware()` - Initiate malware scan
- `checkMalwareScanStatus()` - Check scan progress
- `getMalwareScanResults()` - Get scan results
- `removeInfectedFile()` - Remove infected files
- `validateFile()` - Pre-upload file validation
- `validateSvg()` - SVG security validation
- `getProjectSettings()` - Get project configuration

This comprehensive integration provides enterprise-grade file handling with Uploadcare while maintaining the zero-bandwidth cost architecture and developer token model! 🚀
