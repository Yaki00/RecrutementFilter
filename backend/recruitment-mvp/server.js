const fs = require("fs");
const { createApp } = require("./app");
const { openDatabase } = require("./db");
const { purgeExpiredData } = require("./data-retention");
const config = require("./config");

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

if (config.nodeEnv === "production") {
  if (!config.adminSecret || !config.candidateTokenSecret) {
    console.warn(
      "Production: définissez ADMIN_SECRET et CANDIDATE_TOKEN_SECRET dans l'environnement."
    );
  }
}

const db = openDatabase(config.dbPath);
const app = createApp({
  db,
  staticDir: config.staticDir,
  questionsPath: config.questionsPath,
  adminConfig: {
    adminPassword: config.adminPassword,
    adminSecret: config.adminSecret || "mira-recruitment-admin-secret-dev"
  },
  candidateConfig: {
    tokenSecret: config.candidateTokenSecret || "mira-recruitment-candidate-secret-dev"
  }
});

purgeExpiredData(db)
  .then((result) => {
    if (result.purgedSessions > 0) {
      console.log(
        `Purge rétention: ${result.purgedSessions} session(s), ${result.purgedCandidates} candidat(s).`
      );
    }
  })
  .catch((error) => {
    console.error("Purge rétention au démarrage échouée:", error.message);
  });

const purgeTimer = setInterval(() => {
  purgeExpiredData(db).catch((error) => {
    console.error("Purge rétention planifiée échouée:", error.message);
  });
}, config.purgeIntervalMs);
if (typeof purgeTimer.unref === "function") {
  purgeTimer.unref();
}

app.listen(config.port, () => {
  console.log(`MIRA recruitment MVP running on port ${config.port}`);
  console.log(`Static dir: ${config.staticDir}`);
  console.log(`Database: ${config.dbPath}`);
  if (!config.adminPassword) {
    console.warn("ADMIN_PASSWORD non défini : la vue admin est désactivée.");
  } else {
    console.log(`Admin UI: http://127.0.0.1:${config.port}/admin`);
  }
});
