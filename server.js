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

    // optional: ?decoded=true → real URL dega
    let login_url = data.login_url || "";

    if (req.query.decoded === "true") {
      try {
        login_url = Buffer.from(login_url, "base64").toString("utf-8");
      } catch (e) {
        return res.status(500).json({
          status: false,
          msg: "Decode failed"
        });
      }
    }

    return res.json({
      status: true,
      status_flag: data.status === true,
      login_url,
      version: Number(data.version || 0)
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
    let { status, login_url, version } = req.body;

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

    // 🔥 normalize + encode
    login_url = login_url.trim();

    if (!login_url.startsWith("http")) {
      return res.status(400).json({ msg: "URL must start with http/https" });
    }

    const encodedUrl = Buffer.from(login_url).toString("base64");

    const panelData = {
      status,
      login_url: encodedUrl,
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


app.get("/ping", (req, res) => {
  res.send("OK");
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

// ================= GET ADMIN UPDATES =================
app.get("/get-admin-updates", async (req, res) => {
  try {
    const snap = await db.ref("admin_updates").get();

    if (!snap.exists()) {
      return res.status(404).json({
        status: false,
        msg: "No admin updates found"
      });
    }

    return res.json({
      status: true,
      data: snap.val()
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      msg: err.message
    });
  }
});


// ================= SET ADMIN UPDATES =================
app.post("/set-admin-updates", async (req, res) => {
  try {
    const { title, message, version } = req.body;

    // 🔒 validation
    if (!title || typeof title !== "string") {
      return res.status(400).json({ msg: "Invalid title" });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({ msg: "Invalid message" });
    }

    if (typeof version !== "number") {
      return res.status(400).json({ msg: "Invalid version" });
    }

    const updateData = {
      title: title.trim(),
      message: message.trim(),
      version,
      timestamp: Date.now()
    };

    await db.ref("admin_updates").set(updateData);

    return res.json({
      success: true,
      update: updateData
    });

  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

// ================= GET UPDATE =================
// ================= GET UPDATE =================

app.get("/get-update", async (req, res) => {

  try {

    const snap =
      await db.ref("update").get();

    // ========= DEFAULT =========

    if (!snap.exists()) {

      return res.json({

        success: true,

        update: {

          isNextLevel: false,

          rollout: false,

          forceUpdate: false,

          versionCode: 0,

          versionName: "",

          apkUrl: "",

          title: "",

          message: ""
        }
      });
    }

    const data =
      snap.val() || {};

    // ========= RESPONSE =========

    return res.json({

      success: true,

      update: {

        isNextLevel:
          data.isNextLevel === true,

        rollout:
          data.rollout === true,

        forceUpdate:
          data.forceUpdate === true,

        versionCode:
          Number(data.versionCode || 0),

        versionName:
          String(data.versionName || ""),

        apkUrl:
          String(data.apkUrl || "")
            .trim(),

        title:
          String(data.title || ""),

        message:
          String(data.message || "")
      }
    });

  } catch (err) {

    console.error(
      "GET UPDATE ERROR:",
      err
    );

    return res.status(500).json({

      success: false,

      msg: err.message
    });
  }
});



// ================= SET UPDATE =================

app.post("/set-update", async (req, res) => {

  try {

    let {

      isNextLevel,

      rollout,
      forceUpdate,

      versionCode,
      versionName,

      apkUrl,
      title,
      message

    } = req.body;

    // ========= NORMALIZE =========

    isNextLevel =
      isNextLevel === true ||
      isNextLevel === "true";

    rollout =
      rollout === true ||
      rollout === "true";

    forceUpdate =
      forceUpdate === true ||
      forceUpdate === "true";

    versionCode =
      Number(versionCode);

    versionName =
      String(versionName || "")
        .trim();

    apkUrl =
      String(apkUrl || "")
        .trim();

    title =
      String(title || "")
        .trim();

    message =
      String(message || "")
        .trim();

    // ========= VALIDATION =========

    if (
      isNaN(versionCode) ||
      versionCode < 1
    ) {

      return res.status(400).json({

        success: false,

        msg: "Invalid versionCode"
      });
    }

    if (!versionName) {

      return res.status(400).json({

        success: false,

        msg: "versionName required"
      });
    }

    if (!apkUrl) {

      return res.status(400).json({

        success: false,

        msg: "apkUrl required"
      });
    }

    if (!title) {

      return res.status(400).json({

        success: false,

        msg: "title required"
      });
    }

    if (!message) {

      return res.status(400).json({

        success: false,

        msg: "message required"
      });
    }

    // ========= URL VALIDATION =========

    if (
      !apkUrl.startsWith("http://") &&
      !apkUrl.startsWith("https://")
    ) {

      return res.status(400).json({

        success: false,

        msg: "apkUrl must start with http:// or https://"
      });
    }

    // ========= APK CHECK =========

    if (
      !apkUrl.toLowerCase().includes(".apk")
    ) {

      return res.status(400).json({

        success: false,

        msg: "Only APK URL allowed"
      });
    }

    // ========= FINAL DATA =========

    const updateData = {

      isNextLevel,

      rollout,

      forceUpdate,

      versionCode,

      versionName,

      apkUrl,

      title,

      message,

      updatedAt:
        Date.now()
    };

    // ========= SAVE =========

    await db
      .ref("update")
      .set(updateData);

    console.log(
      "UPDATE SAVED:",
      updateData
    );

    // ========= RESPONSE =========

    return res.json({

      success: true,

      update: updateData
    });

  } catch (err) {

    console.error(
      "SET UPDATE ERROR:",
      err
    );

    return res.status(500).json({

      success: false,

      msg: err.message
    });
  }
});

// ================= STATUS =================
app.get("/status", async (req, res) => {
  try {

    // Firebase se status fetch
    const snap = await db.ref("status").get();

    // Agar data nahi mila
    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        msg: "Status not found"
      });
    }

    // Firebase data
    const data = snap.val() || {};

    // Server values return
    return res.json({
      success: true,
      active_attacks: Number(data.active_attacks),
      max_attacks: Number(data.max_attacks)
    });

  } catch (err) {

    console.error("STATUS ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/status", async (req, res) => {

  try {

    const response =
      await axios.get(
        "https://kil.teamvps.space/status",
        {
          timeout: 10000
        }
      );

    return res.json(response.data);

  } catch (err) {

    console.error(
      "STATUS FETCH ERROR:",
      err.message
    );

    return res.status(500).json({

      success: false,

      error: "Failed to fetch status"
    });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});