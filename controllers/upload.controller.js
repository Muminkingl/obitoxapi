import { supabaseAdmin } from '../database/supabase.js';
import { put } from '@vercel/blob';

/**
 * Generate signed URLs for Vercel Blob uploads - Core API endpoint
 * This is the main endpoint that developers will use (3-7 lines of code vision)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const generateVercelSignedUrl = async (req, res) => {
  try {
    const { filename, contentType, vercelToken } = req.body;
    
    // Validate required fields
    if (!filename || !vercelToken) {
      return res.status(400).json({
        success: false,
        error: 'filename and vercelToken are required'
      });
    }

    // Generate unique filename to prevent conflicts
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = filename.split('.').pop();
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const finalFilename = `${baseName}_${timestamp}_${randomSuffix}.${fileExtension}`;

    // Create the final file URL (this is what developers will use to access the file)
    const fileUrl = `https://blob.vercel-storage.com/${finalFilename}`;
    const uploadUrl = fileUrl; // Same URL for upload and access

    // Track usage for analytics and billing
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: finalFilename,
          file_type: contentType,
          file_url: fileUrl,
          status: 'pending',
          provider: 'vercel',
          created_at: new Date()
        });
    } catch (logError) {
      console.error('Error logging upload initiation:', logError);
    }

    // Return the simple, clean response that developers expect
    return res.status(200).json({
      success: true,
      uploadUrl: uploadUrl,
      fileUrl: fileUrl,
      filename: finalFilename,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': contentType || 'application/octet-stream',
        'x-vercel-filename': finalFilename
      },
      // Add instructions for proper upload
      instructions: {
        note: 'Use the Vercel Blob SDK put() method instead of direct HTTP upload',
        sdkExample: `import { put } from '@vercel/blob';
const blob = await put(finalFilename, fileBuffer, { token: vercelToken });`
      }
    });

  } catch (error) {
    console.error('Vercel Blob error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate upload URL',
      message: error.message
    });
  }
};

/**
 * Server-side upload using Vercel Blob SDK
 * This endpoint handles the actual file upload on the server
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const uploadToVercelBlob = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'token is required'
      });
    }

    // Check if file is uploaded
    if (!req.file && !req.body.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    // Get file data (assuming multer middleware is used)
    const fileBuffer = req.file ? req.file.buffer : Buffer.from(req.body.file, 'base64');
    const filename = req.file ? req.file.originalname : req.body.filename || 'uploaded-file';
    const contentType = req.file ? req.file.mimetype : req.body.contentType || 'application/octet-stream';

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = filename.split('.').pop();
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const finalFilename = `${baseName}_${timestamp}_${randomSuffix}.${fileExtension}`;

    // Upload to Vercel Blob using the SDK
    const blob = await put(finalFilename, fileBuffer, {
      access: 'public',
      token: token
    });

    // Log successful upload
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: finalFilename,
          file_type: contentType,
          file_url: blob.url,
          status: 'completed',
          provider: 'vercel'
        });
    } catch (logError) {
      console.error('Error logging upload completion:', logError);
    }

    return res.status(200).json({
      success: true,
      url: blob.url,
      filename: finalFilename,
      size: fileBuffer.length,
      contentType: contentType
    });

  } catch (error) {
    console.error('Vercel Blob upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      message: error.message
    });
  }
};

/**
 * Alternative: Direct upload URL generation without token exchange
 * This creates a direct upload endpoint
 */
export const generateDirectUploadUrl = async (req, res) => {
  try {
    const { filename, contentType, vercelToken } = req.body;
    
    if (!filename || !vercelToken) {
      return res.status(400).json({
        success: false,
        error: 'filename and vercelToken required'
      });
    }

    // Create the upload URL structure
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const finalFilename = `${filename.replace(/\.[^/.]+$/, '')}_${randomSuffix}.${filename.split('.').pop()}`;
    
    const uploadUrl = `https://blob.vercel-storage.com/${finalFilename}`;
    
    // Log upload for analytics
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: finalFilename,
          file_type: contentType,
          file_url: uploadUrl,
          status: 'pending'
        });
    } catch (logError) {
      console.error('Error logging upload:', logError);
    }

    return res.status(200).json({
      success: true,
      uploadUrl: uploadUrl,
      downloadUrl: uploadUrl,
      filename: finalFilename,
      instructions: {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': contentType || 'application/octet-stream',
          'x-vercel-filename': finalFilename
        },
        note: 'Upload your file using PUT method to the uploadUrl with the provided headers'
      }
    });

  } catch (error) {
    console.error('Upload URL generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate upload URL',
      message: error.message
    });
  }
};

/**
 * Analytics tracking endpoint - logs upload events for dashboard analytics
 * This matches your planned architecture for usage tracking and billing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const trackUploadEvent = async (req, res) => {
  try {
    const { event, fileUrl, filename, fileSize, provider = 'vercel' } = req.body;
    
    if (!event || !fileUrl) {
      return res.status(400).json({
        success: false,
        error: 'event and fileUrl are required'
      });
    }

    // Log the event for analytics
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: filename,
          file_url: fileUrl,
          file_size: fileSize,
          status: event, // 'completed', 'failed', etc.
          provider: provider,
          event_type: event,
          created_at: new Date()
        });
    } catch (logError) {
      console.error('Error logging analytics event:', logError);
    }

    return res.status(200).json({
      success: true,
      message: 'Event tracked successfully'
    });

  } catch (error) {
    console.error('Analytics tracking error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to track event',
      message: error.message
    });
  }
};