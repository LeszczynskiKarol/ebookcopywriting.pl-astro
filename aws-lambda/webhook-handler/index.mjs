import Stripe from "stripe";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });
const ses = new SESClient({ region: process.env.SES_REGION || "us-east-1" });

const PRODUCT_FILES = {
  "ebook-copywriting-360": {
    s3Key: "copywriting-360.pdf",
    name: "Copywriting 360\u00B0",
    fileName: "Copywriting-360-Ebook.pdf",
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
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing signature" }) };
    }

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Signature verification failed:", err.message);
      console.log("isBase64Encoded:", event.isBase64Encoded);
      console.log("Body length:", rawBody?.length);
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid signature" }) };
    }

    console.log("Verified event:", stripeEvent.type);

    if (
      stripeEvent.type === "checkout.session.completed" ||
      stripeEvent.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = stripeEvent.data.object;

      if (session.payment_status !== "paid") {
        console.log("Payment not yet paid:", session.payment_status);
        return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
      }

      const productId = session.metadata?.productId;
      const customerEmail = session.customer_details?.email || session.customer_email;

      console.log("Product:", productId, "Email:", customerEmail);

      if (!productId || !PRODUCT_FILES[productId]) {
        console.error("Unknown product:", productId);
        return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
      }

      if (!customerEmail) {
        console.error("No customer email");
        return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
      }

      const product = PRODUCT_FILES[productId];

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: product.s3Key,
        ResponseContentDisposition: `attachment; filename="${product.fileName}"`,
        ResponseContentType: "application/pdf",
      });

      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: DOWNLOAD_EXPIRY });
      console.log("Generated download URL for", customerEmail);

      await sendEmail(customerEmail, product, downloadUrl);
      console.log("Email sent to", customerEmail);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
  } catch (error) {
    console.error("Webhook error:", error);
    return { statusCode: 200, headers, body: JSON.stringify({ received: true, error: error.message }) };
  }
};

async function sendEmail(to, product, downloadUrl) {
  const fromName = process.env.EMAIL_FROM_NAME || "eBookCopywriting.pl";
  const fromEmail = process.env.EMAIL_FROM || "sklep@ebookcopywriting.pl";

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
  <p style="color:#64748b;font-size:16px;margin:0 0 30px;">Twój ebook <strong style="color:#1e293b;">${product.name}</strong> jest gotowy do pobrania.</p>
  <div style="text-align:center;margin:30px 0;">
    <a href="${downloadUrl}" style="display:inline-block;background:#1a73e8;color:white;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:bold;font-size:16px;">&#128229; Pobierz ebook (PDF)</a>
  </div>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0;font-size:14px;color:#9a3412;"><strong>&#9200; Link ważny 7 dni.</strong> Pobierz i zapisz plik na dysku.</p>
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

  const textBody = `Dziekujemy za zakup ebooka ${product.name}!\n\nPobierz ebook: ${downloadUrl}\n\nLink jest wazny 7 dni. Pobierz i zapisz plik na dysku.\n\nProblemy? kontakt@ebookcopywriting.pl`;

  await ses.send(new SendEmailCommand({
    Source: `${fromName} <${fromEmail}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `Twoj ebook "${product.name}" - link do pobrania`, Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: { Data: textBody, Charset: "UTF-8" },
      },
    },
  }));
}
