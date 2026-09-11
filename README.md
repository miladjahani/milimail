# 🚀 Turbo Temp Mail (Cloudflare Workers + GitHub Pages)

یک سرویس کامل، مدرن و کاملاً رایگان **ایمیل موقت (Disposable / Temp Mail)** با ماندگاری ۲۴ ساعته، دریافت زنده پیام‌ها و قابلیت نصب به عنوان PWA.

طراحی شده برای اجرا روی:
* **بک‌اند و سیستم دریافت ایمیل:** [Cloudflare Workers](https://workers.cloudflare.com/) با استفاده از **Email Routing** و **Cloudflare KV**
* **فرانت‌اند:** [GitHub Pages](https://pages.github.com/) (یا Cloudflare Pages)

---

## ✨ امکانات کلیدی

* ⚡ **دریافت خودکار و زنده (Real-time Polling):** پیام‌های جدید بدون نیاز به رفرش صفحه ظاهر می‌شوند.
* 🔒 **انقضای خودکار ۲۴ ساعته:** با قابلیت بومی `expirationTtl: 86400` در KV، پیام‌ها بدون نیاز به Cron Job پس از ۲۴ ساعت به طور خودکار پاک می‌شوند.
* 🎲 **شناسه دلخواه یا تصادفی:** کاربر می‌تواند آدرس تصادفی دریافت کند یا نام کاربری دلخواه خود را بنویسد.
* 🛡️ **نمایش ایمن محتوا:** تفکیک هوشمند هدرها و بدنه پیام با رندر امن HTML درون `iframe sandbox`.
* 📱 **PWA Ready:** پشتیبانی کامل از PWA و Service Worker جهت نصب روی اندروید و iOS.
* 🔔 **اعلان صوتی اختصاصی:** تولید صدای زنگ سبک با Web Audio API به محض رسیدن ایمیل جدید.
* 📋 **کپی سریع و QR Code:** جهت اسکن آسان آدرس با دوربین گوشی.
* 💸 **۱۰۰٪ رایگان:** کاملاً بر روی پلن رایگان (Free Tier) کلودفلر و گیت‌هاب اجرا می‌شود.

---

## 📁 ساختار پروژه

```text
turbo-temp-mail/
├── backend-worker/           # کدهای ورکر کلودفلر (بک‌اند)
│   ├── src/
│   │   ├── index.js          # هندلرهای اصلی email و fetch و API
│   │   └── mime-parser.js    # پارسر مستقل RFC822 / MIME بدون نیاز به کتابخانه خارجی
│   ├── wrangler.toml         # فایل تنظیمات Wrangler
│   └── package.json
├── frontend-pages/           # فرانت‌اند آماده استقرار روی GitHub Pages
│   ├── index.html            # رابط کاربری مدرن با Tailwind CSS و دارک مود
│   ├── app.js                # منطق برنامه و ارتباط با Worker
│   ├── style.css             # استایل‌ها و انیمیشن‌ها
│   ├── manifest.json         # مانیفست PWA
│   └── sw.js                 # سرویس ورکر
├── .github/workflows/        # پایپ‌لاین‌های استقرار خودکار GitHub Actions
│   ├── deploy-pages.yml      # دیپلوی خودکار فرانت‌اند به GitHub Pages
│   └── deploy-worker.yml     # دیپلوی خودکار ورکر با Wrangler Action
└── config.example.json
```

---

## 🛠️ راهنمای گام‌به‌گام راه‌اندازی

### مرحله ۱: تنظیمات دامنه و Cloudflare Email Routing
1. دامنه خود را در کلودفلر ثبت کرده و DNSهای آن را فعال کنید.
2. از منوی سمت چپ دامنه، وارد بخش **Email Routing** شوید و آن را فعال کنید.
3. در صورت درخواست، اجازه دهید رکوردهای DNS (شامل MX و TXT) به صورت خودکار ثبت شوند.

### مرحله ۲: ساخت KV Namespace
1. در داشبورد کلودفلر وارد **Storage & Databases > KV** شوید.
2. یک Namespace جدید با نام `EMAILS_KV` ایجاد کنید.
3. مقدار **KV Namespace ID** تولید شده را کپی کنید.

### مرحله ۳: استقرار Worker (بک‌اند)

#### روش ۱ — از طریق خط فرمان (Termux یا کامپیوتر):
```bash
cd backend-worker
npm install

# لاگین به کلودفلر
npx wrangler login

# آی‌دی KV را در wrangler.toml قرار دهید و سپس دیپلوی کنید:
npx wrangler deploy
```

#### روش ۲ — بدون نیاز به ترمینال (داشبورد کلودفلر):
1. در کلودفلر به **Workers & Pages > Create Application > Worker** بروید.
2. نام ورکر را مثلاً `turbo-temp-mail-worker` بگذارید و Deploy کنید.
3. وارد تنظیمات ورکر شوید: **Settings > Variables > KV Namespace Bindings**
4. دکمه **Add binding** را بزنید:
   * **Variable name:** `EMAILS_KV`
   * **KV namespace:** `EMAILS_KV` (همان که در مرحله ۲ ساختید)
5. به تب **Settings > Variables > Environment Variables** بروید و متغیر `MAIL_DOMAIN` را با مقدار دامنه خود (مثلاً `yourdomain.com`) اضافه کنید.
6. وارد بخش **Quick Edit** کد ورکر شوید و محتویات دو فایل `mime-parser.js` و `index.js` را در آن قرار دهید (یا ماژولار ذخیره کنید) و Save and Deploy نمایید.

### مرحله ۴: اتصال Email Routing به Worker
1. به صفحه دامنه‌تان در کلودفلر برگشته و وارد **Email Routing > Routing Rules** شوید.
2. در بخش **Catch-all address**:
   * وضعیت را **Active** کنید.
   * در بخش **Action**، گزینه **Send to a Worker** را انتخاب کرده و نام Worker خود را برگزینید.
   * تغییرات را ذخیره کنید.

### مرحله ۵: استقرار فرانت‌اند در GitHub Pages
1. در فایل `frontend-pages/app.js`، متغیر `DEFAULT_WORKER_URL` را با آدرس ورکر خود (مثلاً `https://turbo-temp-mail-worker.yourname.workers.dev`) و `DEFAULT_DOMAIN` را با دامنه خود جایگزین کنید.
2. پروژه را به یک مخزن در گیت‌هاب Push کنید.
3. در مخزن گیت‌هاب به **Settings > Pages** بروید.
4. در بخش **Build and deployment > Source**، گزینه **GitHub Actions** را انتخاب کنید.
5. ورک‌فلو `deploy-pages.yml` به طور خودکار اجرا شده و فرانت‌اند شما را روی آدرس گیت‌هاب پیجز منتشر می‌کند.

---

## 📡 اندپوینت‌های REST API ورکر

| متد | مسیر | توضیحات |
| :--- | :--- | :--- |
| `GET` | `/api/config` | دریافت دامنه‌های فعال و مدت انقضا |
| `GET` | `/api/messages?email=user@domain.com` | دریافت لیست خلاصه پیام‌های صندوق |
| `GET` | `/api/message?email=user@domain.com&id=...` | دریافت متن کامل (Text و HTML) یک پیام |
| `DELETE` | `/api/message?email=user@domain.com&id=...` | حذف یک پیام مشخص |
| `DELETE` | `/api/messages?email=user@domain.com` | حذف کامل صندوق ورودی و تمام پیام‌ها |

---

## 🔒 امنیت و حریم خصوصی
* تمام ایمیل‌های دریافتی حداکثر پس از ۲۴ ساعت به طور کامل از روی KV پاک می‌شوند.
* محتوای HTML دریافتی درون `iframe` ایزوله با اتریبیوت `sandbox="allow-same-origin"` رندر می‌شود تا از حملات XSS جلوگیری شود.
