const path = require("path");

const ROOT_DIR = __dirname;

module.exports = {
  ROOT_DIR,
  port: Number(process.env.PORT) || 8080,
  nodeEnv: process.env.NODE_ENV || "development",
  dataDir: path.join(ROOT_DIR, "data"),
  dbPath: path.join(ROOT_DIR, "data", "recruitment.db"),
  staticDir: path.resolve(ROOT_DIR, "../../ux-ui/recruitment-mvp"),
  questionsPath: path.resolve(ROOT_DIR, "../../ux-ui/recruitment-mvp/questions.json"),
  purgeIntervalMs: 24 * 60 * 60 * 1000,
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminSecret: process.env.ADMIN_SECRET || "",
  candidateTokenSecret: process.env.CANDIDATE_TOKEN_SECRET || ""
};
