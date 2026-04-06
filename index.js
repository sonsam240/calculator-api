import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

// Разрешаем запросы с вашего домена Тильды
app.use(cors({
  origin: ["https://matilda-design-001.tilda.ws", "http://localhost:3000"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API MORTGAGE v14 ✅ (Active)"));

// 1. ТОП-ПРЕДЛОЖЕНИЯ (для плиток сверху)
app.get("/offer-base", async (req, res) => {
  const fetchTop = async (mType) => {
    const query = `query { getLoanOffer(loanPeriod: 30, agendaType: primary_housing, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2", initialPayment: 120000000, cost: 600000000, isRfCitizen: true, mortgageType: ${mType}) { bankName rate paymentDetails { payment } } }`;
    const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const data = await response.json();
    return data?.data?.getLoanOffer || [];
  };

  try {
    let offers = await fetchTop("GOVERNMENT_SUPPORT");
    if (offers.length === 0) offers = await fetchTop("STANDARD");

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

// 2. КАЛЬКУЛЯТОР (ОСНОВНОЙ ПОИСК)
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary, hasCertificate, isTwoDocs, useMatCapital } = req.body;
    const cost = parseInt(price), initial = parseInt(initialPayment), period = parseInt(loanPeriod);

    // Логика выбора типов ипотеки на основе чекбоксов
    let typesToQuery = [];
    if (hasChild) typesToQuery.push("FAMILY");
    if (isIT) typesToQuery.push("IT");
    if (isMilitary) typesToQuery.push("MILITARY");
    
    // Если ничего не выбрано или есть спец. условия, добавляем стандартные программы
    if (typesToQuery.length === 0 || hasCertificate || isTwoDocs) {
        typesToQuery.push("STANDARD");
        typesToQuery.push("GOVERNMENT_SUPPORT");
    }
    typesToQuery = [...new Set(typesToQuery)]; // Убираем дубликаты

    const fetchByType = async (mType) => {
      const proofAttr = isTwoDocs ? "proofOfIncome: no_needed," : "";
      const matCapAttr = useMatCapital ? "maternalCapital: 83300000," : "";
      const certAttr = hasCertificate ? "subsidyType: saveInitialPayment, subsidy: 60000000," : "";
      
      const query = `query { 
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
            ${proofAttr} ${matCapAttr} ${certAttr}
        ) { 
            name bankName rate paymentDetails { payment } 
        } 
      }`;
      
      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
        const json = await resp.json();
        return json?.data?.getLoanOffer || [];
      } catch (e) { return []; }
    };

    const allResults = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = allResults.flat();
    
    const unique = [];
    const seen = new Set();
    flatOffers.sort((a, b) => a.rate - b.rate).forEach(o => {
      const key = `${o.bankName}-${o.rate}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ 
            program: o.name, 
            bank: o.bankName, 
            rate: o.rate, 
            monthlyPayment: o.paymentDetails?.[0]?.payment || 0 
        });
      }
    });
    
    res.json(unique.slice(0, 15));
  } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));