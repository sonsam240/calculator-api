import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

// Настройка CORS для Тильды
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// 1. Проверка работоспособности
app.get("/", (req, res) => res.send("API IS RUNNING ✅"));

// 2. Роут для ТОП предложений (БЕЗ фильтров)
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2"; // ДНС СИТИ
    const price = 6000000 * 100;
    const initialPayment = Math.floor(price * 0.2);
    const loanPeriod = 30;

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${loanPeriod},
          loanTypes: [PRIMARY],
          propertyTypes: [FLAT],
          housingComplexUuid: "${complex}",
          initialPayment: ${initialPayment},
          cost: ${price},
          isRfCitizen: true,
          mortgageType: STANDARD
        ) {
          name
          bankName
          rate
          paymentDetails { payment }
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    const offers = data?.data?.getLoanOffer;

    if (!offers || offers.length === 0) return res.json([]);

    const sorted = offers.sort((a, b) => a.rate - b.rate);
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
    console.error("❌ BASE OFFERS ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 3. Роут для КАЛЬКУЛЯТОРА (С ФИЛЬТРАМИ)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary, mortgageFSK } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Логика типа ипотеки (как в Dvizh)
    let mType = "STANDARD";
    if (hasChild) mType = "FAMILY";
    if (isIT) mType = "IT";
    if (isMilitary) mType = "MILITARY";

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${period},
          loanTypes: [PRIMARY],
          propertyTypes: [FLAT],
          housingComplexUuid: "${complex}",
          initialPayment: ${initial},
          cost: ${cost},
          isRfCitizen: true,
          mortgageType: ${mType},
          filters: {
            hasChild: ${!!hasChild},
            isIT: ${!!isIT},
            isMilitary: ${!!isMilitary}
            ${mortgageFSK ? ", mortgageFSK: true" : ""}
          }
        ) {
          name
          bankName
          rate
          paymentDetails { payment }
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors) {
      console.error("❌ GRAPHQL ERROR:", JSON.stringify(result.errors, null, 2));
      return res.status(400).json({ error: "API Schema Error", details: result.errors });
    }

    const offers = result?.data?.getLoanOffer;
    if (!offers || offers.length === 0) return res.json([]);

    const processed = offers
      .map(o => ({
        program: o.name,
        bank: o.bankName,
        rate: o.rate,
        monthlyPayment: o.paymentDetails?.[0]?.payment || 0,
        term: period * 12
      }))
      .sort((a, b) => a.rate - b.rate);

    const unique = [];
    const seenBanks = new Set();
    for (let o of processed) {
      if (!seenBanks.has(o.bank)) {
        seenBanks.add(o.bank);
        unique.push(o);
      }
      if (unique.length === 3) break;
    }

    res.json(unique);
  } catch (err) {
    console.error("❌ CALCULATE ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));