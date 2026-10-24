#!/bin/bash
set -euxo pipefail

dnf update -y
dnf install -y git

# k3s with its bundled Traefik disabled: this stack terminates TLS with Caddy,
# which already handles Let's Encrypt automatically and is what the previous
# Oracle deployment used, so certificate behaviour stays identical.
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
chmod 644 /etc/rancher/k3s/k3s.yaml
echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> /etc/profile.d/kubeconfig.sh

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
for i in $(seq 1 60); do
  /usr/local/bin/kubectl get node && break
  sleep 5
done

export PATH=$PATH:/usr/local/bin
kubectl create namespace ${app_namespace} --dry-run=client -o yaml | kubectl apply -f -

git clone ${repo_url} /opt/finals-buddy || (cd /opt/finals-buddy && git pull)

# --- ECR pull credentials, refreshed because the token expires every 12h ---
cat > /usr/local/bin/refresh-ecr-secret.sh <<'EOS'
#!/bin/bash
set -euo pipefail
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
export PATH=$PATH:/usr/local/bin
PASSWORD=$(aws ecr get-login-password --region ${aws_region})
kubectl create secret docker-registry ecr-creds \
  --docker-server=${account_id}.dkr.ecr.${aws_region}.amazonaws.com \
  --docker-username=AWS \
  --docker-password="$PASSWORD" \
  --namespace=${app_namespace} \
  --dry-run=client -o yaml | kubectl apply -f -
EOS
chmod +x /usr/local/bin/refresh-ecr-secret.sh

# --- Application secrets: SSM Parameter Store to a Kubernetes Secret ---
# Values never touch the repo or the instance disk outside the cluster store.
cat > /usr/local/bin/sync-app-secrets.sh <<'EOS'
#!/bin/bash
set -euo pipefail
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
export PATH=$PATH:/usr/local/bin
ARGS=()
for NAME in GROQ_API_KEY GROQ_API_KEY_2 OPENAI_API_KEY ADMIN_EMAILS CORS_ORIGINS; do
  VALUE=$(aws ssm get-parameter --name "/finals-buddy/$NAME" --with-decryption \
            --region ${aws_region} --query Parameter.Value --output text 2>/dev/null || echo "")
  if [ -n "$VALUE" ] && [ "$VALUE" != "placeholder-set-out-of-band" ]; then
    ARGS+=(--from-literal="$NAME=$VALUE")
  fi
done
if [ $${#ARGS[@]} -gt 0 ]; then
  kubectl create secret generic app-secrets "$${ARGS[@]}" \
    --namespace=${app_namespace} --dry-run=client -o yaml | kubectl apply -f -
fi
EOS
chmod +x /usr/local/bin/sync-app-secrets.sh

/usr/local/bin/refresh-ecr-secret.sh
/usr/local/bin/sync-app-secrets.sh

cat > /etc/systemd/system/refresh-secrets.service <<'EOS'
[Unit]
Description=Refresh ECR pull token and sync app secrets from SSM
[Service]
Type=oneshot
ExecStart=/usr/local/bin/refresh-ecr-secret.sh
ExecStart=/usr/local/bin/sync-app-secrets.sh
EOS

cat > /etc/systemd/system/refresh-secrets.timer <<'EOS'
[Unit]
Description=Run refresh-secrets every 6 hours
[Timer]
OnBootSec=2min
OnUnitActiveSec=6h
[Install]
WantedBy=timers.target
EOS

systemctl daemon-reload
systemctl enable --now refresh-secrets.timer

# Cluster baseline. The app Deployment starts on a placeholder image and is
# pointed at a real one by the first CI deploy.
chmod +x /opt/finals-buddy/infra/scripts/apply-manifests.sh
DOMAIN_NAME=${domain_name} /opt/finals-buddy/infra/scripts/apply-manifests.sh
