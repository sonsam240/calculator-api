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

app.get("/", (req, res) => res.send("API DVIZH-STYLE IS RUNNING"));

app.post("/calculate", async (req, res) => {
  try {
    const { price, complex, initialPayment, loanPeriod, hasChild, isIT, isMilitary, mortgageFSK } = req.body;

    // Подготовка данных (в копейках и числах)
    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Логика выбора типа ипотеки (как в Движ)
    let mortgageType = "STANDARD";
    if (hasChild) mortgageType = "FAMILY";
    if (isIT) mortgageType = "IT";
    if (isMilitary) mortgageType = "MILITARY";

    // ВНИМАНИЕ: Исправлены loanTypes и propertyTypes на массивы [ ]
    // Также убраны лишние фильтры, если они могут вызвать 400 ошибку
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
          mortgageType: ${mortgageType},
          filters: {
            hasChild: ${!!hasChild},
            isIT: ${!!isIT},
            isMilitary: ${!!isMilitary}
            ${mortgageFSK ? ", mortgageFSK: true" : ""}
          }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const result = await response.json();

    // Если API вернуло ошибку валидации схемы
    if (result.errors) {
      console.error("❌ GRAPHQL ERROR:", JSON.stringify(result.errors, null, 2));
      return res.status(400).json({ error: "Ошибка параметров запроса", details: result.errors });
    }

    const offers = result?.data?.getLoanOffer;

    if (!offers || !Array.isArray(offers) || offers.length === 0) {
      return res.json([]);
    }

    // Обработка результатов (сортировка по минимальному платежу)
    const processedOffers = offers
      .map(o => ({
        program: o.name,
        bank: o.bankName,
        rate: o.rate,
        monthlyPayment: o.paymentDetails?.[0]?.payment || 0,
        term: period * 12
      }))
      .sort((a, b) => a.monthlyPayment - b.monthlyPayment)
      .filter((item, index, self) => 
        index === self.findIndex((t) => t.bank === item.bank)
      ) // Уникальные банки
      .slice(0, 3); // Только топ-3

    res.json(processedOffers);

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API DVIZH-STYLE READY`));