import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// CORS только для Tilda
app.use(cors({
  origin: "https://matilda-design-001.tilda.ws",
}));

let jwtToken = "";

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (data?.data?.loanOfficer_SignIn) {
      jwtToken = data.data.loanOfficer_SignIn;
      console.log("✅ JWT token получен");
    }
  } catch (err) {
    console.error("❌ Ошибка получения токена:", err);
  }
}

// Обновление токена
setInterval(getToken, 1000 * 60 * 10);
getToken();

app.post("/calculate", async (req, res) => {
  try {
    if (!jwtToken) await getToken();

    const { price } = req.body;
    const query = `
      query {
        creditCoreGetLowestRateAgendas(
          housingComplexUuid: "ed2f3423-a31c-4832-8552-a83d93a63e4b",
          prices: [${price}]
        ) {
          agendaName
          payment
          period
          rate
        }
      }
    `;

    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + jwtToken
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    const offer = data?.data?.creditCoreGetLowestRateAgendas?.[0];

    if (!offer) return res.status(400).json({ error: "Нет предложений", raw: data });

    res.json({
      agendaName: offer.agendaName,
      monthlyPayment: offer.payment,
      term: offer.period,
      rate: offer.rate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка с DVIZH" });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Server running"));
