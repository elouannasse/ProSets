# ProSets Backend API

Backend NestJS pour ProSets - Marketplace de ressources numériques pour designers et créateurs.

## 🚀 Technologies

- **NestJS** - Framework Node.js progressif
- **TypeScript** - Typage strict
- **Prisma** - ORM moderne
- **PostgreSQL** - Base de données relationnelle
- **Auth0** - Authentication et autorisation
- **Stripe** - Paiements en ligne
- **AWS S3** - Stockage de fichiers
- **Docker** - Containerisation
- **Swagger** - Documentation API

## 📁 Structure du projet

```
apps/api/
├── src/
│   ├── main.ts                 # Point d'entrée de l'application
│   ├── app.module.ts           # Module principal
│   ├── config/                 # Configurations (Database, Auth0, Stripe, AWS)
│   ├── common/                 # Guards, decorators, filters, interceptors
│   └── modules/                # Modules métiers
│       ├── auth/               # Authentication
│       ├── users/              # Gestion des utilisateurs
│       ├── assets/             # Gestion des ressources
│       ├── orders/             # Gestion des commandes
│       ├── payments/           # Paiements Stripe
│       ├── storage/            # Upload/Download S3
│       └── prisma/             # Service Prisma
├── prisma/
│   └── schema.prisma           # Schéma de base de données
├── .env.example                # Variables d'environnement exemple
├── docker-compose.yml          # Configuration Docker
└── package.json
```

## 🛠 Installation

### Prérequis

- Node.js 18+ et npm
- Docker et Docker Compose
- Compte Auth0
- Compte Stripe
- Compte AWS (S3)

### Étapes

1. **Cloner et installer les dépendances**

```bash
cd apps/api
npm install
```

2. **Configurer les variables d'environnement**

```bash
cp .env.example .env
# Éditer .env avec vos configurations
```

3. **Démarrer PostgreSQL avec Docker**

```bash
npm run docker:up
```

4. **Générer le client Prisma et lancer les migrations**

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. **Démarrer l'application en mode développement**

```bash
npm run dev
```

L'API sera accessible sur `http://localhost:4000/api`

## 📝 Scripts disponibles

```bash
# Développement
npm run dev                    # Démarrer en mode watch
npm run start:debug           # Démarrer avec debugger

# Production
npm run build                 # Builder l'application
npm run start:prod            # Démarrer en production

# Base de données
npm run prisma:generate       # Générer le client Prisma
npm run prisma:migrate        # Lancer les migrations
npm run prisma:migrate:prod   # Migrations en production
npm run prisma:studio         # Ouvrir Prisma Studio

# Docker
npm run docker:up             # Démarrer PostgreSQL
npm run docker:down           # Arrêter PostgreSQL
npm run docker:logs           # Voir les logs

# Tests
npm run test                  # Lancer les tests unitaires
npm run test:e2e              # Lancer les tests E2E
npm run test:cov              # Couverture de code

# Qualité du code
npm run lint                  # Linter le code
npm run format                # Formatter le code
```

## 🔑 Variables d'environnement

Voir `.env.example` pour la liste complète des variables requises :

- `DATABASE_URL` - URL de connexion PostgreSQL
- `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, etc. - Configuration Auth0
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Configuration Stripe
- `AWS_*` - Configuration AWS S3
- `FRONTEND_URL` - URL du frontend pour CORS

## 📚 Documentation API

Une fois l'application démarrée, accédez à la documentation Swagger :

```
http://localhost:4000/api/docs
```

## 🏥 Health Check

```
http://localhost:4000/api/health
```

## 🗄 Modèles de données

### User
- Rôles : CLIENT, VENDEUR, ADMIN
- Lié à Auth0 via `auth0Id`

### Asset
- Ressources numériques vendues par les vendeurs
- Status : ACTIVE, INACTIVE

### Order
- Commandes passées par les clients
- Status : PENDING, PAID, FAILED

### Payment
- Paiements Stripe liés aux commandes
- Status : PENDING, SUCCEEDED, FAILED, REFUNDED

## 🔐 Sécurité

- Authentication via Auth0 JWT
- Validation globale avec `class-validator`
- Guards personnalisés pour la protection des routes
- Exception filters pour la gestion d'erreurs
- CORS configuré pour le frontend

## 📦 Déploiement

1. Builder l'application :
```bash
npm run build
```

2. Configurer les variables d'environnement de production

3. Lancer les migrations :
```bash
npm run prisma:migrate:prod
```

4. Démarrer l'application :
```bash
npm run start:prod
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est privé et propriétaire.

## 👥 Auteurs

ProSets Team
