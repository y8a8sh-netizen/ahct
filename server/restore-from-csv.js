/**
 * استعادة البيانات من ملفات CSV الأصلية
 * التشغيل: node restore-from-csv.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CSV_DIR = path.join(__dirname, '..', 'examapp', 'New folder');
// للإنتاج: API_URL=https://ahct.onrender.com node restore-from-csv.js
const API = process.env.API_URL || 'http://localhost:3001';

function parseCSV(content) {
    const clean = content.replace(/^\uFEFF/, '').trim();
    const lines = clean.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const split = (line) => line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const headers = split(lines[0]);
    return lines.slice(1).map((line) => {
        const vals = split(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
    });
}

function readCsv(name) {
    const p = path.join(CSV_DIR, name);
    if (!fs.existsSync(p)) throw new Error('ملف غير موجود: ' + p);
    return parseCSV(fs.readFileSync(p, 'utf8'));
}

function buildState() {
    const examRows = readCsv('1.csv');
    const studentRows = readCsv('2.csv');
    const roomRows = readCsv('3.csv');
    const proctorRows = readCsv('4.csv');

    const examsMap = new Map();
    examRows.forEach((row) => {
        const rawType = String(row.ExamType || row.Type || '').trim();
        const isLab = rawType.includes('معمل') || /blackboard|lab/i.test(rawType);
        const code = String(row.course || row.Code || '').trim();
        const spec = String(row.specialization || row.Specialization || 'جميع التخصصات').trim();
        const key = `${code}|${spec}`;
        if (code && !examsMap.has(key)) {
            examsMap.set(key, {
                courseCode: code,
                courseName: row.courseName || row.Name || '',
                date: row.date || row.Date || '',
                time: row.Time || row.time || '',
                duration: parseInt(row.Duration || '120', 10) || 120,
                type: isLab ? 'Blackboard' : 'Paper',
                department: row.department || row.Department || 'عام',
                specialization: spec,
            });
        }
    });
    const exams = Array.from(examsMap.values());

    const studentsMap = new Map();
    studentRows.forEach((row) => {
        const id = row.studentId || row.ID || row.student_id;
        if (!id) return;
        const spec = (row.specialization || row.Specialization || 'عام').trim();
        if (!studentsMap.has(id)) {
            studentsMap.set(id, { id, name: row.StudentName || row.Name || '', specialization: spec, courseCodes: [] });
        }
        const student = studentsMap.get(id);
        const course = (row.course || row.Code || '').trim();
        if (!course) return;
        const matching = exams.filter((e) => e.courseCode === course);
        let ok = true;
        if (matching.length > 0) {
            ok = matching.some((e) => {
                const es = (e.specialization || '').trim();
                return es === 'جميع التخصصات' || es === 'عام' || es.toLowerCase() === 'all' || es === student.specialization;
            });
        }
        if (ok && !student.courseCodes.includes(course)) student.courseCodes.push(course);
    });
    const students = Array.from(studentsMap.values());

    const rooms = roomRows.map((row, idx) => {
        const name = row.Location || row.Name || `Room ${idx + 1}`;
        return {
            id: `room-${idx}`,
            name,
            type: (String(row.Type || '').includes('معمل') || name.includes('معمل')) ? 'Lab' : 'Hall',
            capacity: parseInt(row.capacity || row.Capacity || '30', 10) || 30,
        };
    }).filter((r) => r.name);

    const proctors = proctorRows.map((row, idx) => ({
        id: String(row.TeacherId || `proctor-${idx}`),
        name: row.Teacher || row.Name || `Proctor ${idx + 1}`,
        department: row.department || row.Department || 'عام',
    })).filter((p) => p.name);

    return { students, exams, rooms, proctors, committees: [], drafts: [] };
}

function sync(data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const url = new URL(API + '/api/sync');
        const transport = url.protocol === 'https:' ? https : http;
        const req = transport.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: raw }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

(async () => {
    try {
        console.log('📂 قراءة الملفات من:', CSV_DIR);
        const state = buildState();
        console.log('✅ تم تجهيز البيانات:');
        console.log(`   متدربين: ${state.students.length}`);
        console.log(`   مقررات: ${state.exams.length}`);
        console.log(`   قاعات: ${state.rooms.length}`);
        console.log(`   مراقبين: ${state.proctors.length}`);
        console.log('📤 إرسال إلى الخادم...');
        const result = await sync(state);
        if (result.status === 200) {
            console.log('✅ تم حفظ البيانات في قاعدة البيانات بنجاح!');
            console.log('');
            console.log('⚠️ الخطوة التالية مهمة:');
            console.log('   1) افتح الموقع وسجّل دخول كمدير');
            console.log('   2) اذهب لوحة التحكم → توزيع اللجان');
            console.log('   3) اضغط "توزيع تلقائي (متوازن)" لإنشاء اللجان');
            console.log('   4) راجع التقرير ثم احفظ');
        } else {
            console.error('❌ فشل الحفظ:', result.status, result.body);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ خطأ:', err.message);
        process.exit(1);
    }
})();
