import express from "express";
import cors from "cors";
import fetch from "node-fetch"; // если Node 18+, fetch встроенный, можно убрать

const app = express();
app.use(express.json());
app.use(cors());

// Тестовый ЖК, можно менять на реальный
const HOUSING_COMPLEX_UUID = "ed2f3423-a31c-4832-8552-a83d93a63e4b";
const DVIZH_GRAPHQL_URL = "https://api.dvizh.io/graphql";

// 🧪 Проверка сервера
app.get("/", (req, res) => {
  res.send("API WORKS");
});

// 📊 Минимальный ипотечный расчет
app.post("/calculate", async (req, res) => {
  try {
    let { price } = req.body;

    if (!price || isNaN(price)) {
      return res.status(400).json({ error: "Введите корректную цену" });
    }

    // Конвертируем в копейки, если пришло в рублях
    price = Number(price);

    const query = `
      query {
        creditCoreGetLowestRateAgendas(
          housingComplexUuid: "${HOUSING_COMPLEX_UUID}",
          prices: [${price}]
        ) {
          agendaId
          agendaName
          period
          payment
          rate
          price
        }
      }
    `;

    const response = await fetch(DVIZH_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (!data?.data?.creditCoreGetLowestRateAgendas || data.data.creditCoreGetLowestRateAgendas.length === 0) {
      return res.status(400).json({ error: "Нет доступных предложений", raw: data });
    }

    const offer = data.data.creditCoreGetLowestRateAgendas[0];

    // Возвращаем минимальный платеж и базовую информацию
    res.json({
      agendaName: offer.agendaName || "—",
      monthlyPayment: offer.payment || 0,
      term: offer.period || 0,
      rate: offer.rate || 0,
      price: offer.price || price
    });

  } catch (err) {
    console.error("Ошибка расчета:", err);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// 🔌 Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
