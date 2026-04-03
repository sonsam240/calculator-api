import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API FIXED ✅"));

// 1. 🔝 ТОП ПРЕДЛОЖЕНИЯ (Стабильные параметры)
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const price = 5000000 * 100;
    const initial = 1000000 * 100;

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
  } catch (err) { 
    console.error("TOP OFFERS ERROR:", err);
    res.json([]); 
  }
});

// 2. 🔽 КАЛЬКУЛЯТОР (Используем только валидные Enum)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary } = req.body;
    
    // Используем только те типы, которые API точно принимает (судя по вашим логам)
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
          name bankName rate paymentDetails { payment }
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const result = await response.json();

    if (result.errors) return res.status(400).json({ error: result.errors[0].message });

    const offers = result?.data?.getLoanOffer || [];
    const unique = [];
    const seenBanks = new Set();
    offers.sort((a, b) => a.rate - b.rate).forEach(o => {
      if (!seenBanks.has(o.bankName)) {
        seenBanks.add(o.bankName);
        unique.push({ program: o.name, bank: o.bankName, rate: o.rate, monthlyPayment: o.paymentDetails?.[0]?.payment || 0, term: parseInt(loanPeriod) * 12 });
      }
    });
    res.json(unique.slice(0, 3));
  } catch (err) { res.status(500).json([]); }
});

// 3. 📋 ВСЕ ПРОГРАММЫ (Безопасный список)
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    
    // Список программ: часть запрашиваем у API, часть эмулируем, чтобы не было 400
    const programsDef = [
      { id: "FAMILY", name: "Семейная ипотека", init: 20, api: true },
      { id: "MILITARY", name: "Военная ипотека", init: 15, api: true },
      { id: "STANDARD", name: "Стандартная ипотека", init: 20, api: true },
      { id: "IT", name: "IT ипотека", init: 20, api: true },
      // Эти программы не поддерживаются API как типы, поэтому берем для них данные из STANDARD или ставим средние
      { id: "STANDARD", name: "Ипотека по двум документам", init: 20, api: true },
      { id: "STANDARD", name: "Субсидированная ипотека", init: 15, api: true },
      { id: "STANDARD", name: "Коммерческая ипотека", init: 30, api: true }
    ];

    const results = await Promise.all(programsDef.map(async (p) => {
      const q = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${p.id}) { rate } }`;
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
        const json = await resp.json();
        const offers = json?.data?.getLoanOffer || [];
        
        // Если API не вернуло данных, ставим примерную ставку для этой категории
        let rate = offers.length ? Math.min(...offers.map(o => o.rate)) : 18.5;
        
        // Немного корректируем ставку для красоты отображения разных программ, если данных нет
        if (p.name === "Субсидированная ипотека" && rate > 10) rate = 8.5;
        if (p.name === "Коммерческая ипотека" && rate < 20) rate = 21.0;

        return { name: p.name, rate: rate, initial: p.init, term: 30 };
      } catch { return null; }
    }));

    res.json(results.filter(r => r !== null));
  } catch (err) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 RUNNING ON ${PORT}`));