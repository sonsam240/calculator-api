import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

// Настройка CORS для работы с Тильдой
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// 1. Проверка работоспособности
app.get("/", (req, res) => res.send("API MORTGAGE SYSTEM ✅"));

// 2. Роут для ТОП-3 предложений (выводятся над калькулятором)
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2"; 
    const price = 6000000 * 100;
    const initialPayment = Math.floor(price * 0.2);

    const query = `
      query {
        getLoanOffer(
          loanPeriod: 30,
          loanTypes: [PRIMARY],
          propertyTypes: [FLAT],
          housingComplexUuid: "${complex}",
          initialPayment: ${initialPayment},
          cost: ${price},
          isRfCitizen: true,
          mortgageType: STANDARD
        ) {
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
    const offers = data?.data?.getLoanOffer || [];

    const unique = [];
    const seen = new Set();
    offers.sort((a, b) => a.rate - b.rate).forEach(o => {
      if (!seen.has(o.bankName)) {
        seen.add(o.bankName);
        unique.push({
          bank: o.bankName,
          rate: o.rate,
          monthlyPayment: o.paymentDetails?.[0]?.payment || 0
        });
      }
    });

    res.json(unique.slice(0, 3));
  } catch (err) {
    console.error("BASE ERROR:", err);
    res.status(500).json({ error: "error" });
  }
});

// 3. Роут для основной фильтрации (Калькулятор)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary } = req.body;

    let mType = "STANDARD";
    if (hasChild) mType = "FAMILY";
    else if (isIT) mType = "IT";
    else if (isMilitary) mType = "MILITARY";

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${parseInt(loanPeriod)},
          loanTypes: [PRIMARY],
          propertyTypes: [FLAT],
          housingComplexUuid: "${complex}",
          initialPayment: ${parseInt(initialPayment)},
          cost: ${parseInt(price)},
          isRfCitizen: true,
          mortgageType: ${mType}
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
    if (result.errors) return res.status(400).json({ error: result.errors[0].message });

    const offers = result?.data?.getLoanOffer || [];
    const unique = [];
    const seenBanks = new Set();
    
    offers.sort((a, b) => a.rate - b.rate).forEach(o => {
      if (!seenBanks.has(o.bankName)) {
        seenBanks.add(o.bankName);
        unique.push({
          program: o.name,
          bank: o.bankName,
          rate: o.rate,
          monthlyPayment: o.paymentDetails?.[0]?.payment || 0,
          term: parseInt(loanPeriod) * 12
        });
      }
    });

    res.json(unique.slice(0, 3));
  } catch (err) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// 4. Роут для вкладки "Все программы" (Сводная информация)
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const programs = [
      { id: "STANDARD", name: "Стандартная ипотека", init: 20 },
      { id: "FAMILY", name: "Семейная ипотека", init: 20 },
      { id: "IT", name: "Ипотека для IT", init: 20 },
      { id: "MILITARY", name: "Военная ипотека", init: 15 }
    ];

    // Функция для получения минимальной ставки по конкретному типу
    const getBestRate = async (type) => {
      const query = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${type}) { rate } }`;
      try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        const json = await response.json();
        const offers = json?.data?.getLoanOffer || [];
        return offers.length > 0 ? Math.min(...offers.map(o => o.rate)) : null;
      } catch { return null; }
    };

    // Запускаем все запросы одновременно
    const results = await Promise.all(programs.map(async (p) => {
      const rate = await getBestRate(p.id);
      return rate ? {
        name: p.name,
        rate: rate,
        initial: p.init,
        term: 30
      } : null;
    }));

    // Отправляем только те программы, по которым найдены ставки
    res.json(results.filter(r => r !== null));

  } catch (err) {
    console.error("ALL PROGRAMS ERROR:", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MORTGAGE API READY ON PORT ${PORT}`));