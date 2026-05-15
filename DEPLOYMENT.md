# نشر المشروع على Vercel مع قاعدة بيانات Supabase

## 1. الخطة الصحيحة

- الواجهة الأمامية (`frontend`) تُنشر على Vercel.
- الـ backend الحالي في `server/index.js` يعمل كخدمة Node/Express ويجب نشره في استضافة منفصلة أو تحويله إلى وظائف.
- قاعدة البيانات تكون في Supabase.

## 2. لماذا هذا هو الأفضل

- Vercel مناسب جداً للواجهة الثابتة المبنية بواسطة Vite.
- Express لا يعمل "طوال الوقت" على Vercel بدون تحويله إلى وظائف serverless.
- لذلك أفضل حل هو: واجهة على Vercel + backend على خدمة Node منفصلة + DB في Supabase.

## 3. ماذا يجب عليك أن تفعل الآن

### (أ) نشر الواجهة على Vercel
1. ادفع المشروع إلى GitHub.
2. افتح Vercel واختر "Import Project" من GitHub.
3. اختر المستودع وادخل على إعدادات المشروع.
4. ضع:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. أضف متغير البيئة:
   - `VITE_API_URL=https://your-backend-url.com/api`
   - إذا تحتاج `GEMINI_API_KEY` في موقعك، أضفه أيضاً.
6. نشر.

### (ب) نشر backend Express
يمكنك استخدام خدمات مثل: Render, Railway, Heroku, Fly.io.

#### مثال باستخدام Render
1. أنشئ حساب في Render.
2. اختر "New Web Service".
3. ضع Repository الخاص بالمشروع أو مجلد `server/`.
4. اضبط:
   - Root Directory: `server`
   - Build Command: (لا شيء) أو `echo "skip"`
   - Start Command: `node index.js`
5. أضف متغيرات البيئة في Render:
   - `SUPABASE_DB_HOST`
   - `SUPABASE_DB_USER`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_DB_NAME`
   - `SUPABASE_DB_PORT`
   - `PORT=3001`
6. احصل على رابط الخدمة الناتج.

### (ج) ربط الواجهة بالbackend
- ضع رابط الـ backend من Render في `VITE_API_URL` داخل إعدادات Vercel.
- مثال: `https://backend-project.onrender.com/api`

## 4. ما الذي عدلته في المشروع

- عدلت `server/index.js` ليقرأ إعدادات قاعدة البيانات من متغيرات البيئة بدلاً من كلمات سر ثابتة.
- أضفت `vercel.json` لتوجيه Vercel إلى بناء الواجهة كـ static site.
- أضفت `.vercelignore` لكي يتجاهل Vercel مجلد `server/` عند نشر الواجهة.
- أضفت مثال ملفات `.env.example` للجذر والمجلد `server/`.

## 5. نقاط مهمة

- لا ترفع كلمات المرور أو بيانات الاتصال إلى GitHub بشكل مباشر.
- استخدم متغيرات البيئة في Vercel، Render، أو أي استضافة أخرى.
- إذا أردت تشغيل كل شيء محلياً:
  - في `server/`: ضع قيم الاتصال في `server/.env` أو اضبط متغيرات البيئة.
  - في جذر المشروع: ضع `VITE_API_URL=http://localhost:3001/api` في `.env.local`.

## 6. إذا تريد مساعدة إضافية
- أستطيع أن أكتب لك خطوات نشر backend في Render خطوة بخطوة.
- أستطيع أن أساعدك في تحويل هذا التطبيق إلى نشر واحد على Vercel فقط إذا أردت تحويل الـ API إلى وظائف serverless.
