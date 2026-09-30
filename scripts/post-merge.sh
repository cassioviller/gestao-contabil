#!/bin/bash
set -e
pnpm install --frozen-lockfile
# As migrations são aplicadas pela própria API no boot (garantirBanco). Aqui só
# conferimos que o schema e as migrations geradas estão coerentes.
DATABASE_URL="${DATABASE_URL:-postgres://localhost/contafacil_dev}" pnpm --filter @workspace/db run check
