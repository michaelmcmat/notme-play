// NotMe: офлайн-кэш игры. Файл собрал scripts/make-sw.mjs, руками его не правят.

const CACHE = "notme-0.18.0-70cba34346"
// все файлы сборки; пути от папки, где лежит этот файл
const FILES = [
  "assets/index-ChxZnuMK.js",
  "assets/index-DU0-u-_h.css",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "manifest.webmanifest"
]

const SCOPE = self.registration.scope // например https://michaelmcmat.github.io/notme-play/
const INDEX = new URL('index.html', SCOPE).href

// Установка: вся сборка кладётся в кэш разом. Не скачался хоть один файл — установка не удалась, и работает прежний кэш.
// cache: 'reload' — не брать файлы из кэша браузера: на GitHub Pages он держит их до 10 минут и мог бы подсунуть прошлую сборку.
// Проверка в конце: index.html должен быть из той же сборки, что и список файлов, то есть называть каждый файл из assets/.
// Если не называет (страница от другой выкладки), кэш удаляется, установка проваливается и повторится при следующем запуске игры
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE)
      await cache.addAll(FILES.map((path) => new Request(new URL(path, SCOPE).href, { cache: 'reload' })))
      const indexResponse = await cache.match(INDEX, { ignoreVary: true })
      const html = indexResponse ? await indexResponse.text() : ''
      const missing = FILES.filter((path) => path.startsWith('assets/') && !html.includes(path))
      if (missing.length > 0) throw new Error('index.html из другой сборки: в нём нет ' + missing.join(', '))
    } catch (err) {
      await caches.delete(CACHE)
      throw err
    }
    await self.skipWaiting()
  })())
})

// Активация: кэши прошлых сборок удаляем (только свои: на github.io у одного автора общее хранилище) и берём под управление открытые страницы
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('notme-') && name !== CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

// Страница игры: если index.html лежит в кэше, он отдаётся сразу, при любой сети. Так игра всегда открывается сборкой, которая
// есть в кэше целиком, и версии идут только вперёд: старая сборка не откроется поверх сохранения, записанного новой.
// Новая версия скачивается в фоне (браузер сам проверяет sw.js при открытии игры, а pwa.ts ещё и когда игру снова показывают),
// встаёт в кэш целиком, прежние кэши удаляются, и открывается она со следующего запуска.
// Сеть нужна, только если index.html в кэше нет (например, телефон очистил хранилище).
// no-cache: спросить у сервера, не изменился ли файл (ответ 304 почти ничего не стоит), а не верить кэшу браузера
async function page() {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(INDEX, { ignoreVary: true })
  if (cached) return cached
  return fetch(INDEX, { cache: 'no-cache' }).catch(() => Response.error())
}

// Остальные файлы: сначала кэш. У файлов в assets/ в имени хэш, а манифест и значки обновляются вместе со сборкой (кэш новый у каждой сборки)
async function file(request) {
  const cache = await caches.open(CACHE)
  return (await cache.match(request, { ignoreVary: true })) ?? fetch(request)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return
  const path = new URL(request.url).pathname
  const isPage = request.mode === 'navigate' && (path.endsWith('/') || path.endsWith('/index.html'))
  event.respondWith(isPage ? page() : file(request))
})
