#!/bin/sh
# Generate ready-to-paste migrations from every NNNN_*.sql template that
# contains a __SCHEMA__ token. Run after editing a template; commit the output.
set -e
cd "$(dirname "$0")"
for TPL in [0-9][0-9][0-9][0-9]_*.sql; do
  case "$TPL" in *.public.sql|*.app_tst.sql|*.app_dev.sql) continue ;; esac
  grep -q '__SCHEMA__' "$TPL" || continue
  BASE="${TPL%.sql}"
  for SCHEMA in public app_tst app_dev; do
    OUT="${BASE}.${SCHEMA}.sql"
    {
      echo "-- GENERATED FROM ${TPL} - DO NOT EDIT BY HAND."
      echo "-- Target schema: ${SCHEMA}"
      echo "-- Regenerate with ./generate.sh after changing the template."
      echo
      sed "s/__SCHEMA__/${SCHEMA}/g" "$TPL"
    } > "$OUT"
    echo "wrote $OUT"
  done
done
