const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const CLAIMS_UPLOAD_DIR = path.join(__dirname, '../data/claims-uploads');

// Ensure upload directory exists
if (!fs.existsSync(CLAIMS_UPLOAD_DIR)) {
  fs.mkdirSync(CLAIMS_UPLOAD_DIR, { recursive: true });
}

// ===== PUBLIC ENDPOINTS (for all authenticated users) =====

// Get pending claims count (for badge on main menu)
router.get('/pending-count', requireAuth, (req, res) => {
  const db = getDB();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM claims WHERE status IN ('pending', 'in_progress')
  `).get();
  res.json({ count: row.count });
});

// Get all claims (for claims list page)
router.get('/list', requireAuth, (req, res) => {
  const db = getDB();
  const claims = db.prepare(`
    SELECT c.*,
           ct.id as task_id, ct.status as task_status, ct.assigned_to_name,
           ct.verdict, ct.resolution, ct.evidence_path, ct.evidence_type,
           ct.started_at as task_started_at, ct.resolved_at as task_resolved_at
    FROM claims c
    LEFT JOIN claim_tasks ct ON c.id = ct.claim_id
    ORDER BY c.created_at DESC
  `).all();
  res.json(claims);
});

// Get single claim with task
router.get('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const claim = db.prepare(`
    SELECT c.*,
           ct.id as task_id, ct.status as task_status, ct.assigned_to,
           ct.assigned_to_name, ct.verdict, ct.resolution,
           ct.evidence_path, ct.evidence_type,
           ct.started_at as task_started_at, ct.resolved_at as task_resolved_at
    FROM claims c
    LEFT JOIN claim_tasks ct ON c.id = ct.claim_id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!claim) {
    return res.status(404).json({ error: 'Претензия не найдена' });
  }

  res.json(claim);
});

// Start working on a claim (any staff member)
router.post('/:id/start', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  // Get user name
  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const claimId = req.params.id;

  // Check if claim exists and is pending
  const claim = db.prepare('SELECT status FROM claims WHERE id = ?').get(claimId);
  if (!claim) {
    return res.status(404).json({ error: 'Претензия не найдена' });
  }

  if (claim.status === 'in_progress') {
    return res.status(400).json({ error: 'Претензия уже в работе' });
  }

  if (claim.status !== 'pending') {
    return res.status(400).json({ error: 'Претензия уже решена' });
  }

  // Update claim status
  db.prepare(`UPDATE claims SET status = 'in_progress' WHERE id = ?`).run(claimId);

  // Create task
  const result = db.prepare(`
    INSERT INTO claim_tasks (claim_id, assigned_to, assigned_to_name, status)
    VALUES (?, ?, ?, 'open')
  `).run(claimId, userId, user.login);

  res.json({ success: true, taskId: result.lastInsertRowid });
});

// Resolve a claim (approve or reject)
router.post('/:id/resolve', requireAuth, (req, res) => {
  const { verdict, resolution } = req.body;
  const claimId = req.params.id;
  const userId = req.session.userId;
  const db = getDB();

  if (!verdict || !['approved', 'rejected'].includes(verdict)) {
    return res.status(400).json({ error: 'Укажите решение: approved или rejected' });
  }

  // Get user name
  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);

  // Find the task - either assigned to user or admin resolving
  const currentUserRole = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  let task;
  
  if (currentUserRole.role === 'admin') {
    task = db.prepare('SELECT * FROM claim_tasks WHERE claim_id = ? ORDER BY id DESC LIMIT 1').get(claimId);
  } else {
    task = db.prepare('SELECT * FROM claim_tasks WHERE claim_id = ? AND assigned_to = ?').get(claimId, userId);
  }
  
  if (!task) {
    return res.status(403).json({ error: 'Нет доступа к этой претензии' });
  }

  // Update task
  db.prepare(`
    UPDATE claim_tasks
    SET status = 'resolved', verdict = ?, resolution = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(verdict, resolution || '', task.id);

  // Update claim
  db.prepare(`
    UPDATE claims
    SET status = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(verdict, claimId);

  res.json({ success: true });
});

// Upload evidence for a claim
router.post('/:id/evidence', requireAuth, (req, res) => {
  const claimId = req.params.id;
  const userId = req.session.userId;
  const db = getDB();

  // Check if user is assigned to this claim or admin
  const currentUserRole = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  let task;
  
  if (currentUserRole.role === 'admin') {
    task = db.prepare('SELECT id FROM claim_tasks WHERE claim_id = ? ORDER BY id DESC LIMIT 1').get(claimId);
  } else {
    task = db.prepare('SELECT id FROM claim_tasks WHERE claim_id = ? AND assigned_to = ?').get(claimId, userId);
  }
  
  if (!task) {
    return res.status(403).json({ error: 'Нет доступа к этой претензии' });
  }

  // Handle base64 file upload
  const { fileData, fileType, fileName } = req.body;
  if (!fileData) {
    return res.status(400).json({ error: 'Нет данных файла' });
  }

  const ext = path.extname(fileName) || (fileType && fileType.includes('video') ? '.mp4' : '.jpg');
  const safeName = `claim_${claimId}_${Date.now()}${ext}`;
  const filePath = path.join(CLAIMS_UPLOAD_DIR, safeName);

  // Decode and save base64
  const buffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
  fs.writeFileSync(filePath, buffer);

  const relativePath = `/data/claims-uploads/${safeName}`;

  // Update task with evidence
  db.prepare(`
    UPDATE claim_tasks
    SET evidence_path = ?, evidence_type = ?
    WHERE id = ?
  `).run(relativePath, fileType || 'image', task.id);

  res.json({ success: true, path: relativePath });
});

// ===== ADMIN ENDPOINTS =====

// Create a new claim (admin only)
router.post('/create', requireAuth, (req, res) => {
  const db = getDB();

  // Check admin role
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Только администратор может создавать претензии' });
  }

  const {
    checkNumber, purchaseTime, orderInfo,
    missingProducts, claimText
  } = req.body;

  if (!claimText || claimText.trim() === '') {
    return res.status(400).json({ error: 'Укажите суть претензии' });
  }

  let attachmentPath = null;
  let attachmentType = null;

  // Handle file upload from admin
  if (req.body.attachmentData) {
    const { fileData, fileType, fileName } = req.body.attachmentData;
    const ext = path.extname(fileName) || (fileType && fileType.includes('video') ? '.mp4' : '.jpg');
    const safeName = `claim_admin_${Date.now()}${ext}`;
    const filePath = path.join(CLAIMS_UPLOAD_DIR, safeName);
    const buffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
    fs.writeFileSync(filePath, buffer);
    attachmentPath = `/data/claims-uploads/${safeName}`;
    attachmentType = fileType || 'image';
  }

  const result = db.prepare(`
    INSERT INTO claims (check_number, purchase_time, order_info, missing_products, claim_text, attachment_path, attachment_type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    checkNumber || null,
    purchaseTime || null,
    orderInfo || null,
    missingProducts || null,
    claimText.trim(),
    attachmentPath,
    attachmentType,
    req.session.userId
  );

  res.json({ success: true, claimId: result.lastInsertRowid });
});

// ===== ADMIN: Редактирование претензии =====
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const claimId = req.params.id;
  const { checkNumber, purchaseTime, orderInfo, missingProducts, claimText, status } = req.body;

  // Handle file upload update
  let attachmentPath = null;
  let attachmentType = null;
  
  if (req.body.attachmentData) {
    const { fileData, fileType, fileName } = req.body.attachmentData;
    const ext = path.extname(fileName) || '.jpg';
    const safeName = `claim_edit_${Date.now()}${ext}`;
    const filePath = path.join(CLAIMS_UPLOAD_DIR, safeName);
    const buffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
    fs.writeFileSync(filePath, buffer);
    attachmentPath = `/data/claims-uploads/${safeName}`;
    attachmentType = fileType || 'image';
  }

  db.prepare(`
    UPDATE claims 
    SET check_number = COALESCE(?, check_number),
        purchase_time = COALESCE(?, purchase_time),
        order_info = COALESCE(?, order_info),
        missing_products = COALESCE(?, missing_products),
        claim_text = COALESCE(?, claim_text),
        status = COALESCE(?, status)
        ${attachmentPath ? ', attachment_path = ?, attachment_type = ?' : ''}
    WHERE id = ?
  `).run(
    checkNumber || null,
    purchaseTime || null,
    orderInfo || null,
    missingProducts || null,
    claimText || null,
    status || null,
    ...(attachmentPath ? [attachmentPath, attachmentType] : []),
    claimId
  );

  res.json({ success: true });
});

// Delete claim (admin only)
router.post('/:id/delete', requireAuth, (req, res) => {
  const db = getDB();

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Только администратор может удалять претензии' });
  }

  const claimId = req.params.id;

  // Delete attachments
  const tasks = db.prepare('SELECT evidence_path FROM claim_tasks WHERE claim_id = ?').all(claimId);
  tasks.forEach(t => {
    if (t.evidence_path) {
      const fullPath = path.join(__dirname, '..', t.evidence_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
  });

  const claim = db.prepare('SELECT attachment_path FROM claims WHERE id = ?').get(claimId);
  if (claim && claim.attachment_path) {
    const fullPath = path.join(__dirname, '..', claim.attachment_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  // Delete related records
  db.prepare('DELETE FROM claim_tasks WHERE claim_id = ?').run(claimId);
  db.prepare('DELETE FROM claims WHERE id = ?').run(claimId);

  res.json({ success: true });
});

// Serve claim attachments
router.get('/file/:filename', requireAuth, (req, res) => {
  const filePath = path.join(CLAIMS_UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Файл не найден' });
  }
});

module.exports = router;
