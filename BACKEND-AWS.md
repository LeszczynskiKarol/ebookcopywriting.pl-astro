# Backend AWS — Copywriting 360°

## Architektura (identyczna jak praca-magisterska.pl)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Astro SSG  │────▶│  API Gateway │────▶│   Lambda     │
│  (S3/CF)    │     │  (REST)      │     │  (Node.js)   │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                    ┌──────────────┐     ┌──────▼───────┐
                    │   SES        │◀────│   Stripe     │
                    │  (email)     │     │  (payments)  │
                    └──────────────┘     └──────────────┘
                                                │
                    ┌──────────────┐     ┌──────▼───────┐
                    │   S3         │     │  Stripe      │
                    │  (ebook PDF) │     │  Webhook     │
                    └──────────────┘     └──────────────┘
```

## Endpoints do zaimplementowania

### POST /create-checkout
Tworzy Stripe Checkout Session.

**Request:**
```json
{
  "productId": "ebook-copywriting-360"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

**Stripe Checkout config:**
```js
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card', 'blik'],
  line_items: [{
    price_data: {
      currency: 'pln',
      product_data: {
        name: 'Copywriting 360° — Ebook PDF',
        description: '194 strony praktycznej wiedzy o copywritingu',
      },
      unit_amount: 4900, // 49.00 PLN w groszach
    },
    quantity: 1,
  }],
  mode: 'payment',
  success_url: 'https://www.ebookcopywriting.pl/sukces?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://www.ebookcopywriting.pl/anulowano',
  customer_email: undefined, // Stripe zbierze
  metadata: {
    product: 'ebook-copywriting-360',
  },
});
```

### POST /webhook (Stripe Webhook)
Obsługuje event `checkout.session.completed`.

**Flow po płatności:**
1. Stripe wysyła webhook z `checkout.session.completed`
2. Lambda weryfikuje podpis webhookowy
3. Generuje presigned URL do ebooka na S3 (ważny 7 dni)
4. Wysyła email przez SES z linkiem do pobrania

### GET /download?token=xxx
Opcjonalny endpoint do bezpiecznego pobierania z tokenem jednorazowym.

## S3 Buckets

### Bucket: `copywriting360-ebooks`
- `copywriting-360-full.pdf` — pełny ebook (prywatny)
- `copywriting-360-preview.pdf` — fragment do preview (publiczny)

### Bucket: `www.ebookcopywriting.pl`
- Hosting statyczny Astro build
- CloudFront distribution

## Zmienne środowiskowe Lambda

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SES_FROM_EMAIL=ebook@ebookcopywriting.pl
S3_EBOOK_BUCKET=copywriting360-ebooks
S3_EBOOK_KEY=copywriting-360-full.pdf
EBOOK_DOWNLOAD_EXPIRY=604800
```

## Deploy frontend

```bash
# Build
npm run build

# Sync do S3
aws s3 sync dist/ s3://www.ebookcopywriting.pl --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id EXXXXXXXXX \
  --paths "/*"
```

## TODO (kolejne kroki)

1. [ ] Utworzyć S3 bucket `copywriting360-ebooks`
2. [ ] Upload preview PDF
3. [ ] Utworzyć Stripe product + price
4. [ ] Stworzyć Lambda function (skopiować wzorzec z praca-magisterska)
5. [ ] Skonfigurować API Gateway
6. [ ] Skonfigurować SES (verified domain)
7. [ ] Ustawić Stripe webhook endpoint
8. [ ] Podmienić API_URL w index.astro i fragment.astro
9. [ ] Podmienić PREVIEW_PDF_URL w obu plikach
10. [ ] Deploy frontend na S3 + CloudFront
11. [ ] Ustawić Route 53 DNS
12. [ ] Certyfikat SSL (ACM)
