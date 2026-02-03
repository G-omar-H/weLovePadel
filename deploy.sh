#!/bin/bash
# StoreName Deployment Script
# Deploy to KVM server at 82.25.115.86

set -e

SERVER="82.25.115.86"
USER="deploy"
REMOTE_PATH="/var/www/your-domain.com/public"
API_PATH="/var/www/your-domain.com/api"

echo "🚀 Deploying StoreName to $SERVER..."

# Deploy static files
echo "📦 Syncing static files..."
rsync -avz --progress \
    --exclude='.git' \
    --exclude='*.md' \
    --exclude='*.txt' \
    --exclude='*.sh' \
    --exclude='*.example' \
    --exclude='vercel.json' \
    --exclude='sendit-config.local.js' \
    --exclude='paypal-config.local.js' \
    --exclude='test-*.html' \
    --exclude='og-image-generator.html' \
    --exclude='node_modules' \
    --exclude='server' \
    --exclude='.env*' \
    -e "ssh -o StrictHostKeyChecking=no" \
    ./ ${USER}@${SERVER}:${REMOTE_PATH}/

# Update API paths (remove .js extensions for self-hosted)
echo "🔧 Updating API paths..."
ssh ${USER}@${SERVER} "sed -i 's|/api/exchange-rate.js|/api/exchange-rate|g; s|/api/paypal-config.js|/api/paypal-config|g; s|/api/sendit-config.js|/api/sendit-config|g' ${REMOTE_PATH}/paypal-config.js ${REMOTE_PATH}/sendit-config.js 2>/dev/null || true"

# Deploy API server if changed
if [ -d "server" ]; then
    echo "📡 Syncing API server..."
    rsync -avz --progress \
        --exclude='node_modules' \
        --exclude='.env' \
        -e "ssh -o StrictHostKeyChecking=no" \
        ./server/ ${USER}@${SERVER}:${API_PATH}/
    
    echo "📦 Installing API dependencies..."
    ssh ${USER}@${SERVER} "cd ${API_PATH} && npm install --production"
    
    echo "🔄 Restarting API..."
    ssh ${USER}@${SERVER} "pm2 restart storename-api"
fi

echo "✅ Deployment complete!"
echo ""
echo "Website: http://82.25.115.86 (or https://your-domain.com once DNS points here)"

