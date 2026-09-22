#!/bin/sh
# Generate the ready-to-paste migrations from 0001_init.sql.
# Run after editing the template. Commit the generated files.
set -e
cd "$(dirname "$0")"
for SCHEMA in public app_tst app_dev; do
  OUT="0001_init.${SCHEMA}.sql"
  {
    echo "-- GENERATED FROM 0001_init.sql - DO NOT EDIT BY HAND."
    echo "-- Target schema: ${SCHEMA}"
    echo "-- Regenerate with ./generate.sh after changing the template."
    echo
    sed "s/__SCHEMA__/${SCHEMA}/g" 0001_init.sql
  } > "$OUT"
  echo "wrote $OUT"
done
