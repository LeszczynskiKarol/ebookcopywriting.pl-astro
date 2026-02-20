import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Produkt: Copywriting 360° ebook
const PRODUCTS = {
  "ebook-copywriting-360": {
    name: "Copywriting 360° — Kompletny poradnik pisania tekstów, które sprzedają",
    price: 4900, // 49 zł w groszach
    currency: "pln",
  },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://www.ebookcopywriting.pl",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler = async (event) => {
  // Handle CORS preflight
  if (
    event.httpMethod === "OPTIONS" ||
    event.requestContext?.http?.method === "OPTIONS"
  ) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    const { productId, customerEmail } = JSON.parse(event.body);

    // Walidacja
    if (!productId || !PRODUCTS[productId]) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Nieprawidłowy produkt" }),
      };
    }

    const product = PRODUCTS[productId];

    // Tworzenie Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "blik"],
      line_items: [
        {
          price_data: {
            currency: product.currency,
            product_data: {
              name: product.name,
              description:
                "Ebook PDF — 194 strony, 16 rozdziałów, formuły, ćwiczenia, rozdział o AI",
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.CANCEL_URL,
      customer_email: customerEmail || undefined,
      metadata: {
        productId: productId,
      },
      billing_address_collection: "auto",
      invoice_creation: {
        enabled: true,
      },
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
    };
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Błąd serwera" }),
    };
  }
};
