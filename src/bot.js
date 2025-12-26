import { Telegraf, Markup } from 'telegraf'
import fs from 'fs/promises'
import { getWeather } from './parser.js'

const bot = new Telegraf('')

const userState = {}

let allCitiesCache = null
let alphabetCache = null

async function loadCitiesCache() {
  if (allCitiesCache) return
  try {
    const text = await fs.readFile('src/cities.txt', 'utf-8')
    allCitiesCache = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .sort((a, b) => a.localeCompare(b, 'uk'))

    alphabetCache = [...new Set(allCitiesCache.map(city => city[0].toUpperCase()))].sort()
  } catch (err) {
    console.error("Не вдалося завантажити cities.txt:", err)
    allCitiesCache = []
    alphabetCache = []
  }
}

function cyrillicToLatin(text) {
  const map = {
    А:"A",Б:"B",В:"V",Г:"H",Ґ:"G",Д:"D",Е:"E",Є:"Ye",Ж:"Zh",
    З:"Z",И:"Y",І:"I",Ї:"Yi",Й:"Y",К:"K",Л:"L",М:"M",Н:"N",
    О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",
    Ч:"Ch",Ш:"Sh",Щ:"Shch",Ю:"Yu",Я:"Ya",
    а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ie",ж:"zh",
    з:"z",и:"y",і:"i",ї:"i",й:"i",к:"k",л:"l",м:"m",н:"n",
    о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",
    ч:"ch",ш:"sh",щ:"shch",ю:"iu",я:"ia","-":"-"," ":" "
  }
  return text.split('').map(c => map[c] ?? c).join('')
}

async function loadProfiles() {
  try {
    return JSON.parse(await fs.readFile('src/profiles.json', 'utf-8'))
  } catch {
    return {}
  }
}

async function saveProfiles(data) {
  try {
    await fs.writeFile('src/profiles.json', JSON.stringify(data, null, 2))
  } catch (err) {
    console.error("saveProfiles error:", err)
  }
}

bot.catch(async (err, ctx) => {
  console.error(`Помилка для юзера ${ctx?.from?.id}:`, err)
  try { await ctx.reply("⚠️ Виникла помилка. Спробуй /start") } catch {}
})

bot.use(async (ctx, next) => {
  if (ctx.message?.text?.startsWith('/')) {
    delete userState[ctx.from.id]
  }
  return next()
})

bot.start(async ctx => {
  try {
    const profiles = await loadProfiles()
    const id = ctx.from.id

    profiles[id] ??= { name: ctx.from.first_name || "Користувач", city: "", history: {} }
    const user = profiles[id]
    await saveProfiles(profiles)

    await ctx.reply(`👋 Привіт, ${user.name}!`, Markup.inlineKeyboard([
      [Markup.button.callback("👤 Профіль", 'profile')]
    ]))

    if (user.city) {
      const data = await getWeather(cyrillicToLatin(user.city))
      if (!data.error) {
        const weatherText = `
🌆 ${data.location.name}, ${data.location.country}
🌡️ Температура: ${data.current.temp_c}°C (відчувається: ${data.current.feelslike_c}°C)
💨 Вітер: ${data.current.wind_kph} км/год
💧 Вологість: ${data.current.humidity}%
☁️ ${data.current.condition.text}
        `.trim()
        await ctx.reply(`🏙️ Погода в ${user.city} зараз:\n\n${weatherText}`)
      }
    }
  } catch (err) { throw err }
})

bot.command('weather', async ctx => {
  try {
    const profiles = await loadProfiles()
    const id = ctx.from.id

    profiles[id] ??= { name: ctx.from.first_name || "Користувач", city: "", history: {} }

    let cityUA = ctx.message.text.split(' ').slice(1).join(' ').trim()

    if (!cityUA) {
      if (!profiles[id].city) return ctx.reply("❌ Вкажи місто або /profile")
      cityUA = profiles[id].city
    }

    const data = await getWeather(cyrillicToLatin(cityUA))

    if (data.error) return ctx.reply("❌ Місто не знайдено")

    profiles[id].history[cityUA] ??= { time: new Date().toLocaleString('uk-UA') }
    await saveProfiles(profiles)

    const weatherText = `
🌆 ${data.location.name}, ${data.location.country}
🌡️ Температура: ${data.current.temp_c}°C (відчувається: ${data.current.feelslike_c}°C)
💨 Вітер: ${data.current.wind_kph} км/год
💧 Вологість: ${data.current.humidity}%
☁️ ${data.current.condition.text}
    `.trim()

    if (profiles[id].city !== cityUA) {
      await ctx.reply(weatherText, Markup.inlineKeyboard([
        [Markup.button.callback(`🏙️Встановити ${data.location.name} як моє місто`, `setcity_${cityUA}`)]
      ]))
    } else {
      await ctx.reply(weatherText)
    }
  } catch (err) { throw err }
})

bot.command('profile', async ctx => {
  try {
    const profiles = await loadProfiles()
    const id = ctx.from.id

    profiles[id] ??= { name: ctx.from.first_name || "Користувач", city: "", history: {} }
    const user = profiles[id]
    await saveProfiles(profiles)

    const buttons = [
      [Markup.button.callback("✏️ Змінити ім'я", 'change_name')],
      [Markup.button.callback("🧾 Історія пошуку", 'history')]
    ]

    if (user.city) {
      buttons.splice(1, 0, [Markup.button.callback("☁️ Погода в моєму місті", `weather_${user.city}`)])
      buttons.splice(2, 0, [Markup.button.callback("🌆 Змінити місто", 'select_city')])
    } else {
      buttons.splice(1, 0, [Markup.button.callback("🌆 Вибрати місто з списку", 'select_city')])
    }

    await ctx.reply(`👤 Ім'я: ${user.name}\n🌆 Місто: ${user.city || "--"}`, Markup.inlineKeyboard(buttons))
  } catch (err) { throw err }
})

bot.action('change_name', async ctx => {
  try {
    delete userState[ctx.from.id]
    userState[ctx.from.id] = 'name'
    await ctx.reply("✏️ Введи нове ім'я:")
    ctx.answerCbQuery()
  } catch (err) { throw err }
})

bot.action('select_city', async ctx => {
  try {
    await loadCitiesCache()

    if (alphabetCache.length === 0) {
      return ctx.answerCbQuery("❌ Список міст порожній")
    }

    const buttons = alphabetCache.map(letter => Markup.button.callback(letter, `letter_${letter}`))
    const kb = Markup.inlineKeyboard(buttons, { columns: 6 })

    if (ctx.update.callback_query?.message) {
      await ctx.editMessageText("🔤 Обери першу букву міста:", kb)
    } else {
      await ctx.reply("🔤 Обери першу букву міста:", kb)
    }
    ctx.answerCbQuery()
  } catch (err) {
    console.error("select_city error:", err)
    ctx.answerCbQuery("⚠️ Помилка")
  }
})

bot.action(/letter_(.+)/, async ctx => {
  try {
    await loadCitiesCache()

    const letter = ctx.match[1]
    const cities = allCitiesCache.filter(city => city.charAt(0).toUpperCase() === letter)

    if (cities.length === 0) {
      return ctx.answerCbQuery("Немає міст на цю букву")
    }

    const buttons = cities.map(city => Markup.button.callback(city, `setcity_${city}`))
    const rows = []
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2))
    }
    rows.push([Markup.button.callback("🔙 Назад до букв", 'select_city')])

    await ctx.editMessageText(
      `🏙️ Міста на букву "${letter}" (${cities.length}):`,
      Markup.inlineKeyboard(rows)
    )
    ctx.answerCbQuery()
  } catch (err) {
    console.error("letter_ error:", err)
    ctx.answerCbQuery("⚠️ Помилка")
  }
})

bot.action(/setcity_(.+)/, async ctx => {
  try {
    const cityUA = ctx.match[1]
    const id = ctx.from.id

    const profiles = await loadProfiles()
    profiles[id] ??= { name: ctx.from.first_name || "Користувач", city: "", history: {} }

    profiles[id].city = cityUA
    profiles[id].history[cityUA] ??= { time: new Date().toLocaleString('uk-UA') }
    await saveProfiles(profiles)

    await ctx.answerCbQuery(`✅ ${cityUA} — тепер твоє місто`)
    await ctx.editMessageText(`✅ Місто успішно встановлено: ${cityUA}\n\nПовернись в /profile`)
  } catch (err) { throw err }
})

bot.action('history', async ctx => {
  try {
    const profiles = await loadProfiles()
    const user = profiles[ctx.from.id] || { history: {} }

    const text = Object.entries(user.history)
      .map(([c, i]) => `• ${c} — ${i.time}`)
      .join('\n') || 'Порожньо'

    await ctx.editMessageText(`🧾 Історія пошуку:\n\n${text}`)
    ctx.answerCbQuery()
  } catch (err) { throw err }
})

bot.action(/weather_(.+)/, async ctx => {
  try {
    const cityUA = ctx.match[1]
    const data = await getWeather(cyrillicToLatin(cityUA))

    if (data.error) return ctx.answerCbQuery("❌")

    const weatherText = `
🌆 ${data.location.name} (${data.location.country})
🌡️ Температура: ${data.current.temp_c}°C (відчувається: ${data.current.feelslike_c}°C)
💨 Вітер: ${data.current.wind_kph} км/год
💧 Вологість: ${data.current.humidity}%
☁️ ${data.current.condition.text}
    `.trim()

    await ctx.editMessageText(weatherText)
    ctx.answerCbQuery()
  } catch (err) { throw err }
})

bot.action('profile', async ctx => {
  try {
    delete userState[ctx.from.id]

    const profiles = await loadProfiles()
    const id = ctx.from.id

    profiles[id] ??= { name: ctx.from.first_name || "Користувач", city: "", history: {} }
    const user = profiles[id]
    await saveProfiles(profiles)

    const buttons = [
      [Markup.button.callback("✏️ Змінити ім'я", 'change_name')],
      [Markup.button.callback("🧾 Історія пошуку", 'history')]
    ]

    if (user.city) {
      buttons.splice(1, 0, [Markup.button.callback("☁️ Погода в моєму місті", `weather_${user.city}`)])
      buttons.splice(2, 0, [Markup.button.callback("🌆 Змінити місто", 'select_city')])
    } else {
      buttons.splice(1, 0, [Markup.button.callback("🌆 Вибрати місто з списку", 'select_city')])
    }

    if (ctx.update.callback_query?.message) {
      await ctx.editMessageText(
        `👤 Ім'я: ${user.name}\n🌆 Місто: ${user.city || "--"}`,
        Markup.inlineKeyboard(buttons)
      )
    } else {
      await ctx.reply(
        `👤 Ім'я: ${user.name}\n🌆 Місто: ${user.city || "--"}`,
        Markup.inlineKeyboard(buttons)
      )
    }

    ctx.answerCbQuery()
  } catch (err) { throw err }
})

bot.on('text', async ctx => {
  try {
    const id = ctx.from.id
    const text = ctx.message.text.trim()

    if (text.startsWith('/')) {
      delete userState[id]
      return
    }

    if (userState[id] === 'name') {
      const profiles = await loadProfiles()
      profiles[id] ??= { name: ctx.from.first_name || "Користувач", city: "", history: {} }

      profiles[id].name = text
      await saveProfiles(profiles)
      delete userState[id]

      await ctx.reply("✅ Ім'я змінено", Markup.inlineKeyboard([
        [Markup.button.callback("👤 Профіль", 'profile')]
      ]))
    }
  } catch (err) { throw err }
})

bot.launch()
console.log("🚀 Бот запущено")
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))