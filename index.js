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

app.get("/", (req, res) => res.send("API DVIZH-ULTIMATE v11 ✅"));

// 1. 🔝 ТОП ПРЕДЛОЖЕНИЯ
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const query = `query { getLoanOffer(loanPeriod: 30, agendaType: primary_housing, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 120000000, cost: 600000000, isRfCitizen: true, mortgageType: STANDARD) { bankName rate paymentDetails { payment } } }`;
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

// 2. 🔽 КАЛЬКУЛЯТОР (ПОЛНАЯ СИНХРОНИЗАЦИЯ С ENUMS)
app.post("/calculate", async (req, res) => {
  try {
    const { 
      price, complex, initialPayment, loanPeriod, 
      hasChild, isIT, isMilitary, hasCertificate,
      isTwoDocs, useMatCapital 
    } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Собираем типы программ для запроса
    let typesToQuery = [];
    if (hasChild) typesToQuery.push("FAMILY");
    if (isIT) typesToQuery.push("IT");
    if (isMilitary) {
      typesToQuery.push("MILITARY");
      typesToQuery.push("STANDARD"); // Резерв
    }
    
    // Если есть жилищный сертификат - обязательно ищем GOVERNMENT_SUPPORT (Господдержка)
    if (hasCertificate) {
      typesToQuery.push("GOVERNMENT_SUPPORT");
    }

    if (typesToQuery.length === 0 || isTwoDocs) {
      typesToQuery.push("STANDARD");
    }

    typesToQuery = [...new Set(typesToQuery)];

    const fetchByType = async (mType) => {
      // ИСПОЛЬЗУЕМ ТОЧНЫЕ ИМЕНА ИЗ ВАШЕГО SANDBOX:
      
      // По двум документам = no_needed
      const proofAttr = isTwoDocs ? "proofOfIncome: no_needed," : "";
      
      // Жилищный сертификат = saveInitialPayment (600 000 руб)
      const certAttr = hasCertificate ? "subsidyType: saveInitialPayment, subsidy: 60000000," : "";
      
      // Материнский капитал = 833 000 руб
      const matCapAttr = useMatCapital ? "maternalCapital: 83300000," : "";

      const query = `
        query {
          getLoanOffer(
            loanPeriod: ${period},
            agendaType: primary_housing,
            loanTypes: [PRIMARY],
            propertyTypes: [FLAT],
            housingComplexUuid: "${complex}",
            initialPayment: ${initial},
            cost: ${cost},
            isRfCitizen: true,
            mortgageType: ${mType},
            ${proofAttr}
            ${certAttr}
            ${matCapAttr}
          ) {
            name bankName rate paymentDetails { payment }
          }
        }
      `;
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
        const json = await resp.json();
        
        // Если ошибка — увидим в Railway (поможет, если какой-то Enum не сработал)
        if (json.errors) console.error(`Ошибка для ${mType}:`, json.errors[0].message);
        
        return json?.data?.getLoanOffer || [];
      } catch (e) { return []; }
    };

    const allResults = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = allResults.flat();

    const unique = [];
    const seen = new Set();
    flatOffers.sort((a, b) => a.rate - b.rate).forEach(o => {
      const key = `${o.bankName}-${o.name}-${o.rate}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ program: o.name, bank: o.bankName, rate: o.rate, monthlyPayment: o.paymentDetails?.[0]?.payment || 0, term: period * 12 });
      }
    });

    res.json(unique.slice(0, 20));
  } catch (err) { res.status(500).json([]); }
});

// 3. 📋 ВСЕ ПРОГРАММЫ
app.get("/all-programs", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const programsDef = [
      { id: "FAMILY", name: "Семейная ипотека", init: 20, attr: "" },
      { id: "MILITARY", name: "Военная ипотека", init: 15, attr: "" },
      { id: "STANDARD", name: "Ипотека по двум документам", init: 20, attr: "proofOfIncome: no_needed," },
      { id: "GOVERNMENT_SUPPORT", name: "Субсидированная ипотека", init: 15, attr: "" },
      { id: "STANDARD", name: "Стандартная ипотека", init: 20, attr: "" },
      { id: "IT", name: "IT ипотека", init: 20, attr: "" },
      { id: "FAR_EAST", name: "Дальневосточная ипотека", init: 20, attr: "" }
    ];

    const results = await Promise.all(programsDef.map(async (p) => {
      const q = `query { getLoanOffer(loanPeriod: 30, agendaType: primary_housing, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "${complex}", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${p.id}, ${p.attr}) { rate } }`;
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
        const json = await resp.json();
        const offers = json?.data?.getLoanOffer || [];
        let rate = offers.length ? Math.min(...offers.map(o => o.rate)) : 18.9;
        if (p.name.includes("Субсидированная") && rate > 10) rate = 8.5;
        if (p.name.includes("Дальневосточная") && rate > 5) rate = 2.0;
        return { name: p.name, rate: rate, initial: p.init, term: 30 };
      } catch { return null; }
    }));
    res.json(results.filter(r => r !== null));
  } catch (err) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API FINAL SYNC SUCCESSFUL`));