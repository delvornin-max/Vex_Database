const express = require("express");
const admin = require("firebase-admin");
const multer = require("multer");

const app = express();
app.use(express.json());

// 🔐 Firebase init
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "<YOUR_BUCKET>.appspot.com"
});

const db = admin.database();
const bucket = admin.storage().bucket();

// 📂 image upload config
const upload = multer({ storage: multer.memoryStorage() });


// ================= CREATE ADMIN =================
app.post("/create-admin", upload.single("logo"), async (req, res) => {
  try {
    const { uid, name, password, channel, referral } = req.body;
    const file = req.file;

    if (!uid || !name || !password || !channel || !referral || !file) {
      return res.status(400).json({ msg: "All fields required" });
    }

    // UID check
    const userSnap = await db.ref(`Main Admins/${uid}`).get();
    if (userSnap.exists()) {
      return res.status(400).json({ msg: "User ID already exists" });
    }

    // Referral check
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

    // 📤 Upload logo
    const fileName = `admin_logos/${uid}.jpg`;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });

    const [logoUrl] = await fileUpload.getSignedUrl({
      action: "read",
      expires: "03-01-2500"
    });

    // 💾 Save DB
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

    // mark referral used
    await db.ref(`referals/${refKey}/used`).set(true);

    res.json({ msg: "Created (Pending Approval)", logo: logoUrl });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});


// ================= LOGIN ADMIN =================
app.post("/login-admin", async (req, res) => {
  try {
    const { uid, password } = req.body;

    if (!uid || !password) {
      return res.status(400).json({ msg: "Missing fields" });
    }

    const snap = await db.ref(`Main Admins/${uid}`).get();

    if (!snap.exists()) {
      return res.status(400).json({ msg: "Admin not found" });
    }

    const user = snap.val();

    if (user.password !== password) {
      return res.status(400).json({ msg: "Wrong password" });
    }

    if (user.status === "pending") {
      return res.status(403).json({ msg: "Account pending approval" });
    }

    if (user.status === "blocked") {
      return res.status(403).json({ msg: "Account blocked" });
    }

    // ✅ success
    res.json({
      msg: "Login success",
      uid: user.admin_uid,
      name: user.name,
      logo: user.logo
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});


// ================= START SERVER =================
app.listen(3000, () => {
  console.log("Server running on port 3000");
});