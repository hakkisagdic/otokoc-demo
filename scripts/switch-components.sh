#!/bin/bash

# Simple Component Switcher - Kopyalama ile güvenli geçiş
# Quote hatalarından kaçınmak için basit cp komutları kullanır

set -e

COMPONENTS_DIR="./dapr-components"
REDIS_DIR="$COMPONENTS_DIR/redis"
POSTGRESQL_DIR="$COMPONENTS_DIR/postgresql"
INMEMORY_DIR="$COMPONENTS_DIR/inmemory"

# Renkli output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}🎭 Dapr Component Switcher (Safe Copy Mode)${NC}"
echo "=========================================="
echo ""

# Mevcut durumu göster
show_current() {
    echo -e "${BLUE}📋 Mevcut Component Durumu:${NC}"
    echo ""
    if [ -f "$COMPONENTS_DIR/user-store.yaml" ]; then
        USER_TYPE=$(grep "type:" "$COMPONENTS_DIR/user-store.yaml" | awk '{print $2}')
        echo "  State Store: $USER_TYPE"
    fi
    
    if [ -f "$COMPONENTS_DIR/pubsub.yaml" ]; then
        PUBSUB_TYPE=$(grep "type:" "$COMPONENTS_DIR/pubsub.yaml" | awk '{print $2}')
        echo "  Pub/Sub: $PUBSUB_TYPE"
    fi
    echo ""
}

# Redis'e geç
switch_to_redis() {
    echo -e "${GREEN}📡 Redis component set'ine geçiliyor...${NC}"
    cp $REDIS_DIR/*.yaml $COMPONENTS_DIR/
    echo -e "${GREEN}✅ Redis component'leri aktif edildi!${NC}"
    echo ""
}

# PostgreSQL'e geç
switch_to_postgresql() {
    echo -e "${GREEN}🐘 PostgreSQL component set'ine geçiliyor...${NC}"
    cp $POSTGRESQL_DIR/*.yaml $COMPONENTS_DIR/
    echo -e "${GREEN}✅ PostgreSQL component'leri aktif edildi!${NC}"
    echo ""
}

# In-Memory'e geç
switch_to_inmemory() {
    echo -e "${GREEN}💾 In-Memory component set'ine geçiliyor...${NC}"
    cp $INMEMORY_DIR/*.yaml $COMPONENTS_DIR/
    echo -e "${GREEN}✅ In-Memory component'leri aktif edildi!${NC}"
    echo ""
}

# Infrastructure başlat
start_infrastructure() {
    echo -e "${YELLOW}🚀 Gerekli infrastructure başlatılıyor...${NC}"
    
    # PostgreSQL gerekiyorsa başlat
    if grep -q "postgresql" $COMPONENTS_DIR/*.yaml 2>/dev/null; then
        echo "🐘 PostgreSQL başlatılıyor..."
        docker-compose up postgres -d
    fi
    
    # Her zaman Redis ve Zipkin başlat
    echo "📡 Redis ve Zipkin başlatılıyor..."
    docker-compose up redis zipkin -d
    
    echo -e "${GREEN}✅ Infrastructure hazır!${NC}"
    echo ""
}

# Mevcut durumu göster
show_current

# Menü
echo -e "${BLUE}🎛️ Component Set Seçenekleri:${NC}"
echo "1. Redis (Yüksek Performans)"
echo "2. PostgreSQL (ACID İşlemler)"  
echo "3. In-Memory (Hızlı Geliştirme)"
echo "4. Infrastructure Başlat"
echo "5. Mevcut Durumu Göster"
echo "6. Çıkış"
echo ""

while true; do
    read -p "Seçiminiz (1-6): " choice
    
    case $choice in
        1)
            switch_to_redis
            show_current
            ;;
        2)
            switch_to_postgresql
            show_current
            ;;
        3)
            switch_to_inmemory
            show_current
            ;;
        4)
            start_infrastructure
            ;;
        5)
            show_current
            ;;
        6)
            echo -e "${GREEN}👋 Çıkılıyor...${NC}"
            exit 0
            ;;
        *)
            echo "❌ Geçersiz seçim! (1-6 arası)"
            ;;
    esac
done
