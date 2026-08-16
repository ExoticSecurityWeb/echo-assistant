# ECHO

Chat façon "IA officielle" — toi tu réponds derrière via un dashboard admin,
et si tu ne réponds pas sous 5 min, Gemini prend le relais automatiquement.
Le toggle "maintenance" dans le dashboard sert à couper le service à la fin du prank.

## Déploiement (Cloudflare Workers)

Nécessite Node.js + `wrangler` (`npm install -g wrangler` si pas déjà fait).

```bash
cd echo-assistant
wrangler login

# 1. Créer la base D1
wrangler d1 create echo_assistant_db
# → copie le "database_id" retourné dans wrangler.toml (remplace REMPLACE_MOI_APRES_wrangler_d1_create)

# 2. Appliquer le schéma
wrangler d1 execute echo_assistant_db --remote --file=./schema.sql

# 3. Ajouter les secrets
wrangler secret put GEMINI_API_KEY
# → colle ta clé Gemini (Google AI Studio)

wrangler secret put ADMIN_PASSWORD
# → choisis un mot de passe fort pour le dashboard admin

# 4. Déployer
wrangler deploy
```

Ton Worker sera dispo sur un sous-domaine `*.workers.dev` (ou en custom domain
si tu configures une route, comme le reste de ta stack vosprojets.workers.dev).

## Utilisation

- `/` → page chat publique, c'est le lien que tu donnes à la cible.
- `/admin.html` → ton dashboard perso (mot de passe = celui mis dans `ADMIN_PASSWORD`).
  - Colonne de gauche : messages en attente de réponse.
  - Tu cliques dessus, tu vois tout le fil, tu tapes ta réponse dans la zone en bas.
  - Si tu ne réponds pas en 5 min, le cron (toutes les minutes) appelle Gemini
    à ta place avec l'historique complet de la conversation.
  - Case "Mode maintenance" en haut : coche-la pour couper le chat côté cible
    (elle verra "service indisponible") — c'est ta sortie de prank.

## Notes techniques

- Le cron Cloudflare tourne toutes les minutes (`* * * * *`) et va chercher
  les messages dont le délai de 5 min est dépassé sans réponse humaine.
- Le front public poll toutes les 3s pour récupérer les nouvelles réponses
  d'ECHO, avec un délai artificiel de 1.2 à 3.4s + indicateur "réfléchit…"
  pour que ça paraisse naturel.
- Aucun vrai logo Cloudflare/Alexa n'est utilisé — juste un anneau orange animé,
  pour rester safe niveau marque déposée.
- Le mot de passe admin est vérifié via un header `X-Admin-Key` simple —
  suffisant pour un usage perso, pas un vrai système d'auth production.
