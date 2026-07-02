const path = require("path");
const fs = require("fs");
const { createApp } = require("./app");
const { openDatabase } = require("./db");

const { purgeExpiredData } = require("./data-retention");

const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "mira-recruitment-admin-secret";
const CANDIDATE_TOKEN_SECRET =
  process.env.CANDIDATE_TOKEN_SECRET || "mira-recruitment-candidate-secret-dev";
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "recruitment.db");
const staticDir = path.resolve(__dirname, "../../ux-ui/recruitment-mvp");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = openDatabase(dbPath);
const app = createApp({
  db,
  staticDir,
  adminConfig: {
    adminPassword: ADMIN_PASSWORD,
    adminSecret: ADMIN_SECRET
  },
  candidateConfig: {
    tokenSecret: CANDIDATE_TOKEN_SECRET
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

setInterval(() => {
  purgeExpiredData(db).catch((error) => {
    console.error("Purge rétention planifiée échouée:", error.message);
  });
}, PURGE_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`MIRA recruitment MVP running on port ${PORT}`);
  console.log(`Static dir: ${staticDir}`);
  console.log(`Database: ${dbPath}`);
  if (!ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD non défini : la vue admin est désactivée.");
  } else {
    console.log(`Admin UI: http://127.0.0.1:${PORT}/admin`);
  }
});
