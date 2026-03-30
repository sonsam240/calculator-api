import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ CORS (чтобы Tilda работала)
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;
const EMAIL = process.env.DVIZH_EMAIL;
const PASSWORD = process.env.DVIZH_PASSWORD;

// 👉 ВАЖНО: ВСТАВИ СЮДА РАБОЧИЙ UUID ПОТОМ
let HOUSING_COMPLEX_UUID = "REPLACE_ME";

// 🔑 токен
let jwtToken = "";

// =========================
// 🔐 Получение токена
// =========================
async function getToken() {
  try {
    const query = `
      mutation {
        loanOfficer_SignIn(input: {
          email: "${EMAIL}",
          password: "${PASSWORD}"
        })
      }
    `;

    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TildaCalc/1.0"
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();

    if (data?.data?.loanOfficer_SignIn) {
      jwtToken = data.data.loanOfficer_SignIn;
      console.log("✅ TOKEN OK");
    } else {
      console.error("❌ TOKEN ERROR", data);
    }

  } catch (err) {
    console.error("❌ TOKEN REQUEST ERROR", err);
  }
}

// автообновление токена
setInterval(getToken, 1000 * 60 * 10);
getToken();

// =========================
// 🧪 Проверка
// =========================
app.get("/", (req, res) => {
  res.send("API WORKS");
});

// =========================
// 🔍 ПОЛУЧИТЬ ЖК (ВАЖНО)
// =========================
app.get("/complexes", async (req, res) => {
  try {
    const query = `
      query {
        getHousingComplex(
          limit: 10
          offset: 0
        ) {
          collection {
            uuid
            name
          }
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + jwtToken
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: "Ошибка получения ЖК" });
  }
});

// =========================
// 📊 КАЛЬКУЛЯТОР
// =========================
app.post("/calculate", async (req, res) => {
  try {
    let { price } = req.body;

    if (!price || isNaN(price)) {
      return res.status(400).json({ error: "Неверная цена" });
    }

    if (HOUSING_COMPLEX_UUID === "REPLACE_ME") {
      return res.json({
        error: "Сначала получи UUID через /complexes"
      });
    }

    const query = `
      query {
        creditCoreGetLowestRateAgendas(
          housingComplexUuid: "${HOUSING_COMPLEX_UUID}",
          prices: [${price}]
        ) {
          agendaName
          payment
          period
          rate
        }
      }
    `;

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + jwtToken
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    const offer = data?.data?.creditCoreGetLowestRateAgendas?.[0];

    if (!offer) {
      return res.json({
        error: "Нет предложений",
        debug: data
      });
    }

    res.json({
      monthlyPayment: offer.payment,
      term: offer.period,
      rate: offer.rate,
      agendaName: offer.agendaName
    });

  } catch (err) {
    console.error("❌ CALC ERROR", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// =========================
// 🚀 СТАРТ
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SERVER STARTED");
});
