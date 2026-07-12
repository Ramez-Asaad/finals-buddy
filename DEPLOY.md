# Deploying Finals Buddy — $0/month (first-timer walkthrough)

Architecture: **frontend on Vercel (free)** + **backend on an Oracle Cloud Always-Free ARM VM**.
The backend keeps SQLite, uploads, and the vector store on a persistent Docker volume.
 .
---

## 0. Push to GitHub (one repo, both folders)

```bash
cd finals-buddy
git init
git add .
git commit -m "Finals Buddy"
# create an empty repo on github.com (no README, no license), then:
git remote add origin https://github.com/<you>/finals-buddy.git
git push -u origin main
```

`.gitignore` already excludes `backend/.env` (your real keys), venv, node_modules,
and runtime data. Before pushing, run `git status` and confirm **no `.env` file is listed**.

---

## 1. Backend → Oracle Cloud (Always Free)

### 1a. Create the instance

Console → ☰ menu → **Compute → Instances → Create instance**.

| Form section | What to pick |
|---|---|
| Name | `finals-buddy` |
| Compartment | `root` (fine for a personal account) |
| Availability domain | AD-1 (any AD works; if creation fails, try another) |
| Capacity type | On-demand |
| Image | **Canonical Ubuntu 24.04** (plain, not Minimal) |
| Shape | **VM.Standard.A1.Flex** (Ampere ARM, "Always Free-eligible") → set **2 OCPUs / 12 GB RAM** (free tier allows up to 4 OCPU / 24 GB total across all A1 VMs) |

**Networking section:**

- Primary network: **"Create new virtual cloud network"** — Oracle auto-creates the
  VCN, a public subnet, an internet gateway, and routing. You do NOT need to make a
  VCN beforehand.
- Subnet: keep the auto "Create new public subnet".
- **"Assign a public IPv4 address": ON** ← check this; it's sometimes collapsed
  under advanced options, and without it you cannot reach the VM at all.

**Add SSH keys section:**

- Easiest: **"Generate a key pair for me"** → click **Download private key** (a
  `.key` file). *You get exactly one chance to download it — Oracle never shows it again.*
  Save it somewhere permanent, e.g. `C:\Users\Ramoz\.ssh\finals-buddy.key`.
- (Alternative: if you already have a key, paste the contents of `~/.ssh/id_ed25519.pub`.)

Click **Create**. Wait for the instance state to turn green **RUNNING**, then copy the
**Public IP address** from the instance page.

> ⚠️ **"Out of capacity" error?** Frankfurt's free ARM pool fills up often. Fixes, in
> order: try a different Availability Domain; drop to 1 OCPU / 6 GB (you can resize
> later); retry at an off-peak hour (early morning EU time works best); it usually
> succeeds within a day of retries. Don't switch region — your account's free tier is
> tied to its home region.

### 1a-bis. Fallback: VM.Standard.E2.1.Micro (when A1 is out of capacity everywhere)

If all three ADs reject A1.Flex, take the **VM.Standard.E2.1.Micro** shape the error
offers — it's also Always Free, x86 (the Dockerfile is arch-agnostic, nothing changes),
and almost always available. Its one constraint: **1 GB RAM**, which is enough for this
backend (FastAPI + SQLite + TF-IDF; the LLMs are remote APIs) — but you MUST add swap
right after your first SSH login (step 1c), *before* installing Docker, or the image
build can get OOM-killed:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Then continue with the guide unchanged. You can recreate on A1 later when capacity
frees up (the deploy is just `git clone` + two docker commands), or simply stay on
the Micro — this app fits.

> Side note: upgrading the account to Pay-As-You-Go unlocks A1 capacity almost
> immediately and always-free resources stay free — but a PAYG account can bill real
> money past free limits. Only worth it if you want the big ARM box for other projects.

### 1b. Open port 8000 — layer 1 of 2: the cloud firewall (Security List)

☰ → **Networking → Virtual cloud networks** → click the VCN that was just created
(named like `vcn-2026...`) → left sidebar **Security Lists** → click
**Default Security List for vcn-...** → **Add Ingress Rules**:

| Field | Value | Why |
|---|---|---|
| Stateless | **OFF** | Stateful rules auto-allow the reply traffic; stateless would need a matching egress rule too |
| Source Type | CIDR | |
| Source CIDR | `0.0.0.0/0` | Anyone on the internet may call the API |
| IP Protocol | TCP | |
| Source Port Range | **leave empty** (= All) | This is the *caller's* port — browsers pick a random one every time |
| Destination Port Range | `8000` | The port uvicorn listens on |
| Description | `finals-buddy API` | |

Click **Add Ingress Rules**. (The "Allows TCP traffic for ports: all" text at the top
of the dialog is just a live summary — it updates once you set the destination port.)

### 1c. SSH into the VM (from Windows PowerShell)

Windows 10/11 has OpenSSH built in:

```powershell
# first time only: lock the key file down or ssh will refuse it
icacls "G:\OneDrive - Alamein International University\Uni stuff\semester 8 - Spring 25-26\finals-buddy\ssh-key-2026-07-10.key" /inheritance:r /grant:r "$env:USERNAME:(R)"

ssh -i C:\Users\Ramoz\.ssh\finals-buddy.key ubuntu@<PUBLIC_IP>
```

Type `yes` at the fingerprint prompt. You should land at `ubuntu@finals-buddy:~$`.

### 1d. Open port 8000 — layer 2 of 2: the VM's own firewall (iptables)

Oracle's Ubuntu images ship with restrictive **iptables** rules baked in (this is the
step everyone misses — the security list alone is not enough):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo netfilter-persistent save     # survives reboots
```

### 1e. Install Docker and deploy

```bash
sudo apt update && sudo apt install -y docker.io
sudo usermod -aG docker ubuntu
exit
```

Re-connect with the same `ssh` command (needed for the docker group to apply), then:

```bash
git clone https://github.com/<you>/finals-buddy.git
cd finals-buddy/backend
cp .env.example .env
nano .env        # paste GROQ_API_KEY, ADMIN_EMAILS (your login email — enables
                  # the /admin dashboard), etc.; Ctrl+O Enter to save, Ctrl+X to exit

docker build -t finals-buddy-api .
docker run -d --name finals-api --restart unless-stopped \
  -p 8000:8000 \
  -v finals_data:/srv/finals-buddy/data \
  --env-file .env \
  finals-buddy-api
```

### 1f. Smoke test

From the VM: `curl -s localhost:8000/docs | head -3` → should print HTML.
From your own PC's browser: `http://<PUBLIC_IP>:8000/docs` → FastAPI docs page.

- Works on the VM but not from your PC → recheck **1b** (security list) and **1d** (iptables).
- `docker logs finals-api` shows startup errors if the container is unhealthy.

> **Redeploying after a code change:**
> `cd ~/finals-buddy && git pull && cd backend && docker build -t finals-buddy-api . && docker rm -f finals-api && docker run -d --name finals-api --restart unless-stopped -p 8000:8000 -v finals_data:/srv/finals-buddy/data --env-file .env finals-buddy-api`
> (the named volume keeps your database and uploads across redeploys)

---

## 2. Frontend → Vercel (free)

1. vercel.com → sign in with GitHub → **Add New… → Project** → import `finals-buddy`.
2. **Root Directory: click Edit → select `frontend`** ← the one setting people miss.
3. Framework preset auto-detects Next.js; leave build settings alone.
4. Expand **Environment Variables** and add:
   - Name: `NEXT_PUBLIC_API_URL` — Value: `http://<PUBLIC_IP>:8000/api`
5. **Deploy**, then note your URL, e.g. `https://finals-buddy.vercel.app`.

## 3. Close the CORS loop

Back on the VM:

```bash
nano ~/finals-buddy/backend/.env
# set:  CORS_ORIGINS=https://finals-buddy.vercel.app
docker restart finals-api
```

---

## 4. Mixed-content caveat — read before sharing the link

Vercel serves over **https**, and browsers block an https page from calling a plain
`http://IP:8000` API ("mixed content"). Your deployed frontend will not be able to
reach the backend until the API is behind https too. The free fix:

1. Get a free subdomain pointing at your VM IP — easiest is **duckdns.org** (login,
   create `something.duckdns.org`, set it to `<PUBLIC_IP>`).
2. On the VM, install **Caddy** (auto-provisions Let's Encrypt TLS):

   ```bash
   sudo apt install -y caddy
   sudo nano /etc/caddy/Caddyfile     # replace contents with:
   ```

   ```
   something.duckdns.org {
       reverse_proxy localhost:8000
   }
   ```

   ```bash
   sudo systemctl restart caddy
   ```

3. Open ports **80 and 443** the same way as port 8000 (both layers: security-list
   ingress rules + iptables), since Let's Encrypt validates over 80:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

4. In Vercel → Project → Settings → Environment Variables: change
   `NEXT_PUBLIC_API_URL` to `https://something.duckdns.org/api` → **Redeploy**.
5. Update `CORS_ORIGINS` on the VM if your Vercel domain changed, `docker restart finals-api`.

---

## No Groq key? AI features return a clear error

All AI generation (summaries, quizzes/flashcards, the AI tutor, mock exams, cheat
sheets, the curriculum map) requires `GROQ_API_KEY`. Without it, those specific
endpoints return a real `503` error with an explanatory message — they never
fabricate fake output. Everything else (subjects, tasks, notes, auth, manual
CRUD on flashcards/quizzes/formulas) works fine with no key at all.

Get a free Groq key at console.groq.com and set `GROQ_API_KEY` in `.env` to enable
AI features. `GROQ_API_KEY_2` is optional and used as an automatic fallback if the
primary key hits a rate limit.

---

## Admin dashboard

Set `ADMIN_EMAILS` in `.env` to your account's login email (comma-separated if
you ever use more than one), then visit `https://<your-frontend>/admin` while
signed in with that account. It shows global stats, a live tail of the app's
log file (no `docker logs` / Docker-socket access needed), a config/health
sanity check (Groq key set? DB reachable? disk space?), and a form to rotate
the Groq key(s) without SSH-ing into the VM — saved keys are persisted to a
file inside the data volume and take effect immediately, no restart required.
