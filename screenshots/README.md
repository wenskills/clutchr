# Clutchr — Votre copilote de recherche d'emploi

> SaaS full-stack de pilotage de recherche d'emploi — développé en solo dans le cadre du Master Ingénierie du Développement Informatique (Aix-Marseille Université, 2025–2026).

---

## Aperçu

Clutchr centralise et automatise le suivi de recherche d'emploi : scraping d'offres multi-sources, moteur de matching par compétences, pipeline Kanban de candidatures, analyse d'écart de compétences, génération de contenu LinkedIn par IA et suivi réseau — le tout dans une interface unifiée.

L'objectif : remplacer les tableurs Excel et les onglets éparpillés par un vrai copilote intelligent, sans jamais inventer de statistiques.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Django 4.2 · Django REST Framework 3.14 · SQLite (dev) / PostgreSQL (prod) |
| Frontend | Angular 16 · TypeScript · standalone components |
| IA | Google Gemini 2.5 Flash (API REST) |
| Scraping | Adzuna API · France Travail OAuth2 · GitHub Trending (HTML) |
| Auth | Token auth DRF · Google OAuth 2.0 (Identity Services) · TOTP 2FA |
| Autres | PyPDF2 · BeautifulSoup4 · YouTube Data API v3 · geo.api.gouv.fr |

---

## Fonctionnalités

### Matching d'offres
- Scraping automatisé depuis Adzuna et France Travail (curseur de pagination par requête pour éviter les doublons)
- Moteur de matching maison : score par compétences, localisation, salaire et expérience
- Mode **Liste** (cartes avec effet empilé, état "déjà consultée" persisté en base) et mode **Swipe** (geste pointer events)
- Offres "déjà lues" sauvegardées en base (`viewed_at`), persistent entre les sessions

### Dashboard
- **Career Pulse** : score global sur 5 axes (employabilité, compétences, réseau, documents, visibilité)
- **Momentum** : vélocité d'activité sur 7 jours (actions réelles, pas des XP factices)
- **Carte de progression** : Explorer → Builder → Candidate → Professional → Expert (basée sur les candidatures réelles)
- Missions du jour, activité récente, pipeline de candidatures en temps réel

### Pipeline Kanban
- Colonnes glissables (Intéressé → Postulé → Entretien → Offre → Refusé)
- Étiquettes colorées façon GitLab, notes par candidature, historique de statuts cliquable
- Préparation d'entretien IA (questions probables, compétences à réviser, questions à poser)

### Analyse d'écart de compétences
- Compétences manquantes les plus fréquentes calculées sur les vraies offres correspondantes
- Radar de salaire par compétence (écart observé sur l'échantillon réel)
- Simulateur "Et si j'apprenais..." — recalcul immédiat sur les offres existantes

### Feuille de route d'apprentissage
- Générée par Gemini à partir du profil réel, des lacunes détectées et des tendances GitHub
- Phases structurées avec ressources concrètes, simulateur d'impact intégré

### Réseau & Contacts
- Synchronisation automatique depuis les offres correspondantes
- Lien de recherche LinkedIn pré-rempli par rôle (recruteur, talent acquisition, hiring manager)
- Génération de messages d'approche par IA (invitation, relance, angle d'approche)
- Pagination côté serveur, filtre par entreprise

### Contenu LinkedIn
- Analyse de post par IA : score Hook / Lisibilité / Impact avec suggestions concrètes
- Reformulation en 5 styles (plus humain, plus technique, plus viral, plus storytelling, orienté recruteur)
- Idées de posts générées depuis le profil + lacunes + tendances tech
- Gestion des brouillons (idée / brouillon / publié), calendrier éditorial

### Veille tech
- Tendances GitHub scraping quotidien (dépôts en progression, filtrés par langages du profil)
- Ressources d'apprentissage YouTube via API

### Auth & Sécurité
- Inscription/connexion classique + Google OAuth 2.0
- 2FA TOTP (QR code + codes de secours)
- Auth guard Angular sur toutes les routes protégées
- Intercepteur HTTP pour injection automatique du token

---

## Architecture

```
clutchr/
├── backend/
│   ├── clutchr/          # Configuration Django (settings, urls, wsgi)
│   ├── jobs/             # App principale
│   │   ├── models.py     # 16 modèles (UserProfile, JobMatch, Pipeline...)
│   │   ├── views.py      # 56 actions API REST
│   │   ├── matching.py   # Moteur de matching (score compétences/salaire/lieu)
│   │   ├── content_ai.py # Intégrations Gemini (roadmap, posts, préparation...)
│   │   ├── dashboard_service.py  # Career Pulse, Momentum, progression
│   │   ├── scraping_service.py   # Orchestration multi-sources
│   │   ├── momentum.py   # Vélocité d'activité
│   │   └── migrations/   # 20 migrations
│   ├── scrapers/         # Adzuna, France Travail, GitHub Trending
│   └── utils/            # PDF parser, skill extractor, geocoding, YouTube
│
└── frontend/
    ├── src/app/
    │   ├── core/         # Auth service, intercepteur, guard, NotifyService
    │   ├── shared/       # Sidebar, IconComponent, ClutchrLogoComponent, Mascot
    │   └── features/     # 14 pages (dashboard, offres, kanban, contacts...)
    └── src/assets/brand/ # Logo Clutchr
```

---

## Installation locale

### Prérequis
- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows : venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Éditer .env : USE_SQLITE=True pour le dev local

python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm start
```

App disponible sur `http://localhost:4200` · API sur `http://localhost:8000`

### Variables d'environnement clés (`.env`)

```env
USE_SQLITE=True                    # SQLite en dev, PostgreSQL en prod
GOOGLE_CLIENT_ID=...               # OAuth Google (optionnel)
ADZUNA_APP_ID=...                  # API Adzuna (gratuit)
ADZUNA_APP_KEY=...
FRANCETRAVAIL_CLIENT_ID=...        # API France Travail (gratuit)
FRANCETRAVAIL_CLIENT_SECRET=...
GEMINI_API_KEY=...                 # Google Gemini (fonctionnalités IA)
YOUTUBE_API_KEY=...                # Ressources d'apprentissage
```

---

## Choix techniques notables

**Curseur de scraping par requête** — au lieu d'un booléen global d'épuisement, chaque combinaison poste+lieu a son propre curseur de pagination, évitant de bloquer toutes les recherches dès qu'une combinaison de niche renvoie peu de résultats.

**Scoring sans invention** — le moteur de matching calcule uniquement depuis les données réelles du profil et des offres scrapées. Aucune statistique de marché externe n'est injectée dans les scores.

**Momentum vs Career Pulse** — deux métriques distinctes : le Pulse mesure l'état du profil (qualité), le Momentum mesure l'activité récente (vitesse). Séparés volontairement pour ne pas récompenser le clic à vide.

**Mascotte comme système de notification** — les toasts plats sont remplacés par un personnage fixe en bas à droite (`MascotComponent`) avec bulles de conversation typées (succès / info / alerte / erreur), animation idle continue et rebond sur événement.

---

## Statut

Projet en développement actif — Phase 2 complète (workflow complet sans IA), Phase 3 en cours (scoring IA, recommandations avancées).

---

## Auteure

**Wendy Rasamoelina** — Master Ingénierie du Développement Informatique, Aix-Marseille Université (2024–2026)


---

## Screenshots

### Dashboard — Base d'opérations
![Dashboard](screenshots/01_dashboard.png)

### Offres correspondantes — Mode Swipe
![Swipe](screenshots/02_offres_swipe.png)

### Offres correspondantes — Mode Liste
![Liste](screenshots/04_offres_liste.png)

### Pipeline de candidatures (Kanban)
![Kanban](screenshots/03_pipeline_kanban.png)

### Analyse d'écart de compétences
![Analyse écart](screenshots/05_analyse_ecart.png)

### Feuille de route d'apprentissage (IA)
![Roadmap](screenshots/06_roadmap.png)

### Réseau & Contacts
![Contacts](screenshots/07_contacts_reseau.png)

### Contenu LinkedIn (analyse IA)
![LinkedIn](screenshots/08_contenu_linkedin.png)

### Veille & Tendances tech
![Veille](screenshots/09_veille_tendances.png)

### Page de connexion
![Connexion](screenshots/10_connexion.png)
