# نظام جداول الاختبارات - الكلية التقنية بأحد رفيدة

مشروع متكامل لإدارة بيانات الاختبارات، توليد اللجان، إدارة المستخدمين، وطباعة التقارير والجداول لعدة أدوار (مدير النظام، رئيس القسم، المراقب، المتدرب).

> هذه الوثيقة مكتوبة من واقع الكود الحالي في المشروع (`frontend + backend`) بدون افتراضات خارجية.

---

## 1) نظرة عامة

التطبيق يتكون من:

- **واجهة أمامية** مبنية بـ `React + Vite + TypeScript` (واجهة RTL عربية).
- **خلفية** مبنية بـ `Node.js + Express`.
- **قاعدة بيانات** PostgreSQL (غالبًا Supabase، مع دعم اتصال مباشر أو Supabase HTTP client).
- **مصادقة JWT** لمدير النظام ورئيس القسم.
- **بوابات ضيف** مباشرة للمتدرب والمراقب عبر المسارات:
  - `/student`
  - `/proctor`

---

## 2) المعمارية (Architecture)

## الواجهة الأمامية

- المدخل الرئيسي: `index.tsx`
- التطبيق الرئيسي وتوجيه الصفحات حسب الدور: `App.tsx`
- التخطيط الجانبي والتنقل: `components/Layout.tsx`
- الاتصال بالـ API: `services/api.ts`
- إدارة التوكن: `utils/auth.ts`
- أدوات parsing/validation للتواريخ والـCSV: `utils/helpers.ts`
- بوابات المسارات المخصصة للطالب/المراقب: `utils/routes.ts`

## الخلفية

- الخادم: `server/index.js`
- الحزم: `server/package.json`
- الخدمات متاحة تحت prefix: `/api/*`

## نمط حفظ البيانات

- **مصدر الحقيقة الأساسي**: السيرفر/قاعدة البيانات.
- عند بداية تشغيل التطبيق: محاولة جلب البيانات من `/api/state`.
- المستخدمون `readOnly` (رئيس قسم/مراقب/متدرب): تحديث تلقائي كل 10 ثواني من السيرفر.
- مدير النظام فقط: مزامنة تلقائية (debounced) إلى `/api/sync`.

---

## 3) هيكل الملفات المهم

```text
.
├─ App.tsx
├─ index.tsx
├─ index.css
├─ package.json
├─ vite.config.ts
├─ .env.example
├─ components/
│  ├─ Layout.tsx
│  ├─ ScheduleDateDisplay.tsx
│  └─ scheduleReport/
│     ├─ ScheduleReportDocument.tsx
│     ├─ buildScheduleFromBuilder.ts
│     ├─ printFooter.ts
│     └─ types.ts
├─ pages/
│  ├─ LoginPage.tsx
│  ├─ ManagerDashboard.tsx
│  ├─ AiScheduleBuilder.tsx
│  ├─ AdminScheduleEditor.tsx
│  ├─ PermissionsManagement.tsx
│  ├─ DeptHeadPortal.tsx
│  ├─ ProctorPortal.tsx
│  ├─ StudentPortal.tsx
│  └─ PrintProctorSchedules.tsx
├─ services/
│  ├─ api.ts
│  └─ ...
├─ utils/
│  ├─ auth.ts
│  ├─ helpers.ts
│  └─ routes.ts
└─ server/
   ├─ index.js
   ├─ package.json
   └─ render-build.sh
```

---

## 4) الصفحات والميزات (من واقع الكود)

## `LoginPage.tsx`

- اختيار الدور (مدير/رئيس قسم/مراقب/متدرب).
- تسجيل دخول فعلي فقط للمدير ورئيس القسم عبر `/api/auth/login`.
- المراقب والمتدرب يدخلان كـ guest session عند المسارات العامة.

## `ManagerDashboard.tsx`

الصفحة الأكبر وظيفيًا وتشمل:

- رفع ملفات CSV:
  - الاختبارات
  - المتدربين
  - القاعات/المعامل
  - المراقبين
- Preview قبل اعتماد الاستيراد.
- تنزيل قوالب CSV.
- **مسح مستقل وآمن لكل نوع بيانات** (تمت إضافته):
  - حذف الاختبارات/المتدربين/القاعات/المراقبين كلٌ على حدة
  - مع تنظيف العلاقات المرتبطة لمنع البيانات المكسورة.
- قفل تبويبي **إنشاء اللجان** و**التقارير** حتى اكتمال الملفات المطلوبة وتحقق شروط الاتساق الأساسية.
- توليد لجان تلقائيًا (توزيع متوازن) مع:
  - مراعاة نوع الاختبار (ورقي/Blackboard)
  - مراعاة السعات
  - مراعاة التخصص
  - توزيع المراقبين.
- التحقق من الجدول عبر `validateSchedule`.
- تقارير، طباعة، وإدارة متدربين داخل اللجان.

## `AiScheduleBuilder.tsx`

- منشئ جدول ذكي متقدم متعدد الخطوات.
- تحليل مقررات وتوزيعها على فترات.
- إدارة draft schedules وحفظها ضمن state/db.
- معاينة وطباعة تقرير شبكي متقدم عبر مكونات `components/scheduleReport/*`.

## كيف يعمل بناء الجدول الذكي فعليًا (`AiScheduleBuilder.tsx`)

المنطق الحالي يتم على مراحل داخل الصفحة نفسها:

1) **استخراج المقررات من ملف التسجيل**
- قراءة صفوف CSV وتجميعها إلى `CourseInfo`.
- تحديد:
  - `course code`
  - `course name`
  - `department`
  - `specialization`
  - قائمة المتدربين المسجلين في كل مقرر.
- المشروع يدعم حالات تكرار المقرر بين تخصصات مختلفة، مع قرارات `merge/split`.

2) **بناء الفترات الزمنية**
- إنشاء `slots` بناءً على:
  - تاريخ البداية `startDate`
  - عدد الأيام `examDays`
  - عدد الفترات اليومية `periodsPerDay`
  - إعدادات أوقات كل فترة `periodConfigs`.

3) **قرارات الدمج/التفريع**
- عند وجود مقرر مشترك بين تخصصات:
  - إما دمجه في اختبار واحد.
  - أو تفريعه لاختبارات منفصلة.
- القرار يؤثر مباشرة على العدد النهائي للمقررات التي ستدخل جدول التوزيع.

4) **تقييم صلاحية الإسناد لكل مقرر**
- قبل وضع كل مقرر في Slot، النظام يفحص:
  - تعارضات الطلاب.
  - إرهاق اليوم (عدد اختبارات الطالب في اليوم).
  - قيود السعة `maxCapacityPerPeriod` (إن كانت مفعلة).

5) **إسناد المقررات للـ Slots**
- كل مقرر يحصل على `assignedSlot`.
- غير القابل للإسناد يوضع في قائمة `unassigned`.

6) **إخراج نهائي + طباعة**
- تحويل النتيجة إلى `ScheduleDay[]` عبر `buildScheduleFromBuilder.ts`.
- تصنيف المقررات (حاسب/موارد/عام) يعتمد على التخصص بالدرجة الأولى.
- طباعة التقرير الشبكي عبر `ScheduleReportDocument.tsx` مع:
  - ترويسة قابلة للتخصيص
  - Footer قابل للتحرير
  - حفظ إعدادات الطباعة في `localStorage`.

## `AdminScheduleEditor.tsx`

- تعديل يدوي متقدم للجان:
  - تغيير القاعة
  - تغيير المراقبين
  - نقل متدربين بين لجان (بنفس المقرر)
  - إضافة لجنة جديدة
  - حذف لجنة فارغة.

## `PermissionsManagement.tsx`

- CRUD لمستخدمي النظام (`manager`, `dept_head`) عبر API محمي بالتوكن.
- منع حذف الحساب الحالي، ومنع حذف/تحويل آخر مدير (منطق في السيرفر).

## `DeptHeadPortal.tsx`

- استعراض اللجان مع فلاتر متقدمة حسب القسم والتاريخ.
- إحصائيات تشغيلية.
- طباعة كشوف متعددة.

## `ProctorPortal.tsx`

- بحث برقم/اسم المراقب.
- عرض جدول المراقبة مع دمج اللجان المتداخلة في نفس القاعة/الوقت.
- طباعة جدول المراقب.

## `StudentPortal.tsx`

- بحث بالرقم التدريبي.
- عرض جدول الاختبارات المرتبط باللجان الموزع عليها.
- طباعة جدول المتدرب.

## `PrintProctorSchedules.tsx`

- طباعة فردية للمراقب أو جماعية حسب القسم.
- تنسيقات طباعة A4 مع تنسيقات التاريخ الميلادي/الهجري.

## كيف يعمل التوزيع التلقائي للجان فعليًا (`ManagerDashboard.tsx`)

يتم داخل الدالة `generateCommittees`، والمنطق الحالي كالتالي:

1) **فرز الاختبارات**
- ترتيب الاختبارات حسب التاريخ ثم الوقت (باستخدام `parseAnyDate`).

2) **اختيار المتدربين المؤهلين لكل اختبار**
- الطالب يُضم إذا:
  - عنده `courseCode` مطابق.
  - وتخصصه يطابق تخصص الاختبار، أو الاختبار عام (`عام/جميع التخصصات/all`).

3) **اختيار نوع المكان الإجباري**
- `Blackboard` => `Lab`
- `Paper` => `Hall`
- ثم حساب السعة المتاحة في نفس الموعد (`date + time`).

4) **التوزيع على القاعات/المعامل**
- القاعات ترتب تنازليًا حسب السعة.
- التوزيع يحاول تعبئة القاعات تدريجيًا بحسب السعة المتاحة في كل قاعة لنفس الفترة.
- إذا لم تكفِ السعة، تُسجل الحالة في `distributionReport` كغير موزعة مع السبب.

5) **تعيين المراقبين تلقائيًا**
- لكل لجنة يتم اختيار مراقبين (عادةً 2) مع مراعاة:
  - عدم تعارض المراقب في نفس التوقيت بين قاعات مختلفة.
  - موازنة الحمل بين المراقبين قدر الإمكان.

6) **إنشاء اللجان النهائية**
- كل لجنة تنتج بـ:
  - `id`
  - `examCode`
  - `specialization`
  - `roomId`
  - `proctorIds`
  - `studentIds`
- ثم تُحفظ في `data.committees`.

7) **نتيجة التنفيذ**
- تحديث `distributionReport`:
  - `allAssigned: true` إذا تم توزيع الجميع.
  - أو قائمة تفصيلية بالمتبقين وأسباب عدم التوزيع (سعة/قاعات/معامل/توقيت...).
- يمكن بعدها طباعة تقرير أسباب عدم التوزيع مباشرة من الواجهة.

---

## 5) الأدوار والصلاحيات

- **Manager**
  - كتابة كاملة + مزامنة + إدارة مستخدمين + كل الصفحات.
- **Dept Head**
  - قراءة/طباعة فقط (read-only).
- **Proctor**
  - بوابة مراقب فقط (read-only guest).
- **Student**
  - بوابة متدرب فقط (read-only guest).

> في `App.tsx`: المستخدم `readOnly` لا يعمل له sync، فقط refresh دوري من السيرفر.

---

## 6) واجهات API الحالية

Base URL (افتراضيًا): `http://<host>:3001/api`

## Health

- `GET /health`
  - حالة الاتصال بقاعدة البيانات + mode + host.

## Auth

- `POST /auth/login`
  - body: `{ username, password, role }`
  - role المقبول: `manager` أو `dept_head`
  - يرجع: `{ token, user }`

## Users (Manager only)

- `GET /users`
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

> هذه المسارات تتطلب Header:
`Authorization: Bearer <JWT>`

## State

- `GET /state`
  - يعيد كامل SystemState (students/exams/rooms/proctors/committees/drafts)
- `POST /sync`
  - مزامنة كاملة للحالة (bulk replace)
- `POST /load-demo-data`
  - تحميل بيانات تجريبية

### ملاحظة أمنية مهمة من الكود الحالي

- `POST /sync` و `POST /load-demo-data` **غير محميين بالتوكن حاليًا** في السيرفر.
- إن كان النشر على إنترنت عام، يوصى بشدة بحمايتهما middleware (مثل `requireManager`) أو عبر private network.

---

## 7) قاعدة البيانات والجداول

يتم إنشاء الجداول تلقائيًا في وضع PostgreSQL داخل `initDatabase()` في `server/index.js`:

- `exams`
- `rooms`
- `proctors`
- `students`
- `student_courses`
- `committees`
- `committee_proctors`
- `committee_students`
- `draft_schedules`
- `users`

### ملاحظات اتساق

- المفتاح الأساسي في `exams` هو `(courseCode, specialization)`.
- ربط الطلاب بالمقررات في `student_courses`.
- ربط علاقات اللجان عبر `committee_proctors` و `committee_students`.

---

## 8) إعداد البيئة (Environment Variables)

## Frontend

- `VITE_API_BASE_URL`
  - إذا غير موجود، الواجهة تبني الرابط تلقائيًا: `http://<window.location.hostname>:3001/api`

## Backend

- `PORT` (افتراضي `3001`)
- `JWT_SECRET`
- `DATABASE_MODE` (`pg` أو `postgres` أو `http`)
- `DATABASE_URL` / `SUPABASE_DB_URL`
- `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_NAME`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_USE_POOLER`, `SUPABASE_POOLER_HOST`, `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_HOST_IPV4`

---

## 9) التشغيل المحلي

## المتطلبات

- Node.js 18+ (يفضل LTS)
- npm
- قاعدة PostgreSQL (محلية أو Supabase)

## تشغيل السيرفر

```bash
cd server
npm install
npm start
```

## تشغيل الواجهة

```bash
npm install
npm run dev
```

الافتراضيات:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

---

## 10) إنشاء أول حساب مدير (Bootstrap)

من الكود الحالي:

- إنشاء مستخدم جديد عبر API يتطلب أن تكون مديرًا أصلًا.
- لذلك في قاعدة جديدة يجب إدخال أول مدير يدويًا في جدول `users`.

خطوات مقترحة:

1) توليد hash لكلمة المرور:

```bash
cd server
node -e "console.log(require('bcryptjs').hashSync('ChangeMe123!', 10))"
```

2) تنفيذ SQL في قاعدة البيانات:

```sql
INSERT INTO users (username, password_hash, role, name)
VALUES ('admin', '<HASH_FROM_STEP_1>', 'manager', 'System Admin');
```

بعدها تستطيع تسجيل الدخول من الواجهة وإنشاء باقي المستخدمين من صفحة الصلاحيات.

---

## 11) سكربتات Windows المرفقة

في جذر المشروع توجد سكربتات تشغيل/إيقاف:

- `start-frontend.bat`
- `start-server.bat`
- `START-ALL.bat`
- `START-SILENT.bat`
- `STOP-ALL.bat`
- `START.vbs`
- `START-HIDDEN.vbs`

> هذه السكربتات مساعدة محلية فقط، وليست جزءًا من runtime الإجباري.

---

## 12) النشر (Deployment)

## Frontend (Vercel)

- ملف إعداد: `vercel.json`
- build command: `npm run build`
- output: `dist`
- rewrite إلى `index.html` لتطبيق SPA routing.

## Backend (Render)

- ملف إعداد: `render.yaml`
- rootDir: `server`
- start command: `npm start`
- env vars الأساسية: `DATABASE_URL`, `JWT_SECRET`

---

## 13) أوامر مهمة

```bash
# frontend
npm run dev
npm run build
npm run preview

# backend
cd server
npm start
```

---

## 14) ملاحظات تشغيلية مهمة

- التطبيق يعتمد على مزامنة الحالة كاملة (`/api/sync`) وليس patch جزئي.
- في حال انقطاع السيرفر:
  - الواجهة تدخل وضع Offline (خاصة القراءة).
  - المدير يحتفظ بنسخة محلية مؤقتة في `localStorage`.
- توكن المصادقة يُحفظ في `sessionStorage` (`tvtc_auth_token`).
- تواريخ الطباعة تعرض ميلادي/هجري (Umm Al-Qura) في أكثر من شاشة.

---

## 15) ترخيص واستخدام

لم يتم تعريف ملف ترخيص (`LICENSE`) في المستودع الحالي.
إذا كان المشروع للاستخدام الرسمي، يفضل إضافة ترخيص وسياسة مساهمة/إصدارات.

