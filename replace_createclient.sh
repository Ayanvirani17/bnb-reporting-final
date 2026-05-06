#!/usr/bin/env bash
set -euo pipefail

# Optional safe commit (won't fail the script if no changes)
git add -A || true
git commit -m "WIP: backup before replacing createClient" || true

# Find occurrences
grep -R --line-number --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "createClient(" . > createclient_occurrences.txt || true
cut -d: -f1 createclient_occurrences.txt | sort -u > createclient_files.txt || true

echo "=== Files that mention createClient (unique) ==="
if [ -s createclient_files.txt ]; then
  cat createclient_files.txt
else
  echo "(none found)"
fi
echo "============================================="

# Do replacements with backups (.bak)
while read -r file; do
  [ -z "$file" ] && continue

  # skip our new helper files
  if [[ "$file" == "lib/supabaseClient.ts" || "$file" == "lib/supabaseServer.ts" ]]; then
    echo "Skipping helper: $file"
    continue
  fi

  # Heuristic: treat files under api or lib as server-side
  if [[ "$file" == *"/app/api/"* ]] || [[ "$file" == *"/pages/api/"* ]] || [[ "$file" == *"/api/"* ]] || [[ "$file" == *"/lib/"* ]]; then
    echo "Updating (server) $file"
    sed -E -i.bak "s/import[[:space:]]+\{[^}]*createClient[^}]*\}[[:space:]]+from[[:space:]]+['\"]@supabase\/supabase-js['\"];?/import { getSupabaseServerClient } from '@/lib\/supabaseServer';/g" "$file" || true
    sed -E -i.bak "s/createClient\([^)]+\)/getSupabaseServerClient()/g" "$file" || true
  else
    echo "Updating (client) $file"
    sed -E -i.bak "s/import[[:space:]]+\{[^}]*createClient[^}]*\}[[:space:]]+from[[:space:]]+['\"]@supabase\/supabase-js['\"];?/import { getSupabaseClient } from '@/lib\/supabaseClient';/g" "$file" || true
    sed -E -i.bak "s/createClient\([^)]+\)/getSupabaseClient()/g" "$file" || true
  fi
done < createclient_files.txt

echo "Replacements complete. Backups are *.bak next to edited files."
