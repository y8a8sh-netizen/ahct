
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const dns = require('dns');
const dnsPromises = dns.promises;
const cors = require('cors');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tvtc-college-scheduler-dev-secret-change-in-production';
const BOOTSTRAP_MANAGER_USERNAME = (process.env.BOOTSTRAP_MANAGER_USERNAME || 'postgres').trim();
const BOOTSTRAP_MANAGER_PASSWORD = (process.env.BOOTSTRAP_MANAGER_PASSWORD || 'admin123').trim();
const BOOTSTRAP_MANAGER_NAME = (process.env.BOOTSTRAP_MANAGER_NAME || 'مدير النظام').trim();

// Render وغيره قد يفشلون مع IPv6 — نفضّل IPv4 دائماً
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const DEFAULT_SUPABASE_PROJECT_REF = 'vxsrcsunzttplulgunnz';
const DEFAULT_POOLER_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
const DEFAULT_POOLER_PORT = 6543;

const app = express();
const PORT = Number(process.env.PORT || 3001);

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const DATABASE_MODE = (process.env.DATABASE_MODE || '').trim().toLowerCase();

const hasHttpKeys = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL.startsWith('http'));
const hasPgConfig = Boolean(DATABASE_URL || SUPABASE_DB_URL || process.env.SUPABASE_DB_HOST || process.env.SUPABASE_DB_PASSWORD);

let useSupabaseClient = false;
let usePgClient = false;
let dbConnectionMode = 'none';
let supabase = null;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// PostgreSQL Database Setup - SUPABASE ONLY
const parseSupabaseUrl = (connectionString) => {
    try {
        const url = new URL(connectionString);
        // Return explicit connection fields (do not pass `connectionString`)
        // so that `family: 4` is honored by the pg client.
        return {
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            host: url.hostname,
            port: Number(url.port || 5432),
            database: url.pathname ? url.pathname.slice(1) : undefined,
            ssl: { rejectUnauthorized: false },
            family: 4,
        };
    } catch (error) {
        console.error('❌ Invalid SUPABASE_DB_URL:', error.message);
        return null;
    }
};

const dbConfig = (() => {
    const connectionString = DATABASE_URL || process.env.SUPABASE_DB_URL;
    let config;

    if (connectionString) {
        const parsed = parseSupabaseUrl(connectionString);
        if (parsed) config = parsed;
    }

    if (!config) {
        const usePooler = process.env.SUPABASE_USE_POOLER !== 'false';
        const poolerHost = process.env.SUPABASE_POOLER_HOST || DEFAULT_POOLER_HOST;
        const projectRef = process.env.SUPABASE_PROJECT_REF || DEFAULT_SUPABASE_PROJECT_REF;

        config = {
            user: process.env.SUPABASE_DB_USER || (usePooler ? `postgres.${projectRef}` : 'postgres'),
            host: process.env.SUPABASE_DB_HOST || (usePooler ? poolerHost : `db.${projectRef}.supabase.co`),
            database: process.env.SUPABASE_DB_NAME || 'postgres',
            password: process.env.SUPABASE_DB_PASSWORD || 'Admin@tvtc@1436',
            port: Number(process.env.SUPABASE_DB_PORT || (usePooler ? DEFAULT_POOLER_PORT : 5432)),
            ssl: {
                rejectUnauthorized: false,
            },
            family: 4,
        };

        if (usePooler) {
            console.log('Using Supabase connection pooler (IPv4-friendly):', config.host);
        }
    }

    if (process.env.SUPABASE_DB_HOST_IPV4) {
        config.host = process.env.SUPABASE_DB_HOST_IPV4;
        console.log('SUPABASE_DB_HOST_IPV4 override detected:', config.host);
    }

    return config;
})();

let pool;
let isSupabaseConnected = false;

const isInvalidApiKeyError = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('invalid api key') || message.includes('invalid jwt');
};

const verifySupabaseHttpClient = async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });
    const { error } = await client.from('students').select('id').limit(1);
    if (error && isInvalidApiKeyError(error)) {
        return { ok: false, error };
    }
    return { ok: true, client, warning: error?.message };
};

const warmHttpTableColumnsCache = async () => {
    const tables = Object.keys(HTTP_TABLE_DEFAULT_COLUMNS);
    for (const table of tables) {
        try {
            await getHttpTableColumns(table);
        } catch (err) {
            console.warn(`HTTP column cache warmup skipped for ${table}:`, err.message || err);
        }
    }
};

const activateSupabaseHttpClient = (client) => {
    supabase = client;
    useSupabaseClient = true;
    usePgClient = false;
    dbConnectionMode = 'supabase-http';
    isSupabaseConnected = true;
    console.log('\n✅ ✅ ✅ متصل بنجاح مع Supabase عبر HTTP client ✅ ✅ ✅');
    Promise.resolve()
        .then(() => warmHttpTableColumnsCache())
        .then(() => ensureBootstrapManager())
        .catch((err) => {
            console.warn('HTTP startup warmup failed:', err.message || err);
        });
};

let syncInProgress = false;

const resolveDbHostToIPv4 = async (host) => {
    if (!host || !/[a-zA-Z]/.test(host)) {
        return host;
    }

    try {
        const addrs = await dnsPromises.resolve4(host);
        if (addrs && addrs.length > 0) {
            console.log('Resolved DB host to IPv4 via resolve4:', addrs[0]);
            return addrs[0];
        }
    } catch (err) {
        console.warn('resolve4 failed for', host, err.message);
    }

    try {
        const lookup = await dnsPromises.lookup(host, { family: 4, all: true });
        if (Array.isArray(lookup) && lookup.length > 0) {
            console.log('Resolved DB host to IPv4 via lookup:', lookup[0].address);
            return lookup[0].address;
        }
    } catch (err) {
        console.warn('lookup failed for', host, err.message);
    }

    console.warn('Could not resolve DB host to IPv4. Using original host:', host);
    return host;
};

const connectPostgres = async () => {
    if (dbConfig.host) {
        dbConfig.host = await resolveDbHostToIPv4(dbConfig.host);
    }

    pool = new Pool({
        ...dbConfig,
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        ssl: dbConfig.ssl,
    });

    const res = await pool.query('SELECT NOW()');
    useSupabaseClient = false;
    usePgClient = true;
    dbConnectionMode = 'postgres';
    isSupabaseConnected = true;
    console.log('\n✅ ✅ ✅ متصل بنجاح مع PostgreSQL ✅ ✅ ✅');
    console.log('📅 وقت السيرفر:', res.rows[0].now);
    console.log('🔌 وضع الاتصال: Direct PostgreSQL\n');
    await initDatabase();
    await ensureBootstrapManager();
};

const logConnectionFailure = (err) => {
    console.error('❌❌❌ SUPABASE CONNECTION FAILED ❌❌❌');
    console.error('🔴 الخطأ:', err.message || err);
    console.error('⚠️  تحقق من:');
    console.error('   1. SUPABASE_DB_URL أو DATABASE_URL (مُفضّل على Render)');
    console.error('   2. أو SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD');
    console.error('   3. أو SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service_role وليس anon)');
    console.error('📝 بيانات الاتصال الحالية:');
    console.error('   Host:', dbConfig.host);
    console.error('   User:', dbConfig.user);
    console.error('   Database:', dbConfig.database);
    isSupabaseConnected = false;
    dbConnectionMode = 'none';
};

const initDatabaseConnection = async () => {
    const preferPg = DATABASE_MODE === 'pg' || DATABASE_MODE === 'postgres' || hasPgConfig;
    const preferHttp = DATABASE_MODE === 'http' && hasHttpKeys;

    try {
        if (preferPg || !hasHttpKeys) {
            console.log('Database init: trying PostgreSQL first');
            await connectPostgres();
            return;
        }

        if (preferHttp || hasHttpKeys) {
            console.log('Database init: verifying Supabase HTTP client');
            const verified = await verifySupabaseHttpClient();
            if (verified.ok) {
                if (verified.warning) {
                    console.warn('Supabase HTTP connected with warning:', verified.warning);
                }
                activateSupabaseHttpClient(verified.client);
                return;
            }

            console.warn('⚠️ Supabase HTTP key invalid or rejected. Falling back to PostgreSQL.');
            console.warn('   Detail:', verified.error?.message || verified.error);
        }

        console.log('Database init: using PostgreSQL fallback');
        await connectPostgres();
    } catch (err) {
        if (hasHttpKeys && !preferPg) {
            try {
                console.warn('PostgreSQL failed, retrying Supabase HTTP as last attempt');
                const verified = await verifySupabaseHttpClient();
                if (verified.ok) {
                    activateSupabaseHttpClient(verified.client);
                    return;
                }
            } catch (httpErr) {
                console.warn('Supabase HTTP retry failed:', httpErr.message || httpErr);
            }
        }
        logConnectionFailure(err);
    }
};

initDatabaseConnection();

app.get('/api/health', (req, res) => {
    res.json({
        ok: isSupabaseConnected,
        mode: dbConnectionMode,
        host: dbConfig.host,
        version: '2.9-permissions',
        features: ['auth', 'users-crud'],
    });
});

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

async function findUserByLogin(username, role) {
    if (useSupabaseClient) {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, password_hash, role, name')
            .eq('username', username)
            .eq('role', role)
            .maybeSingle();
        if (error) throw error;
        return data;
    }
    const result = await pool.query(
        'SELECT id, username, password_hash, role, name FROM users WHERE username = $1 AND role = $2',
        [username, role]
    );
    return result.rows[0];
}

async function listUsers() {
    if (useSupabaseClient) {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, role, name, created_at')
            .order('role')
            .order('name');
        if (error) throw error;
        return data || [];
    }
    const result = await pool.query(
        'SELECT id, username, role, name, created_at FROM users ORDER BY role, name'
    );
    return result.rows;
}

async function countManagers() {
    if (useSupabaseClient) {
        const { count, error } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'manager');
        if (error) throw error;
        return count || 0;
    }
    const result = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'manager'");
    return result.rows[0].c;
}

async function ensureBootstrapManager() {
    if (!isSupabaseConnected) return;
    try {
        const managers = await countManagers();
        if (managers > 0) return;
        if (!BOOTSTRAP_MANAGER_USERNAME || !BOOTSTRAP_MANAGER_PASSWORD) return;

        const hash = await bcrypt.hash(BOOTSTRAP_MANAGER_PASSWORD, 10);
        if (useSupabaseClient) {
            const { error } = await supabase.from('users').insert({
                username: BOOTSTRAP_MANAGER_USERNAME,
                password_hash: hash,
                role: 'manager',
                name: BOOTSTRAP_MANAGER_NAME,
            });
            if (error) throw error;
        } else {
            await pool.query(
                `INSERT INTO users (username, password_hash, role, name)
                 VALUES ($1, $2, 'manager', $3)
                 ON CONFLICT (username) DO NOTHING`,
                [BOOTSTRAP_MANAGER_USERNAME, hash, BOOTSTRAP_MANAGER_NAME]
            );
        }
        console.log(`✅ Bootstrap manager ready (username: ${BOOTSTRAP_MANAGER_USERNAME})`);
    } catch (err) {
        console.error('❌ Bootstrap manager failed:', err.message || err);
    }
}

async function getStudentInstructions() {
    const defaultTitle = 'تعليمات عامة قبل الاختبار';
    if (useSupabaseClient) {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value, updated_at')
            .eq('key', 'student_instructions')
            .maybeSingle();
        if (error) throw error;
        const value = data?.value || {};
        return {
            title: value.title || defaultTitle,
            text: value.text || '',
            imageDataUrl: value.imageDataUrl || '',
            updatedAt: data?.updated_at || null,
        };
    }

    const result = await pool.query(
        'SELECT value, updated_at FROM app_settings WHERE key = $1 LIMIT 1',
        ['student_instructions']
    );
    if (result.rows.length === 0) {
        return { title: defaultTitle, text: '', imageDataUrl: '', updatedAt: null };
    }
    const value = result.rows[0].value || {};
    return {
        title: value.title || defaultTitle,
        text: value.text || '',
        imageDataUrl: value.imageDataUrl || '',
        updatedAt: result.rows[0].updated_at || null,
    };
}

async function setStudentInstructions(payload) {
    const defaultTitle = 'تعليمات عامة قبل الاختبار';
    const data = {
        title: String(payload?.title || defaultTitle),
        text: String(payload?.text || ''),
        imageDataUrl: String(payload?.imageDataUrl || ''),
    };

    if (useSupabaseClient) {
        const { error } = await supabase
            .from('app_settings')
            .upsert(
                { key: 'student_instructions', value: data },
                { onConflict: 'key' }
            );
        if (error) throw error;
        return getStudentInstructions();
    }

    const result = await pool.query(
        `INSERT INTO app_settings (key, value)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING value, updated_at`,
        ['student_instructions', JSON.stringify(data)]
    );
    const value = result.rows[0].value || {};
    return {
        title: value.title || defaultTitle,
        text: value.text || '',
        imageDataUrl: value.imageDataUrl || '',
        updatedAt: result.rows[0].updated_at || null,
    };
}

app.post('/api/auth/login', async (req, res) => {
    try {
        if (!isSupabaseConnected) {
            return res.status(503).json({ error: 'قاعدة البيانات غير متصلة' });
        }
        const { username, password, role } = req.body || {};
        const trimmedUsername = String(username || '').trim();
        const trimmedPassword = String(password || '').trim();

        if (!trimmedUsername || !trimmedPassword || !role) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور والدور مطلوبة' });
        }
        if (role !== 'manager' && role !== 'dept_head') {
            return res.status(400).json({ error: 'دور غير صالح' });
        }

        const row = await findUserByLogin(trimmedUsername, role);
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

app.get('/api/users', requireManager, async (req, res) => {
    try {
        res.json(await listUsers());
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

        if (useSupabaseClient) {
            const { data, error } = await supabase
                .from('users')
                .insert({ username: trimmedUsername, password_hash: hash, role, name: trimmedName })
                .select('id, username, role, name, created_at')
                .single();
            if (error) {
                if (error.code === '23505') return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
                throw error;
            }
            return res.status(201).json(data);
        }

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

        const existing = useSupabaseClient
            ? (await supabase.from('users').select('id, role').eq('id', userId).maybeSingle()).data
            : (await pool.query('SELECT id, role FROM users WHERE id = $1', [userId])).rows[0];

        if (!existing) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        if (role === 'dept_head' && existing.role === 'manager') {
            if ((await countManagers()) <= 1) {
                return res.status(400).json({ error: 'لا يمكن تحويل آخر مدير في النظام' });
            }
        }

        const updates = {};
        if (trimmedUsername) updates.username = trimmedUsername;
        if (trimmedName) updates.name = trimmedName;
        if (role) updates.role = role;
        if (trimmedPassword) {
            if (trimmedPassword.length < 6) {
                return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
            }
            updates.password_hash = await bcrypt.hash(trimmedPassword, 10);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
        }

        if (useSupabaseClient) {
            const { data, error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', userId)
                .select('id, username, role, name, created_at')
                .single();
            if (error) {
                if (error.code === '23505') return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
                throw error;
            }
            return res.json(data);
        }

        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, val] of Object.entries(updates)) {
            fields.push(`${key} = $${idx++}`);
            values.push(val);
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

        const target = useSupabaseClient
            ? (await supabase.from('users').select('id, role').eq('id', userId).maybeSingle()).data
            : (await pool.query('SELECT id, role FROM users WHERE id = $1', [userId])).rows[0];

        if (!target) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        if (target.role === 'manager' && (await countManagers()) <= 1) {
            return res.status(400).json({ error: 'لا يمكن حذف آخر مدير في النظام' });
        }

        if (useSupabaseClient) {
            const { error } = await supabase.from('users').delete().eq('id', userId);
            if (error) throw error;
        } else {
            await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'فشل حذف المستخدم' });
    }
});

app.get('/api/instructions', async (req, res) => {
    try {
        const instructions = await getStudentInstructions();
        res.json(instructions);
    } catch (err) {
        console.error('Get instructions error:', err);
        res.status(500).json({ error: 'فشل جلب التعليمات' });
    }
});

app.put('/api/instructions', requireManager, async (req, res) => {
    try {
        const { title, text, imageDataUrl } = req.body || {};
        const payload = {
            title: String(title || 'تعليمات عامة قبل الاختبار'),
            text: String(text || ''),
            imageDataUrl: String(imageDataUrl || ''),
        };
        if (payload.imageDataUrl.length > 3 * 1024 * 1024) {
            return res.status(400).json({ error: 'حجم الصورة كبير جدًا' });
        }
        const updated = await setStudentInstructions(payload);
        res.json(updated);
    } catch (err) {
        console.error('Save instructions error:', err);
        res.status(500).json({ error: 'فشل حفظ التعليمات' });
    }
});

// Initialize Database Schema
async function initDatabase() {
    if (useSupabaseClient) {
        console.log('Skipping schema initialization in Supabase HTTP client mode. Ensure your tables exist in Supabase.');
        return;
    }

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

        await client.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMP DEFAULT NOW()
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
}

async function fetchTable(table) {
    if (useSupabaseClient) {
        const pageSize = 1000;
        let from = 0;
        let all = [];
        while (true) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .range(from, from + pageSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
        }
        return all;
    }

    const result = await pool.query(`SELECT * FROM ${table}`);
    return result.rows;
}

function getRowValue(row, ...keys) {
    if (!row) return undefined;
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) return row[key];
        const lower = String(key).toLowerCase();
        if (row[lower] !== undefined && row[lower] !== null) return row[lower];
    }
    return undefined;
}

const KEY_TO_DB_ALIASES = {
    courseCode: ['coursecode', 'course_code', 'courseCode'],
    courseName: ['coursename', 'course_name', 'courseName'],
    studentId: ['studentid', 'student_id', 'studentId'],
    committeeId: ['committeeid', 'committee_id', 'committeeId'],
    proctorId: ['proctorid', 'proctor_id', 'proctorId'],
    examCode: ['examcode', 'exam_code', 'examCode'],
    roomId: ['roomid', 'room_id', 'roomId'],
    createdAt: ['created_at', 'createdat', 'createdAt'],
};

const HTTP_TABLE_DEFAULT_COLUMNS = {
    exams: ['coursecode', 'coursename', 'date', 'time', 'duration', 'type', 'department', 'specialization'],
    student_courses: ['studentid', 'coursecode'],
    committees: ['id', 'examcode', 'roomid', 'specialization'],
    committee_proctors: ['committeeid', 'proctorid'],
    committee_students: ['committeeid', 'studentid'],
    students: ['id', 'name', 'specialization'],
    rooms: ['id', 'name', 'type', 'capacity'],
    proctors: ['id', 'name', 'department'],
    draft_schedules: ['id', 'name', 'created_at', 'payload'],
};

const httpTableColumnsCache = {};

function resolveDbKey(logicalKey, availableColumns) {
    const candidates = KEY_TO_DB_ALIASES[logicalKey] || [logicalKey];
    if (availableColumns?.length) {
        for (const candidate of candidates) {
            const hit = availableColumns.find(
                (col) => col === candidate || col.toLowerCase() === candidate.toLowerCase()
            );
            if (hit) return hit;
        }
    }
    return candidates[0];
}

function mapRowForHttp(row, columns) {
    const mapped = {};
    for (const [key, value] of Object.entries(row)) {
        mapped[resolveDbKey(key, columns)] = value === undefined ? null : value;
    }
    return mapped;
}

async function getHttpTableColumns(table) {
    if (httpTableColumnsCache[table]) return httpTableColumnsCache[table];
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) throw error;
    const columns = data?.[0] ? Object.keys(data[0]) : (HTTP_TABLE_DEFAULT_COLUMNS[table] || ['id']);
    httpTableColumnsCache[table] = columns;
    return columns;
}

async function deleteAll(table, filterColumn) {
    if (useSupabaseClient) {
        const { data, error: selectError } = await supabase.from(table).select('*').limit(1);
        if (selectError) throw selectError;
        if (!data?.length) return;
        const columns = Object.keys(data[0]);
        const filter = resolveDbKey(filterColumn, columns);
        const { error } = await supabase.from(table).delete().not(filter, 'is', null);
        if (error) throw error;
        return;
    }
    await pool.query(`DELETE FROM ${table} WHERE ${filterColumn} <> ''`);
}

async function bulkInsert(table, rows) {
    if (!rows || rows.length === 0) return;

    if (useSupabaseClient) {
        const columns = await getHttpTableColumns(table);
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize).map((row) => mapRowForHttp(row, columns));
            const { error } = await supabase.from(table).insert(chunk, { returning: 'minimal' });
            if (error) throw error;
        }
        return;
    }

    const columns = Object.keys(rows[0]);
    const values = [];
    const placeholders = rows.map((row) => {
        const rowPlaceholders = columns.map((column) => {
            values.push(row[column] === undefined ? null : row[column]);
            return `$${values.length}`;
        });
        return `(${rowPlaceholders.join(',')})`;
    });

    await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')}`, values);
}

// --- API ROUTES ---

// 1. GET Full State
app.get('/api/state', async (req, res) => {
    try {
        const [students, studentCourses, exams, rooms, proctors, committees, commProctors, commStudents, drafts] = await Promise.all([
            fetchTable('students'),
            fetchTable('student_courses'),
            fetchTable('exams'),
            fetchTable('rooms'),
            fetchTable('proctors'),
            fetchTable('committees'),
            fetchTable('committee_proctors'),
            fetchTable('committee_students'),
            fetchTable('draft_schedules'),
        ]);

        const state = {};
        const studentsData = students.rows || students;
        const studentCoursesData = studentCourses.rows || studentCourses;
        const examsData = exams.rows || exams;
        const roomsData = rooms.rows || rooms;
        const proctorsData = proctors.rows || proctors;
        const committeesData = committees.rows || committees;
        const commProctorsData = commProctors.rows || commProctors;
        const commStudentsData = commStudents.rows || commStudents;
        const draftsData = drafts.rows || drafts;

        // Reconstruct Students with Courses
        state.students = studentsData.map((s) => ({
            id: s.id,
            name: s.name,
            specialization: s.specialization,
            courseCodes: studentCoursesData
                .filter((sc) => getRowValue(sc, 'studentId', 'studentid', 'student_id') === s.id)
                .map((sc) => getRowValue(sc, 'courseCode', 'coursecode', 'course_code'))
                .filter(Boolean),
        }));

        // Exams, Rooms, Proctors (Direct mapping)
        state.exams = examsData.map((e) => ({
            courseCode: getRowValue(e, 'courseCode', 'coursecode', 'course_code'),
            courseName: getRowValue(e, 'courseName', 'coursename', 'course_name'),
            date: e.date,
            time: e.time,
            duration: e.duration,
            type: e.type,
            department: e.department,
            specialization: e.specialization,
        }));
        
        state.rooms = roomsData;
        state.proctors = proctorsData;

        // Reconstruct Committees
        state.committees = committeesData.map((c) => ({
            id: c.id,
            examCode: getRowValue(c, 'examCode', 'examcode', 'exam_code'),
            specialization: c.specialization,
            roomId: getRowValue(c, 'roomId', 'roomid', 'room_id'),
            proctorIds: commProctorsData
                .filter((cp) => getRowValue(cp, 'committeeId', 'committeeid', 'committee_id') === c.id)
                .map((cp) => getRowValue(cp, 'proctorId', 'proctorid', 'proctor_id'))
                .filter(Boolean),
            studentIds: commStudentsData
                .filter((cs) => getRowValue(cs, 'committeeId', 'committeeid', 'committee_id') === c.id)
                .map((cs) => getRowValue(cs, 'studentId', 'studentid', 'student_id'))
                .filter(Boolean),
        }));

        state.drafts = draftsData.map(d => ({
            id: d.id,
            name: d.name,
            createdAt: d.created_at,
            ...d.payload
        }));

        res.json(state);
    } catch (err) {
        console.error("Error fetching state:", err);
        console.error(err.stack || err);
        // Include error message for debugging (remove in production)
        res.status(500).json({ error: "Failed to fetch data from database", detail: err.message });
    }
});

// 2. POST Full State (Sync)
app.post('/api/sync', async (req, res) => {
    if (syncInProgress) {
        return res.status(429).json({ error: 'مزامنة جارية بالفعل، انتظر قليلاً ثم حاول مجدداً' });
    }
    syncInProgress = true;

    try {
    const data = req.body;
    console.log(`[${new Date().toLocaleTimeString()}] 📥 Received sync request (Committees: ${data.committees?.length || 0})`);

    if (useSupabaseClient) {
        try {
            await deleteAll('committee_students', 'committeeId');
            await deleteAll('committee_proctors', 'committeeId');
            await deleteAll('committees', 'id');
            await deleteAll('student_courses', 'studentId');
            await deleteAll('students', 'id');
            await deleteAll('exams', 'courseCode');
            await deleteAll('rooms', 'id');
            await deleteAll('proctors', 'id');

            await bulkInsert('exams', (data.exams || []).map((e) => ({
                courseCode: e.courseCode,
                courseName: e.courseName,
                date: e.date,
                time: e.time,
                duration: e.duration,
                type: e.type,
                department: e.department || 'عام',
                specialization: e.specialization || 'عام',
            })));

            await bulkInsert('rooms', (data.rooms || []).map((r) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                capacity: r.capacity,
            })));

            await bulkInsert('proctors', (data.proctors || []).map((p) => ({
                id: p.id,
                name: p.name,
                department: p.department || 'عام',
            })));

            await bulkInsert('students', (data.students || []).map((s) => ({
                id: s.id,
                name: s.name,
                specialization: s.specialization || 'عام',
            })));

            await bulkInsert('student_courses', (data.students || []).flatMap((s) => (s.courseCodes || []).map((courseCode) => ({
                studentId: s.id,
                courseCode,
            }))));

            await bulkInsert('committees', (data.committees || []).map((c) => ({
                id: c.id,
                examCode: c.examCode,
                roomId: c.roomId,
                specialization: c.specialization || 'عام',
            })));

            await bulkInsert('committee_proctors', (data.committees || []).flatMap((c) => (c.proctorIds || []).map((pid) => ({
                committeeId: c.id,
                proctorId: pid,
            }))));

            await bulkInsert('committee_students', (data.committees || []).flatMap((c) => (c.studentIds || []).map((sid) => ({
                committeeId: c.id,
                studentId: sid,
            }))));

            if (Array.isArray(data.drafts)) {
                const existingDrafts = await fetchTable('draft_schedules');
                const existingCapacityById = new Map(
                    (existingDrafts || []).map((d) => [d.id, d?.payload?.maxCapacityPerPeriod])
                );
                await deleteAll('draft_schedules', 'id');
                await bulkInsert('draft_schedules', data.drafts.map((d) => ({
                    id: d.id,
                    name: d.name,
                    created_at: d.createdAt,
                    payload: {
                        startDate: d.startDate,
                        examDays: d.examDays,
                        periodsPerDay: d.periodsPerDay,
                        duration: d.duration,
                        maxCapacityPerPeriod: d.maxCapacityPerPeriod ?? existingCapacityById.get(d.id) ?? 0,
                        periodConfigs: d.periodConfigs,
                        courses: d.courses,
                        slots: d.slots,
                    },
                })));
            }

            return res.json({ success: true, message: 'Database synchronized successfully' });
        } catch (err) {
            console.error('Error syncing data via Supabase HTTP client:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    const client = await pool.connect();
    
    try {
        // Disable per-statement timeout for this sync transaction.
        await client.query("SET LOCAL statement_timeout = 0");
        await client.query('BEGIN');

        // Faster cleanup using TRUNCATE (fewer WAL operations than many DELETEs)
        await client.query("TRUNCATE TABLE committee_students, committee_proctors, committees, student_courses, students, exams, rooms, proctors RESTART IDENTITY;");

        // Helper for bulk inserting many rows with parameterized multi-row VALUES
        const bulkInsert = async (table, columns, rows, chunkSize = 2000) => {
            if (!rows || rows.length === 0) return;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                const params = [];
                const values = chunk.map((r, rowIdx) => {
                    const placeholders = r.map((_, colIdx) => {
                        params.push(r[colIdx]);
                        return `$${params.length}`;
                    });
                    return `(${placeholders.join(',')})`;
                });
                // Use ON CONFLICT DO NOTHING to avoid failing when duplicate text PKs appear
                const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`;
                await client.query(sql, params);
            }
        };

        // Bulk insert Exams
        console.time('bulkInsert:exams');
        await bulkInsert('exams', ['courseCode','courseName','date','time','duration','type','department','specialization'],
            (data.exams || []).map(e => [e.courseCode, e.courseName, e.date, e.time, e.duration, e.type, e.department || 'عام', e.specialization || 'عام']));
        console.timeEnd('bulkInsert:exams');

        // Bulk insert Rooms
        console.time('bulkInsert:rooms');
        await bulkInsert('rooms', ['id','name','type','capacity'],
            (data.rooms || []).map(r => [r.id, r.name, r.type, r.capacity]));
        console.timeEnd('bulkInsert:rooms');

        // Bulk insert Proctors
        console.time('bulkInsert:proctors');
        await bulkInsert('proctors', ['id','name','department'],
            (data.proctors || []).map(p => [p.id, p.name, p.department || 'عام']));
        console.timeEnd('bulkInsert:proctors');

        // Bulk insert Students
        console.time('bulkInsert:students');
        await bulkInsert('students', ['id','name','specialization'],
            (data.students || []).map(s => [s.id, s.name, s.specialization || 'عام']));
        console.timeEnd('bulkInsert:students');

        // Bulk insert Student Courses
        const studentCourseRows = [];
        (data.students || []).forEach(s => {
            (s.courseCodes || []).forEach(code => studentCourseRows.push([s.id, code]));
        });
        console.time('bulkInsert:student_courses');
        await bulkInsert('student_courses', ['studentId','courseCode'], studentCourseRows);
        console.timeEnd('bulkInsert:student_courses');

        // Bulk insert Committees and related tables
        console.time('bulkInsert:committees');
        await bulkInsert('committees', ['id','examCode','roomId','specialization'],
            (data.committees || []).map(c => [c.id, c.examCode, c.roomId, c.specialization || 'عام']));
        console.timeEnd('bulkInsert:committees');

        const committeeProctorRows = [];
        const committeeStudentRows = [];
        (data.committees || []).forEach(c => {
            (c.proctorIds || []).forEach(pid => committeeProctorRows.push([c.id, pid]));
            (c.studentIds || []).forEach(sid => committeeStudentRows.push([c.id, sid]));
        });
        console.time('bulkInsert:committee_proctors');
        await bulkInsert('committee_proctors', ['committeeId','proctorId'], committeeProctorRows);
        console.timeEnd('bulkInsert:committee_proctors');
        console.time('bulkInsert:committee_students');
        await bulkInsert('committee_students', ['committeeId','studentId'], committeeStudentRows);
        console.timeEnd('bulkInsert:committee_students');

        // Insert Draft Schedules
        const existingDraftRows = await client.query("SELECT id, payload FROM draft_schedules");
        const existingCapacityById = new Map(
            (existingDraftRows.rows || []).map((d) => [d.id, d?.payload?.maxCapacityPerPeriod])
        );
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
                        maxCapacityPerPeriod: d.maxCapacityPerPeriod ?? existingCapacityById.get(d.id) ?? 0,
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
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Rollback failed:', rollbackErr.message);
        }
        console.error("Transaction Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
    } finally {
        syncInProgress = false;
    }
});

// 3. POST Load Demo Data (for testing when database is empty)
app.post('/api/load-demo-data', async (req, res) => {
    if (useSupabaseClient) {
        try {
            await deleteAll('committee_students', 'committeeId');
            await deleteAll('committee_proctors', 'committeeId');
            await deleteAll('committees', 'id');
            await deleteAll('student_courses', 'studentId');
            await deleteAll('students', 'id');
            await deleteAll('exams', 'courseCode');
            await deleteAll('rooms', 'id');
            await deleteAll('proctors', 'id');

            await bulkInsert('exams', [
                { courseCode: 'CS101', courseName: 'Programming Basics', date: '2026-05-20', time: '09:00', duration: 120, type: 'Blackboard', department: 'IT', specialization: 'عام' },
                { courseCode: 'CS102', courseName: 'Database Systems', date: '2026-05-21', time: '10:00', duration: 120, type: 'Online', department: 'IT', specialization: 'عام' },
                { courseCode: 'ENG101', courseName: 'English Language', date: '2026-05-22', time: '11:00', duration: 90, type: 'Written', department: 'Languages', specialization: 'عام' },
                { courseCode: 'MATH101', courseName: 'Advanced Mathematics', date: '2026-05-23', time: '14:00', duration: 120, type: 'Written', department: 'Sciences', specialization: 'عام' },
            ]);

            await bulkInsert('rooms', [
                { id: 'ROOM101', name: 'Room 101', type: 'Classroom', capacity: 30 },
                { id: 'ROOM102', name: 'Room 102', type: 'Classroom', capacity: 35 },
                { id: 'ROOM103', name: 'Room 103', type: 'Lab', capacity: 25 },
                { id: 'ROOM104', name: 'Room 104', type: 'Classroom', capacity: 40 },
            ]);

            await bulkInsert('proctors', [
                { id: 'P001', name: 'Ahmed Mohamed', department: 'IT' },
                { id: 'P002', name: 'Fatima Ali', department: 'IT' },
                { id: 'P003', name: 'Mahmoud Salem', department: 'Languages' },
                { id: 'P004', name: 'Lina Khalil', department: 'Sciences' },
            ]);

            const students = [
                { id: 'S001', name: 'Ali Ahmed', specialization: 'عام' },
                { id: 'S002', name: 'Sara Mohamed', specialization: 'عام' },
                { id: 'S003', name: 'Mahmoud Ali', specialization: 'عام' },
                { id: 'S004', name: 'Rihab Salem', specialization: 'عام' },
                { id: 'S005', name: 'Khaled Hassan', specialization: 'عام' },
            ];

            await bulkInsert('students', students);
            await bulkInsert('student_courses', students.flatMap((student) => [
                { studentId: student.id, courseCode: 'CS101' },
                { studentId: student.id, courseCode: 'CS102' },
                { studentId: student.id, courseCode: 'ENG101' },
            ]));

            return res.json({ success: true, message: 'Demo data loaded successfully' });
        } catch (err) {
            console.error('Error loading demo data via Supabase HTTP client:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Clear existing data
        await client.query("DELETE FROM committee_students");
        await client.query("DELETE FROM committee_proctors");
        await client.query("DELETE FROM committees");
        await client.query("DELETE FROM student_courses");
        await client.query("DELETE FROM students");
        await client.query("DELETE FROM exams");
        await client.query("DELETE FROM rooms");
        await client.query("DELETE FROM proctors");

        // Insert Demo Exams
        const demoExams = [
            ['CS101', 'أساسيات البرمجة', '2026-05-20', '09:00', 120, 'Blackboard', 'نظم المعلومات', 'عام'],
            ['CS102', 'قواعد البيانات', '2026-05-21', '10:00', 120, 'Online', 'نظم المعلومات', 'عام'],
            ['ENG101', 'اللغة الإنجليزية', '2026-05-22', '11:00', 90, 'Written', 'لغات', 'عام'],
            ['MATH101', 'الرياضيات المتقدمة', '2026-05-23', '14:00', 120, 'Written', 'العلوم', 'عام'],
        ];

        for (const exam of demoExams) {
            await client.query(
                "INSERT INTO exams (courseCode, courseName, date, time, duration, type, department, specialization) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                exam
            );
        }

        // Insert Demo Rooms
        const demoRooms = [
            ['ROOM101', 'قاعة 101', 'Classroom', 30],
            ['ROOM102', 'قاعة 102', 'Classroom', 35],
            ['ROOM103', 'قاعة 103', 'Lab', 25],
            ['ROOM104', 'قاعة 104', 'Classroom', 40],
        ];

        for (const room of demoRooms) {
            await client.query(
                "INSERT INTO rooms (id, name, type, capacity) VALUES ($1, $2, $3, $4)",
                room
            );
        }

        // Insert Demo Proctors
        const demoProctors = [
            ['P001', 'أحمد محمد', 'نظم المعلومات'],
            ['P002', 'فاطمة علي', 'نظم المعلومات'],
            ['P003', 'محمود سالم', 'لغات'],
            ['P004', 'لينا خليل', 'العلوم'],
        ];

        for (const proctor of demoProctors) {
            await client.query(
                "INSERT INTO proctors (id, name, department) VALUES ($1, $2, $3)",
                proctor
            );
        }

        // Insert Demo Students
        const demoStudents = [
            ['S001', 'علي أحمد', 'عام'],
            ['S002', 'سارة محمد', 'عام'],
            ['S003', 'محمود علي', 'عام'],
            ['S004', 'رحاب سالم', 'عام'],
            ['S005', 'خالد حسن', 'عام'],
        ];

        for (const student of demoStudents) {
            await client.query(
                "INSERT INTO students (id, name, specialization) VALUES ($1, $2, $3)",
                student
            );

            // Assign courses to students
            const courses = ['CS101', 'CS102', 'ENG101'];
            for (const course of courses) {
                await client.query(
                    "INSERT INTO student_courses (studentId, courseCode) VALUES ($1, $2)",
                    [student[0], course]
                );
            }
        }

        await client.query('COMMIT');
        console.log('✅ Demo data loaded successfully');
        res.json({ success: true, message: "Demo data loaded successfully" });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error loading demo data:", err);
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