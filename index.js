import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

// Разрешаем запросы только с вашей Тильды
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API MORTGAGE FULL SYSTEM v4 ✅"));

// 1. 🔝 ЛУЧШИЕ ПРЕДЛОЖЕНИЯ (Для блока над калькулятором)
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const price = 6000000 * 100;
    const initial = 1200000 * 100;

    const query = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: ${initial}, cost: ${price}, isRfCitizen: true, mortgageType: STANDARD) { bankName rate paymentDetails { payment } } }`;
    
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

// 2. 🔽 КАЛЬКУЛЯТОР (ДО 20 РЕЗУЛЬТАТОВ + МУЛЬТИ-ФИЛЬТР)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary, isTwoDocs } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Определяем, какие типы программ запрашивать одновременно
    let typesToQuery = [];
    if (hasChild) typesToQuery.push("FAMILY");
    if (isIT) typesToQuery.push("IT");
    if (isMilitary) typesToQuery.push("MILITARY");
    
    // Если выбрано "По двум документам" или ничего не выбрано — ищем по STANDARD
    if (isTwoDocs || typesToQuery.length === 0) {
      typesToQuery.push("STANDARD");
    }

    // Функция запроса к API для одного типа
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

    // Запускаем все запросы параллельно
    const allResults = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = allResults.flat();

    if (flatOffers.length === 0) return res.json([]);

    // Сортировка по выгодности ставки
    const sorted = flatOffers.sort((a, b) => a.rate - b.rate);

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

    // ВЫВОДИМ ДО 20 ПРЕДЛОЖЕНИЙ
    res.json(unique.slice(0, 20));

  } catch (err) {
    console.error("CALC ERROR:", err);
    res.status(500).json([]);
  }
});

// 3. 📋 ВСЕ ПРОГРАММЫ (Витрина из 7 программ)
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    
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
        
        // Корректировка для тех программ, которых нет в API как типов
        if (p.name.includes("Субсидированная")) rate = 8.5;
        if (p.name.includes("Коммерческая")) rate = 21.0;
        if (p.name.includes("Военная") && rate > 15) rate = 14.5;

        return { name: p.name, rate: rate, initial: p.init, term: 30 };
      } catch { return null; }
    }));

    res.json(results.filter(r => r !== null));
  } catch (err) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));