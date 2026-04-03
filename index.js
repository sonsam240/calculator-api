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

// 1. Проверка работы сервера
app.get("/", (req, res) => res.send("MORTGAGE FULL API READY ✅"));

// 2. 🔝 ЛУЧШИЕ ПРЕДЛОЖЕНИЯ (Выводятся над калькулятором)
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
    res.status(500).json([]);
  }
});

// 3. 🔽 КАЛЬКУЛЯТОР (С вашими 4 фильтрами)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary, mortgageFSK } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Логика выбора типа программы
    let mType = "STANDARD";
    if (hasChild) mType = "FAMILY";
    else if (isIT) mType = "IT";
    else if (isMilitary) mType = "MILITARY";

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
            isMilitary: ${!!isMilitary},
            mortgageFSK: ${!!mortgageFSK}
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
      console.error("❌ ERROR:", result.errors);
      return res.status(400).json({ error: result.errors[0].message });
    }

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
          term: period * 12
        });
      }
    });

    res.json(unique.slice(0, 3));
  } catch (err) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// 4. 📋 ВСЕ ПРОГРАММЫ (Ваши 7 программ для витрины)
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    
    // Список требуемых программ и их параметры для поиска
    const programsDef = [
      { id: "FAMILY", name: "Семейная ипотека", init: 20 },
      { id: "MILITARY", name: "Военная ипотека", init: 15 },
      { id: "TWO_DOCUMENTS", name: "Ипотека по двум документам", init: 20 },
      { id: "SUBSIDIZED", name: "Субсидированная ипотека", init: 15 },
      { id: "STANDARD", name: "Стандартная ипотека", init: 20 },
      { id: "IT", name: "IT ипотека", init: 20 },
      { id: "COMMERCIAL", name: "Коммерческая ипотека", init: 30 }
    ];

    // Функция запроса к API для каждой программы
    const getBestRate = async (p) => {
      const query = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${p.id}) { rate } }`;
      try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        const json = await response.json();
        const offers = json?.data?.getLoanOffer || [];
        if (offers.length === 0) return null;
        
        return {
          name: p.name,
          rate: Math.min(...offers.map(o => o.rate)),
          initial: p.init,
          term: 30
        };
      } catch (e) {
        return null;
      }
    };

    // Выполняем все запросы параллельно
    const results = await Promise.all(programsDef.map(p => getBestRate(p)));

    // Отфильтровываем те, по которым банк не вернул данных
    res.json(results.filter(r => r !== null));

  } catch (err) {
    console.error("ALL PROGRAMS ERROR:", err);
    res.status(500).json([]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MORTGAGE SERVER RUNNING ON PORT ${PORT}`));