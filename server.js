const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database("panel.db");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    total_volume TEXT DEFAULT 'نامحدود',
    used_volume TEXT DEFAULT '0 GB',
    expiry TEXT DEFAULT '',
    subscription_link TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "nova-proxy-secret-change-this",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

function page(title, content) {
    return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>

<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: Tahoma, Arial, sans-serif;
    background: #0b1020;
    color: #fff;
}

.container {
    width: min(1100px, 94%);
    margin: 30px auto;
}

.card {
    background: #151c32;
    border: 1px solid #27304b;
    border-radius: 18px;
    padding: 22px;
    margin-bottom: 20px;
    box-shadow: 0 15px 40px rgba(0,0,0,.25);
}

h1, h2, h3 {
    margin-top: 0;
}

input, button, textarea {
    width: 100%;
    padding: 13px;
    border-radius: 10px;
    border: 1px solid #303a59;
    background: #0e1528;
    color: white;
    margin-top: 8px;
    margin-bottom: 12px;
    font-size: 15px;
}

button {
    background: #5865f2;
    border: none;
    cursor: pointer;
    font-weight: bold;
}

button:hover {
    opacity: .9;
}

a {
    color: #8ea2ff;
    text-decoration: none;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit,minmax(220px,1fr));
    gap: 15px;
}

.stat {
    background: #0e1528;
    padding: 18px;
    border-radius: 14px;
    border: 1px solid #293452;
}

.user {
    background: #0e1528;
    padding: 18px;
    border-radius: 14px;
    margin-top: 12px;
    border: 1px solid #293452;
}

.badge {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 20px;
    font-size: 12px;
}

.active {
    background: #164e35;
    color: #6ee7a0;
}

.inactive {
    background: #542020;
    color: #ff8d8d;
}

.small {
    color: #9aa4bd;
    font-size: 13px;
}

.btn {
    display: inline-block;
    width: auto;
    padding: 10px 15px;
    margin: 4px;
    background: #5865f2;
    color: white;
    border-radius: 9px;
}

.btn.red {
    background: #b83232;
}

.btn.green {
    background: #16834b;
}

.logo {
    font-size: 30px;
    font-weight: bold;
    margin-bottom: 8px;
}

.center {
    text-align: center;
}

@media(max-width:600px) {
    .container {
        width: 92%;
        margin: 15px auto;
    }

    .card {
        padding: 17px;
    }
}
</style>
</head>

<body>
<div class="container">

${content}

</div>
</body>
</html>
`;
}

function requireLogin(req, res, next) {
    if (!req.session.adminId) {
        return res.redirect("/login");
    }

    next();
}

app.get("/", (req, res) => {
    if (req.session.adminId) {
        return res.redirect("/admin");
    }

    res.send(
        page(
            "نوا پروکسی",
            `
<div class="card center">
    <div class="logo">🚀 نوا پروکسی</div>
    <p class="small">
        پنل مدیریت کاربران و اشتراک‌های پروکسی
    </p>

    <a class="btn" href="/login">
        🔐 ورود به پنل
    </a>

    <a class="btn green" href="/create-admin">
        👤 ساخت مدیر
    </a>
</div>
`
        )
    );
});

app.get("/create-admin", (req, res) => {
    res.send(
        page(
            "ساخت مدیر",
            `
<div class="card">
<h2>👤 ساخت حساب مدیر</h2>

<form method="POST" action="/create-admin">

<label>نام کاربری</label>
<input name="username" required>

<label>رمز عبور</label>
<input name="password" type="password" required>

<button type="submit">
ساخت حساب مدیر
</button>

</form>

<a href="/login">ورود به حساب</a>
</div>
`
        )
    );
});

app.post("/create-admin", (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
        return res.send("اطلاعات ناقص است.");
    }

    try {
        const hash = bcrypt.hashSync(password, 10);

        db.prepare(`
            INSERT INTO admins (username, password)
            VALUES (?, ?)
        `).run(username, hash);

        res.redirect("/login");
    } catch (e) {
        res.send("این نام کاربری قبلاً استفاده شده است.");
    }
});

app.get("/login", (req, res) => {
    res.send(
        page(
            "ورود",
            `
<div class="card">
<h2>🔐 ورود به پنل</h2>

<form method="POST" action="/login">

<label>نام کاربری</label>
<input name="username" required>

<label>رمز عبور</label>
<input name="password" type="password" required>

<button type="submit">
ورود
</button>

</form>
</div>
`
        )
    );
});

app.post("/login", (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const admin = db.prepare(`
        SELECT * FROM admins
        WHERE username = ?
    `).get(username);

    if (!admin) {
        return res.send("نام کاربری یا رمز عبور اشتباه است.");
    }

    if (!bcrypt.compareSync(password, admin.password)) {
        return res.send("نام کاربری یا رمز عبور اشتباه است.");
    }

    req.session.adminId = admin.id;
    req.session.username = admin.username;

    res.redirect("/admin");
});

app.get("/admin", requireLogin, (req, res) => {
    const users = db.prepare(`
        SELECT *
        FROM users
        WHERE admin_id = ?
        ORDER BY id DESC
    `).all(req.session.adminId);

    let usersHtml = "";

    if (users.length === 0) {
        usersHtml = `
<div class="user">
    هنوز کاربری اضافه نشده است.
</div>
`;
    } else {
        usersHtml = users
            .map(
                (u) => `
<div class="user">

<h3>👤 ${escapeHtml(u.name)}</h3>

<p>
وضعیت:
${
    u.active
        ? '<span class="badge active">فعال</span>'
        : '<span class="badge inactive">غیرفعال</span>'
}
</p>

<p>📦 حجم کل: ${escapeHtml(u.total_volume)}</p>
<p>📊 مصرف شده: ${escapeHtml(u.used_volume)}</p>
<p>⏳ انقضا: ${escapeHtml(u.expiry || "تعیین نشده")}</p>

<a class="btn" href="/admin/user/${u.id}">
مدیریت
</a>

<a class="btn green" href="/u/${u.token}" target="_blank">
صفحه کاربر
</a>

<a class="btn" href="/admin/user/${u.id}/qr">
QR
</a>

</div>
`
            )
            .join("");
    }

    res.send(
        page(
            "پنل مدیریت نوا پروکسی",
            `
<div class="card">

<div class="logo">
🚀 نوا پروکسی
</div>

<p class="small">
مدیر: ${escapeHtml(req.session.username)}
</p>

<div class="grid">

<div class="stat">
<h3>👥 کاربران</h3>
<strong>${users.length}</strong>
</div>

<div class="stat">
<h3>🟢 فعال</h3>
<strong>${users.filter((x) => x.active).length}</strong>
</div>

<div class="stat">
<h3>🔴 غیرفعال</h3>
<strong>${users.filter((x) => !x.active).length}</strong>
</div>

</div>

</div>

<div class="card">

<h2>➕ افزودن کاربر</h2>

<form method="POST" action="/admin/add">

<label>نام کاربر</label>
<input
    name="name"
    placeholder="مثلاً علی"
    required
>

<label>حجم کل</label>
<input
    name="total_volume"
    placeholder="مثلاً 100 GB"
>

<label>حجم مصرف شده</label>
<input
    name="used_volume"
    placeholder="مثلاً 20 GB"
>

<label>تاریخ انقضا</label>
<input
    name="expiry"
    placeholder="مثلاً 1405/12/30"
>

<label>لینک اشتراک کاربر</label>
<input
    name="subscription_link"
    placeholder="لینک اشتراک را وارد کنید"
>

<button type="submit">
ساخت کاربر
</button>

</form>

</div>

<div class="card">

<h2>👥 کاربران</h2>

${usersHtml}

</div>

<div class="card center">

<a class="btn red" href="/logout">
خروج از حساب
</a>

</div>
`
        )
    );
});

app.post("/admin/add", requireLogin, (req, res) => {
    const name = String(req.body.name || "").trim();

    const totalVolume =
        String(req.body.total_volume || "").trim() ||
        "نامحدود";

    const usedVolume =
        String(req.body.used_volume || "").trim() ||
        "0 GB";

    const expiry =
        String(req.body.expiry || "").trim();

    const subscriptionLink =
        String(req.body.subscription_link || "").trim();

    if (!name) {
        return res.send("نام کاربر الزامی است.");
    }

    const token = crypto.randomBytes(24).toString("hex");

    db.prepare(`
        INSERT INTO users
        (
            admin_id,
            name,
            token,
            total_volume,
            used_volume,
            expiry,
            subscription_link
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.session.adminId,
        name,
        token,
        totalVolume,
        usedVolume,
        expiry,
        subscriptionLink
    );

    res.redirect("/admin");
});

app.get("/admin/user/:id", requireLogin, (req, res) => {
    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        AND admin_id = ?
    `).get(
        req.params.id,
        req.session.adminId
    );

    if (!user) {
        return res.status(404).send("کاربر پیدا نشد.");
    }

    res.send(
        page(
            "مدیریت کاربر",
            `
<div class="card">

<h2>👤 مدیریت ${escapeHtml(user.name)}</h2>

<form method="POST" action="/admin/user/${user.id}/update">

<label>نام کاربر</label>
<input
    name="name"
    value="${escapeAttr(user.name)}"
    required
>

<label>حجم کل</label>
<input
    name="total_volume"
    value="${escapeAttr(user.total_volume)}"
>

<label>حجم مصرف شده</label>
<input
    name="used_volume"
    value="${escapeAttr(user.used_volume)}"
>

<label>تاریخ انقضا</label>
<input
    name="expiry"
    value="${escapeAttr(user.expiry)}"
>

<label>لینک اشتراک کاربر</label>
<input
    name="subscription_link"
    value="${escapeAttr(user.subscription_link)}"
>

<button type="submit">
💾 ذخیره تغییرات
</button>

</form>

<form method="POST" action="/admin/user/${user.id}/toggle">

<button type="submit">
${user.active ? "🔴 غیرفعال کردن" : "🟢 فعال کردن"}
</button>

</form>

<a
    class="btn green"
    href="/u/${user.token}"
    target="_blank"
>
🌐 صفحه عمومی کاربر
</a>

<a
    class="btn"
    href="/admin/user/${user.id}/qr"
>
📱 دریافت QR
</a>

<br><br>

<a href="/admin">
⬅️ بازگشت به پنل
</a>

</div>
`
        )
    );
});

app.post("/admin/user/:id/update", requireLogin, (req, res) => {
    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        AND admin_id = ?
    `).get(
        req.params.id,
        req.session.adminId
    );

    if (!user) {
        return res.status(404).send("کاربر پیدا نشد.");
    }

    const name = String(req.body.name || "").trim();

    const totalVolume =
        String(req.body.total_volume || "").trim() ||
        "نامحدود";

    const usedVolume =
        String(req.body.used_volume || "").trim() ||
        "0 GB";

    const expiry =
        String(req.body.expiry || "").trim();

    const subscriptionLink =
        String(req.body.subscription_link || "").trim();

    db.prepare(`
        UPDATE users
        SET
            name = ?,
            total_volume = ?,
            used_volume = ?,
            expiry = ?,
            subscription_link = ?
        WHERE id = ?
        AND admin_id = ?
    `).run(
        name,
        totalVolume,
        usedVolume,
        expiry,
        subscriptionLink,
        req.params.id,
        req.session.adminId
    );

    res.redirect(`/admin/user/${req.params.id}`);
});

app.post("/admin/user/:id/toggle", requireLogin, (req, res) => {
    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        AND admin_id = ?
    `).get(
        req.params.id,
        req.session.adminId
    );

    if (!user) {
        return res.status(404).send("کاربر پیدا نشد.");
    }

    db.prepare(`
        UPDATE users
        SET active = ?
        WHERE id = ?
        AND admin_id = ?
    `).run(
        user.active ? 0 : 1,
        req.params.id,
        req.session.adminId
    );

    res.redirect(`/admin/user/${req.params.id}`);
});

app.get("/admin/user/:id/qr", requireLogin, async (req, res) => {
    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        AND admin_id = ?
    `).get(
        req.params.id,
        req.session.adminId
    );

    if (!user) {
        return res.status(404).send("کاربر پیدا نشد.");
    }

    const publicUrl =
        `${getBaseUrl(req)}/u/${user.token}`;

    try {
        const qr = await QRCode.toDataURL(publicUrl);

        res.send(
            page(
                "QR کاربر",
                `
<div class="card center">

<h2>📱 QR کد ${escapeHtml(user.name)}</h2>

<img
    src="${qr}"
    style="max-width:350px;width:100%;background:white;padding:15px;border-radius:15px;"
>

<p class="small">
${escapeHtml(publicUrl)}
</p>

<a class="btn" href="/admin">
⬅️ بازگشت
</a>

</div>
`
            )
        );
    } catch (e) {
        res.status(500).send("خطا در ساخت QR");
    }
});

app.get("/u/:token", (req, res) => {
    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE token = ?
    `).get(req.params.token);

    if (!user) {
        return res.status(404).send(
            page(
                "کاربر پیدا نشد",
                `
<div class="card center">
<h2>❌ کاربر پیدا نشد</h2>
</div>
`
            )
        );
    }

    const status = user.active
        ? '<span class="badge active">فعال</span>'
        : '<span class="badge inactive">غیرفعال</span>';

    let subscriptionButton = "";

    if (user.subscription_link) {
        subscriptionButton = `
<a
    class="btn green"
    href="${escapeAttr(user.subscription_link)}"
    target="_blank"
>
🔗 دریافت لینک اشتراک
</a>
`;
    }

    res.send(
        page(
            `پنل ${user.name}`,
            `
<div class="card center">

<div class="logo">
🚀 نوا پروکسی
</div>

<h2>
${escapeHtml(user.name)}
</h2>

<p>
وضعیت: ${status}
</p>

<div class="grid">

<div class="stat">
<h3>📦 حجم کل</h3>
<strong>
${escapeHtml(user.total_volume)}
</strong>
</div>

<div class="stat">
<h3>📊 مصرف شده</h3>
<strong>
${escapeHtml(user.used_volume)}
</strong>
</div>

<div class="stat">
<h3>⏳ تاریخ انقضا</h3>
<strong>
${escapeHtml(user.expiry || "تعیین نشده")}
</strong>
</div>

</div>

<br>

${subscriptionButton}

</div>
`
        )
    );
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

function getBaseUrl(req) {
    const forwardedProto =
        req.headers["x-forwarded-proto"];

    const protocol =
        forwardedProto ||
        req.protocol;

    return `${protocol}://${req.get("host")}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
    return escapeHtml(value);
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Nova Proxy panel running on port ${PORT}`
    );
});
