# 🎭 Dapr E-Ticaret Demo Sunum Notları

## 📋 Sunum Yapısı (60 dakika)

### 1. Giriş ve Dapr'a Genel Bakış (10 dakika)
- **Dapr Nedir?**
  - Distributed Application Runtime
  - Mikroservis geliştirme için sidecar pattern
  - Cloud-agnostic ve polyglot

- **Temel Özellikler:**
  - Service Invocation (Servis-servis iletişim)
  - State Management (Durum yönetimi)
  - Pub/Sub Messaging (Asenkron mesajlaşma)
  - Input/Output Bindings (Dış sistem entegrasyonu)
  - Secrets Management (Gizli bilgi yönetimi)
  - Configuration Management (Konfigürasyon)
  - Observability (İzlenebilirlik)

### 2. Demo Mimarisinin Tanıtımı (10 dakika)

#### Mikroservisler:
```
👤 User Service (3001)      - Kullanıcı yönetimi
📦 Product Service (3002)   - Ürün kataloğu  
📋 Order Service (3003)     - Sipariş işlemleri
💳 Payment Service (3004)   - Ödeme sistemi
📊 Inventory Service (3005) - Stok yönetimi
📧 Notification Service (3006) - Bildirimler
```

#### Event Flow:
```
User Created → Welcome Email
Order Created → Inventory Check → Payment → Inventory Update → Shipping → Notifications
```

### 3. Canlı Demo - Temel Özellikler (25 dakika)

#### Demo 1: Service Invocation (5 dakika)
```bash
# Servisleri başlat
./scripts/start-infrastructure.sh
./scripts/run-services.sh

# Dapr Dashboard'u göster
dapr dashboard
```

**Gösterilecek:**
- Dapr sidecar pattern
- Service discovery
- Load balancing
- Health checks

#### Demo 2: State Management (5 dakika)
```bash
# Redis state store göster
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ahmet","email":"ahmet@test.com"}'

# Redis'te verilerin saklandığını göster
docker exec -it dapr-redis redis-cli
KEYS *
GET "user-service||<user-id>"
```

**Gösterilecek:**
- Otomatik serialization/deserialization
- State store abstraction
- Transactional operations

#### Demo 3: Pub/Sub Messaging (5 dakika)
```bash
# Sipariş oluştur ve event akışını göster
./scripts/demo-scenarios.sh
# Senaryo 1'i seç
```

**Gösterilecek:**
- Event-driven architecture
- Asenkron processing
- Multiple subscribers
- Dead letter queues

#### Demo 4: Component Pluggability (10 dakika)
```bash
# Redis'ten PostgreSQL'e geçiş
./scripts/switch-components.sh
# Option 2'yi seç

# Infrastructure'ı yeniden başlat
docker-compose up postgres rabbitmq zipkin -d

# Servisleri yeniden başlat
./scripts/run-services.sh

# Aynı demo'yu çalıştır
./scripts/demo-scenarios.sh
```

**Gösterilecek:**
- Zero code change
- Configuration-driven
- Multiple provider support
- Infrastructure abstraction

### 4. Gelişmiş Özellikler (10 dakika)

#### Demo 5: Observability
```bash
# Zipkin tracing göster
open http://localhost:9411

# Metrics göster (eğer Prometheus kuruluysa)
# Dapr dashboard'taki metrics
```

**Gösterilecek:**
- Distributed tracing
- Automatic instrumentation
- Service dependencies
- Performance monitoring

#### Demo 6: Resilience Patterns
```bash
# Payment service'i durdur
dapr stop --app-id payment-service

# Sipariş oluşturmayı dene
# Circuit breaker ve retry'ları göster
```

**Gösterilecek:**
- Circuit breaker
- Retry policies
- Timeout handling
- Graceful degradation

### 5. Production Considerations (5 dakika)

#### Kubernetes Deployment:
```yaml
# Örnek Kubernetes manifest göster
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  annotations:
    dapr.io/enabled: "true"
    dapr.io/app-id: "user-service"
    dapr.io/app-port: "3001"
```

**Konuşulacak Konular:**
- Container orchestration
- Service mesh integration
- Security (mTLS, RBAC)
- Scaling strategies
- Multi-region deployment

## 🎯 Demo Senaryoları

### Senaryo 1: Tam Sipariş Akışı
1. **Kullanıcı oluştur** → Welcome email gönderilir
2. **Ürünleri listele** → Product service'ten veri çek
3. **Sipariş oluştur** → Order service, User ve Product service'lerini çağırır
4. **Ödeme işle** → Payment service, gateway'i simüle eder
5. **Stok güncelle** → Inventory service, events dinler
6. **Bildirim gönder** → Notification service, status güncellemelerini dinler

### Senaryo 2: Component Değişimi
1. **Redis setup** → Başlangıç durumu
2. **PostgreSQL + RabbitMQ'ya geçiş** → Zero code change
3. **In-memory'ye geçiş** → Development mode
4. **Geri Redis'e dönüş** → Production mode

### Senaryo 3: Error Handling
1. **Service down** → Circuit breaker devreye girer
2. **Network timeout** → Retry policies çalışır
3. **Invalid data** → Validation errors
4. **Dead letter queue** → Failed message handling

## 🔧 Teknik Detaylar

### Kullanılan Dapr Building Blocks:

#### 1. Service Invocation
```javascript
// Order Service'den User Service'e çağrı
const userResponse = await daprClient.invoker.invoke(
  'user-service',
  `users/${userId}`,
  'GET'
);
```

#### 2. State Management
```javascript
// Redis state store kullanımı
await daprClient.state.save('user-store', [
  { key: userId, value: user }
]);
```

#### 3. Pub/Sub
```javascript
// Event publish
await daprClient.pubsub.publish('order-pubsub', 'order-created', {
  orderId, order
});
```

#### 4. Secrets
```javascript
// Secret store'dan API key çek
const apiKey = await daprClient.secret.get('local-secret-store', 'payment.apiKey');
```

### Component Konfigürasyonları:

#### Redis State Store:
```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: user-store
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
```

#### PostgreSQL State Store:
```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: user-store
spec:
  type: state.postgresql
  version: v1
  metadata:
  - name: connectionString
    value: "host=localhost user=dapr password=dapr123 dbname=dapr_state port=5432"
```

## 📊 Demo Metrikler

### Performans Göstergeleri:
- **Request latency**: Service-to-service çağrılar
- **Throughput**: Saniye başına işlem sayısı
- **Error rate**: Başarısız işlem oranı
- **Resource usage**: CPU/Memory kullanımı

### Business Metrikleri:
- **Order completion rate**: Tamamlanan sipariş oranı
- **Payment success rate**: Başarılı ödeme oranı
- **Notification delivery**: Bildirim iletim oranı
- **Inventory accuracy**: Stok doğruluk oranı

## 🎤 Sunum İpuçları

### Başlangıçta Vurgulanacaklar:
1. **Developer Experience**: Kod basitliği ve sadeliği
2. **Infrastructure Abstraction**: Platform bağımsızlığı
3. **Best Practices**: Built-in patterns
4. **Observability**: Out-of-the-box monitoring

### Demo Sırasında Dikkat Edilecekler:
1. **Live coding yok**: Hazır kodları göster
2. **Hızlı geçişler**: Component değişimlerini canlı göster
3. **Visual tools**: Dashboard ve tracing araçlarını kullan
4. **Real-world scenarios**: Gerçek iş problemlerine odaklan

### Sorular ve Cevaplar:
- **"Kubernetes gerekli mi?"** → Hayır, ancak production için önerilimiyor
- **"Performance overhead?"** → Minimal, benchmarklar mevcut
- **"Learning curve?"** → SDK'lar sayesinde kolay
- **"Production readiness?"** → Microsoft, Alibaba, ZEISS kullanıyor

## 📚 Ek Kaynaklar

### Dokümantasyon:
- Official Docs: https://docs.dapr.io
- Best Practices: https://docs.dapr.io/developing-applications/
- Component Catalog: https://docs.dapr.io/reference/components-reference/

### Community:
- Discord: https://discord.com/invite/ptHhX6jc34
- GitHub: https://github.com/dapr/dapr
- Blog: https://blog.dapr.io/

### Örnek Projekte:
- Quickstarts: https://github.com/dapr/quickstarts
- Samples: https://github.com/dapr/samples
