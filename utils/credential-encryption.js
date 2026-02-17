/**
 * Credential Encryption Utility
 * 
 * AES-256-GCM encryption for storing sensitive credentials (S3/R2 keys)
 * in the database. Uses a server-side encryption key from env vars.
 * 
 * @file utils/credential-encryption.js
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;   // 128-bit IV
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Get the encryption key from environment.
 * Falls back to a derived key from SUPABASE_SERVICE_ROLE_KEY if WEBHOOK_ENCRYPTION_KEY is not set.
 * 
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
    const envKey = process.env.WEBHOOK_ENCRYPTION_KEY;

    if (envKey) {
        // Use SHA-256 to ensure exactly 32 bytes regardless of input length
        return crypto.createHash('sha256').update(envKey).digest();
    }

    // Fallback: derive from Supabase service role key
    const fallbackKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!fallbackKey) {
        throw new Error('WEBHOOK_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY must be set for credential encryption');
    }

    return crypto.createHash('sha256').update(`webhook_cred_${fallbackKey}`).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * 
 * @param {string} plaintext - The string to encrypt
 * @returns {string} Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptCredential(plaintext) {
    if (!plaintext) return plaintext;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted credential string
 * 
 * @param {string} encryptedText - The encrypted string in format: iv:authTag:ciphertext
 * @returns {string} Decrypted plaintext
 */
export function decryptCredential(encryptedText) {
    if (!encryptedText) return encryptedText;

    // If not in encrypted format, return as-is (backwards compatibility with existing plaintext)
    if (!encryptedText.includes(':')) {
        return encryptedText;
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        // Not in expected format — return as-is for backwards compatibility
        return encryptedText;
    }

    const [ivHex, authTagHex, ciphertext] = parts;

    // Validate hex lengths
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== TAG_LENGTH * 2) {
        // Not in expected format — return as-is
        return encryptedText;
    }

    try {
        const key = getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[CredentialEncryption] ❌ Decryption failed:', error.message);
        // Return original text if decryption fails (key rotation scenario)
        return encryptedText;
    }
}
