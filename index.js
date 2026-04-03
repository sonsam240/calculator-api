import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

// Настройка CORS
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// Проверка работоспособности
app.get("/", (req, res) => {
  res.send("API ипотечного калькулятора работает");
});

// =====================================================
// 🔝 БАЗОВЫЕ ПРЕДЛОЖЕНИЯ (ОБЫЧНЫЕ СТАВКИ)
// =====================================================
app.get("/offer-base", async (req, res) => {
  try {
    const complex = "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2"; // ДНС СИТИ по умолчанию
    const price = 5000000 * 100;
    const initialPayment = Math.floor(price * 0.2);
    const loanPeriod = 30;

    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${loanPeriod},
          loanTypes: PRIMARY,
          propertyTypes: FLAT,
          housingComplexUuid: "${complex}",
          initialPayment: ${initialPayment},
          cost: ${price},
          isRfCitizen: true
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
    const offers = data?.data?.getLoanOffer;

    if (!offers || offers.length === 0) return res.json([]);

    // Сортировка по ставке
    const sorted = offers.sort((a, b) => a.rate - b.rate);

    const unique = [];
    const seen = new Set();

    for (let o of sorted) {
      if (!seen.has(o.bankName)) {
        seen.add(o.bankName);
        unique.push({
          bank: o.bankName,
          rate: o.rate,
          monthlyPayment: o.paymentDetails?.[0]?.payment || 0
        });
      }
      if (unique.length === 3) break;
    }

    res.json(unique);
  } catch (err) {
    console.error("❌ BASE ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера при получении базовых офферов" });
  }
});

// =====================================================
// 🔽 КАЛЬКУЛЯТОР (С УЧЕТОМ ФИЛЬТРОВ: IT, СЕМЬЯ И Т.Д.)
// =====================================================
app.post("/calculate", async (req, res) => {
  try {
    // Получаем данные из тела запроса
    let { 
      price, 
      complex, 
      initialPayment, 
      loanPeriod, 
      hasChild, 
      isIT, 
      isMilitary, 
      mortgageFSK 
    } = req.body;

    // --- ВАЛИДАЦИЯ И ПРИВЕДЕНИЕ ТИПОВ ---
    const cost = parseInt(price);
    const period = parseInt(loanPeriod) || 30;
    const initial = parseInt(initialPayment) || Math.floor(cost * 0.2);

    if (!cost || isNaN(cost)) return res.status(400).json({ error: "Неверная цена" });
    if (!complex) return res.status(400).json({ error: "Не выбран ЖК" });

    // Формируем запрос
    // ВАЖНО: mortgageType: STANDARD удален, чтобы работали фильтры льготных программ
    const query = `
      query {
        getLoanOffer(
          loanPeriod: ${period},
          loanTypes: PRIMARY,
          propertyTypes: FLAT,
          housingComplexUuid: "${complex}",
          initialPayment: ${initial},
          cost: ${cost},
          isRfCitizen: true,
          filters: {
            hasChild: ${!!hasChild},
            isIT: ${!!isIT},
            isMilitary: ${!!isMilitary},
            mortgageFSK: ${!!mortgageFSK}
          }
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

    const result = await response.json();

    // Если API вернуло ошибку в структуре GraphQL
    if (result.errors) {
      console.error("❌ GRAPHQL ERROR:", result.errors);
      return res.status(400).json({ error: "Ошибка параметров запроса к банку" });
    }

    const offers = result?.data?.getLoanOffer;

    if (!offers || !Array.isArray(offers) || offers.length === 0) {
      return res.json([]);
    }

    // Сортировка: сначала самые низкие ставки
    const sorted = offers.sort((a, b) => a.rate - b.rate);

    // Уникализация по банкам (чтобы не было 3 предложений от одного Сбера)
    const unique = [];
    const seenBanks = new Set();

    for (let o of sorted) {
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
      if (unique.length === 3) break;
    }

    res.json(unique);
  } catch (err) {
    console.error("❌ CALC ERROR:", err);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SERVER STARTED ON PORT ${PORT}`);
});