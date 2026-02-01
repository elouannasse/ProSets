# 🔐 Système de Téléchargement Sécurisé - ProSets Backend

## 📋 Vue d'ensemble

Le module Downloads fournit un système complet de téléchargement sécurisé avec presigned URLs S3, vérification d'ownership, rate limiting et tracking détaillé.

## 🏗️ Architecture

```
src/modules/downloads/
├── downloads.module.ts          # Module principal
├── downloads.controller.ts      # Endpoints API
├── downloads.service.ts         # Logique métier
└── dto/
    └── generate-download.dto.ts # DTO de validation
```

## 🔑 Fonctionnalités

### 1. Génération de Presigned URL

**Endpoint:** `POST /downloads/generate/:assetId`

**Sécurité:**
- ✅ JWT Authentication requise
- ✅ Vérification Order PAID obligatoire
- ✅ Rate limiting: 5 téléchargements/heure
- ✅ Expiration URL: 5 minutes (configurable)

**Vérifications:**
```typescript
1. User existe et authentifié
2. Asset existe et non supprimé (deletedAt = null)
3. Order existe avec status = PAID
4. Rate limit non dépassé (< 5/heure)
5. Expiration valide (≤ 1 heure)
```

**Réponse:**
```json
{
  "url": "https://bucket.s3.region.amazonaws.com/file?signature=...",
  "expiresAt": "2026-02-01T15:30:00.000Z",
  "expiresIn": 300,
  "asset": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Medieval Castle 3D Model",
    "category": "Architecture",
    "vendor": "John Doe"
  }
}
```

### 2. Historique des Téléchargements

**Endpoint:** `GET /downloads/history?page=1&limit=20`

**Réponse:**
```json
{
  "data": [
    {
      "assetId": "...",
      "assetTitle": "Medieval Castle",
      "assetCategory": "Architecture",
      "price": 29.99,
      "purchaseDate": "2026-01-15T10:00:00.000Z",
      "downloadCount": 3,
      "lastDownloadAt": "2026-02-01T14:30:00.000Z"
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

### 3. Vérification d'Éligibilité

**Endpoint:** `GET /downloads/can-download/:assetId`

Retourne `true` si l'utilisateur possède un Order PAID pour l'asset.

### 4. Endpoints Admin

#### Tous les Téléchargements
**Endpoint:** `GET /downloads/admin/all?page=1&limit=50`
**Rôle:** ADMIN uniquement

#### Statistiques
**Endpoint:** `GET /downloads/admin/stats`
**Rôle:** ADMIN uniquement

**Métriques:**
```json
{
  "totalDownloads": 1523,
  "uniqueUsers": 342,
  "uniqueAssets": 156,
  "recentDownloads30Days": 487,
  "averageDownloadsPerDay": "16.23",
  "topAssets": [
    {
      "assetId": "...",
      "title": "Medieval Castle",
      "category": "Architecture",
      "price": 29.99,
      "downloadCount": 87
    }
  ]
}
```

## 🗄️ Modèle de Données

### Table `downloads`

```prisma
model Download {
  id        String   @id @default(uuid())
  userId    String
  assetId   String
  createdAt DateTime @default(now())

  user  User  @relation(...)
  asset Asset @relation(...)

  @@index([userId])
  @@index([assetId])
  @@index([createdAt])
}
```

**Indexes:**
- `userId`: Optimise les requêtes d'historique utilisateur
- `assetId`: Optimise les stats par asset
- `createdAt`: Optimise le rate limiting et les stats temporelles

## 🔒 Sécurité

### Rate Limiting
- **Limite:** 5 téléchargements/heure par user/asset
- **Fenêtre:** Dernière heure glissante
- **Message d'erreur:** 409 Conflict avec détails

### Validation Order Status
```typescript
✅ PAID    → Téléchargement autorisé
❌ PENDING → 403 "Payment not confirmed yet"
❌ FAILED  → 403 "Payment failed. Please purchase again"
```

### Presigned URL
- **Expiration par défaut:** 300 secondes (5 min)
- **Expiration max:** 3600 secondes (1 heure)
- **Génération:** AWS SDK v3 getSignedUrl()
- **Bucket:** Privé (sourceFileKey)

## 📊 Tracking & Analytics

### Métriques Collectées
1. **Par utilisateur:**
   - Nombre de téléchargements par asset
   - Date du dernier téléchargement
   - Historique complet

2. **Par asset:**
   - Compteur global `asset.downloads`
   - Top assets téléchargés
   - Distribution par catégorie

3. **Globales:**
   - Total téléchargements
   - Utilisateurs actifs
   - Moyenne journalière

## 🎯 Edge Cases

### Asset Supprimé
```typescript
if (asset.deletedAt) {
  throw new NotFoundException('This asset has been removed');
}
```

### Lien Expiré
- Frontend peut redemander un nouveau lien via `POST /downloads/generate/:assetId`
- Pas de limite sur le nombre de générations (seulement rate limit sur les downloads)

### Order Non Payé
```typescript
if (order.status !== 'PAID') {
  throw new ForbiddenException('You do not have access to download this asset');
}
```

## 🚀 Optimisations Futures

### Cache Redis (TODO)
```typescript
// Cache presigned URL pendant 4 minutes
await redis.setex(
  `download:${userId}:${assetId}`,
  240,
  JSON.stringify({ url, expiresAt })
);
```

### Limite de Téléchargements (TODO)
```prisma
model Asset {
  maxDownloads Int? // null = illimité
}
```

Vérification:
```typescript
if (asset.maxDownloads && downloadCount >= asset.maxDownloads) {
  throw new ForbiddenException('Maximum downloads exceeded');
}
```

## 📝 Logs

### Format
```typescript
this.logger.log(
  `Download URL generated for user ${user.email} - Asset: ${asset.title} (${asset.id})`
);
```

### Contenus Loggés
- ✅ Génération URL réussie
- ✅ Tentatives rate-limitées
- ✅ Orders non payés
- ✅ Assets supprimés
- ❌ Erreurs S3

## 🧪 Tests

### Tests Unitaires
```typescript
describe('DownloadsService', () => {
  it('should generate presigned URL for owned asset');
  it('should reject if order not paid');
  it('should enforce rate limiting');
  it('should validate expiration');
});
```

### Tests E2E
```typescript
describe('Downloads (e2e)', () => {
  it('POST /downloads/generate/:assetId - success');
  it('POST /downloads/generate/:assetId - 403 not owned');
  it('GET /downloads/history - pagination');
  it('GET /downloads/admin/stats - admin only');
});
```

## 🔧 Configuration

### Variables d'environnement
```env
# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_SOURCE_BUCKET=prosets-source-private

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/prosets
```

### Constantes Service
```typescript
MAX_DOWNLOADS_PER_HOUR = 5
DEFAULT_EXPIRATION = 300  // 5 minutes
MAX_EXPIRATION = 3600     // 1 hour
```

## 📚 Exemples d'Utilisation

### Frontend - Télécharger un Asset
```typescript
async function downloadAsset(assetId: string) {
  try {
    const response = await fetch(`/api/downloads/generate/${assetId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const { url, expiresAt } = await response.json();
    
    // Ouvrir le lien de téléchargement
    window.location.href = url;
    
    // Ou utiliser fetch pour télécharger
    const file = await fetch(url);
    const blob = await file.blob();
    // ...
  } catch (error) {
    if (error.status === 403) {
      alert('You need to purchase this asset first');
    } else if (error.status === 409) {
      alert('Download limit exceeded. Please try again later.');
    }
  }
}
```

### Vérifier Éligibilité Avant Achat
```typescript
const { canDownload } = await fetch(`/api/downloads/can-download/${assetId}`);

if (canDownload) {
  showDownloadButton();
} else {
  showPurchaseButton();
}
```

## 🎨 UI/UX Recommandations

1. **Afficher le Timer:** Montrer l'expiration du lien (countdown 5min)
2. **Bouton Régénérer:** Si expiré, permettre génération nouveau lien
3. **Indicateur Rate Limit:** Afficher "3/5 downloads remaining this hour"
4. **Historique:** Tableau avec assets téléchargés + dates
5. **Progress Bar:** Pour les gros fichiers (>100MB)

---

**Auteur:** ProSets Backend Team  
**Version:** 1.0.0  
**Dernière mise à jour:** 2026-02-01
