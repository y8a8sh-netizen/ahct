
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const os = require('os');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'tvtc-college-scheduler-dev-secret-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// PostgreSQL Database Setup
const getPoolConfig = () => {
    if (process.env.DATABASE_URL) {
        const useSsl = process.env.DATABASE_URL.includes('supabase') || process.env.DATABASE_SSL === 'true';
        return {
            connectionString: process.env.DATABASE_URL,
            ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        };
    }
    return {
        user: 'postgres',
        host: 'localhost',
        database: 'college_scheduler',
        password: 'admin123',
        port: 5432,
    };
};

const pool = new Pool(getPoolConfig());

const rowToSession = (row) => ({
    id: String(row.id),
    name: row.name,
    role: row.role,
    readOnly: row.role !== 'manager',
});

const requireManager = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح: يلزم تسجيل الدخول كمدير' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'manager') {
            return res.status(403).json({ error: 'هذه العملية للمدير فقط' });
        }
        req.authUser = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً' });
    }
};

// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Could not connect to PostgreSQL database', err);
    } else {
        console.log('✅ Connected to PostgreSQL database');
        console.log('📅 Server time:', res.rows[0].now);
    }
});

// Initialize Database Schema
const initDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS exams (
                courseCode TEXT,
                courseName TEXT,
                date TEXT,
                time TEXT,
                duration INTEGER,
                type TEXT,
                department TEXT DEFAULT 'عام',
                specialization TEXT DEFAULT 'عام',
                PRIMARY KEY (courseCode, specialization)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT,
                type TEXT,
                capacity INTEGER
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS proctors (
                id TEXT PRIMARY KEY,
                name TEXT,
                department TEXT DEFAULT 'عام'
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS students (
                id TEXT PRIMARY KEY,
                name TEXT,
                specialization TEXT DEFAULT 'عام'
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS student_courses (
                studentId TEXT,
                courseCode TEXT,
                FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS committees (
                id TEXT PRIMARY KEY,
                examCode TEXT,
                roomId TEXT,
                specialization TEXT DEFAULT 'عام'
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS committee_proctors (
                committeeId TEXT,
                proctorId TEXT,
                FOREIGN KEY(committeeId) REFERENCES committees(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS committee_students (
                committeeId TEXT,
                studentId TEXT,
                FOREIGN KEY(committeeId) REFERENCES committees(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS draft_schedules (
                id TEXT PRIMARY KEY,
                name TEXT,
                created_at TEXT,
                payload JSONB
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('manager', 'dept_head')),
                name TEXT NOT NULL,
                created_by UUID,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query('COMMIT');
        console.log('✅ Database tables initialized successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', err);
    } finally {
        client.release();
    }
};

// Initialize database on startup
initDatabase();

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
    res.json({ ok: true, version: '2.9-permissions', features: ['auth', 'users-crud'] });
});

// Auth: login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body || {};
        const trimmedUsername = String(username || '').trim();
        const trimmedPassword = String(password || '').trim();

        if (!trimmedUsername || !trimmedPassword || !role) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور والدور مطلوبة' });
        }
        if (role !== 'manager' && role !== 'dept_head') {
            return res.status(400).json({ error: 'دور غير صالح' });
        }

        const result = await pool.query(
            'SELECT id, username, password_hash, role, name FROM users WHERE username = $1 AND role = $2',
            [trimmedUsername, role]
        );
        const row = result.rows[0];
        if (!row) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const valid = await bcrypt.compare(trimmedPassword, row.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const session = rowToSession(row);
        const token = jwt.sign(
            { id: session.id, username: row.username, role: session.role, name: session.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user: session });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'فشل تسجيل الدخول' });
    }
});

// Users CRUD (manager only)
app.get('/api/users', requireManager, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, name, created_at FROM users ORDER BY role, name'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'فشل جلب المستخدمين' });
    }
});

app.post('/api/users', requireManager, async (req, res) => {
    try {
        const { username, password, role, name } = req.body || {};
        const trimmedUsername = String(username || '').trim();
        const trimmedPassword = String(password || '').trim();
        const trimmedName = String(name || '').trim();

        if (!trimmedUsername || !trimmedPassword || !trimmedName) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        if (role !== 'manager' && role !== 'dept_head') {
            return res.status(400).json({ error: 'الدور يجب أن يكون manager أو dept_head' });
        }
        if (trimmedPassword.length < 6) {
            return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
        }

        const hash = await bcrypt.hash(trimmedPassword, 10);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role, name)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, role, name, created_at`,
            [trimmedUsername, hash, role, trimmedName]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
        }
        console.error('Create user error:', err);
        res.status(500).json({ error: 'فشل إنشاء المستخدم' });
    }
});

app.put('/api/users/:id', requireManager, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (Number.isNaN(userId)) {
            return res.status(400).json({ error: 'معرّف غير صالح' });
        }

        const { username, password, role, name } = req.body || {};
        const trimmedUsername = username !== undefined ? String(username).trim() : undefined;
        const trimmedName = name !== undefined ? String(name).trim() : undefined;
        const trimmedPassword = password ? String(password).trim() : '';

        if (role && role !== 'manager' && role !== 'dept_head') {
            return res.status(400).json({ error: 'دور غير صالح' });
        }

        const existing = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        if (role === 'dept_head' && existing.rows[0].role === 'manager') {
            const managers = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'manager'");
            if (managers.rows[0].c <= 1) {
                return res.status(400).json({ error: 'لا يمكن تحويل آخر مدير في النظام' });
            }
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (trimmedUsername) {
            fields.push(`username = $${idx++}`);
            values.push(trimmedUsername);
        }
        if (trimmedName) {
            fields.push(`name = $${idx++}`);
            values.push(trimmedName);
        }
        if (role) {
            fields.push(`role = $${idx++}`);
            values.push(role);
        }
        if (trimmedPassword) {
            if (trimmedPassword.length < 6) {
                return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
            }
            const hash = await bcrypt.hash(trimmedPassword, 10);
            fields.push(`password_hash = $${idx++}`);
            values.push(hash);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
        }

        values.push(userId);
        const result = await pool.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
             RETURNING id, username, role, name, created_at`,
            values
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
        }
        console.error('Update user error:', err);
        res.status(500).json({ error: 'فشل تحديث المستخدم' });
    }
});

app.delete('/api/users/:id', requireManager, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (Number.isNaN(userId)) {
            return res.status(400).json({ error: 'معرّف غير صالح' });
        }

        if (String(userId) === String(req.authUser.id)) {
            return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
        }

        const target = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
        if (!target.rows[0]) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        if (target.rows[0].role === 'manager') {
            const managers = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'manager'");
            if (managers.rows[0].c <= 1) {
                return res.status(400).json({ error: 'لا يمكن حذف آخر مدير في النظام' });
            }
        }

        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'فشل حذف المستخدم' });
    }
});

// 1. GET Full State
app.get('/api/state', async (req, res) => {
    try {
        // Fetch all tables in parallel
        const [students, studentCourses, exams, rooms, proctors, committees, commProctors, commStudents] = await Promise.all([
            pool.query("SELECT * FROM students"),
            pool.query("SELECT * FROM student_courses"),
            pool.query("SELECT * FROM exams"),
            pool.query("SELECT * FROM rooms"),
            pool.query("SELECT * FROM proctors"),
            pool.query("SELECT * FROM committees"),
            pool.query("SELECT * FROM committee_proctors"),
            pool.query("SELECT * FROM committee_students")
        ]);

        const state = {};

        // Reconstruct Students with Courses
        state.students = students.rows.map(s => ({
            id: s.id,
            name: s.name,
            specialization: s.specialization,
            courseCodes: studentCourses.rows.filter(sc => sc.studentid === s.id).map(sc => sc.coursecode)
        }));

        // Exams, Rooms, Proctors (Direct mapping)
        state.exams = exams.rows.map(e => ({
            courseCode: e.coursecode,
            courseName: e.coursename,
            date: e.date,
            time: e.time,
            duration: e.duration,
            type: e.type,
            department: e.department,
            specialization: e.specialization
        }));
        
        state.rooms = rooms.rows;
        state.proctors = proctors.rows;

        // Reconstruct Committees
        state.committees = committees.rows.map(c => ({
            id: c.id,
            examCode: c.examcode,
            specialization: c.specialization,
            roomId: c.roomid,
            proctorIds: commProctors.rows.filter(cp => cp.committeeid === c.id).map(cp => cp.proctorid),
            studentIds: commStudents.rows.filter(cs => cs.committeeid === c.id).map(cs => cs.studentid)
        }));

        const drafts = await pool.query("SELECT * FROM draft_schedules ORDER BY created_at DESC");
        state.drafts = drafts.rows.map(d => ({
            id: d.id,
            name: d.name,
            createdAt: d.created_at,
            ...d.payload
        }));

        res.json(state);
    } catch (err) {
        console.error("Error fetching state:", err);
        res.status(500).json({ error: "Failed to fetch data from database" });
    }
});

// 2. POST Full State (Sync)
app.post('/api/sync', async (req, res) => {
    const data = req.body;
    console.log(`[${new Date().toLocaleTimeString()}] 📥 Received sync request (Committees: ${data.committees?.length || 0})`);
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Clear old data (in correct order due to foreign key constraints)
        await client.query("DELETE FROM committee_students");
        await client.query("DELETE FROM committee_proctors");
        await client.query("DELETE FROM committees");
        await client.query("DELETE FROM student_courses");
        await client.query("DELETE FROM students");
        await client.query("DELETE FROM exams");
        await client.query("DELETE FROM rooms");
        await client.query("DELETE FROM proctors");

        // Insert Exams
        for (const e of data.exams) {
            await client.query(
                "INSERT INTO exams (courseCode, courseName, date, time, duration, type, department, specialization) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                [e.courseCode, e.courseName, e.date, e.time, e.duration, e.type, e.department || 'عام', e.specialization || 'عام']
            );
        }

        // Insert Rooms
        for (const r of data.rooms) {
            await client.query(
                "INSERT INTO rooms (id, name, type, capacity) VALUES ($1, $2, $3, $4)",
                [r.id, r.name, r.type, r.capacity]
            );
        }

        // Insert Proctors
        for (const p of data.proctors) {
            await client.query(
                "INSERT INTO proctors (id, name, department) VALUES ($1, $2, $3)",
                [p.id, p.name, p.department || 'عام']
            );
        }

        // Insert Students & Courses
        for (const s of data.students) {
            await client.query(
                "INSERT INTO students (id, name, specialization) VALUES ($1, $2, $3)",
                [s.id, s.name, s.specialization || 'عام']
            );
            
            for (const code of s.courseCodes) {
                await client.query(
                    "INSERT INTO student_courses (studentId, courseCode) VALUES ($1, $2)",
                    [s.id, code]
                );
            }
        }

        // Insert Committees
        for (const c of data.committees) {
            await client.query(
                "INSERT INTO committees (id, examCode, roomId, specialization) VALUES ($1, $2, $3, $4)",
                [c.id, c.examCode, c.roomId, c.specialization || 'عام']
            );
            
            for (const pid of c.proctorIds) {
                await client.query(
                    "INSERT INTO committee_proctors (committeeId, proctorId) VALUES ($1, $2)",
                    [c.id, pid]
                );
            }
            
            for (const sid of c.studentIds) {
                await client.query(
                    "INSERT INTO committee_students (committeeId, studentId) VALUES ($1, $2)",
                    [c.id, sid]
                );
            }
        }

        // Insert Draft Schedules
        await client.query("DELETE FROM draft_schedules");
        if (Array.isArray(data.drafts)) {
            for (const d of data.drafts) {
                await client.query(
                    "INSERT INTO draft_schedules (id, name, created_at, payload) VALUES ($1, $2, $3, $4)",
                    [d.id, d.name, d.createdAt, JSON.stringify({
                        startDate: d.startDate,
                        examDays: d.examDays,
                        periodsPerDay: d.periodsPerDay,
                        duration: d.duration,
                        periodConfigs: d.periodConfigs,
                        courses: d.courses,
                        slots: d.slots
                    })]
                );
            }
        }

        await client.query('COMMIT');
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Database synchronized successfully`);
        res.json({ success: true, message: "Database synchronized successfully" });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Helper to find local IP
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIp();
    console.log(`Server running on port ${PORT}`);
    console.log(`\n=================================================`);
    console.log(`📡 Backend URL: http://${ip}:${PORT}`);
    console.log(`🌍 Frontend Share Link: http://${ip}:3000`); 
    console.log(`=================================================\n`);
});
