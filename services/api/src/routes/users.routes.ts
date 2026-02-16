import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { auditMiddleware, AuditAction, ResourceType } from "../middleware/auditLog.js";
import bcrypt from "bcrypt";

export const usersRouter = Router();

// GET /users - List users in org (admin only)
usersRouter.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.orgId;

    const result = await db.query(
      `SELECT id, email, role, created_at, last_login_at, is_active
       FROM users
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error('[Users] Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /users - Create new user (admin only)
usersRouter.post("/", requireAuth, requireAdmin, auditMiddleware(AuditAction.USER_CREATED, ResourceType.USER), async (req, res) => {
  try {
    const orgId = req.auth!.orgId;
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'email, password, and role required' });
    }

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or user' });
    }

    // Check if user already exists
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (org_id, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, role, created_at`,
      [orgId, email, hashedPassword, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('[Users] Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /users/:id - Update user (admin only)
usersRouter.put("/:id", requireAuth, requireAdmin, auditMiddleware(AuditAction.USER_UPDATED, ResourceType.USER), async (req, res) => {
  try {
    const orgId = req.auth!.orgId;
    const userId = req.params.id;
    const { role, isActive, password } = req.body;

    // Verify user belongs to org
    const userCheck = await db.query(
      'SELECT id FROM users WHERE id = $1 AND org_id = $2',
      [userId, orgId]
    );

    if (userCheck.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let updateFields = [];
    let params = [userId];
    let paramIndex = 2;

    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updateFields.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramIndex}`);
      params.push(hashedPassword);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const result = await db.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $1 RETURNING id, email, role, is_active, updated_at`,
      params
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[Users] Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /users/:id - Deactivate user (admin only)
usersRouter.delete("/:id", requireAuth, requireAdmin, auditMiddleware(AuditAction.USER_DELETED, ResourceType.USER), async (req, res) => {
  try {
    const orgId = req.auth!.orgId;
    const userId = req.params.id;

    // Cannot delete self
    if (userId === req.auth!.userId) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    const result = await db.query(
      'UPDATE users SET is_active = false WHERE id = $1 AND org_id = $2 RETURNING id',
      [userId, orgId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Users] Error deactivating user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

export default usersRouter;