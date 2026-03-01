#!/usr/bin/env bash
# ============================================================
#  ufw-prefill.sh
#  Liest alle aktuell lauschenden Ports aus, benennt sie
#  und fügt UFW-Allow-Regeln hinzu.
#  UFW wird NICHT aktiviert — nur die Regeln werden gesetzt.
# ============================================================
set -euo pipefail

# ── Farben ───────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Bekannte Port-Namen (Port → Beschreibung) ─────────────────
declare -A PORT_NAMES
PORT_NAMES=(
  [20]="FTP Data"         [21]="FTP Control"       [22]="SSH"
  [23]="Telnet"           [25]="SMTP"               [53]="DNS"
  [67]="DHCP Server"      [68]="DHCP Client"        [69]="TFTP"
  [80]="HTTP"             [81]="Nginx Proxy Manager" [110]="POP3"
  [123]="NTP"             [143]="IMAP"              [161]="SNMP"
  [179]="BGP"             [194]="IRC"               [389]="LDAP"
  [443]="HTTPS"           [444]="HTTPS alt"         [445]="SMB"
  [465]="SMTPS"           [514]="Syslog"            [587]="SMTP Submission"
  [631]="CUPS"            [636]="LDAPS"             [873]="rsync"
  [993]="IMAPS"           [995]="POP3S"             [1194]="OpenVPN"
  [1433]="MSSQL"          [1521]="Oracle DB"        [1883]="MQTT"
  [2049]="NFS"            [2222]="SSH alt / Gitea"  [2375]="Docker (plain)"
  [2376]="Docker TLS"     [2377]="Docker Swarm"     [3000]="Grafana / Dev"
  [3001]="Uptime Kuma"    [3306]="MySQL/MariaDB"    [3389]="RDP"
  [3478]="STUN/TURN"      [4443]="HTTPS alt"        [4444]="Metasploit"
  [5000]="Flask/Dev"      [5432]="PostgreSQL"       [5672]="RabbitMQ"
  [5900]="VNC"            [6010]="X11 Forwarding"   [6379]="Redis"
  [6443]="Kubernetes API" [7474]="Neo4j HTTP"       [7687]="Neo4j Bolt"
  [8000]="HTTP alt"       [8080]="HTTP Proxy/Dev"   [8081]="HTTP alt"
  [8082]="HTTP alt"       [8083]="HTTP alt"         [8085]="HTTP alt"
  [8086]="InfluxDB"       [8087]="HTTP alt"         [8088]="HTTP alt"
  [8090]="HTTP alt"       [8091]="Couchbase"        [8092]="Couchbase"
  [8093]="HTTP alt"       [8096]="Jellyfin HTTP"    [8097]="Jellyfin HTTPS"
  [8112]="Deluge Web"     [8181]="HTTP alt"         [8182]="HTTP alt"
  [8200]="Vault"          [8443]="HTTPS alt"        [8448]="Matrix Federation"
  [8500]="Consul"         [8600]="Consul DNS"       [8686]="Sonarr"
  [8780]="HTTP alt"       [8782]="HTTP alt"         [8888]="Jupyter"
  [8929]="HTTP alt"       [8989]="Sonarr"           [9000]="Portainer / PHP-FPM"
  [9001]="Portainer Agent" [9090]="Prometheus / Cockpit" [9091]="Transmission Web"
  [9100]="Node Exporter"  [9117]="Jackett"          [9200]="Elasticsearch"
  [9300]="Elasticsearch Cluster" [9443]="Portainer HTTPS" [9987]="TeamSpeak 3 Voice"
  [10000]="ServerDash"    [10001]="ServerDash alt"  [19999]="Netdata"
  [27017]="MongoDB"       [28015]="RethinkDB"       [30033]="TeamSpeak 3 Files"
  [32400]="Plex"          [51820]="WireGuard"
)

# ── Prüfungen ─────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Bitte als root ausführen: sudo ./ufw-prefill.sh${NC}"
  exit 1
fi

if ! command -v ufw &>/dev/null; then
  echo -e "${RED}UFW ist nicht installiert. Abbruch.${NC}"
  exit 1
fi

if ! command -v ss &>/dev/null; then
  echo -e "${RED}ss (iproute2) ist nicht verfügbar. Abbruch.${NC}"
  exit 1
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         UFW Regel-Vorbefüllung (ufw-prefill)         ║${NC}"
echo -e "${BOLD}║  UFW wird NICHT aktiviert – nur Regeln werden gesetzt ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Aktuell lauschende Ports einlesen ─────────────────────────
# ss -tlunp: TCP+UDP, listening, numeric, processes
# Felder: Netid State RecvQ SendQ Local Address:Port ...
declare -A seen  # "port/proto" → "prozess"

while IFS= read -r line; do
  # Extrahiere Proto (tcp/udp), local address:port, prozessname
  proto=$(echo "$line" | awk '{print $1}' | sed 's/v6//')
  local_addr=$(echo "$line" | awk '{print $5}')
  process_info=$(echo "$line" | grep -oP 'users:\(\(".*?"\)' 2>/dev/null || true)

  # Port aus letztem :-Segment (IPv6 hat [::]:port, IPv4 hat 0.0.0.0:port)
  port=$(echo "$local_addr" | rev | cut -d: -f1 | rev)

  # Nur numerische Ports, keine 0
  if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ "$port" -eq 0 ]]; then
    continue
  fi

  # Prozessname extrahieren wenn vorhanden
  proc=$(echo "$process_info" | grep -oP '"[^"]*"' | head -1 | tr -d '"' 2>/dev/null || echo "")

  key="${port}/${proto}"
  if [[ -z "${seen[$key]+_}" ]]; then
    seen[$key]="$proc"
  fi
done < <(ss -tlunp 2>/dev/null | tail -n +2)

if [[ ${#seen[@]} -eq 0 ]]; then
  echo -e "${YELLOW}Keine lauschenden Ports gefunden.${NC}"
  exit 0
fi

# ── Docker Container Ports einlesen ──────────────────────────
declare -A DOCKER_PORTS  # host-port → "container (image)"

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  echo -e "${CYAN}Lese Docker Container Ports…${NC}"
  # set -e temporär deaktivieren: grep liefert exit 1 wenn kein Match
  set +e
  while IFS='|' read -r cname cimage cports; do
    [[ -z "$cports" ]] && continue
    while IFS= read -r mapping; do
      mapping=$(echo "$mapping" | xargs 2>/dev/null)
      [[ -z "$mapping" ]] && continue
      # Extrahiere Host-Port vor dem Pfeil (0.0.0.0:PORT-> oder :::PORT->)
      hport=$(echo "$mapping" | grep -oP '(?<=[0-9]:)[0-9]+(?=->)' 2>/dev/null | head -1)
      [[ -z "$hport" ]] && hport=$(echo "$mapping" | grep -oP '^[0-9]+(?=->)' 2>/dev/null | head -1)
      if [[ -n "$hport" ]]; then
        short_image=$(echo "$cimage" | sed 's|.*/||' | cut -d: -f1)
        DOCKER_PORTS[$hport]="${cname} (${short_image})"
      fi
    done < <(echo "$cports" | tr ',' '\n')
  done < <(docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>/dev/null)
  set -e
  echo -e "  ${#DOCKER_PORTS[@]} Docker Port-Zuordnungen gefunden."
  echo ""
else
  echo -e "  ${YELLOW}Docker nicht verfügbar oder kein Zugriff — übersprungen.${NC}"
  echo ""
fi

# ── Gefundene Ports anzeigen ───────────────────────────────────
echo -e "${CYAN}Gefundene lauschende Ports:${NC}"
echo ""

declare -a TO_ADD=()
declare -a SKIP_PORTS=(0)  # Port 0 immer überspringen

for key in $(echo "${!seen[@]}" | tr ' ' '\n' | sort -t/ -k1 -n); do
  port=$(echo "$key" | cut -d/ -f1)
  proto=$(echo "$key" | cut -d/ -f2)
  proc="${seen[$key]}"

  # Beschreibung ermitteln (Priorität: PORT_NAMES > Docker > Prozess > /etc/services)
  name="${PORT_NAMES[$port]:-}"
  docker_label="${DOCKER_PORTS[$port]:-}"
  if [[ -n "$docker_label" ]]; then
    if [[ -n "$name" ]]; then
      name="${name} [Docker: ${docker_label}]"
    else
      name="Docker: ${docker_label}"
    fi
  elif [[ -z "$name" && -n "$proc" ]]; then
    name="$proc"
  elif [[ -z "$name" ]]; then
    # Versuche /etc/services
    name=$(grep -E "^[a-z].*[[:space:]]+${port}/${proto}" /etc/services 2>/dev/null | head -1 | awk '{print $1}' || echo "Unbekannt")
    [[ -z "$name" ]] && name="Unbekannt"
  fi

  printf "  ${GREEN}%-6s${NC}  %-6s  %s\n" "$port" "$proto" "$name"
  TO_ADD+=("$port/$proto|$name")
done

echo ""
echo -e "  ${#TO_ADD[@]} Ports werden als UFW-Regeln hinzugefügt."
echo ""

# ── UFW Regeln hinzufügen ──────────────────────────────────────
echo -e "${CYAN}Füge UFW-Regeln hinzu…${NC}"
echo ""

ADDED=0
SKIPPED=0
ERRORS=0

for entry in "${TO_ADD[@]}"; do
  key=$(echo "$entry" | cut -d'|' -f1)
  name=$(echo "$entry" | cut -d'|' -f2)
  port=$(echo "$key" | cut -d/ -f1)
  proto=$(echo "$key" | cut -d/ -f2)

  # Kommentar kürzen und Sonderzeichen entfernen (fix: tr ohne Backslash am Ende)
  safe_comment=$(echo "$name" | tr -d "'\"" | tr -d '\\' | cut -c1-40)

  # Prüfen ob Regel schon existiert
  if ufw status | grep -qE "^${port}(/${proto})?\s+(ALLOW|LIMIT)"; then
    printf "  ${YELLOW}%-20s${NC} bereits vorhanden — übersprungen\n" "$key"
    ((SKIPPED++)) || true
    continue
  fi

  if ufw allow "${port}/${proto}" comment "${safe_comment}" &>/dev/null; then
    printf "  ${GREEN}%-20s${NC} ✓ ufw allow %s/%s  [%s]\n" "$key" "$port" "$proto" "$safe_comment"
    ((ADDED++)) || true
  else
    printf "  ${RED}%-20s${NC} ✗ Fehler beim Hinzufügen\n" "$key"
    ((ERRORS++)) || true
  fi
done

echo ""
echo -e "${BOLD}── Zusammenfassung ──────────────────────────────────────${NC}"
echo -e "  ${GREEN}Hinzugefügt:${NC} $ADDED"
echo -e "  ${YELLOW}Übersprungen:${NC} $SKIPPED (bereits vorhanden)"
[[ $ERRORS -gt 0 ]] && echo -e "  ${RED}Fehler:${NC}       $ERRORS"
echo ""
echo -e "${BOLD}UFW-Status:${NC} $(ufw status | head -1)"
echo ""
echo -e "Aktuelle Regeln prüfen:"
echo -e "  ${CYAN}sudo ufw status numbered${NC}"
echo ""
echo -e "Wenn alles korrekt aussieht, UFW aktivieren:"
echo -e "  ${CYAN}sudo ufw enable${NC}"
echo ""
echo -e "${YELLOW}⚠ UFW wurde NICHT aktiviert. Prüfe die Regeln zuerst!${NC}"
echo ""
