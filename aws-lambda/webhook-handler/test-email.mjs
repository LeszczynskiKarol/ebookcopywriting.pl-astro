// test-email.mjs
// Testuje generowanie presigned URL (PDF + EPUB) i wysyłkę maila
// BEZ Stripe — odpala bezpośrednio logikę dostawy
//
// Użycie:
//   cd d:\ebookcopywriting.pl-astro\aws-lambda\webhook-handler
//   node test-email.mjs twoj@email.pl
//
// Wymaga ustawionych env vars (lub wpisz na twardo poniżej):
//   set AWS_REGION=eu-central-1
//   set S3_BUCKET=ebookcopywriting-ebooks
//   set SES_REGION=us-east-1
//   set EMAIL_FROM=sklep@ebookcopywriting.pl
//   set EMAIL_FROM_NAME=eBookCopywriting.pl

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// ============ KONFIGURACJA ============
const REGION = process.env.AWS_REGION || "eu-central-1";
const S3_BUCKET = process.env.S3_BUCKET || "ebookcopywriting-ebooks";
const SES_REGION = process.env.SES_REGION || "us-east-1";
const EMAIL_FROM = process.env.EMAIL_FROM || "sklep@ebookcopywriting.pl";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "eBookCopywriting.pl";
const TEST_EMAIL = process.argv[2]; // pierwszy argument CLI

if (!TEST_EMAIL) {
  console.error("Użycie: node test-email.mjs twoj@email.pl");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });
const ses = new SESClient({ region: SES_REGION });

const PRODUCT = {
  name: "Copywriting 360°",
  files: [
    {
      s3Key: "copywriting-360.pdf",
      fileName: "Copywriting-360-Ebook.pdf",
      label: "PDF",
      contentType: "application/pdf",
      emoji: "📕",
    },
    {
      s3Key: "copywriting-360.epub",
      fileName: "Copywriting-360-Ebook.epub",
      label: "EPUB",
      contentType: "application/epub+zip",
      emoji: "📱",
    },
  ],
};

const DOWNLOAD_EXPIRY = 7 * 24 * 60 * 60;

async function main() {
  console.log(`\n🧪 TEST wysyłki ebooka na: ${TEST_EMAIL}`);
  console.log(`   Bucket: ${S3_BUCKET}`);
  console.log(`   Region: ${REGION}`);
  console.log(`   SES Region: ${SES_REGION}\n`);

  // 1. Sprawdź czy pliki istnieją na S3
  console.log("📂 Sprawdzam pliki na S3...");
  for (const file of PRODUCT.files) {
    try {
      const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key });
      // HeadObject byłby lepszy, ale GetObject z presign też zwaliduje
      const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
      console.log(`   ✅ ${file.label}: ${file.s3Key} — OK`);
    } catch (err) {
      console.error(`   ❌ ${file.label}: ${file.s3Key} — BRAK PLIKU!`);
      console.error(`      ${err.message}`);
      process.exit(1);
    }
  }

  // 2. Generuj presigned URLs
  console.log("\n🔗 Generuję presigned URLs...");
  const downloads = [];
  for (const file of PRODUCT.files) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: file.s3Key,
      ResponseContentDisposition: `attachment; filename="${file.fileName}"`,
      ResponseContentType: file.contentType,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: DOWNLOAD_EXPIRY });
    downloads.push({ ...file, url });
    console.log(`   ✅ ${file.label}: wygenerowany (ważny 7 dni)`);
  }

  // 3. Wyślij maila
  console.log(`\n📧 Wysyłam maila na ${TEST_EMAIL}...`);

  const downloadButtonsHtml = downloads
    .map(
      (d) => `
    <a href="${d.url}" style="display:inline-block;background:#1a73e8;color:white;text-decoration:none;padding:16px 28px;border-radius:12px;font-weight:bold;font-size:16px;margin:6px 8px 6px 0;">
      ${d.emoji} Pobierz ${d.label}
    </a>`
    )
    .join("\n");

  const downloadLinksText = downloads
    .map((d) => `${d.label}: ${d.url}`)
    .join("\n");

  const formatList = downloads.map((d) => d.label).join(" + ");

  const htmlBody = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;background:#f8fafc;">
<div style="text-align:center;padding:30px 0 20px;">
  <div style="display:inline-block;background:#1a73e8;color:white;font-weight:bold;width:40px;height:40px;line-height:40px;border-radius:8px;font-size:18px;">C</div>
  <span style="font-size:20px;font-weight:bold;margin-left:8px;vertical-align:middle;">
    <span style="color:#0d47a1;">Copywriting</span><span style="color:#1e293b;">360&#176;</span>
  </span>
</div>
<div style="background:white;border-radius:16px;padding:40px 30px;border:1px solid #e2e8f0;">
  <h1 style="color:#0d47a1;font-size:24px;margin:0 0 10px;">&#127881; Dziękujemy za zakup!</h1>
  <p style="color:#64748b;font-size:16px;margin:0 0 8px;">Twój ebook <strong style="color:#1e293b;">${PRODUCT.name}</strong> jest gotowy do pobrania w ${downloads.length} formatach.</p>
  <p style="color:#ef4444;font-size:13px;margin:0 0 30px;">⚠️ TO JEST MAIL TESTOWY — nie było prawdziwej płatności.</p>
  <div style="text-align:center;margin:30px 0;">
    ${downloadButtonsHtml}
  </div>
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0 0 6px;font-size:14px;color:#0c4a6e;"><strong>&#128218; Który format wybrać?</strong></p>
    <p style="margin:0;font-size:14px;color:#0c4a6e;"><strong>PDF</strong> — najlepszy do czytania na komputerze i do druku.</p>
    <p style="margin:8px 0 0;font-size:14px;color:#0c4a6e;"><strong>EPUB</strong> — idealny na czytniki (Kindle, Kobo) i telefon.</p>
  </div>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0;font-size:14px;color:#9a3412;"><strong>&#9200; Linki ważne 7 dni.</strong> Pobierz oba formaty i zapisz na dysku.</p>
  </div>
</div>
</body></html>`;

  const textBody = `[TEST] Dziekujemy za zakup ebooka ${PRODUCT.name}!\n\nPobierz (${formatList}):\n${downloadLinksText}\n\nLinki wazne 7 dni.`;

  try {
    await ses.send(
      new SendEmailCommand({
        Source: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
        Destination: { ToAddresses: [TEST_EMAIL] },
        Message: {
          Subject: {
            Data: `[TEST] Twoj ebook "${PRODUCT.name}" - linki do pobrania (${formatList})`,
            Charset: "UTF-8",
          },
          Body: {
            Html: { Data: htmlBody, Charset: "UTF-8" },
            Text: { Data: textBody, Charset: "UTF-8" },
          },
        },
      })
    );
    console.log("   ✅ Mail wysłany!\n");
    console.log("🎉 SUKCES — sprawdź skrzynkę (i spam).");
    console.log("   Powinny być DWA przyciski: PDF i EPUB.");
    console.log("   Kliknij oba — sprawdź czy pobieranie działa.\n");
  } catch (err) {
    console.error("   ❌ Błąd wysyłki:", err.message);
    if (err.message.includes("not verified")) {
      console.error(
        "   → Email lub domena nie jest zweryfikowana w SES."
      );
      console.error(
        `   → Jeśli SES jest w sandbox, odbiorca (${TEST_EMAIL}) też musi być zweryfikowany.`
      );
    }
    process.exit(1);
  }
}

main();
