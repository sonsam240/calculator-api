import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

let jwtToken = "";

// 🔑 Получение токена
async function getToken() {
  const query = `
    mutation {
      loanOfficer_SignIn(input: {
        email: "${process.env.DVIZH_EMAIL}",
        password: "${process.env.DVIZH_PASSWORD}"
      })
    }
  `;

  try {
    const res = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TildaCalculator/1.0"
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();

    if (data?.data?.loanOfficer_SignIn) {
      jwtToken = data.data.loanOfficer_SignIn;
      console.log("✅ JWT token получен");
    } else {
      console.error("❌ Ошибка токена:", data);
    }
  } catch (err) {
    console.error("❌ Ошибка запроса токена:", err);
  }
}

// 🧠 Проверка токена
async function ensureToken() {
  if (!jwtToken) {
    await getToken();
  }
}

// 🚀 старт
getToken();

// 🔄 обновление токена
setInterval(() => {
  getToken();
}, 1000 * 60 * 10);

// 🧪 тест
app.get("/", (req, res) => {
  res.send("API WORKS");
});

// 📊 РАСЧЕТ (ИСПРАВЛЕН)
app.post("/calculate", async (req, res) => {
  await ensureToken();

  const { price } = req.body;

  if (!price || isNaN(price)) {
    return res.status(400).json({ error: "Некорректная цена" });
  }

  // 👉 перевод в копейки
  const priceInKopecks = price * 100;

  const query = `
    query {
      creditCoreGetLowestRateAgendas(
        housingComplexUuid: "ed2f3423-a31c-4832-8552-a83d93a63e4b",
        prices: [${priceInKopecks}]
      ) {
        payment
        rate
        period
      }
    }
  `;

  try {
    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer ${jwtToken}\`,
        "User-Agent": "TildaCalculator/1.0"
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    if (data.errors || !data?.data?.creditCoreGetLowestRateAgendas?.length) {
      return res.status(400).json({
        error: "Ошибка расчета",
        raw: data
      });
    }

    const result = data.data.creditCoreGetLowestRateAgendas[0];

    res.json({
      monthlyPayment: result.payment / 100, // обратно в рубли
      rate: result.rate,
      period: result.period
    });

  } catch (err) {
    console.error("❌ Ошибка расчета:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔌 запуск
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
