#!/usr/bin/env bash
set -euo pipefail

# Load env vars from .env first
if [ ! -f .env ]; then
  echo "Error: .env not found. Copy .env.example and fill it in."
  exit 1
fi
# shellcheck disable=SC1091
source .env

# Require all GCP config vars
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is not set in .env}"
GCP_REGION="${GCP_REGION:?GCP_REGION is not set in .env}"
GCP_SERVICE_NAME="${GCP_SERVICE_NAME:?GCP_SERVICE_NAME is not set in .env}"
GCP_IMAGE_NAME="${GCP_IMAGE_NAME:?GCP_IMAGE_NAME is not set in .env}"

IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/cloud-run/${GCP_IMAGE_NAME}"

# Create Artifact Registry repo if it doesn't exist yet
if ! gcloud artifacts repositories describe cloud-run \
     --location="${GCP_REGION}" --project="${GCP_PROJECT_ID}" &>/dev/null; then
  echo "→ Creating Artifact Registry repo..."
  gcloud artifacts repositories create cloud-run \
    --repository-format=docker \
    --location="${GCP_REGION}" \
    --project="${GCP_PROJECT_ID}"
fi

echo "→ Building and pushing image via Cloud Build..."
gcloud builds submit \
  --tag "${IMAGE_URI}" \
  --project "${GCP_PROJECT_ID}" \
  .

echo "→ Deploying to Cloud Run..."
gcloud run deploy "${GCP_SERVICE_NAME}" \
  --image "${IMAGE_URI}" \
  --region "${GCP_REGION}" \
  --project "${GCP_PROJECT_ID}" \
  --max-instances 1 \
  --allow-unauthenticated \
  --set-env-vars "\
DATABASE_ENGINE=${DATABASE_ENGINE:-postgresql},\
DATABASE_HOST=${DATABASE_HOST},\
DATABASE_USER=${DATABASE_USER},\
DATABASE_PASSWORD=${DATABASE_PASSWORD},\
DATABASE_NAME=${DATABASE_NAME},\
AUTH_TOKEN=${AUTH_TOKEN},\
ROW_LIMIT=${ROW_LIMIT}${DATABASE_PORT:+,DATABASE_PORT=${DATABASE_PORT}}${DATABASE_SSL_PARAMS:+,DATABASE_SSL_PARAMS=${DATABASE_SSL_PARAMS}}"

echo ""
echo "Deployed. Service URL:"
gcloud run services describe "${GCP_SERVICE_NAME}" \
  --region "${GCP_REGION}" \
  --project "${GCP_PROJECT_ID}" \
  --format "value(status.url)"
