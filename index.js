import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// 1. ТОП-3
app.get("/offer-base", async (req, res) => {
  try {
    const query = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2", initialPayment: 120000000, cost: 600000000, isRfCitizen: true, mortgageType: STANDARD) { bankName rate paymentDetails { payment } } }`;
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

// 2. КАЛЬКУЛЯТОР (ДО 20 ПРЕДЛОЖЕНИЙ)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary } = req.body;

    let typesToQuery = [];
    if (hasChild) typesToQuery.push("FAMILY");
    if (isIT) typesToQuery.push("IT");
    if (isMilitary) typesToQuery.push("MILITARY");
    if (typesToQuery.length === 0) typesToQuery.push("STANDARD");

    const fetchByType = async (mType) => {
      const query = `query { getLoanOffer(loanPeriod: ${parseInt(loanPeriod)}, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: ${parseInt(initialPayment)}, cost: ${parseInt(price)}, isRfCitizen: true, mortgageType: ${mType}) { name bankName rate paymentDetails { payment } } }`;
      const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const json = await resp.json();
      return json?.data?.getLoanOffer || [];
    };

    const allResults = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flat = allResults.flat().sort((a, b) => a.rate - b.rate);

    const unique = [];
    const seen = new Set();
    for (let o of flat) {
      const key = `${o.bankName}-${o.name}-${o.rate}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ program: o.name, bank: o.bankName, rate: o.rate, monthlyPayment: o.paymentDetails?.[0]?.payment || 0, term: parseInt(loanPeriod) * 12 });
      }
    }
    res.json(unique.slice(0, 20)); // Лимит 20
  } catch (err) { res.status(500).json([]); }
});

// 3. ВСЕ ПРОГРАММЫ (7 ШТУК)
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const progs = [
      { id: "FAMILY", n: "Семейная ипотека", i: 20 },
      { id: "MILITARY", n: "Военная ипотека", i: 15 },
      { id: "STANDARD", n: "Ипотека по двум документам", i: 20 },
      { id: "STANDARD", n: "Субсидированная ипотека", i: 15 },
      { id: "STANDARD", n: "Стандартная ипотека", i: 20 },
      { id: "IT", n: "IT ипотека", i: 20 },
      { id: "STANDARD", n: "Коммерческая ипотека", i: 30 }
    ];

    const data = await Promise.all(progs.map(async (p) => {
      const q = `query { getLoanOffer(loanPeriod: 30, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 2000000, cost: 8000000, isRfCitizen: true, mortgageType: ${p.id}) { rate } }`;
      const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const json = await resp.json();
      const offers = json?.data?.getLoanOffer || [];
      let rate = offers.length ? Math.min(...offers.map(o => o.rate)) : 18.5;
      if (p.n.includes("Субсидированная")) rate = 8.5;
      if (p.n.includes("Коммерческая")) rate = 21.0;
      return { name: p.n, rate: rate, initial: p.i };
    }));
    res.json(data);
  } catch (e) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 READY"));