import { GraphQLError } from 'graphql';
import pool from '../config/database.js';
import { AuthUser, Context, UserRole } from '../types/index.js';



// ============================================
// GUARD HELPERS
// Called at the top of any resolver that needs protection.
// Usage:
//   const user = requireAuth(context);
//   requireRole(context, ['admin']);
//   await requireVerified(context);
// ============================================

/**
 * Asserts the request is authenticated.
 * Returns the typed user or throws UNAUTHENTICATED.
 */
export function requireAuth(context: Context): AuthUser {
  if (!context.user) {
    console.log({auth_msg: context.auth_msg, user: context.user})
    throw new GraphQLError('You must be logged in.', {
      extensions: { code: context.auth_msg?? "UNAUTHENTICATED", http: { status: 401 } },
    });
  }
  return context.user;
}

/**
 * Asserts the user has one of the allowed roles.
 * Call after requireAuth.
 */
export function requireRole(
  context: { user: AuthUser | null },
  roles: UserRole[]
): AuthUser {
  const user = requireAuth(context);

  if (!roles.includes(user.role)) {
    throw new GraphQLError(
      `Access denied. Required role: ${roles.join(' or ')}.`,
      { extensions: { code: 'FORBIDDEN', http: { status: 403 } } }
    );
  }

  return user;
}

/**
 * Asserts the user is an admin.
 * Shorthand for requireRole(ctx, ['admin']).
 */
export function requireAdmin(context: { user: AuthUser | null }): AuthUser {
  return requireRole(context, ['admin']);
}

/**
 * Asserts the user is an agent or admin.
 */
export function requireAgent(context: { user: AuthUser | null }): AuthUser {
  return requireRole(context, ['agent', 'admin']);
}

/**
 * Asserts the calling agent has a verified profile.
 * Hits the DB once — only call this on sensitive agent mutations.
 */
export async function requireVerified(
  context: { user: AuthUser | null }
): Promise<AuthUser> {
  const user = requireAgent(context);

  const result = await pool.query(
    `SELECT verification_status FROM agent_profiles WHERE user_id = $1`,
    [user.id]
  );

  if (!result.rows[0] || result.rows[0].verification_status !== 'verified') {
    throw new GraphQLError(
      'Your agent profile must be verified to perform this action.',
      { extensions: { code: 'FORBIDDEN', http: { status: 403 } } }
    );
  }

  return user;
}

/**
 * Asserts the authenticated user owns the resource, or is an admin.
 * Pass the owner's userId from the resource being accessed.
 */
export function requireOwnerOrAdmin(
  context: { user: AuthUser | null },
  resourceOwnerId: string
): AuthUser {
  const user = requireAuth(context);

  if (user.role !== 'admin' && user.id !== resourceOwnerId) {
    throw new GraphQLError('You do not have permission to access this resource.', {
      extensions: { code: 'FORBIDDEN', http: { status: 403 } },
    });
  }

  return user;
}
