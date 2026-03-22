import Stripe from "stripe";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });
const ses = new SESClient({ region: process.env.SES_REGION || "us-east-1" });

const PRODUCT_FILES = {
  "ebook-copywriting-360": {
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
  },
};

const DOWNLOAD_EXPIRY = 7 * 24 * 60 * 60;

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    // API Gateway HTTP API v2 moze kodowac body jako base64
    let rawBody = event.body;
    if (event.isBase64Encoded) {
      rawBody = Buffer.from(event.body, "base64").toString("utf8");
    }

    const signature =
      event.headers?.["stripe-signature"] ||
      event.headers?.["Stripe-Signature"];

    if (!signature) {
      console.error("Missing Stripe signature header");
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing signature" }),
      };
    }

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error("Signature verification failed:", err.message);
      console.log("isBase64Encoded:", event.isBase64Encoded);
      console.log("Body length:", rawBody?.length);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid signature" }),
      };
    }

    console.log("Verified event:", stripeEvent.type);

    if (
      stripeEvent.type === "checkout.session.completed" ||
      stripeEvent.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = stripeEvent.data.object;

      if (session.payment_status !== "paid") {
        console.log("Payment not yet paid:", session.payment_status);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ received: true }),
        };
      }

      const productId = session.metadata?.productId;
      const customerEmail =
        session.customer_details?.email || session.customer_email;

      console.log("Product:", productId, "Email:", customerEmail);

      if (!productId || !PRODUCT_FILES[productId]) {
        console.error("Unknown product:", productId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ received: true }),
        };
      }

      if (!customerEmail) {
        console.error("No customer email");
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ received: true }),
        };
      }

      const product = PRODUCT_FILES[productId];

      // Generuj presigned URL dla każdego formatu
      const downloads = [];
      for (const file of product.files) {
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: file.s3Key,
          ResponseContentDisposition: `attachment; filename="${file.fileName}"`,
          ResponseContentType: file.contentType,
        });

        const url = await getSignedUrl(s3, command, {
          expiresIn: DOWNLOAD_EXPIRY,
        });
        downloads.push({ ...file, url });
        console.log(`Generated ${file.label} download URL for`, customerEmail);
      }

      await sendEmail(customerEmail, product, downloads);
      console.log(
        "Email sent to",
        customerEmail,
        "with",
        downloads.length,
        "download links",
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true, error: error.message }),
    };
  }
};

async function sendEmail(to, product, downloads) {
  const fromName = process.env.EMAIL_FROM_NAME || "eBookCopywriting.pl";
  const fromEmail = process.env.EMAIL_FROM || "sklep@ebookcopywriting.pl";

  // Generuj przyciski pobierania dla każdego formatu
  const downloadButtonsHtml = downloads
    .map(
      (d) => `
    <a href="${d.url}" style="display:inline-block;background:#1a73e8;color:white;text-decoration:none;padding:16px 28px;border-radius:12px;font-weight:bold;font-size:16px;margin:6px 8px 6px 0;">
      ${d.emoji} Pobierz ${d.label}
    </a>`,
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
  <p style="color:#64748b;font-size:16px;margin:0 0 30px;">Twój ebook <strong style="color:#1e293b;">${product.name}</strong> jest gotowy do pobrania w ${downloads.length} formatach.</p>
  <div style="text-align:center;margin:30px 0;">
    ${downloadButtonsHtml}
  </div>
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0 0 6px;font-size:14px;color:#0c4a6e;"><strong>&#128218; Który format wybrać?</strong></p>
    <p style="margin:0;font-size:14px;color:#0c4a6e;"><strong>PDF</strong> — najlepszy do czytania na komputerze i do druku. Zachowuje układ stron, fonty i grafiki dokładnie tak, jak zostały zaprojektowane.</p>
    <p style="margin:8px 0 0;font-size:14px;color:#0c4a6e;"><strong>EPUB</strong> — idealny na czytniki (Kindle, Kobo) i telefon. Tekst dopasowuje się do rozmiaru ekranu, możesz zmieniać wielkość czcionki.</p>
  </div>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0;font-size:14px;color:#9a3412;"><strong>&#9200; Linki ważne 7 dni.</strong> Pobierz oba formaty i zapisz na dysku.</p>
  </div>
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0 0 6px;font-size:14px;color:#0c4a6e;"><strong>&#128161; Wskazówka na start:</strong></p>
    <p style="margin:0;font-size:14px;color:#0c4a6e;">Zacznij od rozdziału 3 (Nagłówki) — to fundament, który od razu zmieni Twoje teksty!</p>
  </div>
</div>
<div style="text-align:center;padding:24px 0;color:#94a3b8;font-size:12px;">
  <p>Problemy z pobieraniem? Napisz: <a href="mailto:kontakt@ebookcopywriting.pl" style="color:#1a73e8;">kontakt@ebookcopywriting.pl</a></p>
  <p style="margin-top:12px;"><a href="https://www.ebookcopywriting.pl" style="color:#1a73e8;text-decoration:none;">eBookCopywriting.pl</a></p>
</div>
</body></html>`;

  const textBody = `Dziekujemy za zakup ebooka ${product.name}!\n\nPobierz ebook (${formatList}):\n${downloadLinksText}\n\nKtory format wybrac?\nPDF — najlepszy do czytania na komputerze i do druku.\nEPUB — idealny na czytniki (Kindle, Kobo) i telefon.\n\nLinki sa wazne 7 dni. Pobierz oba formaty i zapisz na dysku.\n\nProblemy? kontakt@ebookcopywriting.pl`;

  await ses.send(
    new SendEmailCommand({
      Source: `${fromName} <${fromEmail}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: {
          Data: `Twoj ebook "${product.name}" - linki do pobrania (${formatList})`,
          Charset: "UTF-8",
        },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    }),
  );
}
