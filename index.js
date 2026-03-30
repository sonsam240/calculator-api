import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// CORS
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// проверка
app.get("/", (req, res) => {
  res.send("API WORKS");
});

// калькулятор
app.post("/calculate", async (req, res) => {
  try {
    let { price, complex } = req.body;

    if (!price || isNaN(price)) {
      return res.status(400).json({ error: "Неверная цена" });
    }

    if (!complex) {
      return res.status(400).json({ error: "Не выбран ЖК" });
    }

    const loanPeriod = 30; // лет
    const initialPayment = Math.floor(price * 0.2);

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${loanPeriod},
          loanTypes: PRIMARY,
          propertyTypes: FLAT,
          housingComplexUuid: "${complex}",
          initialPayment: ${initialPayment},
          cost: ${price},
          mortgageType: STANDARD,
          isRfCitizen: true
        ) {
          name
          bankName
          rate
          paymentDetails {
            payment
          }
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    const offers = data?.data?.getLoanOffer;

    if (!offers || offers.length === 0) {
      return res.json({
        error: "Нет предложений",
        debug: data
      });
    }

    // топ-3 предложения
    const result = offers.slice(0, 3).map(o => ({
      program: o.name,
      bank: o.bankName,
      rate: o.rate,
      monthlyPayment: o.paymentDetails?.[0]?.payment || 0,
      term: loanPeriod * 12
    }));

    res.json(result);

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// старт
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SERVER STARTED");
});
