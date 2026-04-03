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

app.get("/", (req, res) => res.send("API MORTGAGE MULTI-FILTER v3 ✅"));

// 1. 🔝 ТОП ПРЕДЛОЖЕНИЯ (Блок над калькулятором)
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const query = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 120000000, cost: 600000000, isRfCitizen: true, mortgageType: STANDARD) { bankName rate paymentDetails { payment } } }`;
    const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const data = await response.json();
    const offers = data?.data?.getLoanOffer || [];
    const unique = [];
    const seen = new Set();
    offers.sort((a, b) => a.rate - b.rate).forEach(o => {
      if (!seen.has(o.bankName)) {
        seen.add(o.bankName);
        unique.push({ bank: o.bankName, rate: o.rate, monthlyPayment: o.paymentDetails?.[0]?.payment || 0 });
      }
    });
    res.json(unique.slice(0, 3));
  } catch (err) { res.json([]); }
});

// 2. 🔽 КАЛЬКУЛЯТОР (ПОДДЕРЖИВАЕТ ВЫБОР НЕСКОЛЬКИХ ГАЛОЧЕК СРАЗУ)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Собираем список типов программ для одновременного запроса
    let typesToQuery = [];
    if (hasChild) typesToQuery.push("FAMILY");
    if (isIT) typesToQuery.push("IT");
    if (isMilitary) typesToQuery.push("MILITARY");
    
    // Если фильтры не выбраны, всегда ищем по STANDARD
    if (typesToQuery.length === 0) typesToQuery.push("STANDARD");

    // Функция для запроса к API
    const fetchByType = async (mType) => {
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
            mortgageType: ${mType}
          ) {
            name bankName rate paymentDetails { payment }
          }
        }
      `;
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        const json = await resp.json();
        return json?.data?.getLoanOffer || [];
      } catch (e) { return []; }
    };

    // Делаем все запросы параллельно
    const allResults = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = allResults.flat();

    if (flatOffers.length === 0) return res.json([]);

    // Сортировка по минимальной ставке
    const sorted = flatOffers.sort((a, b) => a.rate - b.rate);

    // Удаление дубликатов (один банк может быть в разных категориях)
    const unique = [];
    const seen = new Set();
    for (let o of sorted) {
      const key = `${o.bankName}-${o.name}-${o.rate}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          program: o.name,
          bank: o.bankName,
          rate: o.rate,
          monthlyPayment: o.paymentDetails?.[0]?.payment || 0,
          term: period * 12
        });
      }
    }

    res.json(unique.slice(0, 6)); // Возвращаем топ-6 предложений
  } catch (err) {
    console.error("CALC ERROR:", err);
    res.status(500).json([]);
  }
});

// 3. 📋 ВСЕ ПРОГРАММЫ (Витрина из 7 программ)
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    
    // Список программ. Если API не поддерживает тип, используем STANDARD как базу
    const programsDef = [
      { id: "FAMILY", name: "Семейная ипотека", init: 20 },
      { id: "MILITARY", name: "Военная ипотека", init: 15 },
      { id: "STANDARD", name: "Ипотека по двум документам", init: 20 },
      { id: "STANDARD", name: "Субсидированная ипотека", init: 15 },
      { id: "STANDARD", name: "Стандартная ипотека", init: 20 },
      { id: "IT", name: "IT ипотека", init: 20 },
      { id: "STANDARD", name: "Коммерческая ипотека", init: 30 }
    ];

    const results = await Promise.all(programsDef.map(async (p) => {
      const q = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${p.id}) { rate } }`;
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
        const json = await resp.json();
        const offers = json?.data?.getLoanOffer || [];
        
        let rate = offers.length ? Math.min(...offers.map(o => o.rate)) : 18.5;
        
        // Ручная корректировка ставок для "витринных" программ, которых нет в API
        if (p.name === "Субсидированная ипотека" && rate > 10) rate = 8.5;
        if (p.name === "Коммерческая ипотека" && rate < 20) rate = 21.0;
        if (p.name === "Военная ипотека" && rate > 15) rate = 14.5;

        return { name: p.name, rate: rate, initial: p.init, term: 30 };
      } catch { return null; }
    }));

    res.json(results.filter(r => r !== null));
  } catch (err) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 RUNNING ON ${PORT}`));