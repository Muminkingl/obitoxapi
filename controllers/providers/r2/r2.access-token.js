/**
 * R2 JWT Access Tokens
 * Fine-grained access control with permission-based tokens
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../../../config/supabase.js';
import { formatR2Error } from './r2.config.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * Generate JWT access token for specific R2 file/bucket
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateR2AccessToken = async (req, res) => {
    const requestId = `token_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startTime = Date.now();

    try {
        const {
            fileKey,
            r2Bucket,
            permissions = ['read'],
            expiresIn = 3600,
            metadata = {}
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        // VALIDATION: Required Fields
        if (!r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_BUCKET',
                'r2Bucket is required',
                'Specify which R2 bucket this token grants access to'
            ));
        }

        // VALIDATION: Permissions
        const validPermissions = ['read', 'write', 'delete'];
        const invalidPerms = permissions.filter(p => !validPermissions.includes(p));

        if (!Array.isArray(permissions) || permissions.length === 0) {
            return res.status(400).json(formatR2Error(
                'INVALID_PERMISSIONS',
                'permissions must be a non-empty array',
                `Valid permissions: ${validPermissions.join(', ')}`
            ));
        }

        if (invalidPerms.length > 0) {
            return res.status(400).json(formatR2Error(
                'INVALID_PERMISSIONS',
                `Invalid permissions: ${invalidPerms.join(', ')}`,
                `Valid permissions: ${validPermissions.join(', ')}`
            ));
        }

        // VALIDATION: Expiry Time
        const expiryInt = parseInt(expiresIn);

        if (isNaN(expiryInt) || expiryInt < 60 || expiryInt > 604800) {
            return res.status(400).json(formatR2Error(
                'INVALID_EXPIRY',
                'expiresIn must be between 60 (1 minute) and 604800 (7 days) seconds',
                `You provided: ${expiresIn}`
            ));
        }

        // TOKEN GENERATION: Create JWT
        const tokenStart = Date.now();

        const tokenPayload = {
            userId,
            apiKeyId,
            fileKey,
            bucket: r2Bucket,
            permissions,
            metadata,
            type: 'r2-access',
            iat: Math.floor(Date.now() / 1000)
        };

        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET || 'your-secret-key-change-this',
            { expiresIn: expiryInt }
        );

        const tokenTime = Date.now() - tokenStart;

        // STORAGE: Store token metadata (NON-BLOCKING)
        const tokenKey = `r2:token:${token.slice(-16)}`;

        supabaseAdmin
            .from('r2_tokens')
            .insert({
                token_id: tokenKey,
                user_id: userId,
                api_key_id: apiKeyId,
                bucket: r2Bucket,
                file_key: fileKey,
                permissions,
                metadata,
                expires_at: new Date(Date.now() + expiryInt * 1000).toISOString(),
                created_at: new Date().toISOString()
            })
            .then(() => { })
            .catch(() => { });

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ Token generated in ${totalTime}ms`);

        return res.status(200).json({
            success: true,
            provider: 'r2',
            token,
            tokenId: tokenKey,
            bucket: r2Bucket,
            fileKey: fileKey || null,
            permissions,
            expiresIn: expiryInt,
            expiresAt: new Date(Date.now() + expiryInt * 1000).toISOString(),
            usage: {
                header: `Authorization: Bearer ${token}`,
                description: 'Include this token in the Authorization header for protected R2 operations'
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    jwtGeneration: `${tokenTime}ms`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Token generation error (${totalTime}ms):`, error.message);

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        return res.status(500).json(formatR2Error(
            'TOKEN_GENERATION_FAILED',
            'Failed to generate access token',
            error.message
        ));
    }
};

/**
 * Revoke R2 access token
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const revokeR2AccessToken = async (req, res) => {
    const requestId = `revoke_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startTime = Date.now();

    try {
        const { token } = req.body;
        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!token) {
            return res.status(400).json(formatR2Error(
                'MISSING_TOKEN',
                'token is required',
                'Provide the token to revoke in the request body'
            ));
        }

        // Mark token as revoked (NON-BLOCKING)
        const tokenKey = `r2:token:${token.slice(-16)}`;

        supabaseAdmin
            .from('r2_tokens')
            .update({
                revoked: true,
                revoked_at: new Date().toISOString()
            })
            .eq('token_id', tokenKey)
            .eq('user_id', userId)
            .then(() => { })
            .catch(() => { });

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ Token revoked in ${totalTime}ms`);

        return res.status(200).json({
            success: true,
            message: 'Token revoked successfully',
            tokenId: tokenKey,
            performance: {
                requestId,
                totalTime: `${totalTime}ms`
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Token revocation error (${totalTime}ms):`, error.message);

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        return res.status(500).json(formatR2Error(
            'TOKEN_REVOCATION_FAILED',
            'Failed to revoke token',
            error.message
        ));
    }
};
