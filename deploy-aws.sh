#!/bin/bash

# =============================================================================
# Deploy backend sklepu ebookcopywriting.pl na AWS Lambda + API Gateway
# Wzorowane na praca-magisterska.pl, dostosowane do Copywriting 360°
# =============================================================================

set -e

# ===== KONFIGURACJA =====
REGION="eu-central-1"
SES_REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# S3
S3_BUCKET="ebookcopywriting-ebooks"
LAMBDA_BUCKET="ebookcopywriting-lambda-deploy"

# API Gateway
API_NAME="ebookcopywriting-sklep-api"
STAGE_NAME="prod"

# IAM
ROLE_NAME="ebookcopywriting-lambda-role"
POLICY_NAME="ebookcopywriting-lambda-policy"

# Lambda function names
CHECKOUT_FUNCTION="ebookcopywriting-create-checkout"
WEBHOOK_FUNCTION="ebookcopywriting-webhook-handler"

# Stripe - ustaw env vars PRZED uruchomieniem:
#   export STRIPE_SECRET_KEY=sk_test_...
#   export STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_XXXXXXXX}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_XXXXXXXX}"

# Email
EMAIL_FROM="sklep@ebookcopywriting.pl"
EMAIL_FROM_NAME="eBookCopywriting.pl"

# URLs
SUCCESS_URL="https://www.ebookcopywriting.pl/sukces"
CANCEL_URL="https://www.ebookcopywriting.pl/anulowano"

# CORS
CORS_ORIGIN="https://www.ebookcopywriting.pl"

echo "================================================"
echo "  Deploying eBookCopywriting.pl Backend"
echo "  Region: $REGION"
echo "  Account: $ACCOUNT_ID"
echo "================================================"

TEMP_DIR="$(pwd)/.deploy-tmp"
mkdir -p "$TEMP_DIR"

# -----------------------------------------------------------------------------
# 1. S3 bucket na ebooki (prywatny)
# -----------------------------------------------------------------------------
echo ""
echo "[1/8] Creating S3 bucket for ebooks..."

if ! aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
    aws s3api create-bucket \
        --bucket "$S3_BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"

    aws s3api put-public-access-block \
        --bucket "$S3_BUCKET" \
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

    echo "  ✅ Created: $S3_BUCKET"
else
    echo "  ✅ Already exists: $S3_BUCKET"
fi

# -----------------------------------------------------------------------------
# 2. S3 bucket na deploy Lambda
# -----------------------------------------------------------------------------
echo ""
echo "[2/8] Creating S3 bucket for Lambda deployment..."

if ! aws s3api head-bucket --bucket "$LAMBDA_BUCKET" 2>/dev/null; then
    aws s3api create-bucket \
        --bucket "$LAMBDA_BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
    echo "  ✅ Created: $LAMBDA_BUCKET"
else
    echo "  ✅ Already exists: $LAMBDA_BUCKET"
fi

# -----------------------------------------------------------------------------
# 3. IAM Role
# -----------------------------------------------------------------------------
echo ""
echo "[3/8] Creating IAM role..."

TRUST_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

if ! aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY"
    echo "  Waiting for role to propagate..."
    sleep 10
fi

LAMBDA_POLICY="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:*:*:*\"},{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::${S3_BUCKET}/*\"},{\"Effect\":\"Allow\",\"Action\":[\"ses:SendEmail\",\"ses:SendRawEmail\"],\"Resource\":\"*\"}]}"

aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" 2>/dev/null || true
aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "$POLICY_NAME" \
    --policy-document "$LAMBDA_POLICY"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "  ✅ IAM role: $ROLE_ARN"

# -----------------------------------------------------------------------------
# 4. Lambda: create-checkout
# -----------------------------------------------------------------------------
echo ""
echo "[4/8] Deploying create-checkout Lambda..."

cd aws-lambda/create-checkout
npm install --production
zip -r ${TEMP_DIR}/create-checkout.zip .
cd ../..

aws s3 cp ${TEMP_DIR}/create-checkout.zip "s3://${LAMBDA_BUCKET}/create-checkout.zip"

if aws lambda get-function --function-name "$CHECKOUT_FUNCTION" 2>/dev/null; then
    aws lambda update-function-code \
        --function-name "$CHECKOUT_FUNCTION" \
        --s3-bucket "$LAMBDA_BUCKET" \
        --s3-key "create-checkout.zip" > /dev/null
else
    aws lambda create-function \
        --function-name "$CHECKOUT_FUNCTION" \
        --runtime "nodejs20.x" \
        --role "$ROLE_ARN" \
        --handler "index.handler" \
        --code "S3Bucket=${LAMBDA_BUCKET},S3Key=create-checkout.zip" \
        --timeout 30 \
        --memory-size 256 \
        --environment "Variables={STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},SUCCESS_URL=${SUCCESS_URL},CANCEL_URL=${CANCEL_URL}}" > /dev/null
fi

# Poczekaj na gotowość
aws lambda wait function-active-v2 --function-name "$CHECKOUT_FUNCTION" 2>/dev/null || sleep 5

aws lambda update-function-configuration \
    --function-name "$CHECKOUT_FUNCTION" \
    --environment "Variables={STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},SUCCESS_URL=${SUCCESS_URL},CANCEL_URL=${CANCEL_URL}}" > /dev/null

echo "  ✅ create-checkout deployed"

# -----------------------------------------------------------------------------
# 5. Lambda: webhook-handler
# -----------------------------------------------------------------------------
echo ""
echo "[5/8] Deploying webhook-handler Lambda..."

cd aws-lambda/webhook-handler
npm install --production
zip -r ${TEMP_DIR}/webhook-handler.zip .
cd ../..

aws s3 cp ${TEMP_DIR}/webhook-handler.zip "s3://${LAMBDA_BUCKET}/webhook-handler.zip"

if aws lambda get-function --function-name "$WEBHOOK_FUNCTION" 2>/dev/null; then
    aws lambda update-function-code \
        --function-name "$WEBHOOK_FUNCTION" \
        --s3-bucket "$LAMBDA_BUCKET" \
        --s3-key "webhook-handler.zip" > /dev/null
else
    aws lambda create-function \
        --function-name "$WEBHOOK_FUNCTION" \
        --runtime "nodejs20.x" \
        --role "$ROLE_ARN" \
        --handler "index.handler" \
        --code "S3Bucket=${LAMBDA_BUCKET},S3Key=webhook-handler.zip" \
        --timeout 30 \
        --memory-size 256 \
        --environment "Variables={STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET},S3_BUCKET=${S3_BUCKET},EMAIL_FROM=${EMAIL_FROM},EMAIL_FROM_NAME=${EMAIL_FROM_NAME},SES_REGION=${SES_REGION}}" > /dev/null
fi

aws lambda wait function-active-v2 --function-name "$WEBHOOK_FUNCTION" 2>/dev/null || sleep 5

aws lambda update-function-configuration \
    --function-name "$WEBHOOK_FUNCTION" \
    --environment "Variables={STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET},S3_BUCKET=${S3_BUCKET},EMAIL_FROM=${EMAIL_FROM},EMAIL_FROM_NAME=${EMAIL_FROM_NAME},SES_REGION=${SES_REGION}}" > /dev/null

echo "  ✅ webhook-handler deployed"

# -----------------------------------------------------------------------------
# 6. API Gateway (HTTP API)
# -----------------------------------------------------------------------------
echo ""
echo "[6/8] Creating API Gateway..."

API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId" --output text)

if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
    API_ID=$(aws apigatewayv2 create-api \
        --name "$API_NAME" \
        --protocol-type HTTP \
        --cors-configuration "AllowOrigins=${CORS_ORIGIN},AllowMethods=POST,OPTIONS,AllowHeaders=Content-Type" \
        --query "ApiId" --output text)
    echo "  Created API: $API_ID"
else
    echo "  API exists: $API_ID"
fi

# Integracja: create-checkout
CHECKOUT_INT=$(aws apigatewayv2 get-integrations --api-id "$API_ID" \
    --query "Items[?contains(IntegrationUri, '${CHECKOUT_FUNCTION}')].IntegrationId" --output text)

if [ -z "$CHECKOUT_INT" ] || [ "$CHECKOUT_INT" = "None" ]; then
    CHECKOUT_INT=$(aws apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${CHECKOUT_FUNCTION}" \
        --payload-format-version "2.0" \
        --query "IntegrationId" --output text)
fi

aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "POST /create-checkout" \
    --target "integrations/${CHECKOUT_INT}" 2>/dev/null || true

# Integracja: webhook
WEBHOOK_INT=$(aws apigatewayv2 get-integrations --api-id "$API_ID" \
    --query "Items[?contains(IntegrationUri, '${WEBHOOK_FUNCTION}')].IntegrationId" --output text)

if [ -z "$WEBHOOK_INT" ] || [ "$WEBHOOK_INT" = "None" ]; then
    WEBHOOK_INT=$(aws apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${WEBHOOK_FUNCTION}" \
        --payload-format-version "2.0" \
        --query "IntegrationId" --output text)
fi

aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "POST /webhook" \
    --target "integrations/${WEBHOOK_INT}" 2>/dev/null || true

echo "  ✅ API Gateway configured: $API_ID"

# -----------------------------------------------------------------------------
# 7. Stage + permissions
# -----------------------------------------------------------------------------
echo ""
echo "[7/8] Deploying API stage..."

if ! aws apigatewayv2 get-stage --api-id "$API_ID" --stage-name "$STAGE_NAME" 2>/dev/null; then
    aws apigatewayv2 create-stage \
        --api-id "$API_ID" \
        --stage-name "$STAGE_NAME" \
        --auto-deploy > /dev/null
fi

aws lambda add-permission \
    --function-name "$CHECKOUT_FUNCTION" \
    --statement-id "apigateway-invoke-checkout" \
    --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" 2>/dev/null || true

aws lambda add-permission \
    --function-name "$WEBHOOK_FUNCTION" \
    --statement-id "apigateway-invoke-webhook" \
    --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" 2>/dev/null || true

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}"
echo "  ✅ API deployed: $API_URL"

# -----------------------------------------------------------------------------
# 8. Podsumowanie
# -----------------------------------------------------------------------------
echo ""
echo "================================================"
echo "  🎉 DEPLOYMENT COMPLETE!"
echo "================================================"
echo ""
echo "  API Endpoints:"
echo "    POST ${API_URL}/create-checkout"
echo "    POST ${API_URL}/webhook"
echo ""
echo "  ================================================"
echo "  NASTĘPNE KROKI:"
echo "  ================================================"
echo ""
echo "  1. Upload ebooka do S3:"
echo "     aws s3 cp copywriting-360.pdf s3://${S3_BUCKET}/ebooks/copywriting-360.pdf"
echo ""
echo "  2. Stripe webhook (dashboard.stripe.com → Developers → Webhooks):"
echo "     URL: ${API_URL}/webhook"
echo "     Events: checkout.session.completed, checkout.session.async_payment_succeeded"
echo ""
echo "  3. SES — zweryfikuj email (lub domenę):"
echo "     aws ses verify-email-identity --email-address ${EMAIL_FROM} --region ${SES_REGION}"
echo ""
echo "  4. Zaktualizuj API_URL w Astro site:"
echo "     const API_URL = '${API_URL}'"
echo ""
echo "  5. Przetestuj w trybie test Stripe!"
echo ""

cat > .env.production << EOF
# Generated by deploy-aws.sh — $(date)
API_URL=${API_URL}
S3_BUCKET=${S3_BUCKET}
REGION=${REGION}
API_ID=${API_ID}
EOF

echo "  Config saved to .env.production"

rm -rf "$TEMP_DIR"
echo "  Temp files cleaned."
