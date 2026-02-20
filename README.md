# Copywriting 360° — Landing Page

Strona sprzedażowa ebooka **Copywriting 360°** — kompletny poradnik pisania tekstów, które sprzedają.

## Stack

- **Astro** — static site generator
- **Tailwind CSS** — styling
- **Stripe** — płatności (backend na AWS)
- **AWS** — S3, CloudFront, Lambda, API Gateway, SES

## Struktura projektu

```
copywriting360/
├── src/
│   ├── components/
│   │   ├── Navbar.astro          # Nawigacja (sticky, transparent → solid)
│   │   ├── Footer.astro          # Stopka z linkami
│   │   ├── BuyButton.astro       # Reużywalny przycisk zakupu
│   │   └── SectionHeading.astro  # Reużywalny nagłówek sekcji
│   ├── layouts/
│   │   └── Layout.astro          # Główny layout (SEO, fonty, Schema.org)
│   ├── pages/
│   │   ├── index.astro           # Strona główna / landing page
│   │   ├── fragment.astro        # Podgląd rozdziału (PDF embed)
│   │   ├── sukces.astro          # Strona po udanej płatności
│   │   └── anulowano.astro       # Strona po anulowanej płatności
│   └── styles/
│       └── global.css            # Globalne style, custom components
├── public/
│   ├── favicon.svg
│   └── robots.txt
├── BACKEND-AWS.md                # Dokumentacja backendu AWS
├── astro.config.mjs
├── tailwind.config.mjs
└── tsconfig.json
```

## Szybki start

```bash
npm install
npm run dev       # localhost:4321
npm run build     # → dist/
npm run preview   # preview buildu
```

## Konfiguracja

### Przed deployem podmień:

1. **`src/pages/index.astro`** — linia `API_URL` i `PREVIEW_PDF_URL`
2. **`src/pages/fragment.astro`** — linia `PREVIEW_PDF_URL` i `API_URL` w script
3. Upload preview PDF na S3 i zaktualizuj URL

### Kolorystyka

Brand color: **orange** (#EA580C) — konfiguracja w `tailwind.config.mjs`.  
Fonty: **Instrument Serif** (display) + **Plus Jakarta Sans** (body).

## Deploy

Patrz: [BACKEND-AWS.md](./BACKEND-AWS.md)

## Autor

Karol Leszczyński · [iCopywriter.pl](https://icopywriter.pl) · [TorWeb.pl](https://torweb.pl)
