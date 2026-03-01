# ServerDash

ServerDash is a self-hosted web dashboard for managing a Linux server. It provides a secure web UI to monitor the system, manage Docker containers, cron jobs, users, services, firewall rules, view logs, and open a web terminal.

## Features

- **Authentication & users**
  - Local user accounts stored in SQLite
  - Default admin user seeded on first start (`admin` / `Admin1234!`)
  - Role field for future role-based access (admin / viewer)
- **System monitoring**
  - Live system metrics via `systeminformation` (CPU, RAM, etc.)
- **Docker management**
  - List and control containers via the Docker daemon (using `dockerode`)
- **Cron jobs**
  - View and manage cron jobs via the backend API
- **Updates & shutdown**
  - Trigger system package updates using `apt`
  - Shutdown / reboot hooks using `sudo` and `systemctl`
- **Server users**
  - Create, modify and delete Linux system users via privileged commands
- **Application users**
  - Manage dashboard users (add/remove, reset passwords)
- **Firewall (UFW)**
  - List and manage UFW rules via the API
  - Optional helper script `ufw-prefill.sh` to prefill rules from listening ports
- **Filesystem browser**
  - Navigate files/directories from the browser
- **Systemd services & logs**
  - View and control `systemd` units
  - View log output via `journalctl` and log files
- **Web terminal**
  - WebSocket-based terminal using `ssh2` + `xterm.js`

> **Important:** Many features rely on `sudo` and system tools (`apt`, `ufw`, `systemctl`, `docker`, etc.). Run in a secure environment and restrict access to trusted users only.

## Tech stack

- **Backend**
  - Node.js, Express
  - SQLite via `better-sqlite3`
  - JSON Web Tokens (`jsonwebtoken`) for auth
  - WebSockets (`ws`) for the terminal
  - `ssh2`, `systeminformation`, `node-cron`, `dockerode`, `helmet`, `express-rate-limit`, `cors`
- **Frontend**
  - React 18 + Vite
  - React Router
  - Axios
  - Tailwind CSS
  - `@xterm/xterm` + `@xterm/addon-fit` for the terminal
  - `lucide-react` icons, `recharts` for charts

## Repository structure

- `backend/` – Express API, SQLite DB setup, auth and all server routes
- `backend/db/database.js` – SQLite initialization and default admin seeding
- `backend/routes/` – API endpoints (auth, users, system-users, docker, cron, updates, monitoring, fs, ufw, logs, systemd, terminal)
- `frontend/` – React/Vite SPA (dashboard UI)
- `ecosystem.config.js` – PM2 configuration for running the backend in production
- `setup.sh` – Ubuntu 24.04 install script (production deployment)
- `ufw-prefill.sh` – helper script to prefill UFW rules from listening ports

## Prerequisites

For **local development**:

- Node.js 18+ and npm

For **production on a server** (tested on Ubuntu 24.04):

- Ubuntu 24.04 (or similar systemd-based distro)
- Root (or sudo) access
- Optional but recommended: Docker and UFW

## Local development

You can run backend and frontend separately during development.

### 1. Clone the repository

```bash
git clone https://github.com/<your-account>/<your-repo>.git
cd WebApp
```

### 2. Backend (API)

From the project root:

```bash
cd backend
npm install
```

Create a `.env` file in `backend/` (adjust as needed):

```bash
PORT=10000
JWT_SECRET=changeme-to-a-long-random-string
JWT_EXPIRES_IN=8h
APP_NAME=ServerDash
DB_PATH=./data/serverdash.db
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

Then start the backend (with auto-reload):

```bash
npm run dev
```

The API will run on `http://localhost:10000` by default.

### 3. Frontend (React)

In a second terminal, from the project root:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173`.

`vite.config.js` is already configured to proxy `/api` requests to `http://localhost:10000`, so the frontend talks to the backend without CORS issues.

Now open:

- Frontend: http://localhost:5173

### 4. Default login

On first start, the backend seeds a default admin user:

- **Username:** `admin`
- **Password:** `Admin1234!`

Log in with these credentials and **change the password immediately** in the UI.

## Production deployment (Ubuntu 24.04)

The `setup.sh` script automates installation on Ubuntu 24.04.

1. Copy or clone this project onto your server (for example to `/opt/serverdash-src`):

   ```bash
   git clone https://github.com/<your-account>/<your-repo>.git
   cd <your-repo>
   ```

2. Run the setup script as root (you can override the port with `PORT=`):

   ```bash
   sudo PORT=10000 bash setup.sh
   ```

The script will:

- Install system dependencies (`nodejs`, `npm`, `git`, `curl`)
- Install PM2 globally
- Create a system user `serverdash` with home at `/opt/serverdash`
- Add `serverdash` to the `docker` group if Docker is present
- Write a sudoers file `/etc/sudoers.d/serverdash` for required commands
- Copy the app into `/opt/serverdash`
- Install backend dependencies in `/opt/serverdash/backend`
- Generate `/opt/serverdash/backend/.env` if not existing (with random `JWT_SECRET`)
- Install frontend dependencies and run `npm run build` in `/opt/serverdash/frontend`
- Start the app via `pm2` using `ecosystem.config.js` (port `10000` by default)
- Configure PM2 to start on boot for user `serverdash`

After completion, the script prints the access URL, e.g.:

- `http://<server-ip>:10000`

Again, the default credentials are `admin` / `Admin1234!` — change the password immediately.

### PM2 and logs

The PM2 app name is `serverdash` and is configured by `ecosystem.config.js`.

Useful commands on the server:

```bash
cd /opt/serverdash
sudo -u serverdash pm2 list
sudo -u serverdash pm2 logs serverdash
sudo -u serverdash pm2 restart serverdash
```

`ecosystem.config.js` is configured to write logs to:

- `./logs/out.log`
- `./logs/err.log`

## UFW helper script (ufw-prefill.sh)

The `ufw-prefill.sh` script scans all currently listening TCP/UDP ports and adds corresponding `ufw allow` rules with descriptive comments. It **does not enable UFW** by itself.

Usage on the server (as root):

```bash
cd /opt/serverdash
sudo ./ufw-prefill.sh
```

The script will:

- Use `ss` to list listening ports
- Try to determine a human-readable name (well-known ports, Docker containers, process name, `/etc/services`)
- Add `ufw allow` rules with a short comment
- Show a summary and current UFW status

Afterwards, you can review the rules:

```bash
sudo ufw status numbered
```

If everything looks good, enable UFW manually:

```bash
sudo ufw enable
```

## Environment variables

Key environment variables used by the backend (`backend/.env`):

- `PORT` – HTTP port for the API (default `10000` in production)
- `JWT_SECRET` – secret key for signing JWTs (must be long and random)
- `JWT_EXPIRES_IN` – token lifetime, e.g. `8h`
- `APP_NAME` – display name used by the app
- `DB_PATH` – path to the SQLite database (e.g. `/opt/serverdash/data/serverdash.db`)
- `CORS_ORIGIN` – allowed origin for the frontend (e.g. `http://localhost:5173` or your domain)
- `NODE_ENV` – `development` or `production`

## Notes & security

- This dashboard has powerful capabilities (user management, shutdown, package management, firewall changes, Docker control, etc.).
- Only expose it on trusted networks or behind a VPN / reverse proxy.
- Change the default admin password directly after the first login.
- Rotate `JWT_SECRET` and regenerate tokens if you suspect compromise.

