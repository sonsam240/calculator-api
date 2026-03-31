import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// CORS
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// проверка
app.get("/", (req, res) => {
  res.send("API WORKS");
});


// =====================================================
// 🔝 БАЗОВЫЕ ПРЕДЛОЖЕНИЯ (НЕ ЗАВИСЯТ ОТ КАЛЬКУЛЯТОРА)
// =====================================================
app.get("/offer-base", async (req, res) => {
  try {

    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2"; // можно менять
    const price = 5000000 * 100;
    const initialPayment = Math.floor(price * 0.2);
    const loanPeriod = 30;

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${loanPeriod},
          loanTypes: PRIMARY,
          propertyTypes: FLAT,
          housingComplexUuid: "${complex}",
          initialPayment: ${initialPayment},
          cost: ${price},
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
    const offers = data?.data?.getLoanOffer;

    if (!offers || offers.length === 0) {
      return res.json([]);
    }

    // сортировка по ставке
    const sorted = offers.sort((a, b) => a.rate - b.rate);

    // уникальные банки
    const unique = [];
    const seen = new Set();

    for (let o of sorted) {
      if (!seen.has(o.bankName)) {
        seen.add(o.bankName);

        unique.push({
          bank: o.bankName,
          rate: o.rate,
          monthlyPayment: o.paymentDetails?.[0]?.payment || 0
        });
      }

      if (unique.length === 3) break;
    }

    res.json(unique);

  } catch (err) {
    console.error("❌ BASE ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});


// =====================================================
// 🔽 КАЛЬКУЛЯТОР (ПО ПАРАМЕТРАМ)
// =====================================================
app.post("/calculate", async (req, res) => {
  try {
    let { price, complex, initialPayment, loanPeriod } = req.body;

    // --- ВАЛИДАЦИЯ ---
    if (!price || isNaN(price)) {
      return res.status(400).json({ error: "Неверная цена" });
    }

    if (!complex) {
      return res.status(400).json({ error: "Не выбран ЖК" });
    }

    if (!loanPeriod || isNaN(loanPeriod)) {
      loanPeriod = 30;
    }

    if (!initialPayment || isNaN(initialPayment)) {
      initialPayment = Math.floor(price * 0.2);
    }

    if (initialPayment >= price) {
      initialPayment = Math.floor(price * 0.2);
    }

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${loanPeriod},
          loanTypes: PRIMARY,
          propertyTypes: FLAT,
          housingComplexUuid: "${complex}",
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
    const offers = data?.data?.getLoanOffer;

    if (!offers || offers.length === 0) {
      return res.json({
        error: "Нет предложений",
        debug: data
      });
    }

    // сортировка по платежу
    const sorted = offers.sort((a, b) => {
      const aPay = a.paymentDetails?.[0]?.payment || 0;
      const bPay = b.paymentDetails?.[0]?.payment || 0;
      return aPay - bPay;
    });

    // уникальные банки
    const unique = [];
    const seenBanks = new Set();

    for (let o of sorted) {
      if (!seenBanks.has(o.bankName)) {
        seenBanks.add(o.bankName);

        unique.push({
          program: o.name,
          bank: o.bankName,
          rate: o.rate,
          monthlyPayment: o.paymentDetails?.[0]?.payment || 0,
          term: loanPeriod * 12
        });
      }

      if (unique.length === 3) break;
    }

    res.json(unique);

  } catch (err) {
    console.error("❌ CALC ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});


// старт
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SERVER STARTED");
});
