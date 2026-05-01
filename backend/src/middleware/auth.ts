import { NextFunction, Request, Response } from 'express';
import SessionManager from './session.js';

export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    (req as any).user = null;
    return next();
  }

  const token = authHeader.replace('Bearer ', '');
  // console.log({token})
  const result = await SessionManager.verifyAccessToken(token);

  if (result.success === false) {
    (req as any).user = null;
    (req as any).auth_msg = result.error;
    console.log({error: result.error})
    return next();
  }

  const sessionData = result.session;
  console.log({sessionData: sessionData});

  // role comes from the session (which was seeded from the DB at login time)
  (req as any).user = {
    id: sessionData.userId,   // UUID string
    email: sessionData.email,
    role: sessionData.role,
    sessionId: sessionData.sessionId
  };

  next();
};
