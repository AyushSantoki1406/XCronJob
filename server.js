// const express = require("express");
// const cron = require("node-cron");
// const mongoose = require("mongoose");
// const moment = require("moment-timezone");
// const User = require("./models/User");
// const APIModel = require("./models/Api");
// const Subscription = require("./models/Subscription.js"); // Adjust path if needed
// const bodyParser = require("body-parser");

// const app = express();
// app.use(express.text());
// app.use(bodyParser.json({ limit: "10mb" }));
// app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// // MongoDB connection
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

// // Health check endpoint for Kubernetes readiness probe
// app.get("/health", (req, res) => {
//   if (mongoose.connection.readyState === 1) {
//     res.status(200).json({ status: "healthy" });
//   } else {
//     res
//       .status(503)
//       .json({ status: "unhealthy", error: "MongoDB not connected" });
//   }
// });

// // SSE setup
// const sseClients = new Map();
// app.get("/broker-status-stream/:email", (req, res) => {
//   const email = req.params.email;
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   res.flushHeaders();

//   if (!sseClients.has(email)) {
//     sseClients.set(email, []);
//   }
//   sseClients.get(email).push(res);
//   console.log(
//     `SSE client connected for ${email}. Total clients: ${
//       sseClients.get(email).length
//     }`
//   );

//   res.write(`data: ${JSON.stringify({ message: "Connected to SSE" })}\n\n`);

//   req.on("close", () => {
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
//       }`
//     );
//     res.end();
//   });
// });

// const notifyBrokerStatusUpdate = (email, brokerData) => {
//   const clientList = sseClients.get(email) || [];
//   clientList.forEach((client) => {
//     client.write(`data: ${JSON.stringify(brokerData)}\n\n`);
//   });
// };

// // Cron job
// const getTimezoneFromLabel = (label) => {
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

// cron.schedule("* * * * *", async () => {
//   console.log(
//     "\n⏰ Cron started at",
//     moment().tz("Asia/Kolkata").format("HH:mm:ss")
//   );

//   try {
//     // Step 1: Fetch all users with ListOfBrokers and XAlgoID
//     const users = await User.find({})
//       .select("Email ListOfBrokers XalgoID")
//       .lean(); // Use .lean() for better performance (returns plain JS objects)

//     if (!users || users.length === 0) {
//       console.log("❌ No users found in the database");
//       return;
//     }

//     // Step 2: Process each user
//     for (const user of users) {
//       console.log(`\n📦 Processing user: ${user.Email}`);
//       console.log(`\n📦 Processing X user: ${user.XalgoID}`);

//       const subscriptions = await Subscription.find({
//         XalgoID: user.XalgoID,
//       }).lean();
//       console.log(`Subscriptions for ${user.Email}:`, subscriptions);

//       let userNeedsUpdate = false;
//       const brokers = [...(user.ListOfBrokers || [])];

//       // Step 3: Update isActive based on tradingTimes
//       for (let broker of brokers) {
//         let shouldBeActive = false;
//         const tz = broker.tradingTimes[0]?.timezone
//           ? getTimezoneFromLabel(broker.tradingTimes[0].timezone)
//           : "Asia/Kolkata";
//         const now = moment().tz(tz);

//         for (const time of broker.tradingTimes || []) {
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

//           if (now.isSameOrAfter(start) && remainingSeconds > 0) {
//             shouldBeActive = true;
//             console.log(
//               `✅ ${broker.clientId} is ACTIVE. Ends in ${remainingSeconds}s`
//             );
//           } else if (now.isBefore(start)) {
//             const untilStart = start.diff(now, "seconds");
//             console.log(`🕒 ${broker.clientId} will start in ${untilStart}s`);
//           } else {
//             console.log(`❌ ${broker.clientId} is currently inactive.`);
//           }
//         }

//         if (broker.isActive !== shouldBeActive) {
//           console.log(
//             `➡️ Updating ${broker.clientId} isActive from ${broker.isActive} → ${shouldBeActive}`
//           );
//           broker.isActive = shouldBeActive;
//           userNeedsUpdate = true;

//           try {
//             const updateResult = await APIModel.updateOne(
//               { "Apis.ApiID": broker.clientId },
//               { $set: { "Apis.$.IsActive": shouldBeActive } }
//             );
//             console.log(
//               `APIModel update result for ${broker.clientId} (isActive):`,
//               updateResult
//             );
//           } catch (err) {
//             console.error(
//               `Failed to update APIModel isActive for ${broker.clientId}:`,
//               err
//             );
//           }
//         }
//       }

//       // Step 4: Update canActivate based on subscriptions
//       const grouped = {};
//       brokers.forEach((b) => {
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
//             `➡️ Broker ${plain.clientId}: index ${index} < totalAPI ${totalAPI} → canActivate: ${canActivate}`
//           );
//         });
//       }

//       // Step 5: Save updates to MongoDB if needed
//       if (userNeedsUpdate) {
//         try {
//           await User.updateOne(
//             { Email: user.Email },
//             { $set: { ListOfBrokers: brokers } }
//           );
//           console.log(`✅ User ${user.Email} broker status updated:`, result);
//           notifyBrokerStatusUpdate(user.Email, result);
//         } catch (err) {
//           console.error(
//             `Failed to save broker updates for ${user.Email}:`,
//             err
//           );
//         }
//       } else {
//         console.log(`ℹ️ No broker status change needed for ${user.Email}.`);
//         console.log(`📤 Current broker result (with canActivate):`, result);
//       }
//     }
//   } catch (error) {
//     console.error("Cron job error:", error);
//   }
// });

// // Start the server
// const PORT = process.env.PORT || 8080;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });




const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const crypto = require("crypto");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Session middleware (simple in-memory session)
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

// In-memory storage (replaces database)
const users = new Map(); // user_id -> user_data
const alerts = []; // list of alert records

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

  async sendMessage(chatId, text, parseMode = "HTML") {
    try {
      const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: parseMode,
      };
      const response = await axios.post(
        `${this.baseUrl}/sendMessage`,
        payload,
        {
          timeout: 10000,
        }
      );
      return response.status === 200;
    } catch (error) {
      console.error("Error sending message:", error.message);
      return false;
    }
  }

  async setWebhook(webhookUrl) {
    try {
      const payload = { url: webhookUrl };
      const response = await axios.post(`${this.baseUrl}/setWebhook`, payload, {
        timeout: 10000,
      });
      return response.status === 200;
    } catch (error) {
      console.error("Error setting webhook:", error.message);
      return false;
    }
  }

  formatTradingViewAlert(alertData) {
    try {
      let data;
      if (typeof alertData === "string") {
        // Try parsing as JSON first
        try {
          data = JSON.parse(alertData);
        } catch {
          // Handle plain text (e.g., "Buy BTC at 50000")
          const parts = alertData.trim().split(" ");
          if (parts.length >= 4 && parts[2].toLowerCase() === "at") {
            data = {
              action: parts[0] || "Alert",
              symbol: parts[1] || "Unknown",
              price: parts[3] || "N/A",
              time: new Date().toISOString(),
            };
          } else {
            // Fallback for unparseable plain text
            data = { text: alertData, time: new Date().toISOString() };
          }
        }
      } else {
        data = alertData;
      }

      // Extract fields with fallbacks
      const symbol = data.ticker || data.symbol || "Unknown";
      const action = data["strategy.order.action"] || data.action || "Alert";
      const price = data.close || data.price || "N/A";
      const time = data.time || new Date().toISOString();

      // Format message
      const message = data.text
        ? `TradingView Alert: ${data.text}\nTime: ${time}`
        : `${action.toUpperCase()} ${symbol} at ${price}\nTime: ${time}`;

      console.log("Formatted alert:", message);
      return message.trim();
    } catch (error) {
      console.error("Error formatting alert:", error.message);
      return `TradingView Alert: ${JSON.stringify(alertData)}`;
    }
  }
}

function generateAuthCommand(botUsername, userId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const authData = `${userId}:${timestamp}`;
  const encodedData = Buffer.from(authData).toString("base64");
  return `/auth@${botUsername} ${encodedData}`;
}

function flashMessage(req, message, type = "success") {
  if (!req.session.flash) {
    req.session.flash = [];
  }
  req.session.flash.push({ message, type });
}

function getFlashMessages(req) {
  const messages = req.session.flash || [];
  req.session.flash = [];
  return messages;
}

// HTML Templates
const INDEX_HTML = `<!DOCTYPE html>
<html data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TradingView Telegram Bot</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body { background: #1a1a1a; }
        .card { border: none; }
        .auth-box { background: #2d4a2d; border: 1px solid #4a5c4a; padding: 1rem; border-radius: 0.5rem; }
        .webhook-url { background: #2d2d2d; border: 1px solid #555; }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-dark">
        <div class="container">
            <span class="navbar-brand"><i class="fas fa Robot me-2"></i>TradingView Bot</span>
        </div>
    </nav>
    <div class="container mt-4">
        {{FLASH_MESSAGES}}
        
        <div class="row justify-content-center">
            <div class="col-md-8">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-cog me-2"></i>Connect Telegram Bot</h3>
                    </div>
                    <div class="card-body">
                        <form method="POST" action="/setup">
                            <div class="mb-3">
                                <label class="form-label">Bot Token</label>
                                <input type="text" class="form-control" name="bot_token" required 
                                       placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz">
                                <div class="form-text">Get your bot token from @BotFather on Telegram</div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Alert Type</label>
                                <select class="form-select" name="alert_type" required>
                                    <option value="personal">Personal Messages</option>
                                    <option value="group">Group Chat</option>
                                    <option value="channel">Channel</option>
                                </select>
                            </div>
                            
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-check me-2"></i>Setup Bot
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body { background: #1a1a1a; }
        .card { border: none; }
        .auth-box { background: #2d4a2d; border: 1px solid #4a5c4a; padding: 1rem; border-radius: 0.5rem; }
        .webhook-url { background: #2d2d2d; border: 1px solid #555; padding: 0.75rem; border-radius: 0.375rem; }
        .copy-btn { cursor: pointer; }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-dark">
        <div class="container">
            <span class="navbar-brand"><i class="fas fa-robot me-2"></i>TradingView Bot</span>
            <a href="/" class="btn btn-outline-light btn-sm">New Bot</a>
        </div>
    </nav>
    
    <div class="container mt-4">
        {{FLASH_MESSAGES}}
        
        <div class="row">
            <div class="col-md-8">
                <div class="card">
                    <div class="card-header">
                        <h4><i class="fas fa-robot me-2"></i>Bot: @{{BOT_USERNAME}}</h4>
                    </div>
                    <div class="card-body">
                        {{AUTH_STATUS}}
                        
                        <div class="mt-4">
                            <h6>Webhook URL for TradingView:</h6>
                            <div class="webhook-url d-flex align-items-center justify-content-between">
                                <code id="webhook-url">{{WEBHOOK_URL}}</code>
                                <i class="fas fa-copy copy-btn ms-2" onclick="copyWebhook()" title="Copy to clipboard"></i>
                            </div>
                            <small class="text-muted">Copy this URL and use it in your TradingView alert webhook settings.</small>
                        </div>
                        
                        <div class="mt-4">
                            <a href="/regenerate/{{USER_ID}}" class="btn btn-warning btn-sm">
                                <i class="fas fa-sync me-2"></i>Regenerate Secret
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">
                        <h6><i class="fas fa-chart-line me-2"></i>Recent Alerts</h6>
                    </div>
                    <div class="card-body">
                        {{RECENT_ALERTS}}
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function copyWebhook() {
            const webhookUrl = document.getElementById('webhook-url').textContent;
            navigator.clipboard.writeText(webhookUrl).then(() => {
                const icon = document.querySelector('.copy-btn');
                icon.className = 'fas fa-check copy-btn ms-2';
                setTimeout(() => {
                    icon.className = 'fas fa-copy copy-btn ms-2';
                }, 2000);
            });
        }
    </script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;

function renderFlashMessages(messages) {
  if (!messages || messages.length === 0) return "";

  return messages
    .map(
      ({ message, type }) => `
        <div class="alert alert-${
          type === "error" ? "danger" : "success"
        } alert-dismissible">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `
    )
    .join("");
}

// Routes
app.get("/", (req, res) => {
  const flashMessages = renderDelegationMessages(getFlashMessages(req));
  const html = INDEX_HTML.replace("{{FLASH_MESSAGES}}", flashMessages);
  res.send(html);
});

app.post("/setup", async (req, res) => {
  try {
    const { bot_token, alert_type } = req.body;

    if (!bot_token || !bot_token.trim()) {
      flashMessage(req, "Bot token is required", "error");
      return res.redirect("/");
    }

    // Verify bot token
    const telegramService = new TelegramService(bot_token.trim());
    const botInfo = await telegramService.verifyBotToken();

    if (!botInfo) {
      flashMessage(
        req,
        "Invalid bot token. Please check your token and try again.",
        "error"
      );
      return res.redirect("/");
    }

    // Generate user ID and secret
    const userId = users.size + 1;
    const secretKey = uuidv4();
    const botUsername = botInfo.username || "UnknownBot";

    // Generate authentication command
    const authCommand = generateAuthCommand(botUsername, userId);

    // Store user data in memory
    const userData = {
      id: userId,
      botToken: bot_token.trim(),
      botUsername,
      secretKey,
      authCommand,
      alertType: alert_type || "personal",
      chatId: null,
      createdAt: new Date(),
    };
    users.set(userId, userData);

    // Set webhook for Telegram bot
    const protocol = req.get("X-Forwarded-Proto") || req.protocol;
    const host = req.get("Host");
    const webhookUrl = `${protocol}://${host}/webhook/telegram/${userId}`;
    const webhookSuccess = await telegramService.setWebhook(webhookUrl);

    if (!webhookSuccess) {
      flashMessage(req, "Failed to set Telegram webhook", "error");
      return res.redirect("/");
    }

    flashMessage(req, "Bot configured successfully!", "success");
    res.redirect(`/dashboard/${userId}`);
  } catch (error) {
    console.error("Error in setup:", error.message);
    flashMessage(req, "An error occurred while setting up the bot", "error");
    res.redirect("/");
  }
});

app.get("/dashboard/:userId", (req, res) => {
  const userId = parseInt(req.params.userId);
  const userData = users.get(userId);

  if (!userData) {
    flashMessage(req, "User not found", "error");
    return res.redirect("/");
  }

  // Get recent alerts for this user
  const userAlerts = alerts.filter((alert) => alert.userId === userId);
  const recentAlerts = userAlerts.slice(-10).reverse();

  // Generate webhook URL
  const protocol = req.get("X-Forwarded-Proto") || req.protocol;
  const host = req.get("Host");
  const webhookUrl = `${protocol}://${host}/webhook/tradingview/${userId}/${userData.secretKey}`;

  // Generate auth status HTML
  let authStatus = "";
  if (userData.alertType === "personal" && !userData.chatId) {
    authStatus = `
            <div class="alert alert-warning">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Action Required</h6>
                <p class="mb-2">To complete personal message setup:</p>
                <ol class="mb-0 ps-3">
                    <li>Start a chat with your bot <strong>@${userData.botUsername}</strong></li>
                    <li>Send this command: <code>${userData.authCommand}</code></li>
                </ol>
            </div>
        `;
  } else if (userData.chatId) {
    authStatus = `
            <div class="alert alert-success">
                <h6><i class="fas fa-check-circle me-2"></i>${
                  userData.alertType.charAt(0).toUpperCase() +
                  userData.alertType.slice(1)
                } Configured!</h6>
                <p class="mb-0">Your ${
                  userData.alertType
                } is ready to receive alerts.</p>
            </div>
        `;
  } else {
    authStatus = `
            <div class="alert alert-info">
                <h6><i class="fas fa-info-circle me-2"></i>Setup Instructions</h6>
                <p class="mb-2">For ${userData.alertType} alerts:</p>
                <ol class="mb-0 ps-3">
                    <li>Add your bot <strong>@${userData.botUsername}</strong> to your ${userData.alertType}</li>
                    <li>Send this command: <code>${userData.authCommand}</code></li>
                </ol>
            </div>
        `;
  }

  // Generate recent alerts HTML
  let recentAlertsHtml = "";
  if (recentAlerts.length > 0) {
    recentAlertsHtml = recentAlerts
      .map(
        (alert) => `
            <div class="alert alert-${
              alert.sentSuccessfully ? "success" : "danger"
            } py-2 mb-2">
                <small>
                    <i class="fas fa-${
                      alert.sentSuccessfully ? "check" : "times"
                    } me-1"></i>
                    ${alert.createdAt.toLocaleString()} - ${alert.webhookData}
                </small>
            </div>
        `
      )
      .join("");
  } else {
    recentAlertsHtml = '<p class="text-muted mb-0">No alerts yet</p>';
  }

  const flashMessages = renderFlashMessages(getFlashMessages(req));
  const html = DASHBOARD_HTML.replace("{{FLASH_MESSAGES}}", flashMessages)
    .replace("{{BOT_USERNAME}}", userData.botUsername)
    .replace("{{AUTH_STATUS}}", authStatus)
    .replace("{{WEBHOOK_URL}}", webhookUrl)
    .replace("{{USER_ID}}", userId)
    .replace("{{RECENT_ALERTS}}", recentAlertsHtml);

  res.send(html);
});

app.post("/webhook/tradingview/:userId/:secretKey", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const secretKey = req.params.secretKey;
    const userData = users.get(userId);

    if (!userData || userData.secretKey !== secretKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get webhook data
    const webhookData = req.body || req.body.message || req.body.text || {};
    console.log(`Received TradingView alert for user ${userId}:`, webhookData);

    // Check if chat is configured
    if (!userData.chatId) {
      const errorMsg =
        "Chat not configured. Please complete authentication first.";
      alerts.push({
        userId,
        webhookData: JSON.stringify(webhookData),
        sentSuccessfully: false,
        createdAt: new Date(),
        errorMessage: errorMsg,
      });
      return res.status(400).json({ error: errorMsg });
    }

    // Send alert to Telegram
    const telegramService = new TelegramService(userData.botToken);
    const formattedMessage =
      telegramService.formatTradingViewAlert(webhookData);

    const success = await telegramService.sendMessage(
      userData.chatId,
      formattedMessage
    );

    // Log alert
    alerts.push({
      userId,
      webhookData: JSON.stringify(webhookData),
      sentSuccessfully: success,
      createdAt: new Date(),
      errorMessage: success ? null : "Failed to send message",
    });

    if (success) {
      console.log(`Alert sent successfully to chat ${userData.chatId}`);
      return res.json({ status: "success" });
    } else {
      console.error(`Failed to send alert to chat ${userData.chatId}`);
      return res.status(500).json({ error: "Failed to send alert" });
    }
  } catch (error) {
    console.error("Error in tradingview webhook:", error.message);
    alerts.push({
      userId: parseInt(req.params.userId),
      webhookData: JSON.stringify(req.body),
      sentSuccessfully: false,
      createdAt: new Date(),
      errorMessage: error.message,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/webhook/telegram/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const userData = users.get(userId);

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    const update = req.body;
    console.log("Received Telegram update:", JSON.stringify(update));

    // Handle message updates
    if (update.message) {
      const message = update.message;
      const chat = message.chat || {};
      const text = message.text || "";

      // Check for auth command
      if (text.startsWith(`/auth@${userData.botUsername}`)) {
        const chatId = chat.id;
        const chatType = chat.type || "private";

        console.log(
          `Received auth command from chat ${chatId}, type: ${chatType}`
        );

        // Update user's chat_id
        userData.chatId = String(chatId);
        users.set(userId, userData);

        // Send confirmation
        const telegramService = new TelegramService(userData.botToken);
        const confirmationMsg = `✅ Authentication successful!\n\nYour ${userData.alertType} is now configured to receive TradingView alerts.`;
        await telegramService.sendMessage(chatId, confirmationMsg);

        console.log(`Chat ${chatId} configured for user ${userId}`);
      }
    }

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Error in telegram webhook:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/regenerate/:userId", (req, res) => {
  const userId = parseInt(req.params.userId);
  const userData = users.get(userId);

  if (!userData) {
    flashMessage(req, "User not found", "error");
    return res.redirect("/");
  }

  // Generate new secret
  userData.secretKey = uuidv4();
  users.set(userId, userData);

  flashMessage(req, "Secret key regenerated successfully!", "success");
  res.redirect(`/dashboard/${userId}`);
});

// Error handlers
app.use((req, res) => {
  res.status(404).send(`
        <div class="container mt-5 text-center">
            <h1>Page Not Found</h1>
            <p>The requested page could not be found.</p>
            <a href="/" class="btn btn-primary">Go Home</a>
        </div>
    `);
});

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);
  res.status(500).send(`
        <div class="container mt-5 text-center">
            <h1>Internal Server Error</h1>
            <p>Something went wrong on our end.</p>
            <a href="/" class="btn btn-primary">Go Home</a>
        </div>
    `);
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("🤖 TradingView Telegram Bot - Node.js Version");
  console.log(`📱 Server running on http://localhost:${PORT}`);
  console.log("💡 Press Ctrl+C to stop the server");
});

module.exports = app;
