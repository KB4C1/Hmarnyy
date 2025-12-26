const API_KEY = '';

export async function getWeather(city, country = 'Ukraine', lang = 'uk') {
  const query = `${city},${country}`.trim();
  const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodeURIComponent(query)}&aqi=no&lang=${lang}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`WeatherAPI HTTP ${res.status}`);
      return { error: { message: "Сервіс погоди недоступний" } };
    }

    const data = await res.json();

    if (data.error) {
      console.warn("WeatherAPI error:", data.error.message);
      return { error: data.error };
    }

    return data;
  } catch (err) {
    console.error("getWeather fetch error:", err.message);
    return { error: { message: "Помилка з'єднання" } };
  }
}