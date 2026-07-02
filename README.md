# MIRA Recrutement

Questionnaire de présélection pour le recrutement MIRA. Le candidat répond en inclinant la tête ; les réponses sont stockées en base et consultables dans une interface admin.

| | URL |
|---|-----|
| Candidats | https://recrutement.mira.pixelbrain.fr |
| Admin | https://recrutement.mira.pixelbrain.fr/admin |
| API santé | https://recrutement.mira.pixelbrain.fr/api/health |

Repo : https://github.com/Yaki00/RecrutementFilter

---

## Parcours candidat

1. **RGPD** — lecture du texte, case à cocher, horodatage du consentement.
2. **Profil** — prénom, nom, email `@epitech.eu`, spécialité. Enregistrement en base à la validation du formulaire.
3. **Onboarding** — 3 écrans d’explication.
4. **Questionnaire** — 15 questions, caméra frontale obligatoire.
5. **Résultat** — verdict affiché ; envoi des réponses au serveur (score recalculé côté serveur).

Un candidat ne peut terminer le questionnaire **qu’une seule fois** (une session par email).

---

## Réponses par inclinaison de tête

Le navigateur charge **MediaPipe Face Landmarker** (modèle IA local, pas d’envoi vidéo au serveur).

Pour chaque question, deux choix sont affichés : **gauche** et **droite** (Oui/Non ou libellés personnalisés dans `questions.json`).

**Détection :**

- La position du nez par rapport aux yeux donne un angle horizontal (`yaw`).
- Inclinaison vers la **gauche** du candidat → choix **gauche**.
- Inclinaison vers la **droite** → choix **droite**.

**Validation d’une réponse** (évite les faux positifs) :

1. L’inclinaison doit dépasser un seuil minimum.
2. La pose doit rester stable ~0,5 s (`confirmHoldMs`).
3. Après une réponse, le candidat doit revenir au **centre** avant la question suivante.
4. Délai de **15 s** par question ; sans réponse → enregistrée comme timeout.

Les libellés gauche/droite et le côté « attendu » pour le score sont définis dans `ux-ui/recruitment-mvp/questions.json`.

---

## Score et verdict

- Questions avec `"scored": false` → profil / info, **ne comptent pas** dans le score.
- Questions scorées : le serveur compare `selectedSide` à `fitSide` dans `questions.json`.
- Le **verdict** est calculé **uniquement côté serveur** à la fin de session :

| Verdict | Condition (sur les questions scorées) |
|---------|--------------------------------------|
| Encourageant | ≥ 75 % de bonnes réponses (min. 5 bonnes si assez de questions) |
| Mitigé | ≥ 50 % |
| Non retenu | en dessous |

Le client affiche un résultat provisoire, puis met à jour avec la réponse serveur.

---

## Interface admin

Connexion par mot de passe. Après 3 échecs : blocage IP (30 min, puis 2 h, puis 24 h si récidive).

- **Participants** — liste, recherche, fiche détaillée (infos + réponses question par question).
- **KPIs** — inscrits, complétion, scores moyens, répartition spécialité / verdict.

Mot de passe et secrets : variables d’environnement sur le serveur (voir ci-dessous). Ne pas les committer.

---

## Lancer en local

```bash
cp backend/recruitment-mvp/.env.example backend/recruitment-mvp/.env
# Renseigner ADMIN_PASSWORD, ADMIN_SECRET, CANDIDATE_TOKEN_SECRET

npm --prefix backend/recruitment-mvp install
npm start
```

- Candidat : http://127.0.0.1:8080  
- Admin : http://127.0.0.1:8080/admin  

Le site doit être ouvert **via le backend** (port 8080). Live Server ou un autre port seul ne fonctionne pas pour l’API.

```bash
npm test   # 40 tests backend + 55 frontend
```

---

## Variables d’environnement

Fichier : `backend/recruitment-mvp/.env` (local) ou `~/apps/recrutement-mira/.env` (VPS).

| Variable | Rôle |
|----------|------|
| `ADMIN_PASSWORD` | Active `/admin` si défini |
| `ADMIN_SECRET` | Secret pour vérifier le mot de passe admin |
| `CANDIDATE_TOKEN_SECRET` | Signature des jetons candidat (fin de questionnaire) |
| `PORT` | Port HTTP (défaut 8080) |

Modèle : `backend/recruitment-mvp/.env.example`

---

## Structure du dépôt

```
backend/recruitment-mvp/   API Express, SQLite, tests dans test/
ux-ui/recruitment-mvp/   Interface candidat + admin, questions.json
Dockerfile               Image de production
scripts/deploy.sh        Sync VPS + rebuild conteneur
```

---

## Déploiement (VPS)

```bash
npm run deploy
```

Cible : hôte SSH `pixelbrain-vps`, répertoire `~/apps/recrutement-mira`, conteneur Docker `recrutement-mira-web`, réseau `docker_ekowrk-network`.

Données SQLite persistantes : `backend/recruitment-mvp/data/recruitment.db` sur le VPS (volume Docker).

Purge automatique des enregistrements dont `expires_at` est dépassé (conservation max **2 ans**), au démarrage puis toutes les 24 h.

---

## Modifier les questions

Éditer `ux-ui/recruitment-mvp/questions.json`, puis redéployer. Le backend charge ce fichier au démarrage pour recalculer les scores.

Champs utiles par question :

- `text` — énoncé
- `left` / `right` — libellés affichés (gauche / droite à l’écran)
- `fitSide` — `"left"` ou `"right"` : réponse considérée comme correcte pour le score
- `scored` — `false` pour exclure du score (questions profil)
