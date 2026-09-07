import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, hashPassword, verifyPassword } from '../db.js';
import { generateToken, authenticateToken, AuthRequest, checkPermanentFreeAccess } from '../auth.js';
import { UserRole } from '../../src/types/index.js';

const router = Router();

// Student Registration
router.post('/register', (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone, icaiRegistrationNumber, caLevel } = req.body;

    if (!email || !password || !fullName || !icaiRegistrationNumber) {
      return res.status(400).json({ error: 'Please provide all required fields (Name, Email, Password, ICAI Registration Number).' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check existing email
    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const passwordHash = hashPassword(password);
    const role: UserRole = 'STUDENT';

    // Insert user
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(userId, normalizedEmail, passwordHash, fullName.trim(), phone?.trim() || null, role);

    // Insert student profile (default 0 used, 0 purchased, First 2 free)
    db.prepare(`
      INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
      VALUES (?, ?, ?, 0, 0)
    `).run(userId, icaiRegistrationNumber.trim().toUpperCase(), caLevel || 'INTERMEDIATE');

    // Welcome Notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Welcome to CA Exam Checker AI', 'Your account has been created. You receive 2 free full-paper evaluations!', 'SYSTEM')
    `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'STUDENT_SIGNUP', 'USER', ?, 'New student account registered')
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, userId, userId);

    const token = generateToken({ id: userId, email: normalizedEmail, role, fullName: fullName.trim() });
    const isPermanentFree = checkPermanentFreeAccess(normalizedEmail);

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.status(201).json({
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        role,
        hasPermanentFreeAccess: isPermanentFree,
      },
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Normal Professional SaaS Login (Server-Side RBAC)
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare(`
      SELECT id, email, password_hash, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(normalizedEmail) as {
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role: UserRole;
      status: string;
    } | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account has been suspended or blocked. Please contact support.' });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    });

    const isPermanentFree = checkPermanentFreeAccess(user.email);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'USER_LOGIN', 'USER', ?, 'User successfully logged in')
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, user.id, user.id);

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        hasPermanentFreeAccess: isPermanentFree,
      },
    });
  } catch (error: unknown) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Get Current User Profile & Entitlements
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = db.prepare(`
      SELECT id, email, full_name, phone, role, status, created_at FROM users WHERE id = ?
    `).get(userId) as {
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      role: UserRole;
      status: string;
      created_at: string;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPermanentFree = checkPermanentFreeAccess(user.email);

    let profileData: Record<string, unknown> = {};

    if (user.role === 'STUDENT') {
      const studentProfile = db.prepare(`
        SELECT p.*, i.name as institute_name, b.name as batch_name
        FROM student_profiles p
        LEFT JOIN institutes i ON i.id = p.institute_id
        LEFT JOIN batches b ON b.id = p.batch_id
        WHERE p.user_id = ?
      `).get(userId) as Record<string, unknown> | undefined;

      profileData = studentProfile || {};
    } else if (user.role === 'INSTITUTE_ADMIN') {
      const institute = db.prepare(`
        SELECT * FROM institutes WHERE email = ?
      `).get(user.email);

      profileData = { institute };
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        hasPermanentFreeAccess: isPermanentFree,
      },
      profile: profileData,
    });
  } catch (error: unknown) {
    console.error('Auth /me error:', error);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Forgot Password
router.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email.trim().toLowerCase());
  // Always return a positive message to prevent user enumeration attacks
  return res.json({
    message: 'If an account with this email exists, a password reset instruction has been sent to your email.',
  });
});

// Logout (Clear Server Session Cookie)
router.post('/logout', (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', 'ca_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
