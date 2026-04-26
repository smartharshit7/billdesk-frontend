/**
 * BillDesk — Express + MongoDB Backend  v2
 * ─────────────────────────────────────────
 * New in v2:
 *   • Email/phone mandatory & unique at registration
 *   • Forgot-password → sends reset link via Nodemailer (SMTP / Gmail App Password)
 *   • Google OAuth 2.0 (Sign in with Google)
 *
 * npm install express mongoose bcryptjs jsonwebtoken multer cors dotenv \
 *             nodemailer crypto google-auth-library
 *
 * node server.js
 */

require("dotenv").config();
const express      = require("express");
const mongoose     = require("mongoose");
const bcrypt       = require("bcryptjs");
const jwt          = require("jsonwebtoken");
const cors         = require("cors");
const multer       = require("multer");
const path         = require("path");
const fs           = require("fs");
const crypto       = require("crypto");
const nodemailer   = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

const app    = express();
const PORT   = process.env.PORT   || 4000;
const JWT    = process.env.JWT_SECRET || "billdesk_dev_secret_change_me";
const CLIENT = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Middleware ──────────────────────────────────────────────────────
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ── MongoDB ─────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/billdesk")
  .then(() => console.log("✅  MongoDB connected"))
  .catch(err => { console.error("❌  MongoDB:", err.message); process.exit(1); });

// ── Nodemailer transporter ──────────────────────────────────────────
// Works with Gmail using an App Password.
// SMTP_USER = your Gmail address
// SMTP_PASS = 16-char App Password from https://myaccount.google.com/apppasswords
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Mongoose Schemas ────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:        { type: String }, // nullable for Google-only accounts
  email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:           { type: String, default: "" },           // optional but stored
  googleId:        { type: String, default: "", index: true },
  authProvider:    { type: String, enum: ["local","google"], default: "local" },
  resetToken:      { type: String, default: "" },
  resetExpires:    { type: Date },
  shop: {
    name:    { type: String, default: "" },
    tagline: { type: String, default: "" },
    phone:   { type: String, default: "" },
    email:   { type: String, default: "" },
    address: { type: String, default: "" },
    gstin:   { type: String, default: "" },
    logo:    { type: String, default: "" },
  },
}, { timestamps: true });

// Case-insensitive unique index on email
UserSchema.index({ email: 1 }, { unique: true });

const ProductSchema = new mongoose.Schema({
  owner:             { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:              { type: String, required: true },
  hsn:               { type: String, default: "" },
  unit:              { type: String, default: "pcs" },
  rate:              { type: Number, required: true },
  gstApplicable:     { type: Boolean, default: true },
  gstRate:           { type: Number, default: 18 },
  trackInventory:    { type: Boolean, default: true },
  lowStockThreshold: { type: Number, default: 5 },
}, { timestamps: true });

const StockLedgerSchema = new mongoose.Schema({
  owner:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  type:      { type: String, enum: ["in","out"], required: true },
  qty:       { type: Number, required: true },
  note:      { type: String, default: "" },
  source:    { type: String, enum: ["manual","invoice"], default: "manual" },
  invoiceId: { type: String, default: "" },
}, { timestamps: true });

const InvoiceItemSchema = new mongoose.Schema({
  productId:     String, name: String, unit: String,
  rate:          Number, qty: Number,
  gstApplicable: Boolean, gstRate: Number, trackInventory: Boolean,
});

const InvoiceSchema = new mongoose.Schema({
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  invoiceNo:   { type: String, required: true },
  date:        String,
  customer:    { name: String, phone: String, address: String },
  items:       [InvoiceItemSchema],
  subtotal:    Number, gstTotal: Number,
  discount:    { type: Number, default: 0 },
  discountType:{ type: String, enum: ["flat","percent"], default: "flat" },
  total:       Number,
}, { timestamps: true });

const User        = mongoose.model("User",        UserSchema);
const Product     = mongoose.model("Product",     ProductSchema);
const StockLedger = mongoose.model("StockLedger", StockLedgerSchema);
const Invoice     = mongoose.model("Invoice",     InvoiceSchema);

// ── Helpers ─────────────────────────────────────────────────────────
function makeToken(id) {
  return jwt.sign({ id }, JWT, { expiresIn: "30d" });
}
function safeUser(u) {
  return { id: u._id, username: u.username, email: u.email, phone: u.phone, authProvider: u.authProvider, shop: u.shop };
}

// ── Auth middleware ──────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "No token" });
  try { req.userId = jwt.verify(h.replace("Bearer ", ""), JWT).id; next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

// ── Multer (logo upload) ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, `${req.userId}_logo${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════

// ── Register (email/phone mandatory, unique) ─────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, email, phone, shop } = req.body;

    if (!username?.trim())  return res.status(400).json({ error: "Username is required" });
    if (!password?.trim())  return res.status(400).json({ error: "Password is required" });
    if (!email?.trim())     return res.status(400).json({ error: "Email is required" });

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Invalid email address" });

    // Check uniqueness
    const existsByUsername = await User.findOne({ username: username.toLowerCase() });
    if (existsByUsername) return res.status(409).json({ error: "Username already taken" });

    const existsByEmail = await User.findOne({ email: email.toLowerCase() });
    if (existsByEmail) return res.status(409).json({ error: "Email already registered" });

    if (phone) {
      const existsByPhone = await User.findOne({ phone });
      if (existsByPhone) return res.status(409).json({ error: "Phone number already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.toLowerCase(),
      password: hashed,
      email:    email.toLowerCase(),
      phone:    phone || "",
      shop:     shop || {},
      authProvider: "local",
    });

    res.json({ token: makeToken(user._id), user: safeUser(user) });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyValue || {})[0] || "field";
      return res.status(409).json({ error: `${field.charAt(0).toUpperCase()+field.slice(1)} already in use` });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Login (by username or email) ─────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Fill all fields" });

    // Allow login by username OR email
    const user = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }]
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.password) return res.status(400).json({ error: "This account uses Google Sign-In. Please use 'Sign in with Google'." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Incorrect password" });

    res.json({ token: makeToken(user._id), user: safeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Google OAuth ──────────────────────────────────────────────────────
// Accepts the ID token from the frontend Google Sign-In button.
// Creates a new user or finds existing one.
app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "No credential" });

    if (!process.env.GOOGLE_CLIENT_ID)
      return res.status(503).json({ error: "Google OAuth not configured on server (missing GOOGLE_CLIENT_ID)" });

    const ticket  = await CLIENT.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

    if (!user) {
      // New user — create from Google profile
      const baseUsername = (name || email.split("@")[0]).toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g,"");
      let username = baseUsername;
      let suffix   = 1;
      while (await User.findOne({ username })) { username = `${baseUsername}${suffix++}`; }

      user = await User.create({
        username,
        email:        email.toLowerCase(),
        googleId,
        authProvider: "google",
        shop:         { name: name || "", logo: picture || "" },
      });
    } else {
      // Update googleId if missing (linked account)
      if (!user.googleId) {
        user.googleId     = googleId;
        user.authProvider = "google";
        await user.save();
      }
    }

    res.json({ token: makeToken(user._id), user: safeUser(user) });
  } catch (e) {
    console.error("Google auth error:", e.message);
    res.status(401).json({ error: "Google sign-in failed: " + e.message });
  }
});

// ── Forgot Password — send reset email ───────────────────────────────
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });
    if (user.authProvider === "google")
      return res.status(400).json({ error: "This account uses Google Sign-In. Password reset is not available." });

    // Generate a secure token
    const token   = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetToken   = token;
    user.resetExpires = expires;
    await user.save();

    // Reset link — frontend handles /reset-password?token=xxx
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink    = `${FRONTEND_URL}?resetToken=${token}`;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      // Dev mode: return token in response so you can test without SMTP
      console.warn("⚠️  SMTP not configured. Reset token (dev only):", token);
      return res.json({ message: "Reset link sent (dev: token in response)", devToken: token });
    }

    await transporter.sendMail({
      from:    `"BillDesk" <${process.env.SMTP_USER}>`,
      to:      user.email,
      subject: "BillDesk — Reset your password",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <h2 style="color:#7c6af7;margin:0">🧾 BillDesk</h2>
          </div>
          <h3 style="color:#1a1a2e">Reset your password</h3>
          <p style="color:#555;line-height:1.6">Hi ${user.username},<br>We received a request to reset your password. Click the button below to choose a new one.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${resetLink}" style="background:#7c6af7;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Reset Password</a>
          </div>
          <p style="color:#888;font-size:13px">This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email — your account is safe.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">BillDesk · Smart billing for your shop</p>
        </div>
      `,
    });

    res.json({ message: "Password reset link sent to your email." });
  } catch (e) {
    console.error("Forgot password error:", e.message);
    res.status(500).json({ error: "Failed to send email. " + e.message });
  }
});

// ── Reset Password — consume token ────────────────────────────────────
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });
    if (newPassword.length < 6)  return res.status(400).json({ error: "Password must be at least 6 characters" });

    const user = await User.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: "Reset link is invalid or has expired" });

    user.password     = await bcrypt.hash(newPassword, 10);
    user.resetToken   = "";
    user.resetExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful. You can now sign in." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Validate reset token (check before showing reset form) ────────────
app.get("/api/auth/validate-reset-token/:token", async (req, res) => {
  const user = await User.findOne({ resetToken: req.params.token, resetExpires: { $gt: new Date() } });
  res.json({ valid: !!user });
});

// ── Update shop ───────────────────────────────────────────────────────
app.put("/api/shop", auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.userId, { shop: req.body }, { new: true });
    res.json({ shop: user.shop });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/shop/logo", auth, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const logoUrl = `/uploads/${req.file.filename}`;
    await User.findByIdAndUpdate(req.userId, { "shop.logo": logoUrl });
    res.json({ logoUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Products ──────────────────────────────────────────────────────────
app.get   ("/api/products",     auth, async (req,res) => { try { res.json(await Product.find({owner:req.userId}).sort({createdAt:-1})); } catch(e){res.status(500).json({error:e.message});} });
app.post  ("/api/products",     auth, async (req,res) => { try { res.json(await Product.create({...req.body,owner:req.userId})); } catch(e){res.status(500).json({error:e.message});} });
app.put   ("/api/products/:id", auth, async (req,res) => { try { const p=await Product.findOneAndUpdate({_id:req.params.id,owner:req.userId},req.body,{new:true}); if(!p) return res.status(404).json({error:"Not found"}); res.json(p); } catch(e){res.status(500).json({error:e.message});} });
app.delete("/api/products/:id", auth, async (req,res) => { try { await Product.findOneAndDelete({_id:req.params.id,owner:req.userId}); await StockLedger.deleteMany({productId:req.params.id,owner:req.userId}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });

// ── Ledger ────────────────────────────────────────────────────────────
app.get ("/api/ledger", auth, async (req,res) => { try { res.json(await StockLedger.find({owner:req.userId}).sort({createdAt:-1})); } catch(e){res.status(500).json({error:e.message});} });
app.post("/api/ledger", auth, async (req,res) => { try { res.json(await StockLedger.create({...req.body,owner:req.userId})); } catch(e){res.status(500).json({error:e.message});} });

// ── Invoices ──────────────────────────────────────────────────────────
app.get   ("/api/invoices",     auth, async (req,res) => { try { res.json(await Invoice.find({owner:req.userId}).sort({createdAt:-1})); } catch(e){res.status(500).json({error:e.message});} });
app.delete("/api/invoices/:id", auth, async (req,res) => { try { await Invoice.findOneAndDelete({_id:req.params.id,owner:req.userId}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
app.post  ("/api/invoices", auth, async (req,res) => {
  try {
    const { invoice, stockDeductions } = req.body;
    const saved = await Invoice.create({...invoice, owner:req.userId});
    if (stockDeductions?.length) await StockLedger.insertMany(stockDeductions.map(d=>({...d,owner:req.userId,source:"invoice",invoiceId:saved.invoiceNo})));
    res.json(saved);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── Health ─────────────────────────────────────────────────────────────
app.get("/api/health", (_,res) => res.json({ status:"ok", time: new Date() }));

app.listen(PORT, () => console.log(`🚀  BillDesk server → http://localhost:${PORT}`));
