# 🚀 PART 2: SDK Implementation - Client-Side Magic

Now let's build the **client-side SDK** that makes resumable uploads **ridiculously easy** for developers! 🔥

---

# 📁 SDK Files Structure

```
sdk/
├── multipart/
│   ├── resumable-upload.js      # Main resumable upload class
│   ├── part-uploader.js         # Parallel part upload manager
│   ├── progress-tracker.js      # Progress tracking & events
│   ├── resume-manager.js        # Resume token persistence
│   └── retry-handler.js         # Network retry logic
└── providers/
    ├── r2.provider.js           # R2 provider (add resumable methods)
    └── s3.provider.js           # S3 provider (add resumable methods)
```

---

## Step 1: Resume Manager (Persistence)

```javascript
// sdk/multipart/resume-manager.js

/**
 * Resume Manager
 * Handles resume token persistence in localStorage/sessionStorage
 */
export class ResumeManager {
    constructor(storage = 'localStorage') {
        this.storage = typeof window !== 'undefined' 
            ? window[storage] 
            : null;
        this.prefix = 'obitox_resume_';
    }

    /**
     * Save resume token for a file
     */
    save(filename, resumeData) {
        if (!this.storage) return false;

        try {
            const key = this.prefix + this.sanitizeFilename(filename);
            const data = {
                resumeToken: resumeData.resumeToken,
                uploadId: resumeData.uploadId,
                fileKey: resumeData.fileKey,
                filename: resumeData.filename,
                fileSize: resumeData.fileSize,
                totalParts: resumeData.totalParts,
                uploadedParts: resumeData.uploadedParts || [],
                savedAt: Date.now()
            };

            this.storage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('[Resume Manager] Save failed:', error);
            return false;
        }
    }

    /**
     * Load resume token for a file
     */
    load(filename) {
        if (!this.storage) return null;

        try {
            const key = this.prefix + this.sanitizeFilename(filename);
            const data = this.storage.getItem(key);
            
            if (!data) return null;

            const parsed = JSON.parse(data);
            
            // Check if resume data is not too old (7 days)
            const age = Date.now() - parsed.savedAt;
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            
            if (age > maxAge) {
                console.warn('[Resume Manager] Resume data expired, removing...');
                this.remove(filename);
                return null;
            }

            return parsed;
        } catch (error) {
            console.error('[Resume Manager] Load failed:', error);
            return null;
        }
    }

    /**
     * Remove resume token
     */
    remove(filename) {
        if (!this.storage) return;

        try {
            const key = this.prefix + this.sanitizeFilename(filename);
            this.storage.removeItem(key);
        } catch (error) {
            console.error('[Resume Manager] Remove failed:', error);
        }
    }

    /**
     * List all saved resume tokens
     */
    listAll() {
        if (!this.storage) return [];

        try {
            const items = [];
            
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                
                if (key && key.startsWith(this.prefix)) {
                    const data = this.storage.getItem(key);
                    if (data) {
                        items.push(JSON.parse(data));
                    }
                }
            }

            return items;
        } catch (error) {
            console.error('[Resume Manager] List failed:', error);
            return [];
        }
    }

    /**
     * Clear all resume tokens
     */
    clearAll() {
        if (!this.storage) return;

        try {
            const keys = [];
            
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    keys.push(key);
                }
            }

            keys.forEach(key => this.storage.removeItem(key));
        } catch (error) {
            console.error('[Resume Manager] Clear failed:', error);
        }
    }

    /**
     * Sanitize filename for storage key
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9.-]/g, '_')
            .substring(0, 100);
    }
}
```

---

## Step 2: Progress Tracker

```javascript
// sdk/multipart/progress-tracker.js

/**
 * Progress Tracker
 * Tracks upload progress and emits events
 */
export class ProgressTracker {
    constructor(totalParts, fileSize) {
        this.totalParts = totalParts;
        this.fileSize = fileSize;
        this.uploadedParts = new Set();
        this.uploadedBytes = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        this.lastUploadedBytes = 0;
        this.listeners = {
            progress: [],
            partComplete: [],
            error: [],
            complete: []
        };
    }

    /**
     * Mark part as uploaded
     */
    markPartUploaded(partNumber, partSize) {
        if (this.uploadedParts.has(partNumber)) {
            return; // Already uploaded
        }

        this.uploadedParts.add(partNumber);
        this.uploadedBytes += partSize;

        this.emitProgress();
    }

    /**
     * Restore progress from saved state
     */
    restoreProgress(uploadedParts) {
        uploadedParts.forEach(part => {
            this.uploadedParts.add(part.partNumber);
            this.uploadedBytes += part.size;
        });

        this.emitProgress();
    }

    /**
     * Emit progress event
     */
    emitProgress() {
        const now = Date.now();
        const timeDelta = (now - this.lastUpdateTime) / 1000; // seconds
        const bytesDelta = this.uploadedBytes - this.lastUploadedBytes;

        const progress = {
            uploaded: this.uploadedParts.size,
            total: this.totalParts,
            percentage: (this.uploadedParts.size / this.totalParts * 100).toFixed(2),
            uploadedBytes: this.uploadedBytes,
            totalBytes: this.fileSize,
            bytesPercentage: (this.uploadedBytes / this.fileSize * 100).toFixed(2),
            speed: timeDelta > 0 ? bytesDelta / timeDelta : 0, // bytes per second
            estimatedTimeRemaining: this.calculateETA(),
            elapsedTime: now - this.startTime
        };

        this.lastUpdateTime = now;
        this.lastUploadedBytes = this.uploadedBytes;

        this.emit('progress', progress);
    }

    /**
     * Calculate estimated time remaining
     */
    calculateETA() {
        const elapsedTime = Date.now() - this.startTime;
        const uploadSpeed = this.uploadedBytes / (elapsedTime / 1000); // bytes per second

        if (uploadSpeed === 0) return null;

        const remainingBytes = this.fileSize - this.uploadedBytes;
        const remainingSeconds = remainingBytes / uploadSpeed;

        return Math.ceil(remainingSeconds);
    }

    /**
     * Format time in human-readable format
     */
    static formatTime(seconds) {
        if (!seconds || seconds < 0) return 'calculating...';
        
        if (seconds < 60) {
            return `${Math.ceil(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.ceil(seconds % 60);
            return `${minutes}m ${secs}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    /**
     * Format bytes in human-readable format
     */
    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format speed in human-readable format
     */
    static formatSpeed(bytesPerSecond) {
        return ProgressTracker.formatBytes(bytesPerSecond) + '/s';
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners[event]) {
            const index = this.listeners[event].indexOf(callback);
            if (index > -1) {
                this.listeners[event].splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[Progress Tracker] Event callback error (${event}):`, error);
                }
            });
        }
    }
}
```

---

## Step 3: Retry Handler

```javascript
// sdk/multipart/retry-handler.js

/**
 * Retry Handler
 * Handles network errors and retries with exponential backoff
 */
export class RetryHandler {
    constructor(maxRetries = 3, initialDelay = 1000) {
        this.maxRetries = maxRetries;
        this.initialDelay = initialDelay;
    }

    /**
     * Execute function with retry logic
     */
    async execute(fn, context = '') {
        let lastError;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (attempt < this.maxRetries) {
                    const delay = this.calculateDelay(attempt);
                    console.warn(
                        `[Retry Handler] ${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), ` +
                        `retrying in ${delay}ms...`,
                        error.message
                    );

                    await this.sleep(delay);
                } else {
                    console.error(
                        `[Retry Handler] ${context} failed after ${this.maxRetries + 1} attempts`,
                        error
                    );
                }
            }
        }

        throw lastError;
    }

    /**
     * Calculate exponential backoff delay
     */
    calculateDelay(attempt) {
        const exponentialDelay = this.initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if error is retryable
     */
    static isRetryable(error) {
        // Network errors
        if (error.message.includes('network') || 
            error.message.includes('timeout') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT')) {
            return true;
        }

        // HTTP status codes that are retryable
        if (error.status) {
            const retryableStatuses = [408, 429, 500, 502, 503, 504];
            return retryableStatuses.includes(error.status);
        }

        return false;
    }
}
```

---

## Step 4: Part Uploader

```javascript
// sdk/multipart/part-uploader.js

import { RetryHandler } from './retry-handler.js';

/**
 * Part Uploader
 * Handles parallel upload of file parts
 */
export class PartUploader {
    constructor(file, options = {}) {
        this.file = file;
        this.concurrency = options.concurrency || 5;
        this.retryHandler = new RetryHandler(
            options.maxRetries || 3,
            options.retryDelay || 1000
        );
        this.activeUploads = 0;
        this.uploadQueue = [];
        this.results = [];
        this.aborted = false;
    }

    /**
     * Upload all parts in parallel (with concurrency limit)
     */
    async uploadParts(partUrls, onPartComplete) {
        this.aborted = false;
        this.results = [];

        // Create upload queue
        this.uploadQueue = partUrls.map(part => ({
            ...part,
            status: 'pending'
        }));

        // Start uploading with concurrency limit
        const uploadPromises = [];
        
        for (let i = 0; i < Math.min(this.concurrency, this.uploadQueue.length); i++) {
            uploadPromises.push(this.processQueue(onPartComplete));
        }

        await Promise.all(uploadPromises);

        return this.results.sort((a, b) => a.partNumber - b.partNumber);
    }

    /**
     * Process upload queue
     */
    async processQueue(onPartComplete) {
        while (this.uploadQueue.length > 0 && !this.aborted) {
            // Get next pending part
            const partIndex = this.uploadQueue.findIndex(p => p.status === 'pending');
            
            if (partIndex === -1) {
                break; // No more pending parts
            }

            const part = this.uploadQueue[partIndex];
            part.status = 'uploading';

            this.activeUploads++;

            try {
                const result = await this.uploadPart(part);
                this.results.push(result);

                if (onPartComplete) {
                    onPartComplete(result);
                }

                part.status = 'completed';
            } catch (error) {
                console.error(`[Part Uploader] Part ${part.partNumber} failed:`, error);
                part.status = 'failed';
                part.error = error.message;

                // Re-throw to stop upload
                throw error;
            } finally {
                this.activeUploads--;
            }
        }
    }

    /**
     * Upload a single part
     */
    async uploadPart(part) {
        const { partNumber, url, start, end } = part;

        // Extract blob for this part
        const blob = this.file.slice(start, end + 1);

        // Upload with retry logic
        const response = await this.retryHandler.execute(
            async () => {
                const res = await fetch(url, {
                    method: 'PUT',
                    body: blob,
                    headers: {
                        'Content-Type': this.file.type || 'application/octet-stream',
                        'Content-Length': blob.size.toString()
                    }
                });

                if (!res.ok) {
                    throw new Error(`Upload failed with status ${res.status}`);
                }

                return res;
            },
            `Part ${partNumber}`
        );

        // Get ETag from response
        const etag = response.headers.get('ETag');

        if (!etag) {
            throw new Error(`No ETag returned for part ${partNumber}`);
        }

        return {
            partNumber,
            etag: etag.replace(/"/g, ''),
            size: blob.size
        };
    }

    /**
     * Abort all uploads
     */
    abort() {
        this.aborted = true;
        console.log('[Part Uploader] Aborting all uploads...');
    }

    /**
     * Get upload statistics
     */
    getStats() {
        const pending = this.uploadQueue.filter(p => p.status === 'pending').length;
        const uploading = this.uploadQueue.filter(p => p.status === 'uploading').length;
        const completed = this.uploadQueue.filter(p => p.status === 'completed').length;
        const failed = this.uploadQueue.filter(p => p.status === 'failed').length;

        return {
            total: this.uploadQueue.length,
            pending,
            uploading,
            completed,
            failed,
            activeUploads: this.activeUploads
        };
    }
}
```

---

## Step 5: Resumable Upload Main Class

```javascript
// sdk/multipart/resumable-upload.js

import { PartUploader } from './part-uploader.js';
import { ProgressTracker } from './progress-tracker.js';
import { ResumeManager } from './resume-manager.js';

/**
 * Resumable Upload
 * Main class for handling resumable multipart uploads
 */
export class ResumableUpload {
    constructor(client, file, options = {}) {
        this.client = client;
        this.file = file;
        this.options = options;
        
        // Configuration
        this.partSize = options.partSize || this.calculateOptimalPartSize(file.size);
        this.concurrency = options.concurrency || 5;
        this.resumeToken = options.resumeToken || null;
        this.autoResume = options.autoResume !== false; // Default: true
        
        // State
        this.uploadId = null;
        this.fileKey = null;
        this.totalParts = 0;
        this.partUrls = [];
        this.uploadedParts = [];
        this.isPaused = false;
        this.isAborted = false;
        
        // Managers
        this.resumeManager = new ResumeManager(options.storage);
        this.progressTracker = null;
        this.partUploader = null;

        // Events
        this.onProgress = options.onProgress || null;
        this.onPartComplete = options.onPartComplete || null;
        this.onError = options.onError || null;
        this.onComplete = options.onComplete || null;
    }

    /**
     * Start upload (initialize or resume)
     */
    async start() {
        try {
            console.log(`[Resumable Upload] 🚀 Starting upload: ${this.file.name} (${this.formatBytes(this.file.size)})`);

            // Check for existing resume data
            if (this.autoResume && !this.resumeToken) {
                const savedData = this.resumeManager.load(this.file.name);
                
                if (savedData && savedData.fileSize === this.file.size) {
                    console.log(`[Resumable Upload] 📂 Found saved progress, resuming...`);
                    this.resumeToken = savedData.resumeToken;
                }
            }

            // Initialize or resume
            if (this.resumeToken) {
                return await this.resume();
            } else {
                return await this.initialize();
            }

        } catch (error) {
            console.error('[Resumable Upload] ❌ Upload failed:', error);
            
            if (this.onError) {
                this.onError(error);
            }

            throw error;
        }
    }

    /**
     * Initialize new multipart upload
     */
    async initialize() {
        console.log(`[Resumable Upload] 🔧 Initializing multipart upload...`);
        console.log(`  - Part size: ${this.formatBytes(this.partSize)}`);
        console.log(`  - Concurrency: ${this.concurrency} parts`);

        // Call API to initialize
        const response = await this.client.makeRequest('/upload/multipart/init', {
            method: 'POST',
            body: {
                filename: this.file.name,
                fileSize: this.file.size,
                contentType: this.file.type,
                partSize: this.partSize,
                ...this.options
            }
        });

        this.resumeToken = response.resumeToken;
        this.uploadId = response.uploadId;
        this.fileKey = response.fileKey;
        this.partUrls = response.partUrls;
        this.totalParts = response.totalParts;

        console.log(`[Resumable Upload] ✅ Initialized: ${this.totalParts} parts`);
        console.log(`  - Resume token: ${this.resumeToken}`);

        // Save resume data
        this.resumeManager.save(this.file.name, {
            resumeToken: this.resumeToken,
            uploadId: this.uploadId,
            fileKey: this.fileKey,
            filename: this.file.name,
            fileSize: this.file.size,
            totalParts: this.totalParts
        });

        // Initialize progress tracker
        this.progressTracker = new ProgressTracker(this.totalParts, this.file.size);
        
        if (this.onProgress) {
            this.progressTracker.on('progress', this.onProgress);
        }

        // Upload parts
        return await this.uploadParts();
    }

    /**
     * Resume interrupted upload
     */
    async resume() {
        console.log(`[Resumable Upload] 🔄 Resuming upload...`);
        console.log(`  - Resume token: ${this.resumeToken}`);

        // Call API to resume
        const response = await this.client.makeRequest('/upload/multipart/resume', {
            method: 'POST',
            body: {
                resumeToken: this.resumeToken
            }
        });

        this.uploadId = response.uploadId;
        this.fileKey = response.fileKey;
        this.totalParts = response.totalParts;
        this.uploadedParts = response.uploadedParts;
        this.partUrls = response.remainingParts;

        console.log(`[Resumable Upload] ✅ Resume data loaded:`);
        console.log(`  - Progress: ${response.progress.percentage}%`);
        console.log(`  - Uploaded: ${response.progress.uploaded}/${response.progress.total} parts`);
        console.log(`  - Remaining: ${this.partUrls.length} parts`);

        // Initialize progress tracker
        this.progressTracker = new ProgressTracker(this.totalParts, this.file.size);
        
        // Restore progress
        this.progressTracker.restoreProgress(this.uploadedParts);
        
        if (this.onProgress) {
            this.progressTracker.on('progress', this.onProgress);
        }

        // Check if already complete
        if (this.partUrls.length === 0) {
            console.log(`[Resumable Upload] ✅ All parts already uploaded, completing...`);
            return await this.complete(this.uploadedParts);
        }

        // Upload remaining parts
        return await this.uploadParts();
    }

    /**
     * Upload all parts
     */
    async uploadParts() {
        console.log(`[Resumable Upload] 📤 Uploading ${this.partUrls.length} parts...`);

        this.partUploader = new PartUploader(this.file, {
            concurrency: this.concurrency,
            maxRetries: this.options.maxRetries,
            retryDelay: this.options.retryDelay
        });

        const newParts = await this.partUploader.uploadParts(
            this.partUrls,
            (part) => {
                // Mark progress
                this.progressTracker.markPartUploaded(part.partNumber, part.size);

                // Save progress
                this.uploadedParts.push(part);
                this.resumeManager.save(this.file.name, {
                    resumeToken: this.resumeToken,
                    uploadId: this.uploadId,
                    fileKey: this.fileKey,
                    filename: this.file.name,
                    fileSize: this.file.size,
                    totalParts: this.totalParts,
                    uploadedParts: this.uploadedParts
                });

                // Callback
                if (this.onPartComplete) {
                    this.onPartComplete({
                        ...part,
                        resumeToken: this.resumeToken
                    });
                }
            }
        );

        console.log(`[Resumable Upload] ✅ All parts uploaded!`);

        // Combine uploaded parts
        const allParts = [...this.uploadedParts, ...newParts];

        // Complete upload
        return await this.complete(allParts);
    }

    /**
     * Complete multipart upload
     */
    async complete(parts) {
        console.log(`[Resumable Upload] 🏁 Completing upload...`);

        const response = await this.client.makeRequest('/upload/multipart/complete', {
            method: 'POST',
            body: {
                resumeToken: this.resumeToken,
                parts: parts.sort((a, b) => a.partNumber - b.partNumber)
            }
        });

        console.log(`[Resumable Upload] ✅ Upload completed!`);
        console.log(`  - URL: ${response.url}`);
        console.log(`  - File: ${response.filename}`);
        console.log(`  - Size: ${this.formatBytes(response.fileSize)}`);

        // Clean up resume data
        this.resumeManager.remove(this.file.name);

        // Callback
        if (this.onComplete) {
            this.onComplete(response);
        }

        return response;
    }

    /**
     * Pause upload
     */
    pause() {
        console.log(`[Resumable Upload] ⏸️ Pausing upload...`);
        this.isPaused = true;
        
        if (this.partUploader) {
            this.partUploader.abort();
        }
    }

    /**
     * Abort upload (cleanup)
     */
    async abort() {
        console.log(`[Resumable Upload] 🛑 Aborting upload...`);
        this.isAborted = true;
        
        if (this.partUploader) {
            this.partUploader.abort();
        }

        // Call API to abort
        await this.client.makeRequest('/upload/multipart/abort', {
            method: 'POST',
            body: {
                resumeToken: this.resumeToken
            }
        });

        // Clean up resume data
        this.resumeManager.remove(this.file.name);

        console.log(`[Resumable Upload] ✅ Upload aborted`);
    }

    /**
     * Calculate optimal part size
     */
    calculateOptimalPartSize(fileSize) {
        const MIN_PART_SIZE = 5 * 1024 * 1024;      // 5MB
        const MAX_PART_SIZE = 100 * 1024 * 1024;    // 100MB
        const MAX_PARTS = 10000;

        const minRequired = Math.ceil(fileSize / MAX_PARTS);
        let partSize = Math.max(MIN_PART_SIZE, minRequired);
        partSize = Math.ceil(partSize / (1024 * 1024)) * (1024 * 1024); // Round to MB
        partSize = Math.min(partSize, MAX_PART_SIZE);

        return partSize;
    }

    /**
     * Format bytes
     */
    formatBytes(bytes) {
        return ProgressTracker.formatBytes(bytes);
    }
}
```

---

## Step 6: Add to Provider (R2)

```javascript
// sdk/providers/r2.provider.js

import { ResumableUpload } from '../multipart/resumable-upload.js';
import { ResumeManager } from '../multipart/resume-manager.js';

export class R2Provider {
    // ... existing methods

    /**
     * ✅ NEW: Resumable upload for large files
     */
    async resumableUpload(file, options = {}) {
        const upload = new ResumableUpload(this.client, file, {
            ...options,
            provider: 'R2',
            r2AccessKey: this.config.accessKey,
            r2SecretKey: this.config.secretKey,
            r2AccountId: this.config.accountId,
            r2Bucket: this.config.bucket
        });

        return await upload.start();
    }

    /**
     * ✅ NEW: Resume a paused upload
     */
    async resumeUpload(resumeToken, file, options = {}) {
        const upload = new ResumableUpload(this.client, file, {
            ...options,
            resumeToken,
            provider: 'R2',
            r2AccessKey: this.config.accessKey,
            r2SecretKey: this.config.secretKey,
            r2AccountId: this.config.accountId,
            r2Bucket: this.config.bucket
        });

        return await upload.start();
    }

    /**
     * ✅ NEW: List saved resume tokens
     */
    listSavedUploads() {
        const manager = new ResumeManager();
        return manager.listAll();
    }

    /**
     * ✅ NEW: Clear all saved resume tokens
     */
    clearSavedUploads() {
        const manager = new ResumeManager();
        manager.clearAll();
    }
}
```

---

