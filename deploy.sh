#!/bin/bash
# deploy.sh - Deploy eBookCopywriting.pl to S3 + CloudFront

S3_BUCKET="www.ebookcopywriting.pl"
CLOUDFRONT_ID="E1ABIXOTGNPJNL"

cd /d/ebookcopywriting.pl-astro

echo "📦 Pushing to GitHub..."
git add .
git commit -m "git push from local"
git push origin main

if [ $? -ne 0 ]; then
  echo "❌ Git push failed!"
  exit 1
fi

echo "🔨 Building Astro site..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "📤 Uploading to S3..."
aws s3 sync dist/ s3://${S3_BUCKET} --delete

echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"

echo "✅ Deployed to https://www.ebookcopywriting.pl"
#  repo: https://github.com/LeszczynskiKarol/ebookcopywriting.pl-astro