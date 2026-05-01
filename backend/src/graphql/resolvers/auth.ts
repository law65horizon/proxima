import UserModel from '../../models/User.js';
import crypto from 'crypto';
import pool from '../../config/database.js';
import bcrypt from 'bcryptjs';
import SessionManager from '../../middleware/session.js';
import redisClient from '../../config/redis.js';
import { GraphQLError } from 'graphql';
import { Address, User } from '../../types/index.js';

const OTP_CONFIG = {
  EXPIRY_SECONDS: 600,
  MAX_ATTEMPTS: 5,
  RATE_LIMIT_WINDOW: 3600,
};

// ============================================
// OTP MANAGER
// ============================================

class OTPManager {
  static async generateOTP(email: string): Promise<string> {
    const rateLimitKey = `otp:ratelimit:${email}`;
    const requestCount = parseInt((await redisClient.incr(rateLimitKey)).toString());
    if (requestCount === 1) {
      await redisClient.expire(rateLimitKey, OTP_CONFIG.RATE_LIMIT_WINDOW);
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    await redisClient.setEx(`otp:code:${email}`, OTP_CONFIG.EXPIRY_SECONDS, otp);
    await redisClient.setEx(`otp:attempts:${email}`, OTP_CONFIG.EXPIRY_SECONDS, '0');
    return otp;
  }

  static async verifyOTP(email: string, code: string): Promise<boolean> {
    const otpKey = `otp:code:${email}`;
    const attemptsKey = `otp:attempts:${email}`;

    const storedOTP = await redisClient.get(otpKey);
    if (!storedOTP) throw new Error('OTP expired or not found. Please request a new code.');

    const attempts = parseInt((await redisClient.get(attemptsKey))?.toString() || '0');
    if (attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      await Promise.all([redisClient.del(otpKey), redisClient.del(attemptsKey)]);
      throw new Error('Too many failed attempts. Please request a new code.');
    }

    if (storedOTP !== code) {
      await redisClient.incr(attemptsKey);
      const remaining = OTP_CONFIG.MAX_ATTEMPTS - attempts - 1;
      throw new Error(`Invalid code. ${remaining} attempt(s) remaining.`);
    }

    await Promise.all([redisClient.del(otpKey), redisClient.del(attemptsKey)]);
    return true;
  }

  static async getRemainingTime(email: string): Promise<number> {
    return parseInt((await redisClient.ttl(`otp:code:${email}`)).toString());
  }
}

// ============================================
// RESOLVERS
// ============================================

export default {
  Query: {
    me: async (_, __, { user, auth_msg }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated.', {
          extensions: { code: auth_msg??'UNAUTHENTICATED', http: { status: 401 } },
        });
      }
      const result = await pool.query(
        `SELECT id, email, name, phone, role, created_at FROM users WHERE id = $1`,
        [user.id]
      );
      if (!result.rows[0]) throw new Error('User not found');
      return result.rows[0];
    },

    getSession: async (_, { sessionId }, { user, auth_msg }) => {
      // if (!user) {
      //   throw new GraphQLError('Not authenticated.', {
      //     extensions: { code: auth_msg??'UNAUTHENTICATED', http: { status: 401 } },
      //   });
      // }
      const sessionData = await SessionManager.getSessionFromRedis(sessionId);
      if (!sessionData) return null;
      return {
        message: sessionData.message,
        success: sessionData.success,
        session: sessionData.session && {
          user: { id: sessionData.session.userId, email: sessionData.session.email, role: sessionData.session.role },
          deviceId: sessionData.session.deviceId,
        },
      };
    },

    activeSessions: async (_, __, { user }) => {
      if (!user) throw new Error('Not authenticated');
      const sessions = await SessionManager.getUserActiveSessions(user.id);
      return sessions.map((session: any) => ({
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        createdAt: new Date(session.createdAt).toISOString(),
        lastActivity: new Date(session.lastActivity).toISOString(),
      }));
    },
  },

  Mutation: {
    login: async (_, { email, password, deviceInfo }: any) => {
      try {
        const result = await pool.query(
          `SELECT id, email, name, password, role FROM users WHERE email = $1`,
          [email]
        );
        if (!result.rows[0]) throw new Error('Invalid credentials');

        const dbUser = result.rows[0];
        const validPassword = await bcrypt.compare(password, dbUser.password);
        if (!validPassword) throw new Error('Invalid credentials');

        // Role always read from DB — never hardcoded
        // const { accessToken, refreshToken, sessionId } =
        //   await SessionManager.createSession(dbUser.id, {
        //     email: dbUser.email,
        //     role: dbUser.role,
        //     deviceId: deviceInfo?.deviceId,
        //   });

        return {
          success: true,
          message: 'Logged in successfully',
          // accessToken,
          // refreshToken,
          // sessionId,
          user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role },
        };
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },

    register: async (_, { input }: { input: User & { address: Address } }) => {
      try {
        const existing = await pool.query(
          `SELECT id FROM users WHERE email = $1`,
          [input.email]
        );
        if (existing.rows.length > 0) {
          return { success: false, message: 'Email already registered', user: null };
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);

        // All self-registered users start as 'renter'.
        // Agents are onboarded via the agent registration flow.
        const user = await UserModel.create({
          ...input,
          password: hashedPassword,
          role: 'renter',
        });

        return { success: true, message: 'User created successfully', user };
      } catch (error) {
        console.error('Register error:', error);
        throw error;
      }
    },

    sendVerificationCode: async (_, { email }) => {
      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email format');

        const otp = await OTPManager.generateOTP(email);
        console.log({ otp }); // TODO: wire up email transport

        return {
          success: true,
          message: 'Verification code sent to your email',
          previewUrl: null,
        };
      } catch (error) {
        throw error;
      }
    },

    verifyCode: async (_, { input }: { input: any }, { req }) => {
      try {
        await OTPManager.verifyOTP(input.email, input.code);

        let userResult = await pool.query(
          `SELECT id, email, name, phone, role, created_at FROM users WHERE email = $1`,
          [input.email]
        );

        let user: any;
        const isNewUser = userResult.rows.length === 0;

        if (isNewUser) {
          if (!input.name) throw new Error('Name is required for new users');
          user = await UserModel.create({
            email: input.email,
            name: input.name,
            phone: input.phone,
            password: null,
            role: 'renter',
            address: input.address,
          } as any);
        } else {
          user = userResult.rows[0];
        }

        const { accessToken, refreshToken, sessionId } =
          await SessionManager.createSession(user.id, {
            email: user.email,
            role: user.role,
            deviceId: req.headers['user-agent'],
          });

        console.log({ id: user.id, email: user.email, role: user.role })
        return {
          accessToken,
          refreshToken,
          user: { id: user.id, email: user.email, role: user.role },
          sessionId,
          isNewUser,
        };
      } catch (error) {
        console.error('Verify OTP error:', error);
        throw error;
      }
    },

    refreshAccessToken: async (_, { refreshToken }) => {
      try {
        const tokens = await SessionManager.refreshAccessToken(refreshToken);
        if (!tokens || !tokens.user) {
          throw new GraphQLError('Invalid or expired token', {
            extensions: { code: 'SESSION_EXPIRED', http: { status: 401 } },
          });
        }
        console.log({user: tokens.user})
        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: tokens.user,
          sessionId: tokens.sessionId,
        };
      } catch (error) {
        throw error;
      }
    },

    logout: async (_, { sessionId }, { user, req, auth_msg }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated.', {
          extensions: { code: auth_msg??'UNAUTHENTICATED', http: { status: 401 } },
        });
      }
      try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        await SessionManager.deleteSession(sessionId, token);
        return { success: true, message: 'Logged out successfully' };
      } catch (error) {
        console.error('Logout error:', error);
        throw error;
      }
    },

    logoutAllDevices: async (_, __, { user, auth_msg }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated.', {
          extensions: { code: auth_msg??'UNAUTHENTICATED', http: { status: 401 } },
        });
      }
      try {
        const count = await SessionManager.deleteAllUserSessions(user.id);
        return { success: true, message: `Logged out from ${count} device(s)` };
      } catch (error) {
        console.error('Logout all error:', error);
        throw error;
      }
    },

    updateProfile: async (_, { fullName, phone }, { user }) => {
      if (!user) throw new Error('Not authenticated');
      const result = await pool.query(
        `UPDATE users 
         SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = NOW()
         WHERE id = $3 
         RETURNING id, email, name, phone, role, created_at`,
        [fullName, phone, user.id]
      );
      return result.rows[0];
    },

    changePassword: async (_, { currentPassword, newPassword }, { user, sessionId }) => {
      if (!user) throw new Error('Not authenticated');
      try {
        const result = await pool.query(
          `SELECT password FROM users WHERE id = $1`,
          [user.id]
        );
        if (!result.rows[0]) throw new Error('User not found');

        const dbUser = result.rows[0];

        if (!dbUser.password) {
          const hashed = await bcrypt.hash(newPassword, 10);
          await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, user.id]);
          return { success: true, message: 'Password set successfully' };
        }

        const valid = await bcrypt.compare(currentPassword, dbUser.password);
        if (!valid) throw new Error('Current password is incorrect');

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, user.id]);

        const allSessions = await SessionManager.getUserActiveSessions(user.id);
        for (const session of allSessions) {
          if ((session as any).sessionId !== sessionId) {
            await SessionManager.deleteSession((session as any).sessionId);
          }
        }

        return { success: true, message: 'Password changed successfully' };
      } catch (error) {
        console.error('Change password error:', error);
        throw error;
      }
    },
  },
};
