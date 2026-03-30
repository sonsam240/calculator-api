import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ CORS для Tilda
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// =========================
// 🧪 Проверка
// =========================
app.get("/", (req, res) => {
  res.send("API WORKS");
});

// =========================
// 📊 КАЛЬКУЛЯТОР (ГЛАВНОЕ)
// =========================
app.post("/calculate", async (req, res) => {
  try {
    let { price } = req.body;

    if (!price || isNaN(price)) {
      return res.status(400).json({ error: "Неверная цена" });
    }

    // 🔥 базовые параметры (можешь менять)
    const initialPayment = Math.floor(price * 0.2); // 20%
    const loanPeriod = 30; // лет

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${loanPeriod},
          loanTypes: PRIMARY,
          propertyTypes: FLAT,
          housingComplexUuid: "ed2f5053-a52c-4398-9226-a57d05a34e9b",
          initialPayment: ${initialPayment},
          cost: ${price},
          mortgageType: STANDARD,
          isRfCitizen: true
        ) {
          name
          bankName
          rate
          paymentDetails {
            payment
          }
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    const offer = data?.data?.getLoanOffer?.[0];

    if (!offer) {
      return res.json({
        error: "Нет предложений",
        debug: data
      });
    }

    res.json({
      program: offer.name,
      bank: offer.bankName,
      rate: offer.rate,
      monthlyPayment: offer.paymentDetails?.[0]?.payment || 0
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// =========================
// 🚀 СТАРТ
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SERVER STARTED");
});
