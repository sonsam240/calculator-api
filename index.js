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

// 🔝 РАБОЧИЙ РОУТ (ПРОВЕРЕНО)
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2";
    const price = 6000000 * 100;
    const initialPayment = Math.floor(price * 0.2);
    const query = `
      query {
        getLoanOffer(
          loanPeriod: 30,
          loanTypes: [PRIMARY],
          propertyTypes: [FLAT],
          housingComplexUuid: "${complex}",
          initialPayment: ${initialPayment},
          cost: ${price},
          isRfCitizen: true,
          mortgageType: STANDARD
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
  } catch (err) { res.status(500).json({ error: "error" }); }
});

// 🔽 ИСПРАВЛЕННЫЙ РОУТ КАЛЬКУЛЯТОРА
app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // ВАЖНО: Определяем mortgageType. 
    // Если это не STANDARD, то это FAMILY или IT. 
    // Мы убираем блок filters, так как mortgageType обычно достаточно для API.
    let mType = "STANDARD";
    if (hasChild) mType = "FAMILY";
    if (isIT) mType = "IT";
    if (isMilitary) mType = "MILITARY";

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

    console.log("✈️ Sending query for type:", mType);

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const result = await response.json();

    // Если API вернуло 400, мы увидим ошибку здесь (в логах Railway)
    if (result.errors) {
      console.error("❌ GRAPHQL ERROR:", JSON.stringify(result.errors));
      return res.status(400).json({ error: "API_ERROR", details: result.errors[0].message });
    }

    const offers = result?.data?.getLoanOffer || [];
    
    if (offers.length === 0) return res.json([]);

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
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 RUNNING`));