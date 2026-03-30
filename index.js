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

// 🧠 Проверка токена перед запросом
async function ensureToken() {
  if (!jwtToken) {
    await getToken();
  }
}

// 🚀 Получаем токен при старте
getToken();

// 💡 обновляем токен каждые 10 минут
setInterval(() => {
  getToken();
}, 1000 * 60 * 10);

// 🧪 Проверка сервера
app.get("/", (req, res) => {
  res.send("API WORKS");
});

// 📊 Ипотечный расчет
app.post("/calculate", async (req, res) => {
  await ensureToken();

  const { price, term } = req.body;

  const query = `
    query {
      calculateMortgage(input: {
        price: ${price},
        term: ${term}
      }) {
        monthlyPayment
        totalPayment
      }
    }
  `;

  try {
    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + jwtToken,
        "User-Agent": "TildaCalculator/1.0"
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    // защита от кривого ответа API
    if (!data?.data?.calculateMortgage) {
      return res.status(400).json({
        error: "Ошибка расчета",
        raw: data
      });
    }

    res.json(data.data.calculateMortgage);
  } catch (err) {
    console.error("❌ Ошибка расчета:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔌 запуск сервера (ВАЖНО для Railway)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
