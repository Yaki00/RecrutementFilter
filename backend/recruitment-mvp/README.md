# Backend

Express + SQLite. Sert l’API et les fichiers statiques du dossier `ux-ui/recruitment-mvp/`.

```bash
npm install
npm start
npm test
```

## Routes candidat

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/candidates/register` | Profil + consentement → `candidateId`, `candidateToken` |
| POST | `/api/session` | Fin de questionnaire (jeton obligatoire, réponses recalculées) |
| GET | `/api/health` | Santé |

## Routes admin (header `Authorization: Bearer <token>`)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/admin/login` | Mot de passe → token (8 h) |
| POST | `/api/admin/logout` | Invalidation du token |
| GET | `/api/admin/participants` | Liste + sessions + réponses |
| GET | `/api/admin/kpis` | Indicateurs agrégés |
| POST | `/api/admin/purge` | Suppression des données expirées |
| POST | `/api/admin/erase-candidate` | Body `{ "email": "..." }` |

Login admin : 3 échecs → ban IP ; rate limit sur toutes les routes admin.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `server.js` | Démarrage, purge planifiée |
| `app.js` | Routes |
| `config.js` | Chemins et variables d’env |
| `questions-scoring.js` | Lecture `questions.json`, score, verdict |
| `candidate-auth.js` | Jeton candidat (HMAC, 4 h) |
| `data-retention.js` | Purge 2 ans, effacement par email |

## Base

`data/recruitment.db` — tables `candidates`, `sessions`, `answers`, `admin_sessions`, `admin_login_attempts`.

Config : copier `.env.example` vers `.env`.
