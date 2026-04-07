import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({
  origin: ["https://matilda-design-001.tilda.ws", "http://localhost:3000"], // Замените на ваш домен тильды
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API MORTGAGE v21 ✅ (Multi-Select Support)"));

// 1. ТОП-ПРЕДЛОЖЕНИЯ (Остаются для внутреннего использования или если решите вернуть)
app.get("/offer-base", async (req, res) => {
    // ... логика без изменений или можно оставить как есть
    res.json([]); 
});

// 2. ОСНОВНОЙ РАСЧЕТ
app.post("/calculate", async (req, res) => {
  try {
    const { 
      price, complex, initialPayment, loanPeriod, 
      selectedPrograms, // Теперь это массив, например ["family", "it"]
      hasCertificate, useMatCapital, isTwoDocs 
    } = req.body;

    let typesToQuery = [];
    
    if (selectedPrograms.includes("all")) {
        typesToQuery = ["FAMILY", "IT", "MILITARY", "FAR_EAST", "GOVERNMENT_SUPPORT", "STANDARD"];
    } else {
        if (selectedPrograms.includes("family")) typesToQuery.push("FAMILY");
        if (selectedPrograms.includes("it")) typesToQuery.push("IT");
        if (selectedPrograms.includes("military")) typesToQuery.push("MILITARY");
        if (selectedPrograms.includes("fe")) typesToQuery.push("FAR_EAST");
        if (selectedPrograms.includes("standard")) {
            typesToQuery.push("GOVERNMENT_SUPPORT");
            typesToQuery.push("STANDARD");
        }
    }
    
    // Если по каким-то причинам пусто
    if (typesToQuery.length === 0) typesToQuery = ["STANDARD"];
    
    typesToQuery = [...new Set(typesToQuery)];

    const fetchByType = async (mType) => {
      const proofAttr = isTwoDocs ? "proofOfIncome: no_needed," : "";
      // Примерные параметры для субсидий, подставьте свои если нужно
      const certAttr = hasCertificate ? "subsidyType: saveInitialPayment," : "";
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
      
      const resp = await fetch(GRAPHQL_ENDPOINT, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ query }) 
      });
      const json = await resp.json();
      return json?.data?.getLoanOffer || [];
    };

    const results = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = results.flat();
    
    const unique = [];
    const seen = new Set();

    // Сортируем по ставке
    flatOffers.sort((a, b) => a.rate - b.rate).forEach(o => {
      const key = `${o.bankName}-${o.rate}-${o.paymentDetails?.[0]?.payment}`;
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

    // Убрали slice(0, 15) - теперь возвращаем все
    res.json(unique); 
  } catch (err) { 
    console.error(err);
    res.status(500).json([]); 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);