import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

// Разрешаем запросы с вашего домена Тильды
app.use(cors({
  origin: ["https://matilda-design-001.tilda.ws", "http://localhost:3000"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

app.get("/", (req, res) => res.send("API MORTGAGE v15 ✅ (Full Filters Active)"));

// 1. ТОП-ПРЕДЛОЖЕНИЯ (плитки сверху)
app.get("/offer-base", async (req, res) => {
  const fetchTop = async (mType) => {
    const query = `query { getLoanOffer(loanPeriod: 30, agendaType: primary_housing, loanTypes: [PRIMARY], propertyTypes: [FLAT], housingComplexUuid: "4a6fdf66-a49e-498c-bdf7-dbe589fa51c2", initialPayment: 120000000, cost: 600000000, isRfCitizen: true, mortgageType: ${mType}) { bankName rate paymentDetails { payment } } }`;
    const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const data = await response.json();
    return data?.data?.getLoanOffer || [];
  };

  try {
    let offers = await fetchTop("GOVERNMENT_SUPPORT");
    if (offers.length === 0) offers = await fetchTop("STANDARD");

    const unique = [];
    const seen = new Set();
    offers.sort((a, b) => a.rate - b.rate).forEach(o => {
      if (!seen.has(o.bankName)) {
        seen.add(o.bankName);
        unique.push({ bank: o.bankName, rate: o.rate, monthlyPayment: o.paymentDetails?.[0]?.payment || 0 });
      }
    });
    res.json(unique.slice(0, 3));
  } catch (err) { res.json([]); }
});

// 2. КАЛЬКУЛЯТОР С ПОЛНЫМ НАБОРОМ ФИЛЬТРОВ
app.post("/calculate", async (req, res) => {
  try {
    const { 
      price, 
      complex, 
      initialPayment, 
      loanPeriod, 
      hasChild, 
      isMilitary, 
      isFE, 
      isStandard, 
      hasCertificate, 
      useMatCapital, 
      isTwoDocs 
    } = req.body;

    const cost = parseInt(price);
    const initial = parseInt(initialPayment);
    const period = parseInt(loanPeriod);

    // Определение типов ипотеки для запроса к API
    let typesToQuery = [];
    if (hasChild) typesToQuery.push("FAMILY");
    if (isMilitary) typesToQuery.push("MILITARY");
    if (isFE) typesToQuery.push("FAR_EAST");
    
    // Если выбрана стандартная или ничего не выбрано, или включены спец-опции
    if (isStandard || typesToQuery.length === 0 || isTwoDocs || hasCertificate) {
      typesToQuery.push("STANDARD");
      typesToQuery.push("GOVERNMENT_SUPPORT");
    }
    
    // Убираем дубликаты типов
    typesToQuery = [...new Set(typesToQuery)];

    const fetchByType = async (mType) => {
      // Динамические параметры запроса
      const proofAttr = isTwoDocs ? "proofOfIncome: no_needed," : "";
      const matCapValue = useMatCapital ? 83300000 : 0; // Примерная сумма маткапитала в копейках
      const matCapAttr = useMatCapital ? `maternalCapital: ${matCapValue},` : "";
      const certAttr = hasCertificate ? "subsidyType: saveInitialPayment, subsidy: 60000000," : "";

      const query = `query { 
        getLoanOffer(
          loanPeriod: ${period}, 
          agendaType: primary_housing, 
          loanTypes: [PRIMARY], 
          propertyTypes: [FLAT], 
          housingComplexUuid: "${complex}", 
          initialPayment: ${initial}, 
          cost: ${cost}, 
          isRfCitizen: true, 
          mortgageType: ${mType}, 
          ${proofAttr} 
          ${matCapAttr} 
          ${certAttr}
        ) { 
          name 
          bankName 
          rate 
          paymentDetails { payment } 
        } 
      }`;

      try {
        const resp = await fetch(GRAPHQL_ENDPOINT, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ query }) 
        });
        const json = await resp.json();
        return json?.data?.getLoanOffer || [];
      } catch (e) { 
        console.error(`Error fetching type ${mType}:`, e);
        return []; 
      }
    };

    // Запускаем запросы по всем выбранным категориям параллельно
    const allResults = await Promise.all(typesToQuery.map(t => fetchByType(t)));
    const flatOffers = allResults.flat();

    // Фильтруем уникальные предложения (один банк - одна лучшая ставка)
    const unique = [];
    const seen = new Set();
    
    flatOffers
      .sort((a, b) => a.rate - b.rate) // Сортируем от меньшей ставки
      .forEach(o => {
        const key = `${o.bankName}-${o.rate}`;
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

    res.json(unique.slice(0, 15)); // Возвращаем топ-15 вариантов
  } catch (err) { 
    console.error("Calculate Error:", err);
    res.status(500).json([]); 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));