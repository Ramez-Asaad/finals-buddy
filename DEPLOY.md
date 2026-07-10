# Deploying Finals Buddy — $0/month

Architecture: **frontend on Vercel (free)** + **backend on Oracle Cloud Always-Free ARM VM**.
The backend keeps SQLite, uploads, and the vector store on a persistent Docker volume.

---

## 0. Push to GitHub (one repo, both folders)

```bash
cd finals-buddy
git init
git add .
git commit -m "Finals Buddy"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/finals-buddy.git
git push -u origin main
```

`.gitignore` already excludes `backend/.env` (your real keys), venv, node_modules,
and the runtime data files. Double-check with `git status` that no `.env` is staged.

---

## 1. Backend → Oracle Cloud (Always Free)

1. **Create the VM**: Oracle Cloud console → Compute → Instances → Create.
   - Image: **Ubuntu 24.04**, Shape: **VM.Standard.A1.Flex** (ARM) — e.g. 2 OCPU / 12 GB
     (you can use up to 4 OCPU / 24 GB total for free).
   - Add your SSH public key. Note the public IP.
2. **Open the firewall** (both layers!):
   - VCN → Security List → Ingress rule: TCP port **8000** from `0.0.0.0/0`
     (or 80/443 if you add a reverse proxy later).
   - On the VM: `sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT`
     (Ubuntu images from Oracle ship restrictive iptables, not just ufw).
3. **Install Docker**:
   ```bash
   sudo apt update && sudo apt install -y docker.io
   sudo usermod -aG docker ubuntu && newgrp docker
   ```
4. **Deploy**:
   ```bash
   git clone https://github.com/<you>/finals-buddy.git
   cd finals-buddy/backend
   cp .env.example .env && nano .env   # paste GROQ_API_KEY etc., set CORS_ORIGINS
   docker build -t finals-buddy-api .
   docker run -d --name finals-api --restart unless-stopped \
     -p 8000:8000 \
     -v finals_data:/srv/finals-buddy/data \
     --env-file .env \
     finals-buddy-api
   ```
5. **Smoke test**: `curl http://<VM_IP>:8000/docs` should return the FastAPI docs page.

> Redeploying after changes: `git pull && docker build -t finals-buddy-api . && docker rm -f finals-api && docker run ...` (same run command; the volume keeps your data).

---

## 2. Frontend → Vercel (free)

1. vercel.com → Add New Project → import the GitHub repo.
2. **Root Directory: `frontend`** (important — it's a monorepo layout).
3. Environment variable:
   - `NEXT_PUBLIC_API_URL` = `http://<VM_IP>:8000/api`
4. Deploy. Note your domain, e.g. `https://finals-buddy.vercel.app`.

## 3. Close the CORS loop

On the VM, edit `backend/.env`:

```
CORS_ORIGINS=https://finals-buddy.vercel.app
```

then `docker restart finals-api`.

---

## Mixed-content caveat (read this)

Vercel serves over **https**, and browsers block https pages from calling a plain
`http://<IP>:8000` API ("mixed content"). Two ways to handle it:

- **Proper fix (recommended, still $0)**: point a free subdomain (e.g. DuckDNS, or a
  domain you own) at the VM IP, then put **Caddy** in front of the API — it
  auto-provisions Let's Encrypt TLS:
  ```bash
  sudo apt install -y caddy
  # /etc/caddy/Caddyfile:
  #   api.yourdomain.com {
  #       reverse_proxy localhost:8000
  #   }
  sudo systemctl restart caddy
  ```
  Then set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api` in Vercel and open
  ports 80+443 instead of 8000.
- **Quick demo workaround**: run the frontend locally (`npm run dev`) against the
  cloud API — http→http is fine. OK for testing, not for a public link.

---

## No LLM keys? Still fine.

The backend degrades gracefully: Ollama Cloud → Groq → deterministic offline mode.
For the live demo, a free Groq key (console.groq.com) is the easiest real-LLM option.
