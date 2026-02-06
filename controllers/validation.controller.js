/**
 * File Validation Controller
 * 
 * Handles file validation requests - validates file metadata with optional magic bytes.
 * CRITICAL: Files never hit the backend - client reads first 8 bytes and sends them!
 * 
 * @module validation-controller
 */

import { validateFileMetadata } from '../utils/file-validator.js';

/**
 * POST /api/v1/upload/validate
 * Validate file metadata before upload
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function validateFile(req, res) {
    const requestId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
        const {
            filename,
            contentType,
            fileSize,
            magicBytes,
            validation
        } = req.body;
        
        console.log(`[${requestId}] 📋 Validation request received`);
        console.log(`[${requestId}]   filename: ${filename}`);
        console.log(`[${requestId}]   contentType: ${contentType}`);
        console.log(`[${requestId}]   fileSize: ${fileSize}`);
        console.log(`[${requestId}]   magicBytes: ${magicBytes ? magicBytes.length + ' bytes' : 'not provided'}`);
        console.log(`[${requestId}]   validation options: ${validation ? 'yes' : 'none'}`);
        
        // =========================================================================
        // 1. VALIDATE REQUIRED FIELDS
        // =========================================================================
        
        const missingFields = [];
        if (!filename) missingFields.push('filename');
        if (!contentType) missingFields.push('contentType');
        if (fileSize === undefined || fileSize === null) missingFields.push('fileSize');
        
        if (missingFields.length > 0) {
            console.log(`[${requestId}] ❌ Missing required fields: ${missingFields.join(', ')}`);
            
            return res.status(400).json({
                success: false,
                error: 'MISSING_REQUIRED_FIELDS',
                message: 'The following fields are required: filename, contentType, and fileSize',
                missingFields,
                requestId
            });
        }
        
        // =========================================================================
        // 2. RUN VALIDATION
        // =========================================================================
        
        const result = validateFileMetadata({
            filename,
            contentType,
            fileSize,
            magicBytes,
            validation: validation || {}
        });
        
        const totalTime = Date.now() - startTime;
        
        console.log(`[${requestId}] ✅ Validation completed in ${totalTime}ms`);
        console.log(`[${requestId}]    valid: ${result.valid}`);
        console.log(`[${requestId}]    errors: ${result.errors?.length || 0}`);
        console.log(`[${requestId}]    warnings: ${result.warnings?.length || 0}`);
        
        if (result.detectedMimeType) {
            console.log(`[${requestId}]    detected type: ${result.detectedMimeType} (${result.detectedSignature})`);
        }
        
        // =========================================================================
        // 3. RETURN RESULT
        // =========================================================================
        
        return res.json({
            success: true,
            requestId,
            timing: `${totalTime}ms`,
            ...result,
            _meta: {
                validatedAt: new Date().toISOString(),
                magicBytesProvided: result.checks.magicBytes.provided,
                magicBytesDetected: result.checks.magicBytes.detected
            }
        });
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Validation error after ${totalTime}ms:`, error);
        
        return res.status(500).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'An error occurred during file validation',
            requestId,
            ...(process.env.NODE_ENV === 'development' && {
                details: error.message,
                stack: error.stack
            })
        });
    }
}

/**
 * POST /api/v1/upload/validate/batch
 * Validate multiple files at once
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function validateFilesBatch(req, res) {
    const requestId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
        const { files, validation } = req.body;
        
        console.log(`[${requestId}] 📋 Batch validation request received`);
        console.log(`[${requestId}]   files: ${files?.length || 0}`);
        
        // =========================================================================
        // 1. VALIDATE INPUT
        // =========================================================================
        
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_FILES',
                message: 'files array is required',
                requestId
            });
        }
        
        if (files.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'TOO_MANY_FILES',
                message: 'Maximum 50 files per batch validation',
                requestId
            });
        }
        
        // =========================================================================
        // 2. RUN VALIDATION ON EACH FILE
        // =========================================================================
        
        const results = files.map((file, index) => {
            const { filename, contentType, fileSize, magicBytes } = file;
            
            const result = validateFileMetadata({
                filename,
                contentType,
                fileSize,
                magicBytes,
                validation: validation || {}
            });
            
            return {
                index,
                filename,
                ...result
            };
        });
        
        // =========================================================================
        // 3. CALCULATE SUMMARY
        // =========================================================================
        
        const validCount = results.filter(r => r.valid).length;
        const invalidCount = results.filter(r => !r.valid).length;
        
        const totalTime = Date.now() - startTime;
        
        console.log(`[${requestId}] ✅ Batch validation completed in ${totalTime}ms`);
        console.log(`[${requestId}]    valid: ${validCount}, invalid: ${invalidCount}`);
        
        // =========================================================================
        // 4. RETURN RESULT
        // =========================================================================
        
        return res.json({
            success: true,
            requestId,
            timing: `${totalTime}ms`,
            summary: {
                total: files.length,
                valid: validCount,
                invalid: invalidCount,
                validPercentage: Math.round((validCount / files.length) * 100)
            },
            results,
            _meta: {
                validatedAt: new Date().toISOString()
            }
        });
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Batch validation error after ${totalTime}ms:`, error);
        
        return res.status(500).json({
            success: false,
            error: 'BATCH_VALIDATION_ERROR',
            message: 'An error occurred during batch file validation',
            requestId
        });
    }
}

/**
 * POST /api/v1/upload/validate/signed-url
 * Validate file and generate signed URL in one request
 * 
 * This combines validation with signed URL generation for convenience.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function validateAndGenerateSignedUrl(req, res) {
    const requestId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
        const {
            filename,
            contentType,
            fileSize,
            magicBytes,
            validation,
            provider,  // 's3', 'r2', 'supabase', 'uploadcare'
            ...providerOptions  // Provider-specific options
        } = req.body;
        
        console.log(`[${requestId}] 📋 Validate + Signed URL request`);
        console.log(`[${requestId}]   provider: ${provider}`);
        console.log(`[${requestId}]   filename: ${filename}`);
        
        // =========================================================================
        // 1. RUN VALIDATION FIRST
        // =========================================================================
        
        const validationResult = validateFileMetadata({
            filename,
            contentType,
            fileSize,
            magicBytes,
            validation: validation || {}
        });
        
        if (!validationResult.valid) {
            console.log(`[${requestId}] ❌ Validation failed`);
            
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_FAILED',
                message: 'File validation failed',
                validationResult,
                requestId
            });
        }
        
        console.log(`[${requestId}] ✅ Validation passed, proceeding to signed URL generation`);
        
        // =========================================================================
        // 2. GENERATE SIGNED URL (provider-specific)
        // =========================================================================
        
        // This would delegate to the appropriate provider's signed-url handler
        // For now, we'll return validation success and let client make separate request
        
        const totalTime = Date.now() - startTime;
        
        return res.json({
            success: true,
            requestId,
            timing: `${totalTime}ms`,
            message: 'Validation passed. Now request signed URL separately.',
            validation: validationResult,
            note: 'Call the provider-specific signed URL endpoint with validated parameters'
        });
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);
        
        return res.status(500).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'An error occurred during validation',
            requestId
        });
    }
}

/**
 * GET /api/v1/upload/validate/supported-types
 * Get list of supported file types for validation
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function getSupportedTypes(req, res) {
    const { MAGIC_BYTES_MAP, DANGEROUS_EXTENSIONS } = require('../utils/file-validator.js');
    
    const supportedTypes = Object.entries(MAGIC_BYTES_MAP)
        .filter(([mime, sig]) => sig.bytes !== null)
        .map(([mime, sig]) => ({
            mimeType: mime,
            signature: sig.signature,
            minBytes: sig.minBytes
        }));
    
    return res.json({
        success: true,
        data: {
            supportedTypes,
            blockedExtensions: DANGEROUS_EXTENSIONS,
            defaultMaxSizeMB: 100,
            defaultAllowedTypes: [
                'image/jpeg',
                'image/png',
                'image/gif',
                'image/webp',
                'application/pdf'
            ]
        }
    });
}
