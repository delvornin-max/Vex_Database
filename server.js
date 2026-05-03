require("dotenv").config(); // 🔥 MUST ADD (LINE 1)
console.log("ENV LOADED:", process.env.FIREBASE_KEY ? "YES" : "NO");
const express = require("express");
const admin = require("firebase-admin");
const multer = require("multer");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ================= FIREBASE INIT =================
let serviceAccount;

try {
  if (process.env.FIREBASE_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

    // 🔥 CRITICAL FIX (ENV newline issue)
    if (serviceAccount.private_key) {
      serviceAccount.private_key =
        serviceAccount.private_key.replace(/\\n/g, "\n");
    }

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

// ================= GET PANEL =================
app.get("/get-panel", async (req, res) => {
  try {
    const snap = await db.ref("panel").get();

    if (!snap.exists()) {
      return res.status(404).json({
        status: false,
        msg: "Panel not found"
      });
    }

    const data = snap.val();

    return res.json({
      status: true,
      ...data
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      msg: err.message
    });
  }
});

// ================= SET PANEL =================
app.post("/set-panel", async (req, res) => {
  try {
    const { status, login_url, version } = req.body;

    // 🔒 validation
    if (typeof status !== "boolean") {
      return res.status(400).json({ msg: "Invalid status" });
    }

    if (!login_url || typeof login_url !== "string") {
      return res.status(400).json({ msg: "Invalid login_url" });
    }

    if (typeof version !== "number") {
      return res.status(400).json({ msg: "Invalid version" });
    }

    const panelData = {
      status,
      login_url,
      version
    };

    await db.ref("panel").set(panelData);

    return res.json({
      success: true,
      panel: panelData
    });

  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});


// ================= GET CONFIG =================
app.get("/get-config", async (req, res) => {
  try {
    const snap = await db.ref("config").get();

    if (!snap.exists()) {
      return res.status(404).json({ msg: "Config not found" });
    }

    return res.json(snap.val());

  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});


// ================= UPDATE CONFIG =================
app.post("/set-config", async (req, res) => {
  try {
    const { attack_url, status, version } = req.body;

    // 🔒 basic validation
    if (!attack_url || typeof status !== "boolean" || version === undefined) {
      return res.status(400).json({ msg: "Invalid data" });
    }

    const newConfig = {
      attack_url,
      status,
      version
    };

    await db.ref("config").set(newConfig);

    return res.json({
      success: true,
      config: newConfig
    });

  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});