# 🎭 Dapr E-commerce Microservices Demo Sunumu

## 📋 Sunum Akışı

### 1. Giriş ve Proje Tanıtımı (5 dk)
**"Modern Microservices Architecture with Dapr"**

```
🎯 Bu Demo'da Göstereceğimiz Özellikler:
• 6 farklı microservice (User, Product, Order, Payment, Inventory, Notification)
• Dapr runtime ile service-to-service communication
• State management (Redis/PostgreSQL)
• Event-driven architecture (Pub/Sub)
• Polyglot programming (Node.js + .NET)
• Distributed tracing ve observability
• Component switching (Redis ↔ PostgreSQL)
```

### 2. Altyapı Gösterimi (3 dk)
**"Infrastructure & Components"**

```bash
# Terminal 1: Infrastructure başlatma
./scripts/start-infrastructure.sh

# Gösterilecek Docker containers:
# - Redis (State store & Pub/Sub)
# - PostgreSQL (Alternative state store)
# - Zipkin (Distributed tracing)
# - Dapr placement service
```

**Açıklama Noktaları:**
- Dapr sidecar pattern
- Component pluggability
- Infrastructure as code

### 3. Node.js Services Demo (8 dk)
**"Microservices in Action"**

```bash
# Terminal 2: Node.js services başlatma
./scripts/run-services.sh

# Çalışan servisler:
# - user-service:3001
# - product-service:3002  
# - order-service:3003
# - payment-service:3004
# - inventory-service:3005
# - notification-service:3006
```

**Demo Scenarios:**
```bash
# Terminal 3: Interactive demo
./scripts/demo-scenarios.sh

# Seçenek 1: Complete Order Flow (en kapsamlı)
# - User creation
# - Product listing
# - Order creation
# - Payment processing
# - Inventory management
# - Event propagation
```

**Gösterilecek Özellikler:**
- HTTP API calls
- Service discovery
- State persistence
- Event publishing/subscribing
- Error handling

### 4. Observability Dashboard'ları (3 dk)
**"Monitoring & Tracing"**

```bash
# Browser tabs açılacak:
# 1. Dapr Dashboard: http://localhost:8080
# 2. Zipkin Tracing: http://localhost:9411
# 3. Application logs: Terminal outputs
```

**Gösterilecek:**
- Service health status
- Request tracing
- Performance metrics
- Event flow visualization

### 5. Component Switching Demo (4 dk)
**"Runtime Configuration Changes"**

```bash
# Terminal 4: Component switching
./scripts/switch-components.sh

# Redis → PostgreSQL switching
# State store değişikliği
# Uygulama restart'ı olmadan
```

**Açıklama:**
- Infrastructure independence
- Configuration-driven development
- Zero-downtime switching (production'da)

### 6. Polyglot Architecture (.NET) (5 dk)
**"Multi-Language Support"**

```bash
# Terminal 5: .NET services
./scripts-dotnet/run-services-dotnet.sh

# Aynı functionality, farklı dil:
# - C# controllers
# - Dapr.AspNetCore integration
# - Same ports, same APIs
```

**Karşılaştırma:**
- Node.js vs .NET implementation
- Same business logic
- Language-agnostic communication
- Developer choice freedom

### 7. Error Handling & Resilience (3 dk)
**"Production-Ready Features"**

```bash
# Service interruption demo
# Port conflict simulation
# Recovery demonstration
```

**Demo Senaryoları:**
- Service failure simulation
- Circuit breaker patterns
- Retry mechanisms
- Health checks

### 8. Cleanup & Q&A (2 dk)
**"Environment Cleanup"**

```bash
# Cleanup scripts
./scripts/cleanup.sh
./scripts/cleanup-dotnet.sh
```

---

## 🎯 Key Talking Points

### Dapr'ın Faydaları:
1. **Language Agnostic**: Node.js ve .NET aynı anda çalışıyor
2. **Infrastructure Independence**: Redis/PostgreSQL switching
3. **Developer Productivity**: Boilerplate code azalması
4. **Cloud Native**: Kubernetes ready
5. **Observability**: Built-in tracing ve metrics

### Business Value:
1. **Faster Development**: Less infrastructure code
2. **Technology Freedom**: Best tool for each service
3. **Vendor Independence**: No cloud lock-in
4. **Operational Excellence**: Built-in best practices
5. **Future Proof**: Standard patterns and protocols

---

## 📚 Technical Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Service  │    │ Product Service │    │  Order Service  │
│   (Node.js)     │    │   (Node.js)     │    │   (Node.js)     │
│     :3001       │    │     :3002       │    │     :3003       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
    ┌────▼───┐              ┌────▼───┐              ┌────▼───┐
    │  Dapr  │              │  Dapr  │              │  Dapr  │
    │Sidecar │              │Sidecar │              │Sidecar │
    └────────┘              └────────┘              └────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │       Dapr Runtime        │
                    │   • State Management      │
                    │   • Service Discovery     │
                    │   • Pub/Sub Messaging     │
                    │   • Distributed Tracing   │
                    └───────────────────────────┘
```

---

## 🚀 Hazırlık Checklist

### Öncesi Kontrol:
- [ ] Docker Desktop çalışıyor
- [ ] Node.js kurulu (v16+)
- [ ] .NET 8.0 kurulu
- [ ] Dapr CLI kurulu
- [ ] jq kurulu (JSON parsing için)
- [ ] Port'lar boş (3001-3006, 6379, 5432, 9411, 8080)

### Sunum Sırasında:
- [ ] Terminal font size büyük
- [ ] Browser tabs hazır
- [ ] Demo scenarios test edilmiş
- [ ] Backup plan (pre-recorded video)

### Sunumdan Sonra:
- [ ] Environment cleanup
- [ ] Q&A session
- [ ] GitHub repo paylaşımı
- [ ] Follow-up materials

---

## 🎤 Sunum Notları

### Açılış:
"Bugün sizlere modern microservices architecture'ın nasıl Dapr ile basitleştirilebileceğini göstereceğim."

### Kapanış:
"Gördüğünüz gibi Dapr, karmaşık distributed systems'i geliştirmeyi çok daha basit hale getiriyor. Sorularınızı alabilirim."

### Demo Flow:
1. **Show** → Infrastructure başlatma
2. **Explain** → Architecture patterns
3. **Demonstrate** → Live scenarios
4. **Compare** → Node.js vs .NET
5. **Conclude** → Business benefits

---

*Bu dokümandaki tüm komutlar test edilmiş ve çalışır durumda. Sunum öncesi mutlaka bir kez daha test edin.*
