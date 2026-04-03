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

app.get("/", (req, res) => res.send("API IS RUNNING ✅"));

// 1. ТОП ПРЕДЛОЖЕНИЯ
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const price = 6000000 * 100;
    const initialPayment = Math.floor(price * 0.2);
    const query = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: ${initialPayment}, cost: ${price}, isRfCitizen: true, mortgageType: STANDARD) { bankName rate paymentDetails { payment } } }`;
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

// 2. ИСПРАВЛЕННЫЙ КАЛЬКУЛЯТОР (Убрали блок filters, вызывающий 400)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Определяем тип программы. Этого поля достаточно для фильтрации!
    let mType = "STANDARD";
    if (hasChild) mType = "FAMILY";
    else if (isIT) mType = "IT";
    else if (isMilitary) mType = "MILITARY";

    // Убрали блок filters, так как он не соответствует схеме
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

    // Если всё еще 400, выведем точную причину в логи Railway
    if (result.errors) {
      console.error("❌ GRAPHQL ERROR:", JSON.stringify(result.errors, null, 2));
      return res.status(400).json({ error: "API Error", message: result.errors[0].message });
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
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 3. ВСЕ ПРОГРАММЫ
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const programsDef = [
      { id: "FAMILY", name: "Семейная ипотека", init: 20 },
      { id: "MILITARY", name: "Военная ипотека", init: 15 },
      { id: "STANDARD", name: "Стандартная ипотека", init: 20 },
      { id: "IT", name: "IT ипотека", init: 20 }
    ];

    const results = await Promise.all(programsDef.map(async (p) => {
      const q = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${p.id}) { rate } }`;
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
        const json = await resp.json();
        const offers = json?.data?.getLoanOffer || [];
        if (!offers.length) return null;
        return { name: p.name, rate: Math.min(...offers.map(o => o.rate)), initial: p.init, term: 30 };
      } catch { return null; }
    }));
    res.json(results.filter(r => r !== null));
  } catch (err) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));