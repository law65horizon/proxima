import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../config/redis.js';
import { UserRole } from '../types/index.js';

interface SessionData {
  sessionId: string;
  userId: string;        // UUID — was number
  email?: string;
  role?: UserRole;
  deviceId?: string;
  createdAt: number;
  lastActivity: number;
}

interface JWTPayload {
  userId: string;        // UUID — was number
  sessionId: string;
  email?: string;
  role?: UserRole;
  iat?: number;
  exp?: number;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user?: any;
}

type VerifyTokenResult =
  | { success: true; session: SessionData }
  | { success: false; error: 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'BLACKLISTED' | 'SESSION_NOT_FOUND' };

// ============================================
// CONFIGURATION
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';

const TTL = {
  ACCESS_TOKEN: 30 * 60,
  REFRESH_TOKEN: 30 * 24 * 60 * 60,
  SESSION_REDIS: 30 * 24 * 60 * 60,
  DRAFT: 24 * 60 * 60,
  BLACKLIST: 30 * 60,
};

// ============================================
// SESSION MANAGER CLASS
// ============================================

export class SessionManager {

  static async createSession(
    userId: string,                       // UUID
    userData: Partial<SessionData> = {}
  ): Promise<TokenPair> {
    const sessionId = uuidv4();
    const now = Date.now();

    const sessionData: SessionData = {
      sessionId,
      userId,
      email: userData.email,
      role: userData.role,
      deviceId: userData.deviceId,
      createdAt: now,
      lastActivity: now,
    };

    await redisClient.setEx(
      `session:${sessionId}`,
      TTL.SESSION_REDIS,
      JSON.stringify(sessionData)
    );

    await redisClient.sAdd(`user:${userId}:sessions`, sessionId);
    await redisClient.expire(`user:${userId}:sessions`, TTL.SESSION_REDIS);

    const accessToken = this.generateAccessToken(userId, sessionId, userData);
    const refreshToken = this.generateRefreshToken(userId, sessionId);

    return {
      accessToken,
      refreshToken,
      sessionId,
      user: { id: sessionData.userId, email: sessionData.email },
    };
  }

  static async verifyAccessToken(token: string): Promise<VerifyTokenResult> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

      const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        return { success: false, error: 'BLACKLISTED' };
      }

      const sessionData = await this.getSessionFromRedis(payload.sessionId);
      if (!sessionData.success) {
        return { success: false, error: 'SESSION_NOT_FOUND' };
      }

      this.updateLastActivity(payload.sessionId).catch(err =>
        console.error('Failed to update activity:', err)
      );

      return { success: true, session: sessionData.session };

    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { success: false, error: 'TOKEN_EXPIRED' };
      }

      if (error.name === 'JsonWebTokenError') {
        return { success: false, error: 'INVALID_TOKEN' };
      }

      return { success: false, error: 'INVALID_TOKEN' };
    }

  }

  static async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JWTPayload;

      const data = await this.getSessionFromRedis(payload.sessionId);
      if (!data.session) return null;

      const user = {
        id: data.session.userId,
        email: data.session.email,
        role: data.session.role
      };

      const newAccessToken = this.generateAccessToken(
        data.session.userId,
        payload.sessionId,
        { email: data.session.email, role: data.session.role }
      );

      return {
        accessToken: newAccessToken,
        refreshToken,
        sessionId: payload.sessionId,
        user,
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      return null;
    }
  }

  static async deleteSession(sessionId: string, accessToken?: string): Promise<boolean> {
    try {
      const sessionData = await this.getSessionFromRedis(sessionId);

      await redisClient.del(`session:${sessionId}`);

      if (sessionData.session) {
        await redisClient.sRem(`user:${sessionData.session.userId}:sessions`, sessionId);
      }

      if (accessToken) {
        await redisClient.setEx(`blacklist:${accessToken}`, TTL.BLACKLIST, '1');
      }

      return true;
    } catch (error) {
      console.error('Delete session error:', error);
      return false;
    }
  }

  static async deleteAllUserSessions(userId: string): Promise<number> {  // UUID
    try {
      const sessionIds: string[] = await redisClient.sMembers(`user:${userId}:sessions`) as string[];
      if (sessionIds.length === 0) return 0;

      const pipeline = redisClient.multi();
      sessionIds.forEach(sessionId => pipeline.del(`session:${sessionId}`));
      pipeline.del(`user:${userId}:sessions`);
      await pipeline.exec();

      return sessionIds.length;
    } catch (error) {
      console.error('Delete all sessions error:', error);
      return 0;
    }
  }

  static async getUserActiveSessions(userId: string): Promise<SessionData[]> {  // UUID
    try {
      const sessionIds: any = await redisClient.sMembers(`user:${userId}:sessions`);
      if (sessionIds.length === 0) return [];

      const sessions: SessionData[] = [];
      for (const sessionId of sessionIds) {
        const data = await this.getSessionFromRedis(sessionId);
        if (data.success) {
          sessions.push({ ...data.session, sessionId } as any);
        }
      }

      return sessions;
    } catch (error) {
      console.error('Get active sessions error:', error);
      return [];
    }
  }

  // ============================================
  // DRAFT MANAGEMENT
  // ============================================

  static async saveDraft(userId: string, draftType: string, draftData: any): Promise<void> {
    const key = `draft:${draftType}:${userId}`;
    await redisClient.setEx(key, TTL.DRAFT, JSON.stringify(draftData));
  }

  static async getDraft(userId: string, draftType: string): Promise<any | null> {
    const key = `draft:${draftType}:${userId}`;
    const data = (await redisClient.get(key))?.toString();
    return data ? JSON.parse(data) : null;
  }

  static async deleteDraft(userId: string, draftType: string): Promise<boolean> {
    const key = `draft:${draftType}:${userId}`;
    const result = (await redisClient.del(key)).toString();
    return parseInt(result) > 0;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private static generateAccessToken(
    userId: string,
    sessionId: string,
    userData: Partial<SessionData> = {}
  ): string {
    const payload: JWTPayload = {
      userId,
      sessionId,
      email: userData.email,
      role: userData.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TTL.ACCESS_TOKEN });
  }

  private static generateRefreshToken(userId: string, sessionId: string): string {
    const payload: JWTPayload = { userId, sessionId };
    return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: TTL.REFRESH_TOKEN });
  }

  static async getSessionFromRedis(sessionId: string): Promise<{
    success: boolean;
    message: string;
    session: SessionData | null;
  }> {
    try {
      const data: any = await redisClient.get(`session:${sessionId}`);
      const session: SessionData = JSON.parse(data);
      session.sessionId = sessionId
      if (!session) {
        return { success: false, message: 'Session not found', session: null };
      }
      return { success: true, message: 'Session found', session };
    } catch (error) {
      console.error('Redis get session error:', error);
      return { success: false, message: 'Redis error', session: null };
    }
  }

  private static async updateLastActivity(sessionId: string): Promise<void> {
    try {
      const data = await this.getSessionFromRedis(sessionId);
      if (data.session) {
        data.session.lastActivity = Date.now();
        await redisClient.setEx(
          `session:${sessionId}`,
          TTL.SESSION_REDIS,
          JSON.stringify(data.session)
        );
      }
    } catch (error) {
      console.error('Update activity error:', error);
    }
  }

  static async updateSessionMetadata(
    sessionId: string,
    metadata: Partial<SessionData>
  ): Promise<boolean> {
    try {
      console.log('updating role')
      const existing = await this.getSessionFromRedis(sessionId);
      if (!existing.success) return false;

      const updated = { ...existing.session, ...metadata };
      await redisClient.setEx(
        `session:${sessionId}`,
        TTL.SESSION_REDIS,
        JSON.stringify(updated)
      );

      return true;
    } catch (error) {
      console.error('Update metadata error:', error);
      return false;
    }
  }
}

// ============================================
// APOLLO CONTEXT HELPER
// ============================================

export async function createContext({ req, res }: { req: any; res: any }) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { req, res, user: null, sessionId: null, ip: req.ip };
  }

  const token = authHeader.replace('Bearer ', '');
  const result = await SessionManager.verifyAccessToken(token);

  if (!result.success) return
  const sessionData = result.session

  return {
    req,
    res,
    user: sessionData
      ? {
          id: sessionData.userId,   // UUID string
          email: sessionData.email,
          role: sessionData.role,
        }
      : null,
    sessionId: sessionData ? (jwt.decode(token) as any)?.sessionId : null,
    ip: req.ip,
  };
}

export default SessionManager;
