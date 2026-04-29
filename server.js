const express = require("express");
const admin = require("firebase-admin");
const multer = require("multer");

const app = express();
app.use(express.json());

// ================= FIREBASE INIT =================
let serviceAccount;

try {
  if (process.env.FIREBASE_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
    console.log("Using ENV Firebase key");
  } else {
    serviceAccount = require("./serviceAccountKey.json");
    console.log("Using local Firebase key");
  }
} catch (e) {
  console.error("❌ Firebase key error:", e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://nextlevelcheats-94b66-default-rtdb.firebaseio.com",
  storageBucket: "nextlevelcheats-94b66.firebasestorage.app"
});

const db = admin.database();
const bucket = admin.storage().bucket();

// ================= MULTER =================
const upload = multer({ storage: multer.memoryStorage() });


// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Server running successfully");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});


// ================= CREATE ADMIN =================
app.post("/create-admin", upload.single("logo"), async (req, res) => {
  try {
    const { uid, name, password, channel, referral } = req.body;
    const file = req.file;

    if (!uid || !name || !password || !channel || !referral || !file) {
      return res.status(400).json({ msg: "All fields required" });
    }

    const userSnap = await db.ref(`Main Admins/${uid}`).get();
    if (userSnap.exists()) {
      return res.status(400).json({ msg: "User ID already exists" });
    }

    const refSnap = await db.ref("referals")
      .orderByChild("code")
      .equalTo(referral)
      .get();

    if (!refSnap.exists()) {
      return res.status(400).json({ msg: "Invalid referral" });
    }

    const data = refSnap.val();
    const refKey = Object.keys(data)[0];
    const refData = data[refKey];

    if (refData.used === true) {
      return res.status(400).json({ msg: "Referral already used" });
    }

    if ((refData.role || "").toLowerCase() !== "admin") {
      return res.status(400).json({ msg: "Only admin referral allowed" });
    }

    const expiry = new Date(refData.expiry);
    if (!expiry || new Date() > expiry) {
      return res.status(400).json({ msg: "Referral expired" });
    }

    const fileName = `admin_logos/${uid}.jpg`;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });

    const [logoUrl] = await fileUpload.getSignedUrl({
      action: "read",
      expires: "03-01-2500"
    });

    const newAdmin = {
      admin_uid: uid,
      name,
      password,
      channel_name: channel,
      referral,
      ref_key: refKey,
      money: refData.money || 0,
      ref_expiry: refData.expiry || "",
      logo: logoUrl,
      status: "pending",
      role: "admin",
      created_at: new Date().toString()
    };

    await db.ref(`Main Admins/${uid}`).set(newAdmin);
    await db.ref(`referals/${refKey}/used`).set(true);

    res.json({ msg: "Created (Pending Approval)", logo: logoUrl });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
});


// ================= LOGIN ADMIN =================
// ================= LOGIN ADMIN =================
app.post("/login-admin", async (req, res) => {
  try {
    const { uid, password } = req.body;

    // 🔴 Strict validation
    if (!uid || !password) {
      return res.status(400).json({ msg: "UID and Password required" });
    }

    // 🔍 Fetch user
    const snap = await db.ref(`Main Admins/${uid}`).get();

    if (!snap.exists()) {
      return res.status(404).json({ msg: "Invalid UID" });
    }

    const user = snap.val();

    // 🔐 Password match
    if (user.password !== password) {
      return res.status(401).json({ msg: "Invalid Password" });
    }

    // 🚫 Block conditions
    if (user.status === "pending") {
      return res.status(403).json({ msg: "Account pending approval" });
    }

    if (user.status === "blocked") {
      return res.status(403).json({ msg: "Account blocked" });
    }

    // ✅ SUCCESS (only uid + password used)
    return res.json({
      msg: "Login success",
      uid: user.admin_uid,
      name: user.name,
      logo: user.logo
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
});


// ================= GENERATE KEYS =================
app.post("/generate-keys", async (req, res) => {
  try {
    const { uid, time, device, keyCount } = req.body;

    if (!uid || !time || !device || !keyCount) {
      return res.status(400).json({ msg: "Missing fields" });
    }

    const adminRef = db.ref(`Main Admins/${uid}`);
    const snap = await adminRef.get();

    if (!snap.exists()) {
      return res.status(404).json({ msg: "Admin not found" });
    }

    const adminData = snap.val();
    const currentMoney = adminData.money || 0;

    const base = {
      "1 Day": 100,
      "7 Day": 500,
      "15 Day": 900,
      "30 Day": 1500
    }[time] || 0;

    const deviceLimit = parseInt(device.split(" ")[0]) || 0;
    const keys = parseInt(keyCount) || 0;

    if (keys <= 0 || deviceLimit <= 0 || base <= 0) {
      return res.status(400).json({ msg: "Invalid values" });
    }

    const pricePerKey = base * deviceLimit;
    const totalCost = pricePerKey * keys;

    if (currentMoney < totalCost) {
      return res.status(400).json({ msg: "Insufficient balance" });
    }

    const daysMap = {
      "1 Day": 1,
      "7 Day": 7,
      "15 Day": 15,
      "30 Day": 30
    };

    const days = daysMap[time] || 0;
    const durationMs = days * 24 * 60 * 60 * 1000;

    const updates = {};

    for (let i = 0; i < keys; i++) {

      const keyId = db.ref("Main Admins")
        .child(uid)
        .child("keys")
        .push().key;

      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const cleanTime = time.replace(" ", "");
      const keyValue = `${uid}_${cleanTime}_${randomPart}`;

      updates[`Main Admins/${uid}/keys/${keyId}`] = {
        key: keyValue,
        time,
        days,
        duration_ms: durationMs,
        device,
        devices_allowed: deviceLimit,
        used_count: 0,
        used_devices: {},
        created_at: Date.now(),
        is_used: false,
        is_active: true,
        expiry_at: 0,
        price: pricePerKey
      };
    }

    updates[`Main Admins/${uid}/money`] = currentMoney - totalCost;

    // ✅ important
    await db.ref().update(updates);

    return res.json({
      msg: "Keys Generated",
      total: keys,
      cost: totalCost
    });

  } catch (err) {
    console.error("GENERATE KEY ERROR:", err);
    return res.status(500).json({ msg: err.message });
  }
});

// ================= GENERATE REFERRAL WITH BALANCE =================
app.post("/generate-referral", async (req, res) => {
  try {
    const { uid, money, expiry } = req.body;

    // ✅ validation
    if (!uid || !money || !expiry) {
      return res.status(400).json({ msg: "Missing fields" });
    }

    const amount = parseInt(money);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ msg: "Invalid money" });
    }

    const expiryTime = new Date(expiry).getTime();
    if (expiryTime <= Date.now()) {
      return res.status(400).json({ msg: "Invalid expiry" });
    }

    const adminRef = admin.database().ref("Main Admins").child(uid);
    const balanceRef = adminRef.child("money");

    // 🔥 ATOMIC TRANSACTION
    const result = await balanceRef.transaction((currentBalance) => {
      if (currentBalance === null) return; // abort

      if (amount > currentBalance) {
        return; // ❌ abort
      }

      return currentBalance - amount; // ✅ deduct
    });

    if (!result.committed) {
      return res.status(400).json({ msg: "Insufficient balance" });
    }

    // ✅ balance deduct ho gaya

    const code = generateCode();
    const key = Date.now().toString();

    const data = {
      code: code,
      money: amount,
      role: "reseller",
      expiry: new Date(expiryTime).toISOString(),
      used: false,
      created_at: Date.now(),
    };

    await adminRef
      .child("referrals")
      .child(key)
      .update(data);

    return res.json({
      success: true,
      code: code,
      key: key,
    });

  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

// 🔥 CODE GENERATOR
function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});