import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import pool from '../../config/database.js';
import SessionManager from '../../middleware/session.js';
import {
  requireAuth,
  requireAdmin,
  requireAgent,
} from '../../middleware/guards.js';
import {
  sendAccountClaimEmail,
  sendPasswordResetEmail,
  sendVerificationApprovedEmail,
} from '../../services/emailService.js';
import { Context } from '../../types/index.js';

export interface AdminCreateAgentInput {
  // Required basic user info
  name: string;
  email: string;

  // Optional contact info
  phone?: string | null;

  // Optional agent profile info
  agency_name?: string | null;
  cac_number?: string | null;
  license_number?: string | null;
  years_experience?: number | null;

  // Flags controlling behavior
  skip_verification?: boolean;
  founding_partner?: boolean;
}
// ============================================
// TOKEN HELPERS
// ============================================

function generateSecureToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function createToken(
  userId: string,
  type: 'account_claim' | 'password_reset',
  expiresInHours: number
): Promise<string> {
  const { raw, hash } = generateSecureToken();

  // Invalidate any previous unused tokens of the same type for this user
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND token_type = $2 AND used_at IS NULL`,
    [userId, type]
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, token_type, expires_at)
     VALUES ($1, $2, $3, NOW() + $4::interval)`,
    [userId, hash, type, `${expiresInHours} hours`]
  );

  return raw;
}

async function consumeToken(
  rawToken: string,
  expectedType: 'account_claim' | 'password_reset'
): Promise<{ userId: string } | null> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { rows } = await pool.query(
    `SELECT user_id FROM password_reset_tokens
     WHERE token_hash = $1
       AND token_type = $2
       AND used_at IS NULL
       AND expires_at > NOW()`,
    [hash, expectedType]
  );

  if (!rows[0]) return null;

  // Single-use — mark consumed immediately
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1`,
    [hash]
  );

  return { userId: rows[0].user_id };
}

// ============================================
// VERIFICATION HELPER
// ============================================

/**
 * After any document is approved, check if the agent now has all required
 * docs approved. If so, flip verification_status to 'verified' and
 * award the verified_agent badge.
 */
async function maybeFinalizeVerification(userId: string, adminId: string) {
  const required = ['cac_certificate', 'nin_slip', 'agency_license'];

  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT doc_type) AS approved_count
     FROM verification_documents
     WHERE user_id = $1
       AND doc_type = ANY($2::text[])
       AND status = 'approved'`,
    [userId, required]
  );

  if (parseInt(rows[0].approved_count) < required.length) return;

  await pool.query(
    `UPDATE agent_profiles
     SET verification_status = 'verified',
         verified_at = NOW(),
         verified_by = $2,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, adminId]
  );

  await pool.query(
    `INSERT INTO user_badges (user_id, badge_id, awarded_by)
     SELECT $1, id, $2 FROM badges WHERE code = 'verified_agent'
     ON CONFLICT (user_id, badge_id) DO NOTHING`,
    [userId, adminId]
  );

  // Notify the agent
  const { rows: userRows } = await pool.query(
    `SELECT email, name FROM users WHERE id = $1`,
    [userId]
  );
  if (userRows[0]) {
    await sendVerificationApprovedEmail(userRows[0].email, userRows[0].name);
  }
}

// ============================================
// BADGE HELPER
// ============================================

async function awardBadgeByCode(userId: string, badgeCode: string, awardedBy: string) {
  const { rows } = await pool.query(
    `SELECT id FROM badges WHERE code = $1 AND is_active = true`,
    [badgeCode]
  );
  if (!rows[0]) return;

  await pool.query(
    `INSERT INTO user_badges (user_id, badge_id, awarded_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, badge_id) DO NOTHING`,
    [userId, rows[0].id, awardedBy]
  );

  if (badgeCode === 'founding_partner') {
    await pool.query(
      `UPDATE agent_profiles
       SET fee_waiver_until = NOW() + INTERVAL '12 months', updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  }
}

// ============================================
// RESOLVERS
// ============================================

export default {
  Query: {
    myAgentProfile: async (_, __, context) => {
      const user = requireAgent(context);

      const { rows } = await pool.query(
        `SELECT ap.*,
                json_agg(
                  json_build_object(
                    'id', ub.id,
                    'awarded_at', ub.awarded_at,
                    'expires_at', ub.expires_at,
                    'badge', json_build_object(
                      'id', b.id, 'code', b.code, 'label', b.label,
                      'description', b.description, 'icon_url', b.icon_url
                    )
                  )
                ) FILTER (WHERE ub.id IS NOT NULL) AS badges
         FROM agent_profiles ap
         LEFT JOIN user_badges ub ON ub.user_id = ap.user_id
         LEFT JOIN badges b ON b.id = ub.badge_id
         WHERE ap.user_id = $1
         GROUP BY ap.id`,
        [user.id]
      );

      return rows[0] || null;
    },

    agentProfile: async (_, { userId }: { userId: string }) => {
      // Public — verified agents only
      const { rows } = await pool.query(
        `SELECT ap.id, ap.user_id, ap.agency_name, ap.years_experience,
                ap.verification_status, ap.verified_at,
                ap.total_listings, ap.total_bookings, ap.avg_rating,
                ap.created_at, ap.updated_at,
                json_agg(
                  json_build_object(
                    'id', ub.id, 'awarded_at', ub.awarded_at, 'expires_at', ub.expires_at,
                    'badge', json_build_object(
                      'id', b.id, 'code', b.code, 'label', b.label,
                      'description', b.description, 'icon_url', b.icon_url
                    )
                  )
                ) FILTER (WHERE ub.id IS NOT NULL) AS badges
         FROM agent_profiles ap
         LEFT JOIN user_badges ub ON ub.user_id = ap.user_id
         LEFT JOIN badges b ON b.id = ub.badge_id
         WHERE ap.user_id = $1 AND ap.verification_status = 'verified'
         GROUP BY ap.id`,
        [userId]
      );

      return rows[0] || null;
    },

    pendingVerifications: async (_, { limit = 20, offset = 0 }, context) => {
      requireAdmin(context);

      const { rows: docs } = await pool.query(
        `SELECT vd.*,
                json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS agent
         FROM verification_documents vd
         JOIN users u ON u.id = vd.user_id
         WHERE vd.status = 'pending'
         ORDER BY vd.created_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) FROM verification_documents WHERE status = 'pending'`
      );

      return { total: parseInt(countRows[0].count), documents: docs };
    },

    agentDocuments: async (_, { userId }: { userId: string }, context) => {
      requireAdmin(context);

      const { rows } = await pool.query(
        `SELECT vd.*,
                json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS agent
         FROM verification_documents vd
         JOIN users u ON u.id = vd.user_id
         WHERE vd.user_id = $1
         ORDER BY vd.created_at DESC`,
        [userId]
      );

      return rows;
    },
  },

  Mutation: {
    // ----------------------------------------------------------
    // AGENT SELF-ONBOARDING
    // ----------------------------------------------------------

    registerAgentProfile: async (_, { input }, context: Context) => {
      const user = requireAuth(context);

      if (user.role === 'renter' || !user.role) {
        await pool.query(`UPDATE users SET role = 'agent' WHERE id = $1`, [user.id]);
        // Update live session so guards reflect new role immediately
        console.log('setting role')
        if (context.user.sessionId) {
          await SessionManager.updateSessionMetadata(context.user.sessionId, {
            role: 'agent',
          });
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO agent_profiles
           (user_id, agency_name, cac_number, license_number, years_experience, id_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           agency_name      = EXCLUDED.agency_name,
           cac_number       = EXCLUDED.cac_number,
           license_number   = EXCLUDED.license_number,
           years_experience = EXCLUDED.years_experience,
           id_type          = EXCLUDED.id_type,
           updated_at       = NOW()
         RETURNING *`,
        [
          user.id,
          input.agency_name || null,
          input.cac_number || null,
          input.license_number || null,
          input.years_experience || null,
          input.id_type || null,
        ]
      );

      return {
        success: true,
        message:
          'Agent profile created. Upload your verification documents to complete registration.',
        profile: rows[0],
      };
    },

    confirmDocumentUpload: async (
      _,
      { storage_key, doc_type, file_name, mime_type, file_size_bytes },
      context
    ) => {
      const user = requireAgent(context);

      const expectedPrefix = `verification/agent_${user.id}/`;
      if (!storage_key.startsWith(expectedPrefix)) {
        throw new GraphQLError('Invalid storage key.', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO verification_documents
           (user_id, doc_type, storage_key, storage_provider,
            file_name, mime_type, file_size_bytes, status)
         VALUES ($1, $2, $3, 'cloudflare_r2', $4, $5, $6, 'pending')
         RETURNING *`,
        [user.id, doc_type, storage_key, file_name, mime_type, file_size_bytes]
      );

      await pool.query(
        `UPDATE agent_profiles
         SET verification_status = 'pending', updated_at = NOW()
         WHERE user_id = $1 AND verification_status = 'unverified'`,
        [user.id]
      );

      return rows[0];
    },

    // ----------------------------------------------------------
    // ADMIN: DOCUMENT REVIEW
    // ----------------------------------------------------------

    reviewDocument: async (_, { input }, context) => {
      const admin = requireAdmin(context);
      const { doc_id, action, rejection_reason } = input;

      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      const { rows } = await pool.query(
        `UPDATE verification_documents
         SET status           = $1,
             reviewed_by      = $2,
             reviewed_at      = NOW(),
             rejection_reason = $3,
             updated_at       = NOW()
         WHERE id = $4
         RETURNING *`,
        [newStatus, admin.id, rejection_reason || null, doc_id]
      );

      if (!rows[0]) {
        throw new GraphQLError('Document not found.', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const doc = rows[0];

      if (action === 'approve') {
        await maybeFinalizeVerification(doc.user_id, admin.id);
      }

      if (action === 'reject') {
        await pool.query(
          `UPDATE agent_profiles
           SET verification_status = 'unverified', updated_at = NOW()
           WHERE user_id = $1 AND verification_status = 'pending'`,
          [doc.user_id]
        );
      }

      return doc;
    },

    // ----------------------------------------------------------
    // ADMIN: BADGE MANAGEMENT
    // ----------------------------------------------------------

    awardBadge: async (_, { userId, badgeCode, expiresAt }, context) => {
      const admin = requireAdmin(context);

      const { rows: badgeRows } = await pool.query(
        `SELECT id FROM badges WHERE code = $1 AND is_active = true`,
        [badgeCode]
      );
      if (!badgeRows[0]) {
        throw new GraphQLError(`Badge '${badgeCode}' not found or inactive.`);
      }

      const { rows } = await pool.query(
        `INSERT INTO user_badges (user_id, badge_id, awarded_by, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, badge_id) DO UPDATE SET
           awarded_by = EXCLUDED.awarded_by,
           awarded_at = NOW(),
           expires_at = EXCLUDED.expires_at
         RETURNING *`,
        [userId, badgeRows[0].id, admin.id, expiresAt || null]
      );

      if (badgeCode === 'founding_partner') {
        await pool.query(
          `UPDATE agent_profiles
           SET fee_waiver_until = NOW() + INTERVAL '12 months', updated_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
      }

      const { rows: badge } = await pool.query(
        `SELECT * FROM badges WHERE id = $1`,
        [badgeRows[0].id]
      );

      return { ...rows[0], badge: badge[0] };
    },

    revokeBadge: async (_, { userBadgeId }, context) => {
      requireAdmin(context);
      const { rowCount } = await pool.query(
        `DELETE FROM user_badges WHERE id = $1`,
        [userBadgeId]
      );
      return (rowCount ?? 0) > 0;
    },

    // ----------------------------------------------------------
    // ADMIN: CREATE AGENT
    // ----------------------------------------------------------

    adminCreateAgent: async (_, { input }, context) => {
      const admin = requireAdmin(context);

      const existing = await pool.query(
        `SELECT id FROM users WHERE email = $1`,
        [input.email]
      );
      if (existing.rows[0]) {
        return {
          success: false,
          message: 'An account with this email already exists.',
          agent: null,
          profile: null,
          claim_link: null,
        };
      }

      // Create user with an unusable random password — they'll set one via claim link
      const unusablePassword = await bcrypt.hash(
        crypto.randomBytes(32).toString('hex'),
        10
      );

      const { rows: userRows } = await pool.query(
        `INSERT INTO users (name, email, phone, password, role, uid, created_at)
         VALUES ($1, $2, $3, $4, 'agent', '', NOW())
         RETURNING id, name, email, phone, role, created_at`,
        [input.name, input.email, input.phone || null, unusablePassword]
      );
      const user = userRows[0];

      // Create agent profile
      const { rows: profileRows } = await pool.query(
        `INSERT INTO agent_profiles
           (user_id, agency_name, cac_number, license_number, years_experience,
            verification_status, verified_at, verified_by)
         VALUES ($1, $2, $3, $4, $5, $6,
           ${input.skip_verification ? 'NOW()' : 'NULL'},
           ${input.skip_verification ? '$7' : 'NULL'})
         RETURNING *`,
        input.skip_verification
          ? [
              user.id, input.agency_name || null, input.cac_number || null,
              input.license_number || null, input.years_experience || null,
              'verified', admin.id,
            ]
          : [
              user.id, input.agency_name || null, input.cac_number || null,
              input.license_number || null, input.years_experience || null,
              'unverified',
            ]
      );
      const profile = profileRows[0];

      // Award founding_partner badge + fee waiver if requested
      if (input.founding_partner) {
        await awardBadgeByCode(user.id, 'founding_partner', admin.id);
      }

      // If skip_verification, also award the verified_agent badge
      if (input.skip_verification) {
        await awardBadgeByCode(user.id, 'verified_agent', admin.id);
      }

      // Generate 48-hour claim token and send email
      const rawToken = await createToken(user.id, 'account_claim', 48);
      const claimUrl = `${process.env.APP_URL}/claim-account?token=${rawToken}`;

      await sendAccountClaimEmail(user.email, user.name, claimUrl);

      if (input.skip_verification) {
        await sendVerificationApprovedEmail(user.email, user.name);
      }

      console.log(`✅ Agent created by admin: ${user.email}`);

      return {
        success: true,
        message: `Agent account created. Claim email sent to ${user.email}.`,
        // agent: user,
        profile,
        // Only exposed outside production for easy testing
        claim_link: process.env.NODE_ENV !== 'production' ? claimUrl : null,
      };
    },

    // ----------------------------------------------------------
    // ACCOUNT CLAIM (agent activates admin-created account)
    // ----------------------------------------------------------

    claimAccount: async (_, { token, password }) => {
      const result = await consumeToken(token, 'account_claim');
      if (!result) {
        throw new GraphQLError(
          'This link is invalid or has expired. Please contact support.',
          { extensions: { code: 'BAD_USER_INPUT' } }
        );
      }

      if (password.length < 8) {
        throw new GraphQLError('Password must be at least 8 characters.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const hashed = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `UPDATE users SET password = $1 WHERE id = $2
         RETURNING id, email, name, role`,
        [hashed, result.userId]
      );
      const user = rows[0];

      // Issue a session — they're logged in immediately after claiming
      const { accessToken, refreshToken, sessionId } =
        await SessionManager.createSession(user.id, {
          email: user.email,
          role: user.role,
        });

      return { accessToken, refreshToken, sessionId, user };
    },

    // ----------------------------------------------------------
    // PASSWORD RESET (self-serve, any user)
    // ----------------------------------------------------------

    // requestPasswordReset: async (_, { email }) => {
    //   // Always return success — never reveal whether the email exists
    //   const { rows } = await pool.query(
    //     `SELECT id, name FROM users WHERE email = $1`,
    //     [email]
    //   );

    //   if (rows[0]) {
    //     const rawToken = await createToken(rows[0].id, 'password_reset', 1);
    //     const resetUrl = `${process.env.APP_URL}/reset-password?token=${rawToken}`;
    //     await sendPasswordResetEmail(email, rows[0].name, resetUrl);
    //   }

    //   return {
    //     success: true,
    //     message:
    //       'If an account exists for that email, a reset link has been sent.',
    //   };
    // },

    // resetPassword: async (_, { token, newPassword }) => {
    //   const result = await consumeToken(token, 'password_reset');
    //   if (!result) {
    //     throw new GraphQLError('This link is invalid or has expired.', {
    //       extensions: { code: 'BAD_USER_INPUT' },
    //     });
    //   }

    //   if (newPassword.length < 8) {
    //     throw new GraphQLError('Password must be at least 8 characters.', {
    //       extensions: { code: 'BAD_USER_INPUT' },
    //     });
    //   }

    //   const hashed = await bcrypt.hash(newPassword, 10);
    //   await pool.query(
    //     `UPDATE users SET password = $1 WHERE id = $2`,
    //     [hashed, result.userId]
    //   );

    //   // Kill all existing sessions — force fresh login
    //   await SessionManager.deleteAllUserSessions(result.userId);

    //   return { success: true, message: 'Password reset successfully. Please log in.' };
    // },
  },
};