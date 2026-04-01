#!/usr/bin/env bash
set -euo pipefail

API_DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$API_DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo bash $0 <api-domain> <email>"
  echo "  api-domain  e.g. mock-api.example.com"
  echo "  email       e.g. admin@example.com"
  exit 1
fi

. /etc/os-release
DISTRO="$ID"

echo "Installing Nginx and Certbot..."
case "$DISTRO" in
  amzn)
    dnf install -y nginx certbot python3-certbot-nginx
    ;;
  ubuntu)
    apt-get update -y
    apt-get install -y nginx certbot python3-certbot-nginx
    ;;
  *)
    echo "Unsupported distro: $DISTRO. Install nginx and certbot manually."
    exit 1
    ;;
esac

systemctl enable --now nginx

mkdir -p /var/www/certbot

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONF_SRC="$SCRIPT_DIR/../nginx/mock-store-api.conf"

if [[ ! -f "$NGINX_CONF_SRC" ]]; then
  echo "Error: template not found at $NGINX_CONF_SRC"
  exit 1
fi

echo "Deploying Nginx site config for $API_DOMAIN ..."
sed -e "s/API_DOMAIN/${API_DOMAIN}/g" "$NGINX_CONF_SRC" \
  > /etc/nginx/sites-available/mock-store-api

ln -sf /etc/nginx/sites-available/mock-store-api \
       /etc/nginx/sites-enabled/mock-store-api

rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "Configuring firewall rules for HTTP/HTTPS..."
if command -v ufw &>/dev/null; then
  ufw allow 'Nginx Full' || true
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
fi

echo "Requesting SSL certificate for $API_DOMAIN ..."
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --email "$EMAIL" \
  -d "$API_DOMAIN"

echo "Configuring certificate auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") \
  | sort -u | crontab -

echo ""
echo "Setup complete."
echo "Mock API is available at: https://${API_DOMAIN}"
