#!/bin/bash
# Applies everything except the app image tag, which CI sets separately with
# `kubectl set image` after this runs. Safe to re-run: every step is idempotent.
set -euxo pipefail

cd "$(dirname "$0")/../.."
export KUBECONFIG=${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}
export PATH=$PATH:/usr/local/bin

DOMAIN_NAME="${DOMAIN_NAME:-finalsbuddy.duckdns.org}"

kubectl apply -f infra/k8s/app.yaml

# Caddy reads the hostname from a ConfigMap so the certificate domain is a
# deploy-time value rather than something baked into the manifest.
kubectl create configmap caddy-domain \
  --from-literal=domain="$DOMAIN_NAME" \
  --namespace=finals-buddy \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-json \
  --from-file=finals-buddy.json=infra/k8s/grafana-dashboard.json \
  --namespace=finals-buddy \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f infra/k8s/caddy.yaml
kubectl apply -f infra/k8s/monitoring.yaml
