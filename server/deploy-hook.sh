#!/bin/bash
# Auto-deploy script triggered by GitHub webhook
set -e

cd /var/www/your-domain.com/public
git fetch origin
git reset --hard origin/main

# Fix API paths for self-hosted
sed -i 's|/api/exchange-rate.js|/api/exchange-rate|g; s|/api/paypal-config.js|/api/paypal-config|g; s|/api/sendit-config.js|/api/sendit-config|g' paypal-config.js sendit-config.js 2>/dev/null || true

# Update API server if changed
if [ -d server ]; then
  rsync -av --exclude node_modules --exclude .env server/ /var/www/your-domain.com/api/
  cd /var/www/your-domain.com/api
  npm install --production
  
  # Ensure SENDIT stock config is set in .env
  if ! grep -q "SENDIT_PRODUCTS_FROM_STOCK=1" .env 2>/dev/null; then
    # Remove any existing PRODUCTS_FROM_STOCK line and add the correct one
    sed -i '/SENDIT_PRODUCTS_FROM_STOCK/d' .env 2>/dev/null || true
    echo "SENDIT_PRODUCTS_FROM_STOCK=1" >> .env
  fi
  if ! grep -q "SENDIT_PACKAGING_ID=8" .env 2>/dev/null; then
    sed -i '/SENDIT_PACKAGING_ID/d' .env 2>/dev/null || true
    echo "SENDIT_PACKAGING_ID=8" >> .env
  fi
  
  # Restart PM2 as deploy user
  sudo -u deploy bash -c 'export PM2_HOME=/home/deploy/.pm2 && pm2 restart storename-api' || true
fi

echo "Deploy complete: $(date)"

