
const express = require('express');
const { Pool } = require('pg');
const dns = require('dns').promises;
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = Number(process.env.PORT || 3001);

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
    const connectionString = process.env.SUPABASE_DB_URL;
    let config;

    if (connectionString) {
        const parsed = parseSupabaseUrl(connectionString);
        if (parsed) config = parsed;
    }

    if (!config) {
        config = {
            user: process.env.SUPABASE_DB_USER || 'postgres',
            host: process.env.SUPABASE_DB_HOST || 'db.vxsrcsunzttplulgunnz.supabase.co',
            database: process.env.SUPABASE_DB_NAME || 'postgres',
            password: process.env.SUPABASE_DB_PASSWORD || 'Admin@tvtc@1436',
            port: Number(process.env.SUPABASE_DB_PORT || 5432),
            ssl: {
                rejectUnauthorized: false,
            },
            family: 4,
        };
    }

    if (process.env.SUPABASE_DB_HOST_IPV4) {
        config.host = process.env.SUPABASE_DB_HOST_IPV4;
        console.log('SUPABASE_DB_HOST_IPV4 override detected:', config.host);
    }

    return config;
})();

let pool;
let isSupabaseConnected = false;

const createPoolAndTest = async () => {
    try {
        if (dbConfig.host && /[a-zA-Z]/.test(dbConfig.host)) {
            try {
                const lookup = await dns.lookup(dbConfig.host, { family: 4 });
                dbConfig.host = lookup.address;
                console.log('Resolved DB host to IPv4 via lookup:', dbConfig.host);
            } catch (e) {
                try {
                    const addrs = await dns.resolve4(dbConfig.host);
                    if (addrs && addrs.length > 0) {
                        dbConfig.host = addrs[0];
                        console.log('Resolved DB host to IPv4 via resolve4:', dbConfig.host);
                    } else {
                        console.warn('resolve4 returned no addresses for', dbConfig.host);
                    }
                } catch (e2) {
                    console.warn('Could not resolve DB host to IPv4 (lookup+resolve4) for', dbConfig.host, e.message, e2.message);
                }
            }
        }

        pool = new Pool(dbConfig);

        const res = await pool.query('SELECT NOW()');
        isSupabaseConnected = true;
        console.log('\n✅ ✅ ✅ متصل بنجاح مع Supabase ✅ ✅ ✅');
        console.log('📅 وقت السيرفر:', res.rows[0].now);
        console.log('🌐 البيانات تُحفظ في Supabase الآن\n');
        // Initialize DB schema after successful connection
        await initDatabase();
    } catch (err) {
        console.error('❌❌❌ SUPABASE CONNECTION FAILED ❌❌❌');
        console.error('🔴 الخطأ:', err.message);
        console.error('⚠️  تحقق من:');
        console.error('   1. بيانات الاتصال (host, user, password, database)');
        console.error('   2. اتصال الإنترنت');
        console.error('   3. أن قاعدة البيانات موجودة في Supabase');
        console.error('📝 بيانات الاتصال الحالية:');
        console.error('   Host:', dbConfig.host);
        console.error('   User:', dbConfig.user);
        console.error('   Database:', dbConfig.database);
        isSupabaseConnected = false;
    }
};

createPoolAndTest();

// Initialize Database Schema
async function initDatabase() {
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

        await client.query('COMMIT');
        console.log('✅ Database tables initialized successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', err);
    } finally {
        client.release();
    }
}

// --- API ROUTES ---

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
        console.error(err.stack || err);
        // Include error message for debugging (remove in production)
        res.status(500).json({ error: "Failed to fetch data from database", detail: err.message });
    }
});

// 2. POST Full State (Sync)
app.post('/api/sync', async (req, res) => {
    const data = req.body;
    console.log(`[${new Date().toLocaleTimeString()}] 📥 Received sync request (Committees: ${data.committees?.length || 0})`);
    
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

// 3. POST Load Demo Data (for testing when database is empty)
app.post('/api/load-demo-data', async (req, res) => {
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