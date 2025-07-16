// const express = require("express");
// const cron = require("node-cron");
// const mongoose = require("mongoose");
// const moment = require("moment-timezone");
// const User = require("./models/User");
// const APIModel = require("./models/Api");
// const Subscription = require("./models/Subscription.js");
// const bodyParser = require("body-parser");
// const cors = require("cors");

// const app = express();

// const allowedOrigins = [
//   "http://localhost:3000",
//   "https://your-netlify-app.netlify.app",
//   "https://xalgos.in",
// ];

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         console.error(`CORS blocked for origin: ${origin}`);
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
//     credentials: true,
//     optionsSuccessStatus: 204,
//   })
// );

// app.use(express.text());
// app.use(bodyParser.json({ limit: "10mb" }));
// app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// const MONGODB_URI =
//   process.env.MONGODB_URI ||
//   "mongodb+srv://harshdvadhavana26:harshdv007@try.j3wxapq.mongodb.net/X-Algos?retryWrites=true&w=majority";

// mongoose
//   .connect(MONGODB_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log("✅ Connected to MongoDB"))
//   .catch((err) => console.error("❌ MongoDB connection error:", err));

// app.get("/health", (req, res) => {
//   if (mongoose.connection.readyState === 1) {
//     res.status(200).json({ status: "healthy" });
//   } else {
//     res
//       .status(503)
//       .json({ status: "unhealthy", error: "MongoDB not connected" });
//   }
// });

// const sseClients = new Map();

// app.get("/broker-status-stream/:email", (req, res) => {
//   const email = req.params.email;
//   res.set({
//     "Content-Type": "text/event-stream",
//     "Cache-Control": "no-cache",
//     Connection: "keep-alive",
//     "Access-Control-Allow-Origin":
//       req.headers.origin || "https://your-netlify-app.netlify.app",
//     "Access-Control-Allow-Credentials": "true",
//     "X-Accel-Buffering": "no",
//   });
//   res.flushHeaders();

//   if (!sseClients.has(email)) {
//     sseClients.set(email, []);
//   }

//   const clientList = sseClients.get(email);
//   clientList.push(res);
//   console.log(
//     `SSE client connected for ${email}. Total clients: ${clientList.length}, Origin: ${req.headers.origin}`
//   );

//   res.write(`data: ${JSON.stringify({ message: "Connected to SSE" })}\n\n`);

//   const heartbeatInterval = setInterval(() => {
//     try {
//       res.write(`data: ${JSON.stringify({ message: "heartbeat" })}\n\n`);
//     } catch (err) {
//       console.error(`❌ Heartbeat error for ${email}:`, err.message);
//       clearInterval(heartbeatInterval);
//       clientList.splice(clientList.indexOf(res), 1);
//       if (clientList.length === 0) {
//         sseClients.delete(email);
//       }
//       res.end();
//     }
//   }, 10000);

//   req.on("error", (err) => {
//     console.error(`❌ Request error for ${email}: ${err.message}`);
//   });

//   req.on("close", () => {
//     clearInterval(heartbeatInterval);
//     const clientList = sseClients.get(email) || [];
//     sseClients.set(
//       email,
//       clientList.filter((client) => client !== res)
//     );
//     if (sseClients.get(email).length === 0) {
//       sseClients.delete(email);
//     }
//     console.log(
//       `SSE client disconnected for ${email}. Remaining clients: ${
//         sseClients.get(email)?.length || 0
//       }, Origin: ${req.headers.origin}`
//     );
//     res.end();
//   });
// });

// const notifyBrokerStatusUpdate = (email, brokerData) => {
//   const clientList = sseClients.get(email) || [];
//   console.log(
//     `📤 Sending SSE notification for ${email}: dbUpdated=${brokerData.dbUpdated}, brokers=`,
//     brokerData.brokers
//   );
//   clientList.forEach((client) => {
//     try {
//       client.write(`data: ${JSON.stringify(brokerData)}\n\n`);
//     } catch (err) {
//       console.error(`❌ Error sending SSE to ${email}:`, err.message);
//     }
//   });
// };

// const getTimezoneFromLabel = (label) => {
//   if (!label) return "Asia/Kolkata";
//   const match = label.match(/\((UTC[+-]\d{2}:\d{2})\)/);
//   if (match) {
//     const offset = match[1].replace("UTC", "");
//     const zones = moment.tz.names();
//     return (
//       zones.find((zone) => moment.tz(zone).format("Z") === offset) ||
//       "Asia/Kolkata"
//     );
//   }
//   if (label.includes("IST")) return "Asia/Kolkata";
//   return "Asia/Kolkata";
// };

// cron.schedule("*/60 * * * * *", async () => {
//   console.log(
//     "\n⏰ Cron started at",
//     moment().tz("Asia/Kolkata").format("HH:mm:ss")
//   );

//   try {
//     const users = await User.find({})
//       .select("Email ListOfBrokers XalgoID")
//       .lean();

//     if (!users || users.length === 0) {
//       console.log("❌ No users found in the database");
//       return;
//     }

//     for (const user of users) {
//       console.log(`\n📦 Processing user: ${user.Email}`);
//       console.log(`📦 Processing X user: ${user.XalgoID}`);

//       const subscriptions = await Subscription.find({
//         XalgoID: user.XalgoID,
//       }).lean();
//       console.log(`Subscriptions for ${user.Email}:`, subscriptions);

//       let userNeedsUpdate = false;
//       const brokers = [...(user.ListOfBrokers || [])];
//       const updatedBrokers = [];

//       for (let broker of brokers) {
//         let shouldBeActive = broker.isActive;
//         const tz = broker.tradingTimes?.[0]?.timezone
//           ? getTimezoneFromLabel(broker.tradingTimes[0].timezone)
//           : "Asia/Kolkata";
//         const now = moment().tz(tz);

//         console.log(
//           `Checking trading times for ${broker.clientId}:`,
//           broker.tradingTimes
//         );

//         if (!broker.tradingTimes || broker.tradingTimes.length === 0) {
//           console.log(
//             `ℹ No trading times found for ${broker.clientId}, preserving isActive=${broker.isActive}`
//           );
//           updatedBrokers.push({ ...broker });
//           continue;
//         }

//         let isWithinTimeWindow = false;
//         for (const time of broker.tradingTimes) {
//           const start = moment.tz(tz).set({
//             year: now.year(),
//             month: now.month(),
//             date: now.date(),
//             hour: +time.startHour,
//             minute: +time.startMinute,
//             second: 0,
//           });
//           const end = moment.tz(tz).set({
//             year: now.year(),
//             month: now.month(),
//             date: now.date(),
//             hour: +time.endHour,
//             minute: +time.endMinute,
//             second: 0,
//           });

//           const remainingSeconds = end.diff(now, "seconds");
//           const untilStart = start.diff(now, "seconds");

//           console.log(
//             `Time window for ${broker.clientId}: ${start.format(
//               "HH:mm"
//             )} - ${end.format("HH:mm")} (Now: ${now.format("HH:mm:ss")})`
//           );

//           if (now.isSameOrAfter(start) && remainingSeconds >= 0) {
//             isWithinTimeWindow = true;
//             shouldBeActive = true;
//             console.log(
//               `✅ ${broker.clientId} is ACTIVE. Ends in ${remainingSeconds}s`
//             );
//             break;
//           } else if (now.isBefore(start)) {
//             console.log(`🕒 ${broker.clientId} will start in ${untilStart}s`);
//           } else {
//             console.log(`❌ ${broker.clientId} is currently inactive.`);
//           }
//         }

//         if (!isWithinTimeWindow) {
//           shouldBeActive = false;
//         }

//         if (broker.isActive !== shouldBeActive) {
//           console.log(
//             `➡ Updating ${broker.clientId} isActive from ${broker.isActive} → ${shouldBeActive}`
//           );
//           broker.isActive = shouldBeActive;
//           userNeedsUpdate = true;

//           try {
//             const apiDoc = await APIModel.findOne({
//               "Apis.ApiID": broker.clientId,
//             });
//             console.log(`APIModel document for ${broker.clientId}:`, apiDoc);

//             const updateResult = await APIModel.updateOne(
//               { "Apis.ApiID": broker.clientId, XAlgoID: user.XalgoID },
//               { $set: { "Apis.$.IsActive": shouldBeActive } }
//             );
//             if (updateResult.matchedCount === 0) {
//               console.error(
//                 `❌ No matching ApiID ${broker.clientId} or XAlgoID ${user.XalgoID} found in APIModel`
//               );
//             } else if (updateResult.modifiedCount === 0) {
//               console.error(
//                 `❌ No changes applied for ${broker.clientId} in APIModel`
//               );
//             } else {
//               console.log(
//                 `✅ APIModel updated for ${broker.clientId} (isActive=${shouldBeActive}):`,
//                 updateResult
//               );
//               userNeedsUpdate = true;
//             }
//           } catch (err) {
//             console.error(
//               `❌ Failed to update APIModel for ${broker.clientId}:`,
//               err.message,
//               err.stack
//             );
//           }
//         } else {
//           console.log(
//             `ℹ No change in isActive for ${broker.clientId} (remains ${broker.isActive})`
//           );
//         }
//         updatedBrokers.push({ ...broker });
//       }

//       const grouped = {};
//       updatedBrokers.forEach((b) => {
//         const type = b.broker?.toLowerCase()?.replace(/\s+/g, "") || "unknown";
//         if (!grouped[type]) grouped[type] = [];
//         grouped[type].push(b);
//       });

//       const result = [];

//       for (const [type, list] of Object.entries(grouped)) {
//         const totalAPI = subscriptions
//           .filter((s) => s.Account?.toLowerCase()?.replace(/\s+/g, "") === type)
//           .reduce((sum, s) => sum + (s.NoOfAPI || 0), 0);

//         console.log(`🔍 Broker Type: ${type}, totalAPI: ${totalAPI}`);

//         list.forEach((broker, index) => {
//           const plain = broker.toObject?.() || broker;
//           const canActivate = index < totalAPI;
//           plain.canActivate = canActivate;
//           result.push(plain);

//           console.log(
//             ` ➡ Broker ${plain.clientId}: index ${index} < totalAPI ${totalAPI} → canActivate: ${canActivate}`
//           );
//         });
//       }

//       if (userNeedsUpdate) {
//         try {
//           await User.updateOne(
//             { Email: user.Email },
//             { $set: { ListOfBrokers: updatedBrokers } }
//           );
//           console.log(`✅ User ${user.Email} broker status updated`);
//           notifyBrokerStatusUpdate(user.Email, {
//             brokers: result,
//             dbUpdated: true,
//           });
//         } catch (err) {
//           console.error(
//             `❌ Failed to save broker updates for ${user.Email}:`,
//             err.message,
//             err.stack
//           );
//           notifyBrokerStatusUpdate(user.Email, {
//             brokers: result,
//             dbUpdated: false,
//           });
//         }
//       } else {
//         console.log(`ℹ No broker status change needed for ${user.Email}`);
//         notifyBrokerStatusUpdate(user.Email, {
//           brokers: result,
//           dbUpdated: false,
//         });
//       }
//     }
//   } catch (error) {
//     console.error("❌ Cron job error:", error.message, error.stack);
//   }
// });

// app.get("/trigger-cron", async (req, res) => {
//   try {
//     await require("./server").cron();
//     res.status(200).json({ message: "Cron triggered successfully" });
//   } catch (err) {
//     console.error("❌ Manual cron trigger error:", err.message, err.stack);
//     res.status(500).json({ error: "Failed to trigger cron" });
//   }
// });

// app.listen(8080, () => console.log("Server running on port 8080"));

const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://harshdvadhavana26:harshdv007@try.j3wxapq.mongodb.net/tradingview_bot?retryWrites=true&w=majority";
const DB_NAME = "tradingview_bot";

// MongoDB Client
let db;

async function connectToMongoDB() {
  const client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    db = client.db(DB_NAME);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
}

// Connect to MongoDB when the server starts
connectToMongoDB();

// Middleware
app.use(express.text({ type: ["text/plain", "text/*"] }));
app.use(express.json({ type: ["application/json", "application/*+json"] }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://xalgotelegram.netlify.app",
    credentials: true,
  })
);

// Session middleware
const sessions = new Map();
function sessionMiddleware(req, res, next) {
  const sessionId =
    req.headers["x-session-id"] || crypto.randomBytes(16).toString("hex");
  req.sessionId = sessionId;
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {});
  }
  req.session = sessions.get(sessionId);
  res.setHeader("X-Session-ID", sessionId);
  next();
}
app.use(sessionMiddleware);

class TelegramService {
  constructor(botToken) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async verifyBotToken() {
    try {
      const response = await axios.get(`${this.baseUrl}/getMe`, {
        timeout: 10000,
      });
      return response.status === 200 && response.data.ok
        ? response.data.result
        : null;
    } catch (error) {
      console.error("Error verifying bot token:", error.message);
      return null;
    }
  }

  async sendMessage(chatId, text, parseMode = null) {
    try {
      const payload = {
        chat_id: chatId,
        text: `${text}\n\nPowered by xalgos.in`,
      };
      if (parseMode) payload.parse_mode = parseMode;
      const response = await axios.post(
        `${this.baseUrl}/sendMessage`,
        payload,
        { timeout: 10000 }
      );
      console.log(`Sent message to chat ${chatId}:`, text);
      return response.status === 200;
    } catch (error) {
      console.error("Error sending message:", error.message);
      return false;
    }
  }

  async setWebhook(webhookUrl) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/setWebhook`,
        { url: webhookUrl, allowed_updates: ["message", "channel_post"] },
        { timeout: 10000 }
      );
      console.log(`Webhook set successfully: ${webhookUrl}`);
      return response.status === 200;
    } catch (error) {
      console.error("Error setting webhook:", error.message);
      return false;
    }
  }

  formatTradingViewAlert(alertData, contentType) {
    try {
      console.log("formatTradingViewAlert input:", { alertData, contentType });

      if (alertData === null || alertData === undefined) {
        return " No data received\n\nPowered by xalgos.in";
      }

      if (contentType.includes("text/plain") || typeof alertData === "string") {
        return `\n\n${
          alertData.trim() || "Empty message"
        }\n\nPowered by xalgos.in`;
      }

      if (
        contentType.includes("application/json") ||
        typeof alertData === "object"
      ) {
        try {
          const formatted = JSON.stringify(alertData, null, 2);
          return `\n\n\`\`\`json\n${formatted}\n\`\`\`\n\nPowered by xalgos.in`;
        } catch (error) {
          console.error("Error formatting JSON:", error.message);
          return ` Malformed JSON data: ${JSON.stringify(
            alertData
          )}\n\nPowered by xalgos.in`;
        }
      }

      return ` Unsupported data format: ${String(
        alertData
      )}\n\nPowered by xalgos.in`;
    } catch (error) {
      console.error("Error processing alert:", error.message);
      return ` Error processing data: ${String(
        alertData
      )}\n\nPowered by xalgos.in`;
    }
  }
}

function generateAuthCommand(botUsername, userId, alertType = "personal") {
  if (alertType === "channel") {
    const unique_code = uuidv4().substring(0, 8).toUpperCase();
    return `auth ${unique_code}`;
  } else {
    const secret =
      process.env.HMAC_SECRET || "3HKlcLqdkJmvjhoAf8FnYzr4Ua6QBWtG";
    const data = `${userId}`;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(data);
    const encodedData = hmac.digest("base64");
    return `/auth@${botUsername} ${encodedData}`;
  }
}

function flashMessage(req, message, type = "success") {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push({
    message: `${message}\n\nPowered by xalgos.in`,
    type,
  });
}

function getFlashMessages(req) {
  const messages = req.session.flash || [];
  req.session.flash = [];
  return messages;
}

// API Routes
app.get("/api", (req, res) => {
  res.json({ flashMessages: getFlashMessages(req) });
});

app.post("/api/setup", async (req, res) => {
  try {
    const { bot_token, image, XId } = req.body;

    if (!bot_token || !bot_token.trim()) {
      flashMessage(req, "Bot token is required", "error");
      return res.status(400).json({
        error: "Bot token is required\n\nPowered by xalgos.in",
      });
    }

    const existingUser = await db
      .collection("users")
      .findOne({ botToken: bot_token.trim() });
    if (existingUser) {
      flashMessage(req, "This bot token is already registered", "error");
      return res.status(400).json({
        error: "This bot token is already registered\n\nPowered by xalgos.in",
      });
    }

    const telegramService = new TelegramService(bot_token.trim());
    const botInfo = await telegramService.verifyBotToken();

    if (!botInfo) {
      flashMessage(
        req,
        "Invalid bot token. Please check your token and try again.",
        "error"
      );
      return res.status(400).json({
        error: "Invalid bot token\n\nPowered by xalgos.in",
      });
    }

    const userCount = await db.collection("users").countDocuments();
    const userId = userCount + 1;

    const secretKey = uuidv4();
    const botUsername = botInfo.username || "unknown";
    const alertTypes = ["personal", "group", "channel"];
    const alerts = alertTypes.map((alertType) => ({
      alertType,
      authCommand: generateAuthCommand(botUsername, userId, alertType),
    }));

    const protocol = req.get("X-Forwarded-Proto") || req.protocol;
    const host = req.get("Host");
    const webhookUrl = `${protocol}://${host}/webhook/telegram/${userId}`;

    const userData = {
      id: userId,
      botToken: bot_token.trim(),
      botUsername,
      image: image || null,
      secretKey,
      chatId: null,
      alerts,
      XalgoID: XId || null,
      webhookURL: webhookUrl,
      createdAt: new Date(),
    };

    console.log("Inserting user:", JSON.stringify(userData, null, 2));
    await db.collection("users").insertOne(userData);
    await telegramService.setWebhook(webhookUrl);

    const userAlerts = await db
      .collection("alerts")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    const webhookTradingViewUrl = `${protocol}://${host}/webhook/tradingview/${userId}/${secretKey}`;

    flashMessage(req, "Bot configured successfully!", "success");
    return res.json({
      redirect: `/dashboard/${userId}`,
      flashMessages: getFlashMessages(req),
      userData,
      recentAlerts: userAlerts,
      webhookUrl: webhookTradingViewUrl,
    });
  } catch (error) {
    console.error("Error in setup:", error.message, error.stack);
    flashMessage(req, "An error occurred while setting up the bot", "error");
    return res.status(500).json({
      error: "Internal server error\n\nPowered by xalgos.in",
    });
  }
});

app.get("/api/dashboard/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const userData = await db.collection("users").findOne({ id: userId });

    if (!userData) {
      flashMessage(req, "User not found", "error");
      return res
        .status(404)
        .json({ error: "User not found\n\nPowered by xalgos.in" });
    }

    const userAlerts = await db
      .collection("alerts")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    const protocol = req.get("X-Forwarded-Proto") || req.protocol;
    const host = req.get("Host");
    const webhookUrl = `${protocol}://${host}/webhook/tradingview/${userId}/${userData.secretKey}`;

    res.json({
      flashMessages: getFlashMessages(req),
      userData,
      recentAlerts: userAlerts,
      webhookUrl,
    });
  } catch (error) {
    console.error("Error in dashboard:", error.message, error.stack);
    flashMessage(
      req,
      "An error occurred while fetching dashboard data",
      "error"
    );
    res
      .status(500)
      .json({ error: "Internal server error\n\nPowered by xalgos.in" });
  }
});

app.post("/webhook/tradingview/:userId/:secretKey", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const secretKey = req.params.secretKey;
    const userData = await db.collection("users").findOne({ id: userId });

    if (!userData || userData.secretKey !== secretKey) {
      console.log(
        `Unauthorized access: userId=${userId}, secretKey=${secretKey}`
      );
      return res
        .status(401)
        .json({ error: "Unauthorized\n\nPowered by xalgos.in" });
    }

    const contentType = req.headers["content-type"] || "unknown";
    console.log(
      `Received TradingView alert for user ${userId}, Content-Type: ${contentType}, Data:`,
      JSON.stringify(req.body, null, 2)
    );

    let webhookData;
    if (contentType.includes("application/json")) {
      webhookData = req.body;
    } else if (contentType.includes("text/plain")) {
      webhookData = req.body;
    } else {
      webhookData = req.body || String(req.rawBody || "");
      console.warn(
        `Unsupported Content-Type: ${contentType}, treating as raw data`
      );
    }

    if (!userData.chatId) {
      const errorMsg =
        "Chat not configured. Please complete authentication first.";
      await db.collection("alerts").insertOne({
        userId,
        webhookData,
        contentType,
        sentSuccessfully: false,
        createdAt: new Date(),
        errorMessage: errorMsg,
      });
      return res.status(400).json({
        error:
          "Chat not configured. Please complete authentication first.\n\nPowered by xalgos.in",
      });
    }

    const telegramService = new TelegramService(userData.botToken);
    const formattedMessage = telegramService.formatTradingViewAlert(
      webhookData,
      contentType
    );
    const success = await telegramService.sendMessage(
      userData.chatId,
      formattedMessage,
      contentType.includes("json") ? "Markdown" : null
    );

    await db.collection("alerts").insertOne({
      userId,
      webhookData,
      contentType,
      formattedMessage,
      sentSuccessfully: success,
      createdAt: new Date(),
      errorMessage: success ? null : "Failed to send message",
    });

    return success
      ? res.json({ status: "success" })
      : res
          .status(500)
          .json({ error: "Failed to send alert\n\nPowered by xalgos.in" });
  } catch (error) {
    console.error("Error in tradingview webhook:", error.message, error.stack);
    await db.collection("alerts").insertOne({
      userId: parseInt(req.params.userId),
      webhookData: req.body || String(req.rawBody || ""),
      contentType: req.headers["content-type"] || "unknown",
      sentSuccessfully: false,
      createdAt: new Date(),
      errorMessage: error.message,
    });
    return res
      .status(500)
      .json({ error: "Internal server error\n\nPowered by xalgos.in" });
  }
});

app.post("/webhook/telegram/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    console.log(
      `Received Telegram update for userId ${userId}:`,
      JSON.stringify(req.body, null, 2)
    );

    const userData = await db.collection("users").findOne({ id: userId });
    if (!userData) {
      console.log(`User not found: userId=${userId}`);
      return res
        .status(404)
        .json({ error: "User not found\n\nPowered by xalgos.in" });
    }

    const telegramService = new TelegramService(userData.botToken);
    const update = req.body;
    let message, chat, text;

    if (update.message) {
      message = update.message;
      chat = message.chat || {};
      text = message.text || "";
      console.log("Processing regular message:", {
        chatId: chat.id,
        chatType: chat.type,
        text,
      });
    } else if (update.channel_post) {
      message = update.channel_post;
      chat = message.chat || {};
      text = message.text || "";
      console.log("Processing channel post:", {
        chatId: chat.id,
        chatType: chat.type,
        text,
      });
    } else {
      console.log(
        "No message or channel_post found in update:",
        JSON.stringify(update, null, 2)
      );
      return res.json({ status: "ok" });
    }

    for (const alert of userData.alerts) {
      if (
        alert.alertType === "channel" &&
        text.startsWith("auth ") &&
        text.length > 5
      ) {
        const receivedCode = text.substring(5).trim();
        const storedCode = alert.authCommand.startsWith("auth ")
          ? alert.authCommand.substring(5).trim()
          : alert.authCommand;

        console.log(
          `Channel auth check: received '${receivedCode}' vs stored '${storedCode}'`
        );

        if (receivedCode === storedCode) {
          await db
            .collection("users")
            .updateOne({ id: userId }, { $set: { chatId: String(chat.id) } });
          console.log(
            `Channel auth successful: chatId ${chat.id} linked to userId ${userId}`
          );
          await telegramService.sendMessage(
            chat.id,
            `✅ Authentication successful!\nYour ${alert.alertType} is now configured to receive TradingView alerts.`
          );
        } else {
          console.log(`Channel auth failed: codes don't match`);
          await telegramService.sendMessage(
            chat.id,
            `❌ Authentication failed. Please use the correct auth code from the dashboard.`
          );
        }
      } else if (
        (text.startsWith(`/auth@${userData.botUsername}`) ||
          text.startsWith(`/auth`)) &&
        ["personal", "group"].includes(alert.alertType)
      ) {
        if (
          text.startsWith(`/auth`) &&
          !text.includes(`@${userData.botUsername}`)
        ) {
          console.log(`Invalid auth command format: ${text}`);
          await telegramService.sendMessage(
            chat.id,
            `Please use the full command: /auth@${userData.botUsername} <encodedData>`
          );
          return res.json({ status: "ok" });
        }

        const parts = text.trim().split(" ");
        if (parts.length < 2) {
          console.log(`Invalid auth command: missing encoded data`);
          await telegramService.sendMessage(
            chat.id,
            `❌ Authentication failed. Please ensure you are using the correct command from the dashboard.`
          );
          return res.json({ status: "ok" });
        }

        const encodedData = parts[1];
        const secret =
          process.env.HMAC_SECRET || "3HKlcLqdkJmvjhoAf8FnYzr4Ua6QBWtG";
        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(`${userId}`);
        const expectedEncodedData = hmac.digest("base64");

        if (encodedData === expectedEncodedData) {
          await db
            .collection("users")
            .updateOne({ id: userId }, { $set: { chatId: String(chat.id) } });
          console.log(
            `Auth successful: chatId ${chat.id} linked to userId ${userId}`
          );
          await telegramService.sendMessage(
            chat.id,
            `✅ Authentication successful!\nYour ${alert.alertType} is now configured to receive TradingView alerts.`
          );
        } else {
          console.log(`Auth failed: invalid HMAC signature`);
          await telegramService.sendMessage(
            chat.id,
            `❌ Authentication failed. Please ensure you are using the correct command from the dashboard.`
          );
        }
      }
    }

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Error in telegram webhook:", error.message, error.stack);
    return res
      .status(500)
      .json({ error: "Internal server error\n\nPowered by xalgos.in" });
  }
});

app.get("/api/regenerate/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const userData = await db.collection("users").findOne({ id: userId });

    if (!userData) {
      flashMessage(req, "User not found", "error");
      return res
        .status(404)
        .json({ error: "User not found\n\nPowered by xalgos.in" });
    }

    const newSecretKey = uuidv4();
    await db
      .collection("users")
      .updateOne({ id: userId }, { $set: { secretKey: newSecretKey } });

    flashMessage(req, "Secret key regenerated successfully!", "success");
    res.json({ status: "success", newSecretKey });
  } catch (error) {
    console.error("Error in regenerate:", error.message, error.stack);
    flashMessage(
      req,
      "An error occurred while regenerating secret key",
      "error"
    );
    res
      .status(500)
      .json({ error: "Internal server error\n\nPowered by xalgos.in" });
  }
});

app.use((req, res) => {
  console.log(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Not found\n\nPowered by xalgos.in" });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error.message, error.stack);
  res
    .status(500)
    .json({ error: "Internal server error\n\nPowered by xalgos.in" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
