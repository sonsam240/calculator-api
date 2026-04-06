import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({
  origin: ["https://matilda-design-001.tilda.ws", "http://localhost:3000"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API MORTGAGE v20 ✅ (Tab Support & Arctic Support)"));

// 1. ТОП-ПРЕДЛОЖЕНИЯ
app.get("/offer-base", async (req, res) => {
  const fetchTop = async (mType) => {
    const query = `query { getLoanOffer(loanPeriod: 30, agendaType: primary_housing, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2", initialPayment: 200000000, cost: 600000000, isRfCitizen: true, mortgageType: ${mType}) { bankName rate paymentDetails { payment } } }`;
    try {
      const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const data = await response.json();
      return data?.data?.getLoanOffer || [];
    } catch { return []; }
  };
  try {
    let offers = await fetchTop("FAR_EAST");
    if (offers.length === 0) offers = await fetchTop("FAMILY");
    if (offers.length === 0) offers = await fetchTop("GOVERNMENT_SUPPORT");
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

// 2. ОСНОВНОЙ РАСЧЕТ
app.post("/calculate", async (req, res) => {
  try {
    const { 
      price, complex, initialPayment, loanPeriod, 
      hasChild, isMilitary, isFE, isIT, isStandard, 
      hasCertificate, useMatCapital, isTwoDocs 
    } = req.body;

    let typesToQuery = [];
    if (isFE) typesToQuery.push("FAR_EAST");
    if (isIT) typesToQuery.push("IT");
    if (hasChild) typesToQuery.push("FAMILY");
    if (isMilitary) typesToQuery.push("MILITARY");
    
    // Если выбрано стандартно или пустой список
    if (isStandard || typesToQuery.length === 0 || isTwoDocs || hasCertificate) {
      typesToQuery.push("GOVERNMENT_SUPPORT");
      typesToQuery.push("STANDARD");
    }
    
    typesToQuery = [...new Set(typesToQuery)];

    const fetchByType = async (mType) => {
      const proofAttr = isTwoDocs ? "proofOfIncome: no_needed," : "";
      const certAttr = hasCertificate ? "subsidyType: saveInitialPayment, subsidy: 60000000," : "";
      const matAttr = useMatCapital ? "maternalCapital: 83300000," : "";

      const query = `query { 
        getLoanOffer(
          loanPeriod: ${parseInt(loanPeriod)}, 
          agendaType: primary_housing, 
          loanTypes: [PRIMARY], 
          propertyTypes: [FLAT], 
          housingComplexUuid: "${complex}", 
          initialPayment: ${parseInt(initialPayment)}, 
          cost: ${parseInt(price)}, 
          isRfCitizen: true, 
          mortgageType: ${mType},
          ${proofAttr} ${certAttr} ${matAttr}
        ) { name bankName rate paymentDetails { payment } } 
      }`;
      const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const json = await resp.json();
      return json?.data?.getLoanOffer || [];
    };

    const results = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = results.flat();
    const unique = [];
    const seen = new Set();
    flatOffers.sort((a, b) => a.rate - b.rate).forEach(o => {
      const key = `${o.bankName}-${o.rate}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ program: o.name, bank: o.bankName, rate: o.rate, monthlyPayment: o.paymentDetails?.[0]?.payment || 0 });
      }
    });
    res.json(unique.slice(0, 15));
  } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);