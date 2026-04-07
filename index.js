import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API MORTGAGE v28 ✅ (Sandbox Sync & Multi-Select)"));

app.post("/calculate", async (req, res) => {
  try {
    const { 
      price, complex, initialPayment, loanPeriod, 
      selectedPrograms, hasCertificate, useMatCapital, isTwoDocs 
    } = req.body;

    // Маппинг кнопок фронтенда на коды из Sandbox
    const progMap = {
      "family": ["FAMILY"],
      "it": ["IT"],
      "military": ["MILITARY"],
      "fe": ["FAR_EAST"],
      "standard": ["STANDARD", "GOVERNMENT_SUPPORT"]
    };

    let typesToQuery = [];
    if (!selectedPrograms || selectedPrograms.includes("all")) {
      typesToQuery = ["STANDARD", "FAMILY", "MILITARY", "GOVERNMENT_SUPPORT", "FAR_EAST", "IT", "ARCTIC"];
    } else {
      selectedPrograms.forEach(p => { if (progMap[p]) typesToQuery.push(...progMap[p]); });
    }
    
    typesToQuery = [...new Set(typesToQuery)];

    const fetchByType = async (mType) => {
      // Параметры субсидий
      const certParams = hasCertificate ? "subsidyType: saveInitialPayment, subsidy: 80000000," : "";
      const matParams = useMatCapital ? "maternalCapital: 83300000," : "";
      const docsParams = isTwoDocs ? "proofOfIncome: no_needed," : "";

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
          ${certParams} ${matParams} ${docsParams}
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
    
    // Сортировка от меньшей ставки к большей
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

    res.json(unique);
  } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);