/**
 * R2 Token Validation Middleware
 * Validates JWT access tokens for R2 operations
 * 
 * Target Performance: <15ms
 * 
 * Features:
 * - JWT verification
 * - Revocation check (database)
 * - Permission validation
 * - Expires naturally with JWT expiry
 */

import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';
import { formatR2Error } from '../controllers/providers/r2/r2.config.js';

/**
 * Middleware to validate R2 access tokens
 * Checks:
 * 1. Token exists in Authorization header
 * 2. JWT is valid and not expired
 * 3. Token is not revoked (database check)
 * 4. Token has required permissions (if specified)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export async function validateR2AccessToken(req, res, next) {
    const startTime = Date.now();

    try {
        // ============================================================================
        // STEP 1: Extract token from Authorization header
        // ============================================================================
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json(formatR2Error(
                'MISSING_TOKEN',
                'Missing access token',
                'Include Authorization: Bearer <token> header in your request'
            ));
        }

        const token = authHeader.slice(7);  // Remove 'Bearer ' prefix

        // ============================================================================
        // STEP 2: Verify JWT signature and expiry (5-10ms)
        // ============================================================================
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json(formatR2Error(
                    'TOKEN_EXPIRED',
                    'Access token has expired',
                    'Generate a new token to continue accessing R2 resources'
                ));
            }

            if (jwtError.name === 'JsonWebTokenError') {
                return res.status(401).json(formatR2Error(
                    'INVALID_TOKEN',
                    'Invalid access token',
                    'The token signature is invalid or the token has been tampered with'
                ));
            }

            return res.status(401).json(formatR2Error(
                'TOKEN_VERIFICATION_FAILED',
                'Token verification failed',
                jwtError.message
            ));
        }

        // Verify token type
        if (decoded.type !== 'r2-access') {
            return res.status(401).json(formatR2Error(
                'INVALID_TOKEN_TYPE',
                'This token is not an R2 access token',
                'Use a valid R2 access token for this operation'
            ));
        }

        // ============================================================================
        // STEP 3: Check if token is revoked (database check, 3-8ms)
        // ============================================================================
        const tokenKey = `r2:token:${token.slice(-16)}`;

        try {
            const { data: tokenData, error: dbError } = await supabaseAdmin
                .from('r2_tokens')
                .select('revoked')
                .eq('token_id', tokenKey)
                .single();

            if (dbError && dbError.code !== 'PGRST116') {  // PGRST116 = not found
                console.warn('Token revocation check failed:', dbError.message);
                // Continue anyway - fail open (token works even if DB check fails)
            }

            if (tokenData?.revoked) {
                return res.status(401).json(formatR2Error(
                    'TOKEN_REVOKED',
                    'This access token has been revoked',
                    'Generate a new token to continue accessing R2 resources'
                ));
            }
        } catch (checkError) {
            console.warn('Token check error:', checkError.message);
            // Continue - fail open
        }

        // ============================================================================
        // STEP 4: Validate permissions (if required by route)
        // ============================================================================
        const requiredPermission = req.r2RequiredPermission;  // Set by route handler

        if (requiredPermission && decoded.permissions) {
            if (!decoded.permissions.includes(requiredPermission)) {
                return res.status(403).json(formatR2Error(
                    'INSUFFICIENT_PERMISSIONS',
                    `This token does not have '${requiredPermission}' permission`,
                    `Token permissions: ${decoded.permissions.join(', ')}`
                ));
            }
        }

        const totalTime = Date.now() - startTime;

        // ============================================================================
        // SUCCESS: Attach token data to request
        // ============================================================================
        req.r2Token = {
            userId: decoded.userId,
            apiKeyId: decoded.apiKeyId,
            bucket: decoded.bucket,
            fileKey: decoded.fileKey,
            permissions: decoded.permissions,
            metadata: decoded.metadata,
            validatedAt: new Date().toISOString(),
            validationTime: `${totalTime}ms`
        };

        console.log(`[Token Validation] ✅ Token valid in ${totalTime}ms`);

        next();

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[Token Validation] ❌ Error (${totalTime}ms):`, error.message);

        return res.status(500).json(formatR2Error(
            'TOKEN_VALIDATION_ERROR',
            'Token validation failed',
            'An unexpected error occurred while validating your token'
        ));
    }
}

/**
 * Helper middleware factory to require specific permissions
 * Usage: router.post('/r2/delete', validateR2AccessToken, requireR2Permission('delete'), handler)
 * 
 * @param {string} permission - Required permission ('read', 'write', or 'delete')
 * @returns {Function} Express middleware
 */
export function requireR2Permission(permission) {
    return (req, res, next) => {
        req.r2RequiredPermission = permission;
        next();
    };
}
