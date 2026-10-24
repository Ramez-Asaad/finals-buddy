#!/bin/bash
# Copies secret values out of backend/.env into AWS SSM Parameter Store.
#
# Values are piped straight from the file into the AWS CLI and are never
# echoed, so they stay out of terminal scrollback, shell history and CI logs.
# Only the parameter name and the result are printed.
#
# Run once after `terraform apply`, and again whenever a key is rotated.
set -euo pipefail

# Git Bash rewrites a leading slash into a Windows path, which turns
# /finals-buddy/KEY into C:/Program Files/Git/finals-buddy/KEY and makes the
# AWS CLI reject the name. Unused everywhere else.
export MSYS_NO_PATHCONV=1

ENV_FILE="${1:-backend/.env}"
REGION="${AWS_REGION:-us-east-1}"
PREFIX="/finals-buddy"

if [ ! -f "$ENV_FILE" ]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

read_env() {
  # Last assignment wins, matching how python-dotenv resolves duplicates.
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# The frontend origin is a deployment fact, not a developer secret, so it is
# set here rather than copied from a local .env that never had it.
CORS_ORIGINS_DEFAULT="${CORS_ORIGINS_OVERRIDE:-https://finals-buddy.vercel.app}"

for NAME in GROQ_API_KEY GROQ_API_KEY_2 OPENAI_API_KEY ADMIN_EMAILS CORS_ORIGINS; do
  VALUE="$(read_env "$NAME" || true)"
  if [ "$NAME" = "CORS_ORIGINS" ] && [ -z "$VALUE" ]; then
    VALUE="$CORS_ORIGINS_DEFAULT"
  fi
  if [ -z "$VALUE" ]; then
    echo "  skip    $NAME (not set in $ENV_FILE)"
    continue
  fi
  aws ssm put-parameter \
    --name "$PREFIX/$NAME" \
    --type SecureString \
    --overwrite \
    --region "$REGION" \
    --value "$VALUE" >/dev/null
  echo "  written $NAME (${#VALUE} chars)"
done

echo "done. Values are encrypted at rest and readable only by the instance role."
