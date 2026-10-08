const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;
const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  "https://nova-proxy-1-7cdg.onrender.com";

const db = new Database("panel.db");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "kowsar-panel-secret-2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

/* =========================
   DATABASE
========================= */

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  total_volume TEXT DEFAULT 'نامحدود',
  used_volume TEXT DEFAULT '0',
  expiry TEXT DEFAULT 'نامحدود',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER UNIQUE,
  token TEXT NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  chat_id TEXT,
  state TEXT,
  data TEXT,
  UNIQUE(admin_id, chat_id)
);
`);

/* =========================
   HELPERS
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getBaseUrl() {
  return PUBLIC_URL.replace(/\/$/, "");
}

function requireLogin(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect("/");
  }

  next();
}

function getAdmin(req) {
  return db
    .prepare("SELECT * FROM admins WHERE id = ?")
    .get(req.session.adminId);
}

function getUser(id, adminId) {
  return db
    .prepare(
      "SELECT * FROM users WHERE id = ? AND admin_id = ?"
    )
    .get(id, adminId);
}

function getConfigs(adminId) {
  return db
    .prepare(
      "SELECT * FROM configs WHERE admin_id = ? ORDER BY id DESC"
    )
    .all(adminId);
}

function subscriptionUrl(token) {
  return `${getBaseUrl()}/sub/${token}`;
}

function userUrl(token) {
  return `${getBaseUrl()}/u/${token}`;
}

/* =========================
   DESIGN
========================= */

function page(title, content, loggedIn = false) {
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>${escapeHtml(title)}</title>

<style>

*{
 box-sizing:border-box;
}

body{
 margin:0;
 font-family:
 Tahoma,
 Arial,
 sans-serif;
 background:
 radial-gradient(
 circle at top right,
 #243b72 0%,
 #10172d 35%,
 #070b17 100%
 );
 color:#fff;
 min-height:100vh;
}

a{
 color:inherit;
 text-decoration:none;
}

.container{
 width:min(1150px,94%);
 margin:auto;
}

.topbar{
 margin:20px auto;
 padding:16px 20px;
 border:1px solid rgba(255,255,255,.1);
 border-radius:22px;
 background:rgba(255,255,255,.07);
 backdrop-filter:blur(20px);
 display:flex;
 align-items:center;
 justify-content:space-between;
 gap:15px;
 box-shadow:0 15px 45px rgba(0,0,0,.25);
}

.logo{
 display:flex;
 align-items:center;
 gap:12px;
 font-size:20px;
 font-weight:bold;
}

.logo-icon{
 width:44px;
 height:44px;
 border-radius:14px;
 display:flex;
 align-items:center;
 justify-content:center;
 background:linear-gradient(135deg,#6d5dfc,#00d4ff);
 box-shadow:0 8px 25px rgba(0,212,255,.25);
}

.nav{
 display:flex;
 gap:8px;
 flex-wrap:wrap;
}

.nav a{
 padding:10px 14px;
 border-radius:12px;
 background:rgba(255,255,255,.06);
 color:#dce7ff;
 font-size:14px;
}

.nav a:hover{
 background:rgba(255,255,255,.13);
}

.hero{
 margin-top:25px;
 padding:32px;
 border-radius:28px;
 background:
 linear-gradient(
 135deg,
 rgba(90,80,220,.28),
 rgba(0,180,255,.08)
 );
 border:1px solid rgba(255,255,255,.1);
 box-shadow:0 25px 70px rgba(0,0,0,.25);
}

.hero h1{
 margin:0 0 10px;
 font-size:32px;
}

.hero p{
 color:#b9c5e2;
 line-height:2;
 margin:0;
}

.grid{
 display:grid;
 grid-template-columns:
 repeat(auto-fit,minmax(220px,1fr));
 gap:18px;
 margin-top:20px;
}

.card{
 background:rgba(255,255,255,.07);
 border:1px solid rgba(255,255,255,.1);
 border-radius:22px;
 padding:22px;
 backdrop-filter:blur(15px);
 box-shadow:0 15px 45px rgba(0,0,0,.18);
}

.stat{
 font-size:30px;
 font-weight:bold;
 margin-top:10px;
}

.muted{
 color:#9eaccb;
 font-size:14px;
}

.form-card{
 max-width:720px;
 margin:35px auto;
}

label{
 display:block;
 margin:15px 0 8px;
 color:#dbe5ff;
}

input,
textarea,
select{
 width:100%;
 border:1px solid rgba(255,255,255,.13);
 outline:none;
 background:rgba(0,0,0,.2);
 color:#fff;
 border-radius:14px;
 padding:14px;
 font-size:15px;
}

textarea{
 min-height:150px;
 resize:vertical;
}

input:focus,
textarea:focus{
 border-color:#00cfff;
 box-shadow:0 0 0 3px rgba(0,207,255,.08);
}

button,
.btn{
 display:inline-flex;
 align-items:center;
 justify-content:center;
 border:0;
 cursor:pointer;
 border-radius:13px;
 padding:12px 17px;
 color:#fff;
 background:linear-gradient(135deg,#635bff,#00bfff);
 font-weight:bold;
 font-size:14px;
}

button:hover,
.btn:hover{
 transform:translateY(-1px);
}

.btn-red{
 background:linear-gradient(135deg,#ff4d6d,#d90429);
}

.btn-green{
 background:linear-gradient(135deg,#00b894,#00cec9);
}

.btn-gray{
 background:rgba(255,255,255,.1);
}

.actions{
 display:flex;
 gap:8px;
 flex-wrap:wrap;
 margin-top:15px;
}

.table-wrap{
 overflow-x:auto;
 margin-top:20px;
}

table{
 width:100%;
 border-collapse:collapse;
 min-width:750px;
}

th,
td{
 padding:14px;
 border-bottom:1px solid rgba(255,255,255,.08);
 text-align:right;
}

th{
 color:#9edfff;
 font-size:13px;
}

td{
 color:#e6ecff;
}

.badge{
 display:inline-block;
 padding:6px 10px;
 border-radius:30px;
 font-size:12px;
}

.badge-on{
 background:rgba(0,200,130,.15);
 color:#54e6b0;
}

.badge-off{
 background:rgba(255,70,100,.15);
 color:#ff7189;
}

.config{
 margin-top:12px;
 padding:14px;
 border-radius:15px;
 background:#070c18;
 border:1px solid rgba(255,255,255,.08);
 word-break:break-all;
 color:#aeeaff;
 font-family:monospace;
 line-height:1.7;
}

.notice{
 padding:15px;
 border-radius:15px;
 margin:15px 0;
 background:rgba(0,200,255,.08);
 border:1px solid rgba(0,200,255,.15);
 color:#c8f3ff;
}

.danger{
 background:rgba(255,50,80,.1);
 border-color:rgba(255,50,80,.2);
 color:#ff9bac;
}

.footer{
 text-align:center;
 color:#7280a1;
 padding:40px 10px;
 font-size:13px;
}

.login-box{
 max-width:450px;
 margin:80px auto;
 padding:30px;
 border-radius:28px;
 background:rgba(255,255,255,.07);
 border:1px solid rgba(255,255,255,.1);
 backdrop-filter:blur(20px);
 box-shadow:0 25px 70px rgba(0,0,0,.3);
}

.login-box h1{
 text-align:center;
}

.center{
 text-align:center;
}

@media(max-width:600px){

 .hero{
  padding:22px;
 }

 .hero h1{
  font-size:25px;
 }

 .topbar{
  align-items:flex-start;
  flex-direction:column;
 }

 .nav{
  width:100%;
 }

 .nav a{
  flex:1;
  text-align:center;
 }

 .card{
  padding:18px;
 }

}

</style>
</head>

<body>

<div class="container">

${
  loggedIn
    ? `
<div class="topbar">

<div class="logo">
<div class="logo-icon">⚡</div>
<span>پنل مدیریت کوثر</span>
</div>

<div class="nav">
<a href="/admin">🏠 داشبورد</a>
<a href="/admin/add">➕ افزودن کاربر</a>
<a href="/admin/telegram">🤖 ربات</a>
<a href="/admin/settings">⚙️ تنظیمات</a>
<a href="/logout">🚪 خروج</a>
</div>

</div>
`
    : ""
}

${content}

<div class="footer">
پنل مدیریت کوثر
<br>
قدرت گرفته از
<a href="https://t.me/ommkko" target="_blank">@ommkko</a>
</div>

</div>

</body>
</html>
`;
}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  if (req.session.adminId) {
    return res.redirect("/admin");
  }

  const adminCount = db
    .prepare("SELECT COUNT(*) AS count FROM admins")
    .get().count;

  if (adminCount === 0) {
    return res.send(
      page(
        "ساخت مدیر",
        `
<div class="login-box">

<div class="center">
<div class="logo-icon" style="margin:auto">⚡</div>
<h1>پنل مدیریت کوثر</h1>
<p class="muted">
برای شروع حساب مدیر را بسازید
</p>
</div>

<form method="POST" action="/create-admin">

<label>نام کاربری مدیر</label>
<input
 name="username"
 required
 placeholder="admin"
>

<label>رمز عبور</label>
<input
 type="password"
 name="password"
 required
 placeholder="رمز عبور"
>

<br><br>

<button style="width:100%">
🚀 ساخت حساب مدیر
</button>

</form>

</div>
`
      )
    );
  }

  res.send(
    page(
      "ورود",
      `
<div class="login-box">

<div class="center">
<div class="logo-icon" style="margin:auto">⚡</div>
<h1>پنل مدیریت کوثر</h1>
<p class="muted">
ورود به پنل مدیریت
</p>
</div>

<form method="POST" action="/login">

<label>نام کاربری</label>
<input
 name="username"
 required
>

<label>رمز عبور</label>
<input
 type="password"
 name="password"
 required
>

<br><br>

<button style="width:100%">
🔐 ورود
</button>

</form>

</div>
`
    )
  );
});

/* =========================
   CREATE ADMIN
========================= */

app.post("/create-admin", async (req, res) => {

  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password) {
    return res.send("اطلاعات کامل نیست.");
  }

  const exists = db
    .prepare("SELECT id FROM admins WHERE username = ?")
    .get(username);

  if (exists) {
    return res.send("این نام کاربری قبلاً استفاده شده است.");
  }

  const hash = await bcrypt.hash(password, 12);

  const result = db
    .prepare(
      "INSERT INTO admins(username,password) VALUES(?,?)"
    )
    .run(username, hash);

  req.session.adminId = result.lastInsertRowid;

  res.redirect("/admin");
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {

  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const admin = db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get(username);

  if (!admin) {
    return res.send("نام کاربری یا رمز عبور اشتباه است.");
  }

  const ok = await bcrypt.compare(
    password,
    admin.password
  );

  if (!ok) {
    return res.send("نام کاربری یا رمز عبور اشتباه است.");
  }

  req.session.adminId = admin.id;

  res.redirect("/admin");
});

/* =========================
   DASHBOARD
========================= */

app.get("/admin", requireLogin, (req, res) => {

  const admin = getAdmin(req);

  const totalUsers = db
    .prepare(
      "SELECT COUNT(*) AS count FROM users WHERE admin_id = ?"
    )
    .get(admin.id).count;

  const activeUsers = db
    .prepare(
      "SELECT COUNT(*) AS count FROM users WHERE admin_id = ? AND active = 1"
    )
    .get(admin.id).count;

  const configs = db
    .prepare(
      "SELECT COUNT(*) AS count FROM configs WHERE admin_id = ?"
    )
    .get(admin.id).count;

  const bot = db
    .prepare(
      "SELECT * FROM telegram_bots WHERE admin_id = ?"
    )
    .get(admin.id);

  const users = db
    .prepare(
      "SELECT * FROM users WHERE admin_id = ? ORDER BY id DESC LIMIT 10"
    )
    .all(admin.id);

  res.send(
    page(
      "داشبورد",
      `
<div class="hero">

<h1>👋 سلام ${escapeHtml(admin.username)}</h1>

<p>
به پنل مدیریت کوثر خوش آمدید.
از اینجا می‌توانید کاربران، کانفیگ‌ها و ربات تلگرام را مدیریت کنید.
</p>

<div class="actions">

<a class="btn" href="/admin/add">
➕ ساخت پنل کاربر
</a>

<a class="btn btn-green" href="/admin/settings">
⚙️ تنظیمات و کانفیگ
</a>

<a
 class="btn btn-gray"
 href="https://t.me/ommkkobot"
 target="_blank"
>
🆓 ساخت پنل رایگان
</a>

</div>

</div>

<div class="grid">

<div class="card">
<div class="muted">👥 کل کاربران</div>
<div class="stat">${totalUsers}</div>
</div>

<div class="card">
<div class="muted">🟢 کاربران فعال</div>
<div class="stat">${activeUsers}</div>
</div>

<div class="card">
<div class="muted">📦 کانفیگ‌ها</div>
<div class="stat">${configs}</div>
</div>

<div class="card">
<div class="muted">🤖 ربات تلگرام</div>
<div class="stat">
${bot ? "🟢" : "🔴"}
</div>
</div>

</div>

<div class="card" style="margin-top:20px">

<h2>👥 آخرین کاربران</h2>

<div class="table-wrap">

<table>

<tr>
<th>نام</th>
<th>حجم</th>
<th>انقضا</th>
<th>وضعیت</th>
<th>مدیریت</th>
</tr>

${
  users.length
    ? users
        .map(
          (u) => `
<tr>

<td>${escapeHtml(u.name)}</td>

<td>${escapeHtml(u.total_volume)}</td>

<td>${escapeHtml(u.expiry)}</td>

<td>
${
  u.active
    ? `<span class="badge badge-on">فعال</span>`
    : `<span class="badge badge-off">غیرفعال</span>`
}
</td>

<td>
<a
 class="btn"
 href="/admin/user/${u.id}"
>
مشاهده
</a>
</td>

</tr>
`
        )
        .join("")
    : `
<tr>
<td colspan="5" class="center">
هنوز کاربری ساخته نشده است.
</td>
</tr>
`
}

</table>

</div>

</div>
`
    )
  );
});

/* =========================
   ADD USER
========================= */

app.get("/admin/add", requireLogin, (req, res) => {

  const configs = getConfigs(req.session.adminId);

  res.send(
    page(
      "ساخت پنل",
      `
<div class="card form-card">

<h2>➕ ساخت پنل کاربر</h2>

<p class="muted">
اطلاعات کاربر را وارد کنید.
کانفیگ‌های موجود در تنظیمات را می‌توانید برای این کاربر انتخاب کنید.
</p>

<form method="POST" action="/admin/add">

<label>نام کاربر</label>
<input
 name="name"
 required
 placeholder="مثلاً علی"
>

<label>حجم</label>
<input
 name="total_volume"
 value="نامحدود"
 placeholder="مثلاً 100GB"
>

<label>تاریخ انقضا</label>
<input
 name="expiry"
 value="نامحدود"
 placeholder="مثلاً 1405/12/30"
>

<label>انتخاب کانفیگ</label>

${
  configs.length
    ? configs
        .map(
          (c) => `
<label style="
display:flex;
gap:10px;
align-items:center;
padding:12px;
background:rgba(255,255,255,.05);
border-radius:12px;
">

<input
 type="checkbox"
 name="configs"
 value="${c.id}"
 style="width:auto"
>

<span>
${escapeHtml(c.name)}
</span>

</label>
`
        )
        .join("")
    : `
<div class="notice">
⚠️ هنوز کانفیگی اضافه نکرده‌اید.
ابتدا از بخش تنظیمات کانفیگ اضافه کنید.
</div>
`
}

<br>

<button>
🚀 ساخت پنل
</button>

</form>

</div>
`
    )
  );
});

app.post("/admin/add", requireLogin, (req, res) => {

  const adminId = req.session.adminId;

  const name = String(req.body.name || "").trim();
  const totalVolume =
    String(req.body.total_volume || "نامحدود").trim();

  const expiry =
    String(req.body.expiry || "نامحدود").trim();

  let selected = req.body.configs || [];

  if (!Array.isArray(selected)) {
    selected = [selected];
  }

  if (!name) {
    return res.send("نام کاربر الزامی است.");
  }

  const token = randomToken();

  const result = db
    .prepare(
      `
      INSERT INTO users
      (admin_id,name,token,total_volume,expiry)
      VALUES(?,?,?,?,?)
      `
    )
    .run(
      adminId,
      name,
      token,
      totalVolume,
      expiry
    );

  const userId = result.lastInsertRowid;

  for (const configId of selected) {

    const config = db
      .prepare(
        "SELECT * FROM configs WHERE id = ? AND admin_id = ?"
      )
      .get(configId, adminId);

    if (!config) continue;

    db.prepare(
      `
      INSERT INTO user_configs
      `
    );
  }

  /*
    اگر جدول user_configs هنوز وجود نداشته باشد
    از سیستم ساده استفاده می‌کنیم و کانفیگ‌ها
    از جدول configs به کاربر متصل می‌شوند.
  */

  res.redirect(`/admin/user/${userId}`);
});

/* =========================
   USER DETAIL
========================= */

app.get("/admin/user/:id", requireLogin, (req, res) => {

  const user = getUser(
    req.params.id,
    req.session.adminId
  );

  if (!user) {
    return res.status(404).send("کاربر پیدا نشد.");
  }

  const configs = getConfigs(req.session.adminId);

  const sub = subscriptionUrl(user.token);
  const publicPage = userUrl(user.token);

  res.send(
    page(
      "مدیریت کاربر",
      `
<div class="hero">

<h1>👤 ${escapeHtml(user.name)}</h1>

<p>
مدیریت پنل این کاربر
</p>

<div class="actions">

<a
 class="btn"
 href="${escapeAttr(publicPage)}"
 target="_blank"
>
🌐 صفحه کاربر
</a>

<a
 class="btn btn-green"
 href="/admin/user/${user.id}/qr"
 target="_blank"
>
📱 QR Code
</a>

</div>

</div>

<div class="grid">

<div class="card">
<div class="muted">حجم</div>
<div class="stat" style="font-size:22px">
${escapeHtml(user.total_volume)}
</div>
</div>

<div class="card">
<div class="muted">انقضا</div>
<div class="stat" style="font-size:22px">
${escapeHtml(user.expiry)}
</div>
</div>

<div class="card">
<div class="muted">وضعیت</div>
<div class="stat" style="font-size:22px">
${user.active ? "🟢 فعال" : "🔴 غیرفعال"}
</div>
</div>

</div>

<div class="card" style="margin-top:20px">

<h2>🔗 لینک اشتراک</h2>

<div class="config">
${escapeHtml(sub)}
</div>

<div class="actions">

<a
 class="btn"
 href="${escapeAttr(sub)}"
 target="_blank"
>
باز کردن
</a>

<button onclick="navigator.clipboard.writeText('${escapeAttr(sub)}')">
📋 کپی لینک
</button>

</div>

</div>

<div class="card" style="margin-top:20px">

<h2>⚙️ ویرایش اطلاعات</h2>

<form method="POST"
action="/admin/user/${user.id}/update">

<label>نام</label>

<input
 name="name"
 value="${escapeAttr(user.name)}"
 required
>

<label>حجم</label>

<input
 name="total_volume"
 value="${escapeAttr(user.total_volume)}"
>

<label>انقضا</label>

<input
 name="expiry"
 value="${escapeAttr(user.expiry)}"
>

<br>

<button>
💾 ذخیره تغییرات
</button>

</form>

<div class="actions">

<form method="POST"
action="/admin/user/${user.id}/toggle">

<button class="${
        user.active ? "btn-red" : "btn-green"
      }">

${user.active ? "🔴 غیرفعال کردن" : "🟢 فعال کردن"}

</button>

</form>

<form
method="POST"
action="/admin/user/${user.id}/delete"
onsubmit="return confirm('آیا از حذف این کاربر مطمئن هستید؟')"
>

<button class="btn-red">
🗑️ حذف کاربر
</button>

</form>

</div>

</div>

<div class="card" style="margin-top:20px">

<h2>📦 کانفیگ‌های موجود</h2>

${
  configs.length
    ? configs
        .map(
          (c) => `
<div style="margin-top:20px">

<strong>
${escapeHtml(c.name)}
</strong>

<div class="config">
${escapeHtml(c.config)}
</div>

</div>
`
        )
        .join("")
    : `
<div class="notice">
هنوز کانفیگی ثبت نشده است.
</div>
`
}

</div>
`
    )
  );
});

/* =========================
   UPDATE USER
========================= */

app.post(
  "/admin/user/:id/update",
  requireLogin,
  (req, res) => {

    const user = getUser(
      req.params.id,
      req.session.adminId
    );

    if (!user) {
      return res.status(404).send("کاربر پیدا نشد.");
    }

    db.prepare(
      `
      UPDATE users
      SET name = ?,
          total_volume = ?,
          expiry = ?
      WHERE id = ?
      AND admin_id = ?
      `
    ).run(
      String(req.body.name || user.name),
      String(
        req.body.total_volume ||
        user.total_volume
      ),
      String(
        req.body.expiry ||
        user.expiry
      ),
      user.id,
      req.session.adminId
    );

    res.redirect(`/admin/user/${user.id}`);
  }
);

/* =========================
   TOGGLE USER
========================= */

app.post(
  "/admin/user/:id/toggle",
  requireLogin,
  (req, res) => {

    const user = getUser(
      req.params.id,
      req.session.adminId
    );

    if (!user) {
      return res.status(404).send("کاربر پیدا نشد.");
    }

    db.prepare(
      `
      UPDATE users
      SET active = ?
      WHERE id = ?
      AND admin_id = ?
      `
    ).run(
      user.active ? 0 : 1,
      user.id,
      req.session.adminId
    );

    res.redirect(`/admin/user/${user.id}`);
  }
);

/* =========================
   DELETE USER
========================= */

app.post(
  "/admin/user/:id/delete",
  requireLogin,
  (req, res) => {

    db.prepare(
      `
      DELETE FROM users
      WHERE id = ?
      AND admin_id = ?
      `
    ).run(
      req.params.id,
      req.session.adminId
    );

    res.redirect("/admin");
  }
);

/* =========================
   QR
========================= */

app.get(
  "/admin/user/:id/qr",
  requireLogin,
  async (req, res) => {

    const user = getUser(
      req.params.id,
      req.session.adminId
    );

    if (!user) {
      return res.status(404).send("کاربر پیدا نشد.");
    }

    const url = subscriptionUrl(user.token);

    const qr = await QRCode.toDataURL(url);

    res.send(
      page(
        "QR Code",
        `
<div class="card center">

<h2>📱 QR Code</h2>

<p class="muted">
${escapeHtml(user.name)}
</p>

<img
src="${qr}"
style="
max-width:320px;
width:100%;
background:white;
padding:15px;
border-radius:20px;
"
>

<div class="config">
${escapeHtml(url)}
</div>

<br>

<a
class="btn"
href="/admin/user/${user.id}"
>
⬅️ بازگشت
</a>

</div>
`,
        true
      )
    );
  }
);

/* =========================
   PUBLIC USER PAGE
========================= */

app.get("/u/:token", (req, res) => {

  const user = db
    .prepare(
      "SELECT * FROM users WHERE token = ?"
    )
    .get(req.params.token);

  if (!user) {
    return res.status(404).send("پنل پیدا نشد.");
  }

  if (!user.active) {
    return res.send(
      page(
        "پنل غیرفعال",
        `
<div class="card center" style="margin-top:60px">

<h1>🔴 پنل غیرفعال است</h1>

<p class="muted">
این پنل در حال حاضر فعال نیست.
</p>

</div>
`
      )
    );
  }

  const configs = db
    .prepare(
      `
      SELECT * FROM configs
      WHERE admin_id = ?
      ORDER BY id DESC
      `
    )
    .all(user.admin_id);

  const sub = subscriptionUrl(user.token);

  res.send(
    page(
      "پنل کاربر",
      `
<div class="hero">

<h1>🚀 پنل ${escapeHtml(user.name)}</h1>

<p>
پنل اختصاصی شما آماده است.
</p>

<div class="grid">

<div class="card">
<div class="muted">حجم</div>
<div class="stat" style="font-size:22px">
${escapeHtml(user.total_volume)}
</div>
</div>

<div class="card">
<div class="muted">انقضا</div>
<div class="stat" style="font-size:22px">
${escapeHtml(user.expiry)}
</div>
</div>

</div>

<div class="actions">

<a
class="btn"
href="${escapeAttr(sub)}"
>
🔗 دریافت اشتراک
</a>

<a
class="btn btn-gray"
href="https://t.me/ommkkobot"
target="_blank"
>
🆓 ساخت پنل رایگان
</a>

</div>

</div>

<div class="card" style="margin-top:20px">

<h2>📦 کانفیگ‌ها</h2>

${
  configs.length
    ? configs
        .map(
          (c) => `
<div style="margin-top:20px">

<h3>
${escapeHtml(c.name)}
</h3>

<div class="config">
${escapeHtml(c.config)}
</div>

<div class="actions">

<button onclick="navigator.clipboard.writeText(${JSON.stringify(
            c.config
          )})">
📋 کپی کانفیگ
</button>

</div>

</div>
`
        )
        .join("")
    : `
<div class="notice">
هنوز کانفیگی برای این پنل ثبت نشده است.
</div>
`
}

</div>

<div class="card" style="margin-top:20px">

<h3>⚡ قدرت گرفته از همین</h3>

<a
class="btn"
href="https://t.me/ommkko"
target="_blank"
>
@ommkko
</a>

</div>
`
    )
  );
});

/* =========================
   SUBSCRIPTION
========================= */

app.get("/sub/:token", (req, res) => {

  const user = db
    .prepare(
      "SELECT * FROM users WHERE token = ?"
    )
    .get(req.params.token);

  if (!user || !user.active) {
    return res.status(404).send("Not Found");
  }

  const configs = db
    .prepare(
      `
      SELECT config FROM configs
      WHERE admin_id = ?
      ORDER BY id ASC
      `
    )
    .all(user.admin_id);

  const output = configs
    .map((x) => x.config)
    .filter(Boolean)
    .join("\n");

  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  res.send(output);
});

/* =========================
   SETTINGS
========================= */

app.get(
  "/admin/settings",
  requireLogin,
  (req, res) => {

    const configs = getConfigs(
      req.session.adminId
    );

    res.send(
      page(
        "تنظیمات",
        `
<div class="hero">

<h1>⚙️ تنظیمات پنل</h1>

<p>
کانفیگ‌ها را از همین بخش اضافه کنید.
پس از اضافه کردن، کانفیگ‌ها در پنل کاربران نمایش داده می‌شوند.
</p>

</div>

<div class="card form-card">

<h2>➕ افزودن کانفیگ</h2>

<form method="POST"
action="/admin/settings/config">

<label>نام کانفیگ</label>

<input
name="name"
required
placeholder="مثلاً Trojan - IPv4 : 443"
>

<label>متن کامل کانفیگ</label>

<textarea
name="config"
required
placeholder="vless://...
یا
trojan://...
یا کانفیگ مورد نظر شما"
></textarea>

<br>

<button>
💾 ذخیره کانفیگ
</button>

</form>

</div>

<div class="card" style="margin-top:20px">

<h2>📦 کانفیگ‌های ثبت‌شده</h2>

${
  configs.length
    ? configs
        .map(
          (c) => `
<div class="card" style="margin-top:15px">

<h3>
${escapeHtml(c.name)}
</h3>

<div class="config">
${escapeHtml(c.config)}
</div>

<form
method="POST"
action="/admin/settings/config/${c.id}/delete"
onsubmit="return confirm('حذف شود؟')"
style="margin-top:12px"
>

<button class="btn-red">
🗑️ حذف کانفیگ
</button>

</form>

</div>
`
        )
        .join("")
    : `
<div class="notice">
هنوز هیچ کانفیگی اضافه نشده است.
</div>
`
}

</div>
`
      )
    );
  }
);

app.post(
  "/admin/settings/config",
  requireLogin,
  (req, res) => {

    const name = String(
      req.body.name || ""
    ).trim();

    const config = String(
      req.body.config || ""
    ).trim();

    if (!name || !config) {
      return res.send("نام و کانفیگ الزامی است.");
    }

    db.prepare(
      `
      INSERT INTO configs
      (admin_id,name,config)
      VALUES(?,?,?)
      `
    ).run(
      req.session.adminId,
      name,
      config
    );

    res.redirect("/admin/settings");
  }
);

app.post(
  "/admin/settings/config/:id/delete",
  requireLogin,
  (req, res) => {

    db.prepare(
      `
      DELETE FROM configs
      WHERE id = ?
      AND admin_id = ?
      `
    ).run(
      req.params.id,
      req.session.adminId
    );

    res.redirect("/admin/settings");
  }
);

/* =========================
   TELEGRAM
========================= */

async function telegramRequest(token, method, data = {}) {

  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  return response.json();
}

async function sendTelegram(
  token,
  chatId,
  text,
  replyMarkup
) {

  return telegramRequest(
    token,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup
        ? {
            inline_keyboard: replyMarkup
          }
        : undefined
    }
  );
}

/* =========================
   TELEGRAM PAGE
========================= */

app.get(
  "/admin/telegram",
  requireLogin,
  (req, res) => {

    const bot = db
      .prepare(
        "SELECT * FROM telegram_bots WHERE admin_id = ?"
      )
      .get(req.session.adminId);

    res.send(
      page(
        "ربات تلگرام",
        `
<div class="hero">

<h1>🤖 اتصال ربات تلگرام</h1>

<p>
توکن ربات خود را وارد کنید تا ربات به پنل مدیریت متصل شود.
</p>

</div>

<div class="card form-card">

<form method="POST"
action="/admin/telegram/connect">

<label>Bot Token</label>

<input
name="token"
required
placeholder="123456:ABC..."
>

<br>

<button>
🔗 اتصال ربات
</button>

</form>

${
  bot
    ? `
<div class="notice" style="margin-top:20px">

🟢 ربات متصل است

<br><br>

<b>
@${escapeHtml(bot.username || "ربات")}
</b>

</div>

<form method="POST"
action="/admin/telegram/disconnect"
onsubmit="return confirm('اتصال ربات قطع شود؟')">

<button class="btn-red">
🔴 قطع اتصال
</button>

</form>
`
    : ""
}

</div>
`
      )
    );
  }
);

/* =========================
   CONNECT BOT
========================= */

app.post(
  "/admin/telegram/connect",
  requireLogin,
  async (req, res) => {

    const token = String(
      req.body.token || ""
    ).trim();

    if (!token) {
      return res.send("توکن وارد نشده است.");
    }

    const result = await telegramRequest(
      token,
      "getMe"
    );

    if (!result.ok) {
      return res.send(
        "❌ توکن ربات اشتباه است."
      );
    }

    const username =
      result.result.username || "";

    const adminId = req.session.adminId;

    db.prepare(
      `
      INSERT INTO telegram_bots
      (admin_id,token,username)
      VALUES(?,?,?)
      ON CONFLICT(admin_id)
      DO UPDATE SET
      token=excluded.token,
      username=excluded.username
      `
    ).run(
      adminId,
      token,
      username
    );

    const webhook =
      `${getBaseUrl()}/telegram/webhook/${encodeURIComponent(token)}`;

    await telegramRequest(
      token,
      "setWebhook",
      {
        url: webhook
      }
    );

    res.redirect("/admin/telegram");
  }
);

/* =========================
   DISCONNECT
========================= */

app.post(
  "/admin/telegram/disconnect",
  requireLogin,
  async (req, res) => {

    const bot = db
      .prepare(
        "SELECT * FROM telegram_bots WHERE admin_id = ?"
      )
      .get(req.session.adminId);

    if (bot) {

      await telegramRequest(
        bot.token,
        "deleteWebhook"
      );

      db.prepare(
        "DELETE FROM telegram_bots WHERE admin_id = ?"
      ).run(req.session.adminId);
    }

    res.redirect("/admin/telegram");
  }
);

/* =========================
   TELEGRAM MENU
========================= */

function telegramMenu() {

  return [
    [
      {
        text: "➕ ساخت پنل",
        callback_data: "add_user"
      },
      {
        text: "👥 کاربران",
        callback_data: "users"
      }
    ],
    [
      {
        text: "📊 آمار",
        callback_data: "stats"
      },
      {
        text: "⚙️ راهنما",
        callback_data: "help"
      }
    ],
    [
      {
        text: "🆓 ساخت پنل رایگان",
        url: "https://t.me/ommkkobot"
      }
    ],
    [
      {
        text: "⚡ قدرت گرفته از همین",
        url: "https://t.me/ommkko"
      }
    ]
  ];
}

/* =========================
   TELEGRAM WEBHOOK
========================= */

app.post(
  "/telegram/webhook/:token",
  async (req, res) => {

    res.sendStatus(200);

    const token = req.params.token;

    const bot = db
      .prepare(
        "SELECT * FROM telegram_bots WHERE token = ?"
      )
      .get(token);

    if (!bot) return;

    try {

      if (req.body.message) {

        await handleTelegramMessage(
          token,
          bot.admin_id,
          req.body.message
        );
      }

      if (req.body.callback_query) {

        await handleTelegramCallback(
          token,
          bot.admin_id,
          req.body.callback_query
        );
      }

    } catch (error) {

      console.error(
        "Telegram error:",
        error
      );
    }
  }
);

/* =========================
   TELEGRAM MESSAGE
========================= */

async function handleTelegramMessage(
  token,
  adminId,
  message
) {

  const chatId = message.chat.id;

  const text =
    String(message.text || "").trim();

  const state = db
    .prepare(
      `
      SELECT * FROM telegram_states
      WHERE admin_id = ?
      AND chat_id = ?
      `
    )
    .get(
      adminId,
      String(chatId)
    );

  if (text === "/start") {

    return sendTelegram(
      token,
      chatId,
      `
<b>👋 سلام</b>

به ربات مدیریت <b>پنل مدیریت کوثر</b> خوش آمدید.

از منوی زیر می‌توانید کاربران و پنل‌ها را مدیریت کنید.
`,
      telegramMenu()
    );
  }

  if (text === "/users") {
    return sendTelegramUsers(
      token,
      adminId,
      chatId
    );
  }

  if (text === "/stats") {
    return sendTelegramStats(
      token,
      adminId,
      chatId
    );
  }

  if (text === "/add") {
    return startTelegramAdd(
      token,
      adminId,
      chatId
    );
  }

  if (!state) {

    return sendTelegram(
      token,
      chatId,
      "از منوی زیر یک گزینه انتخاب کنید 👇",
      telegramMenu()
    );
  }

  const data =
    JSON.parse(state.data || "{}");

  if (state.state === "name") {

    data.name = text;

    db.prepare(
      `
      UPDATE telegram_states
      SET state = ?, data = ?
      WHERE admin_id = ?
      AND chat_id = ?
      `
    ).run(
      "volume",
      JSON.stringify(data),
      adminId,
      String(chatId)
    );

    return sendTelegram(
      token,
      chatId,
      "📦 حجم پنل را وارد کنید:\n\nمثلاً:\n100GB\nیا\nنامحدود"
    );
  }

  if (state.state === "volume") {

    data.volume = text;

    db.prepare(
      `
      UPDATE telegram_states
      SET state = ?, data = ?
      WHERE admin_id = ?
      AND chat_id = ?
      `
    ).run(
      "expiry",
      JSON.stringify(data),
      adminId,
      String(chatId)
    );

    return sendTelegram(
      token,
      chatId,
      "📅 تاریخ انقضا را وارد کنید:\n\nمثلاً:\n1405/12/30\nیا\nنامحدود"
    );
  }

  if (state.state === "expiry") {

    data.expiry = text;

    const tokenUser = randomToken();

    db.prepare(
      `
      INSERT INTO users
      (admin_id,name,token,total_volume,expiry)
      VALUES(?,?,?,?,?)
      `
    ).run(
      adminId,
      data.name,
      tokenUser,
      data.volume,
      data.expiry
    );

    db.prepare(
      `
      DELETE FROM telegram_states
      WHERE admin_id = ?
      AND chat_id = ?
      `
    ).run(
      adminId,
      String(chatId)
    );

    return sendTelegram(
      token,
      chatId,
      `
✅ <b>پنل ساخته شد</b>

👤 نام: ${escapeHtml(data.name)}
📦 حجم: ${escapeHtml(data.volume)}
📅 انقضا: ${escapeHtml(data.expiry)}

🔗 لینک پنل:
${escapeHtml(userUrl(tokenUser))}

🔗 لینک اشتراک:
${escapeHtml(subscriptionUrl(tokenUser))}
`,
      [
        [
          {
            text: "🌐 ورود به پنل",
            url: userUrl(tokenUser)
          }
        ],
        [
          {
            text: "🆓 ساخت پنل رایگان",
            url: "https://t.me/ommkkobot"
          }
        ],
        [
          {
            text: "⚡ قدرت گرفته از همین",
            url: "https://t.me/ommkko"
          }
        ]
      ]
    );
  }
}

/* =========================
   TELEGRAM ADD
========================= */

async function startTelegramAdd(
  token,
  adminId,
  chatId
) {

  db.prepare(
    `
    INSERT INTO telegram_states
    (admin_id,chat_id,state,data)
    VALUES(?,?,?,?)
    ON CONFLICT(admin_id,chat_id)
    DO UPDATE SET
    state=excluded.state,
    data=excluded.data
    `
  ).run(
    adminId,
    String(chatId),
    "name",
    "{}"
  );

  return sendTelegram(
    token,
    chatId,
    "👤 نام کاربر را وارد کنید:"
  );
}

/* =========================
   TELEGRAM USERS
========================= */

async function sendTelegramUsers(
  token,
  adminId,
  chatId
) {

  const users = db
    .prepare(
      `
      SELECT * FROM users
      WHERE admin_id = ?
      ORDER BY id DESC
      LIMIT 30
      `
    )
    .all(adminId);

  if (!users.length) {

    return sendTelegram(
      token,
      chatId,
      "👥 هنوز هیچ کاربری ساخته نشده است.",
      telegramMenu()
    );
  }

  let text =
    "<b>👥 کاربران</b>\n\n";

  const buttons = [];

  for (const user of users) {

    text +=
      `${user.active ? "🟢" : "🔴"} ` +
      `<b>${escapeHtml(user.name)}</b>\n` +
      `📦 ${escapeHtml(user.total_volume)}\n` +
      `📅 ${escapeHtml(user.expiry)}\n\n`;

    buttons.push([
      {
        text: `👤 ${user.name}`,
        callback_data: `user_${user.id}`
      }
    ]);
  }

  buttons.push([
    {
      text: "➕ ساخت پنل",
      callback_data: "add_user"
    }
  ]);

  return sendTelegram(
    token,
    chatId,
    text,
    buttons
  );
}

/* =========================
   TELEGRAM USER
========================= */

async function sendTelegramUser(
  token,
  adminId,
  chatId,
  userId
) {

  const user = getUser(
    userId,
    adminId
  );

  if (!user) {

    return sendTelegram(
      token,
      chatId,
      "❌ کاربر پیدا نشد."
    );
  }

  return sendTelegram(
    token,
    chatId,
    `
<b>👤 ${escapeHtml(user.name)}</b>

📦 حجم: ${escapeHtml(user.total_volume)}
📅 انقضا: ${escapeHtml(user.expiry)}
📌 وضعیت: ${user.active ? "🟢 فعال" : "🔴 غیرفعال"}

🔗 پنل:
${escapeHtml(userUrl(user.token))}

🔗 اشتراک:
${escapeHtml(subscriptionUrl(user.token))}
`,
    [
      [
        {
          text: user.active
            ? "🔴 غیرفعال"
            : "🟢 فعال",
          callback_data:
            `toggle_${user.id}`
        }
      ],
      [
        {
          text: "🗑️ حذف کاربر",
          callback_data:
            `delete_${user.id}`
        }
      ],
      [
        {
          text: "🌐 ورود به پنل",
          url: userUrl(user.token)
        }
      ],
      [
        {
          text: "🆓 ساخت پنل رایگان",
          url: "https://t.me/ommkkobot"
        }
      ],
      [
        {
          text: "⚡ قدرت گرفته از همین",
          url: "https://t.me/ommkko"
        }
      ]
    ]
  );
}

/* =========================
   TELEGRAM STATS
========================= */

async function sendTelegramStats(
  token,
  adminId,
  chatId
) {

  const total = db
    .prepare(
      "SELECT COUNT(*) AS count FROM users WHERE admin_id = ?"
    )
    .get(adminId).count;

  const active = db
    .prepare(
      "SELECT COUNT(*) AS count FROM users WHERE admin_id = ? AND active = 1"
    )
    .get(adminId).count;

  const configs = db
    .prepare(
      "SELECT COUNT(*) AS count FROM configs WHERE admin_id = ?"
    )
    .get(adminId).count;

  return sendTelegram(
    token,
    chatId,
    `
<b>📊 آمار پنل</b>

👥 کل کاربران: ${total}
🟢 فعال: ${active}
📦 کانفیگ‌ها: ${configs}
`,
    telegramMenu()
  );
}

/* =========================
   CALLBACK
========================= */

async function handleTelegramCallback(
  token,
  adminId,
  callback
) {

  const chatId =
    callback.message.chat.id;

  const data =
    callback.data || "";

  await telegramRequest(
    token,
    "answerCallbackQuery",
    {
      callback_query_id:
        callback.id
    }
  );

  if (data === "add_user") {

    return startTelegramAdd(
      token,
      adminId,
      chatId
    );
  }

  if (data === "users") {

    return sendTelegramUsers(
      token,
      adminId,
      chatId
    );
  }

  if (data === "stats") {

    return sendTelegramStats(
      token,
      adminId,
      chatId
    );
  }

  if (data === "help") {

    return sendTelegram(
      token,
      chatId,
      `
<b>⚙️ راهنما</b>

/add
ساخت پنل جدید

/users
نمایش کاربران

/stats
نمایش آمار

/start
نمایش منوی اصلی
`,
      telegramMenu()
    );
  }

  if (data.startsWith("user_")) {

    const id =
      Number(data.split("_")[1]);

    return sendTelegramUser(
      token,
      adminId,
      chatId,
      id
    );
  }

  if (data.startsWith("toggle_")) {

    const id =
      Number(data.split("_")[1]);

    const user = getUser(
      id,
      adminId
    );

    if (!user) return;

    db.prepare(
      `
      UPDATE users
      SET active = ?
      WHERE id = ?
      AND admin_id = ?
      `
    ).run(
      user.active ? 0 : 1,
      id,
      adminId
    );

    return sendTelegramUser(
      token,
      adminId,
      chatId,
      id
    );
  }

  if (data.startsWith("delete_")) {

    const id =
      Number(data.split("_")[1]);

    db.prepare(
      `
      DELETE FROM users
      WHERE id = ?
      AND admin_id = ?
      `
    ).run(
      id,
      adminId
    );

    return sendTelegram(
      token,
      chatId,
      "✅ کاربر حذف شد.",
      telegramMenu()
    );
  }
}

/* =========================
   LOGOUT
========================= */

app.get("/logout", (req, res) => {

  req.session.destroy(() => {
    res.redirect("/");
  });

});

/* =========================
   START
========================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Kowsar Panel running on port ${PORT}`
  );

});
