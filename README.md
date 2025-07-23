# Dapr E-Ticaret Demo Projesi

Bu proje, Dapr'ın temel özelliklerini gösteren kapsamlı bir e-ticaret mikroservis demo'sudur.

## 🏗️ Mimari

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Service  │    │ Product Service │    │  Order Service  │
│     :3001       │    │     :3002       │    │     :3003       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Payment Service │    │Inventory Service│    │Notification Svc │
│     :3004       │    │     :3005       │    │     :3006       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎯 Gösterilen Dapr Özellikleri

### 1. Service Invocation
- Servisler arası güvenli iletişim
- Load balancing ve service discovery
- Retry policies ve circuit breaker

### 2. State Management
- Redis ile state store
- JSON ve Binary data desteği
- Transactional operations

### 3. Pub/Sub Messaging
- Redis Streams ile event messaging
- Order events, payment events
- Asenkron bildirimler

### 4. Input/Output Bindings
- HTTP binding ile webhook entegrasyonu
- Cron binding ile scheduled tasks
- Email binding ile bildirimler

### 5. Secrets Management
- Kubernetes secrets
- Local file secrets
- Environment variables

### 6. Configuration Management
- Runtime configuration
- Feature flags
- A/B testing desteği

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Docker & Docker Compose
- Dapr CLI (v1.12+)
- Node.js (v18+)
- jq (JSON processor)

### Kurulum

1. **Repository'yi klonla:**
```bash
git clone https://github.com/hakkisagdic/otokar-demo.git
cd otokar-demo
```

2. **Dependencies yükle:**
```bash
npm run install-all
```

3. **Infrastructure'ı başlat:**
```bash
./scripts/start-infrastructure.sh
```

4. **Servisleri çalıştır:**
```bash
./scripts/run-services.sh
```

5. **Demo senaryolarını test et:**
```bash
./scripts/demo-scenarios.sh
```

## 📋 Demo Senaryoları

### Senaryo 1: Basit Sipariş Akışı
1. Kullanıcı kaydı → Welcome email
2. Ürün listeleme → Product catalog
3. Sipariş oluşturma → Order processing
4. Ödeme işlemi → Payment gateway
5. Stok güncelleme → Inventory management
6. Bildirim gönderme → Status updates

### Senaryo 2: Component Değişimi
```bash
./scripts/switch-components.sh
```
- Redis → PostgreSQL state store
- Redis → In-Memory state store  
- Local secrets → Kubernetes secrets

### Senaryo 3: Resilience Patterns
- Circuit breaker demo
- Retry policies
- Timeout handling

### Senaryo 4: Bulk Operations
- Bulk notifications
- Batch processing
- Error handling

### Senaryo 5: Service Integration
- Cross-service communication
- Event-driven workflows
- Data consistency

## 🔧 Komponentler

### Production Components
- **State Store**: Redis
- **Pub/Sub**: Redis Streams
- **Secrets**: Kubernetes
- **Configuration**: Redis

### Alternative Components
- **State Store**: PostgreSQL, In-Memory
- **Pub/Sub**: Redis Streams (uniform across all sets)
- **Secrets**: Local file, Environment variables
- **Configuration**: Local file, ConfigMap

### Component Değiştirme
```bash
# Interactive component switcher
./scripts/switch-components.sh

# Docker Compose ile farklı infrastructure
docker-compose up postgres -d       # PostgreSQL + Redis
docker-compose up redis -d          # Redis only
```

## 📊 Monitoring ve Observability

### Dapr Dashboard
```bash
dapr dashboard
# http://localhost:8080
```

### Distributed Tracing
- **Zipkin**: http://localhost:9411
- **Jaeger**: (konfigürasyonla aktif edilebilir)

### Metrics
- **Prometheus**: (konfigürasyonla aktif edilebilir)
- **Grafana**: (dashboard template'leri mevcut)

### Health Checks
```bash
# Service health checks
curl http://localhost:3001/health  # User Service
curl http://localhost:3002/health  # Product Service
curl http://localhost:3003/health  # Order Service
curl http://localhost:3004/health  # Payment Service
curl http://localhost:3005/health  # Inventory Service
curl http://localhost:3006/health  # Notification Service
```

## 🧪 Test ve Geliştirme

### API Testing
```bash
# Postman collection (gelecekte eklenecek)
# İçeri aktarılabilir API test collection'ı

# Manual testing
curl -X GET http://localhost:3002/products
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'
```

### Development Mode
```bash
# In-memory components ile hızlı geliştirme
./scripts/switch-components.sh
# Option 3: In-Memory seç

# Sadece Zipkin çalıştır
docker-compose up zipkin -d

# Servisleri dev mode'da çalıştır
npm run start:services
```

## 🎭 Sunum İçin Notlar

Demo notları ve sunum rehberi için: [DEMO-NOTES.md](./DEMO-NOTES.md)

### Sunum Süresi: 60 dakika
1. **Giriş ve Dapr Overview** (10 dk)
2. **Mimari Tanıtım** (10 dk)
3. **Canlı Demo - Temel Özellikler** (25 dk)
4. **Gelişmiş Özellikler** (10 dk)
5. **Production Considerations** (5 dk)

### Key Demo Points:
- **Zero code change** component switching
- **Event-driven architecture** with pub/sub
- **Service-to-service** communication
- **Automatic observability** with tracing
- **Resilience patterns** built-in

## 🛠️ Geliştirici Araçları

### Available Scripts
```bash
npm run install-all        # Tüm servislerin dependencies'lerini yükle
npm run start:infrastructure # Infrastructure'ı başlat
npm run start:services     # Tüm servisleri başlat
npm run demo              # Demo senaryolarını çalıştır
npm run switch:components # Component switcher'ı aç
npm run cleanup          # Tüm servisleri temizle
npm run docker:up        # Docker Compose ile infrastructure
npm run docker:down      # Docker Compose'u durdur
```

### Manual Service Control
```bash
# Tek tek servis kontrolü
cd services/user-service
dapr run --app-id user-service --app-port 3001 \
  --components-path ../../dapr-components npm start

# Dapr sidecar ile debug
dapr run --app-id user-service --app-port 3001 \
  --components-path ../../dapr-components \
  --log-level debug npm start
```

## 🔧 Konfigürasyon

### Environment Variables
```bash
# Service ports (default değerler)
export USER_SERVICE_PORT=3001
export PRODUCT_SERVICE_PORT=3002
export ORDER_SERVICE_PORT=3003
export PAYMENT_SERVICE_PORT=3004
export INVENTORY_SERVICE_PORT=3005
export NOTIFICATION_SERVICE_PORT=3006

# Dapr sidecar ports
export USER_DAPR_PORT=3501
export PRODUCT_DAPR_PORT=3502
# ... diğer servisler
```

### Secrets Configuration
```json
// secrets.json
{
  "database": {
    "connectionString": "redis://localhost:6379"
  },
  "payment": {
    "apiKey": "your_payment_api_key"
  },
  "notification": {
    "emailApiKey": "your_email_api_key"
  }
}
```

## 🚫 Temizlik ve Kapatma

```bash
# Tüm servisleri ve infrastructure'ı temizle
./scripts/cleanup.sh

# Sadece Docker container'ları durdur
docker-compose down

# Dapr'ı tamamen kaldır (opsiyonel)
dapr uninstall
```

## 📚 Ek Kaynaklar

### Dapr Dokümantasyonu
- [Official Documentation](https://docs.dapr.io)
- [Best Practices](https://docs.dapr.io/developing-applications/best-practices/)
- [Component Reference](https://docs.dapr.io/reference/components-reference/)

### Topluluk
- [Discord](https://discord.com/invite/ptHhX6jc34)
- [GitHub](https://github.com/dapr/dapr)
- [Blog](https://blog.dapr.io/)

### Bu Projede Kullanılan Teknolojiler
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **State Store**: Redis, PostgreSQL
- **Message Broker**: Redis Streams
- **Tracing**: Zipkin
- **Container**: Docker & Docker Compose

## 📝 Lisans

MIT License - detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 📝 Kaynaklar

- https://github.com/dotnet/tye
- https://dapr.io/

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📞 İletişim

- **Proje Sahibi**: Hakkı Sağdıç
- **Email**: hakki@example.com
- **GitHub**: [@hakkisagdic](https://github.com/hakkisagdic)

---

⭐ Bu projeyi beğendiyseniz star vermeyi unutmayın!