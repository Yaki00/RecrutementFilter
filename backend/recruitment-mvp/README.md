# MVP recrutement MIRA (caméra + tilt tête)

Prototype rapide :
- 1 page web avec caméra frontale
- questions affichées au-dessus de la tête
- réponses via inclinaison gauche/droite
- ambiance visuelle selon le score
- stockage SQLite avec conservation max 2 ans

## Lancer en local

```bash
cd backend/recruitment-mvp
npm install
npm start
```

Puis ouvrir : `http://localhost:8080`

## Variables utiles

- `PORT` (défaut: `8080`)

## Schéma BDD (SQLite)

Tables :
- `sessions`
- `answers`

Le backend stocke `expires_at = created_at + 2 ans`.
